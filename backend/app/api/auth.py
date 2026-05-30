from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, EmailStr
import logging
from datetime import datetime, timezone
from typing import Optional
import uuid

from app.db.database import get_db
from app.db.models import User, UserRole
from app.core.config import settings
from app.core.security import (
    hash_password, verify_password,
    create_access_token, create_refresh_token, decode_token,
    get_current_user
)
from app.core.encryption import encrypt, decrypt
from app.core.audit import write_audit_log
import random
import string
from datetime import timedelta
from app.db.models import OTPCode
from app.core.email import send_otp_email

logger = logging.getLogger(__name__)

router = APIRouter()


def _format_datetime(value: datetime | None) -> str | None:
    if not value:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.isoformat()

def generate_otp() -> str:
    return "".join(random.choices(string.digits, k=6))

class OTPVerifyRequest(BaseModel):
    user_id: str
    otp_code: str

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    phone: str = ""
    address: str = ""
    role: UserRole = UserRole.patient

    class Config:
        use_enum_values = True


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    role: str


class RefreshRequest(BaseModel):
    refresh_token: str

def _mask_email(email: str) -> str:
    """Mask email for display: doctor@example.com → d****r@e*****.com"""
    try:
        local, domain = email.split("@", 1)
        if len(local) <= 2:
            masked_local = local[0] + "*"
        elif len(local) <= 4:
            masked_local = local[0] + "*" * (len(local) - 2) + local[-1]
        else:
            masked_local = local[0] + local[1] + "*" * (len(local) - 3) + local[-1]

        domain_parts = domain.split(".")
        main_domain = domain_parts[0]
        if len(main_domain) <= 2:
            masked_domain = main_domain
        else:
            masked_domain = main_domain[0] + "*" * (len(main_domain) - 2) + main_domain[-1]

        tld = ".".join(domain_parts[1:])
        return f"{masked_local}@{masked_domain}.{tld}"
    except Exception:
        return "your registered email"

