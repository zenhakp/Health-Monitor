from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from app.db.database import get_db
from app.db.models import User, UserRole, AuditLog
from app.core.security import require_role
from app.core.encryption import decrypt
from app.core.audit import write_audit_log
from datetime import datetime, timezone
import uuid

router = APIRouter()
require_admin = require_role("admin")


@router.get("/patients")
async def list_all_patients(
    current_user: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(User).where(User.role == UserRole.patient).order_by(User.created_at.desc())
    )
    users = result.scalars().all()
    return [_format_user(u) for u in users]


@router.get("/doctors")
async def list_all_doctors(
    current_user: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(User).where(User.role == UserRole.doctor).order_by(User.created_at.desc())
    )
    users = result.scalars().all()
    return [_format_user(u) for u in users]


@router.get("/audit-logs")
async def get_audit_logs(
    limit: int = 200,
    current_user: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(AuditLog).order_by(desc(AuditLog.timestamp)).limit(limit)
    )
    logs = result.scalars().all()
    return [
        {
            "id": str(l.id),
            "action": l.action,
            "user_id": l.user_id,
            "user_role": l.user_role,
            "resource": l.resource,
            "resource_id": l.resource_id,
            "details": l.details,
            "ip_address": l.ip_address,
            "success": l.success,
            "timestamp": str(l.timestamp),
        }
        for l in logs
    ]


@router.patch("/users/{user_id}/deactivate")
async def deactivate_user(
    user_id: str,
    request: Request,
    current_user: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(User).where(User.id == uuid.UUID(user_id)))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_active = False
    await db.commit()
    await write_audit_log(
        action="DEACTIVATE_USER",
        user_id=current_user["sub"],
        user_role="admin",
        resource="user",
        resource_id=user_id,
        ip_address=request.client.host,
    )
    return {"message": f"User {decrypt(user.full_name_encrypted)} deactivated"}


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: str,
    request: Request,
    current_user: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(User).where(User.id == uuid.UUID(user_id)))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    name = decrypt(user.full_name_encrypted)
    await db.delete(user)
    await db.commit()
    await write_audit_log(
        action="DELETE_USER",
        user_id=current_user["sub"],
        user_role="admin",
        resource="user",
        resource_id=user_id,
        ip_address=request.client.host,
    )
    return {"message": f"User {name} permanently deleted"}


def _format_datetime(value: datetime | None) -> str | None:
    if not value:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.isoformat()


def _format_user(u: User) -> dict:
    return {
        "id": str(u.id),
        "email": u.email,
        "full_name": decrypt(u.full_name_encrypted),
        "phone": decrypt(u.phone_encrypted) if u.phone_encrypted else "",
        "address": decrypt(u.address_encrypted) if u.address_encrypted else "",
        "role": str(u.role.value if hasattr(u.role, 'value') else u.role),
        "is_active": u.is_active,
        "created_at": str(u.created_at),
        "last_login": _format_datetime(u.last_login),
    }