from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, EmailStr
from datetime import datetime, timezone
from typing import Optional
import uuid

from app.db.database import get_db
from app.db.models import User, UserRole
from app.core.security import (
    hash_password, verify_password,
    create_access_token, create_refresh_token, decode_token,
    get_current_user
)
from app.core.encryption import encrypt, decrypt
from app.core.audit import write_audit_log

router = APIRouter()


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


@router.post("/login", response_model=TokenResponse)
async def login(
    request: Request,
    body: LoginRequest,
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    if not user or not verify_password(body.password, user.hashed_password):
        await write_audit_log(
            action="LOGIN_FAILED",
            user_id=body.email,
            user_role="unknown",
            resource="auth",
            ip_address=request.client.host,
            success=False,
        )
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is disabled")

    # Update last login
    user.last_login = datetime.now(timezone.utc)
    await db.commit()

    token_data = {
        "sub": str(user.id),
        "email": user.email,
        "role": user.role.value if hasattr(user.role, 'value') else user.role,
    }

    await write_audit_log(
        action="LOGIN_SUCCESS",
        user_id=str(user.id),
        user_role=str(user.role),
        resource="auth",
        ip_address=request.client.host,
    )

    return TokenResponse(
        access_token=create_access_token(token_data),
        refresh_token=create_refresh_token(token_data),
        role=str(user.role.value if hasattr(user.role, 'value') else user.role),
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
        "last_login": user.last_login,
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