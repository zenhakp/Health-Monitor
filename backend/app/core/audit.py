import json
from datetime import datetime
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.database import async_session_maker


async def write_audit_log(
    action: str,
    user_id: str,
    user_role: str,
    resource: str,
    resource_id: Optional[str] = None,
    details: Optional[dict] = None,
    ip_address: Optional[str] = None,
    success: bool = True,
):
    """Immutable audit log — never updated or deleted, only inserted."""
    from app.db.models import AuditLog

    async with async_session_maker() as session:
        log = AuditLog(
            action=action,
            user_id=user_id,
            user_role=user_role,
            resource=resource,
            resource_id=resource_id,
            details=json.dumps(details or {}),
            ip_address=ip_address,
            success=success,
            timestamp=datetime.utcnow(),
        )
        session.add(log)
        await session.commit()