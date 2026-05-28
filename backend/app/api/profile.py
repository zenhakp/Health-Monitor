from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, EmailStr
from datetime import datetime
import uuid
import os
import base64
import aiofiles

from app.db.database import get_db
from app.db.models import User
from app.core.security import get_current_user
from app.core.encryption import encrypt, decrypt
from app.core.audit import write_audit_log

router = APIRouter()

AVATARS_DIR = "avatars"
os.makedirs(AVATARS_DIR, exist_ok=True)


class UpdateProfileRequest(BaseModel):
    full_name: str = ""
    phone: str = ""
    address: str = ""


@router.patch("/update")
async def update_profile(
    body: UpdateProfileRequest,
    request: Request,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    user_id = current_user.get("sub")
    result = await db.execute(select(User).where(User.id == uuid.UUID(user_id)))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    role = str(user.role.value if hasattr(user.role, 'value') else user.role)

    if body.full_name:
        name = body.full_name
        if role == "doctor" and not name.startswith("Dr."):
            name = f"Dr. {name}"
        user.full_name_encrypted = encrypt(name)

    if body.phone is not None:
        user.phone_encrypted = encrypt(body.phone) if body.phone else None
    if body.address is not None:
        user.address_encrypted = encrypt(body.address) if body.address else None

    await db.commit()

    await write_audit_log(
        action="UPDATE_PROFILE",
        user_id=user_id,
        user_role=current_user.get("role"),
        resource="user",
        resource_id=user_id,
        ip_address=request.client.host,
    )

    return {
        "message": "Profile updated",
        "full_name": decrypt(user.full_name_encrypted),
        "phone": decrypt(user.phone_encrypted) if user.phone_encrypted else "",
        "address": decrypt(user.address_encrypted) if user.address_encrypted else "",
    }


@router.post("/avatar")
async def upload_avatar(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    user_id = current_user.get("sub")

    allowed = ["image/jpeg", "image/png", "image/jpg", "image/webp"]
    if file.content_type not in allowed:
        raise HTTPException(status_code=400, detail="Only JPEG, PNG, WebP images allowed")

    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image too large — max 5MB")

    # Store as base64 in DB for simplicity
    ext = file.filename.split(".")[-1] if "." in file.filename else "jpg"
    b64 = base64.b64encode(content).decode()
    data_url = f"data:{file.content_type};base64,{b64}"

    result = await db.execute(select(User).where(User.id == uuid.UUID(user_id)))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.avatar_url = data_url
    await db.commit()

    return {"avatar_url": data_url, "message": "Avatar updated"}


@router.get("/me")
async def get_profile(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    user_id = current_user.get("sub")
    result = await db.execute(select(User).where(User.id == uuid.UUID(user_id)))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    role = str(user.role.value if hasattr(user.role, 'value') else user.role)
    return {
        "id": str(user.id),
        "email": user.email,
        "full_name": decrypt(user.full_name_encrypted),
        "phone": decrypt(user.phone_encrypted) if user.phone_encrypted else "",
        "address": decrypt(user.address_encrypted) if user.address_encrypted else "",
        "role": role,
        "avatar_url": user.avatar_url or "",
        "created_at": str(user.created_at),
        "last_login": str(user.last_login) if user.last_login else None,
        "is_active": user.is_active,
    }