@router.post("/register", status_code=201)
async def register(
    request: Request,
    body: RegisterRequest,
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(User).where(User.email == body.email))
    existing = result.scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    if len(body.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    if body.role == UserRole.admin:
        raise HTTPException(status_code=403, detail="Admin accounts cannot be self-registered")

    # Add Dr. prefix for doctors
    display_name = body.full_name
    if body.role == "doctor" and not body.full_name.startswith("Dr."):
        display_name = f"Dr. {body.full_name}"

    user = User(
        id=uuid.uuid4(),
        email=body.email,
        hashed_password=hash_password(body.password),
        full_name_encrypted=encrypt(display_name),
        phone_encrypted=encrypt(body.phone) if body.phone else None,
        address_encrypted=encrypt(body.address) if body.address else None,
        role=body.role,
        is_active=True,
        created_at=datetime.utcnow(),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    await write_audit_log(
        action="REGISTER",
        user_id=str(user.id),
        user_role=body.role,
        resource="user",
        resource_id=str(user.id),
        ip_address=request.client.host,
    )

    return {"message": "User registered successfully", "user_id": str(user.id)}

@router.post("/login")
async def login(request: Request, body: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    if not user or not verify_password(body.password, user.hashed_password):
        await write_audit_log(action="LOGIN_FAILED", user_id=body.email,
            user_role="unknown", resource="auth", ip_address=request.client.host, success=False)
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is disabled")

    role = str(user.role.value if hasattr(user.role, 'value') else user.role)

    # For doctors: return OTP challenge instead of token directly
    if role == "doctor":
        otp_code = generate_otp()

        # Clean up any existing unused OTPs for this user first
        existing_otps_result = await db.execute(
            select(OTPCode).where(
                OTPCode.user_id == user.id,
                OTPCode.used == False,
            )
        )
        existing_otps = existing_otps_result.scalars().all()
        for old_otp in existing_otps:
            old_otp.used = True  # invalidate all previous OTPs

        otp = OTPCode(
            id=uuid.uuid4(),
            user_id=user.id,
            code=otp_code,
            expires_at=datetime.utcnow() + timedelta(minutes=10),
        )
        db.add(otp)
        await db.commit()

        doctor_name = decrypt(user.full_name_encrypted)

        # Send email in thread pool to avoid blocking the async event loop
        import asyncio
        from concurrent.futures import ThreadPoolExecutor

        loop = asyncio.get_event_loop()
        with ThreadPoolExecutor(max_workers=1) as executor:
            email_sent = await loop.run_in_executor(
                executor,
                send_otp_email,
                user.email,
                otp_code,
                doctor_name
            )

        await write_audit_log(
            action="OTP_SENT",
            user_id=str(user.id),
            user_role=role,
            resource="auth",
            ip_address=request.client.host,
            details={"email_sent": email_sent},
        )

        if not email_sent:
            logger.error(f"OTP email failed for {user.email}")
            # Don't fail the request — OTP is saved in DB
            # Return a specific error flag so frontend can show appropriate message
            return {
                "requires_otp": True,
                "user_id": str(user.id),
                "masked_email": _mask_email(user.email),
                "email_delivered": False,
                "message": "Code generated but email delivery failed. Contact your administrator.",
            }

        return {
            "requires_otp": True,
            "user_id": str(user.id),
            "masked_email": _mask_email(user.email),
            "email_delivered": True,
            "message": f"Verification code sent to {_mask_email(user.email)}",
        }

    # Patients and admin login directly
    user.last_login = datetime.utcnow()
    await db.commit()
    token_data = {"sub": str(user.id), "email": user.email, "role": role}

    await write_audit_log(action="LOGIN_SUCCESS", user_id=str(user.id),
        user_role=role, resource="auth", ip_address=request.client.host)

    return TokenResponse(
        access_token=create_access_token(token_data),
        refresh_token=create_refresh_token(token_data),
        role=role,
    )



@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(body: RefreshRequest, db: AsyncSession = Depends(get_db)):
    payload = decode_token(body.refresh_token)
    if payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    result = await db.execute(select(User).where(User.id == payload["sub"]))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")

    token_data = {
        "sub": str(user.id),
        "email": user.email,
        "role": user.role.value if hasattr(user.role, 'value') else user.role,
    }

    return TokenResponse(
        access_token=create_access_token(token_data),
        refresh_token=create_refresh_token(token_data),
        role=str(user.role.value if hasattr(user.role, 'value') else user.role),
    )


@router.get("/me")
async def get_me(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(User).where(User.id == current_user["sub"]))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return {
        "id": str(user.id),
        "email": user.email,
        "full_name": decrypt(user.full_name_encrypted),
        "phone": decrypt(user.phone_encrypted) if user.phone_encrypted else "",
        "address": decrypt(user.address_encrypted) if user.address_encrypted else "",
        "role": str(user.role.value if hasattr(user.role, 'value') else user.role),
        "created_at": user.created_at,
        "last_login": _format_datetime(user.last_login),
    }

@router.delete("/account")
async def delete_own_account(
    request: Request,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """User can delete their own account."""
    user_id = current_user.get("sub")
    result = await db.execute(select(User).where(User.id == uuid.UUID(user_id)))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    await write_audit_log(
        action="DELETE_OWN_ACCOUNT",
        user_id=user_id,
        user_role=current_user.get("role"),
        resource="user",
        resource_id=user_id,
        ip_address=request.client.host,
    )

    user.is_active = False  # Soft delete — keep records for audit
    await db.commit()
    return {"message": "Account deactivated successfully"}

@router.post("/heartbeat")
async def heartbeat(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Called every 2 minutes from frontend to track online status."""
    user_id = current_user.get("sub")
    result = await db.execute(select(User).where(User.id == uuid.UUID(user_id)))
    user = result.scalar_one_or_none()
    if user:
        user.last_login = datetime.utcnow()
        await db.commit()
    return {"status": "ok"}


_otp_attempts: dict = {}  # user_id -> attempt count


@router.post("/verify-otp", response_model=TokenResponse)
async def verify_otp(body: OTPVerifyRequest, request: Request, db: AsyncSession = Depends(get_db)):
    user_id = body.user_id

    # Rate limit: max 5 attempts per user
    attempts = _otp_attempts.get(user_id, 0)
    if attempts >= 5:
        raise HTTPException(
            status_code=429,
            detail="Too many incorrect attempts. Please sign in again to receive a new code."
        )

    result = await db.execute(
        select(OTPCode).where(
            OTPCode.user_id == uuid.UUID(user_id),
            OTPCode.code == body.otp_code,
            OTPCode.used == False,
            OTPCode.expires_at > datetime.utcnow(),
        )
    )
    otp = result.scalar_one_or_none()

    if not otp:
        _otp_attempts[user_id] = attempts + 1
        remaining = 5 - _otp_attempts[user_id]
        raise HTTPException(
            status_code=401,
            detail=f"Invalid or expired code. {remaining} attempt{'s' if remaining != 1 else ''} remaining."
        )

    # Success — clear attempts
    _otp_attempts.pop(user_id, None)
    otp.used = True

    user_result = await db.execute(select(User).where(User.id == uuid.UUID(user_id)))
    user = user_result.scalar_one_or_none()
    user.last_login = datetime.utcnow()
    await db.commit()

    role = str(user.role.value if hasattr(user.role, 'value') else user.role)
    token_data = {"sub": str(user.id), "email": user.email, "role": role}

    await write_audit_log(
        action="LOGIN_SUCCESS_2FA",
        user_id=str(user.id),
        user_role=role,
        resource="auth",
        ip_address=request.client.host,
    )

    return TokenResponse(
        access_token=create_access_token(token_data),
        refresh_token=create_refresh_token(token_data),
        role=role,
    )