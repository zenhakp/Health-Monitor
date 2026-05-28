from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from typing import List, Optional, AsyncGenerator
import uuid
import json
import asyncio

from app.db.database import get_db, async_session_maker
from app.db.models import Alert, User
from app.core.security import require_doctor, get_current_user, get_current_user_optional
from app.core.audit import write_audit_log
from pydantic import BaseModel
from datetime import datetime
from app.core.encryption import decrypt


router = APIRouter()

# In-memory SSE subscriber registry: patient_id -> list of queues
_sse_subscribers: dict[str, list[asyncio.Queue]] = {}


def register_sse_subscriber(patient_id: str) -> asyncio.Queue:
    queue = asyncio.Queue(maxsize=50)
    if patient_id not in _sse_subscribers:
        _sse_subscribers[patient_id] = []
    _sse_subscribers[patient_id].append(queue)
    return queue


def unregister_sse_subscriber(patient_id: str, queue: asyncio.Queue):
    if patient_id in _sse_subscribers:
        try:
            _sse_subscribers[patient_id].remove(queue)
        except ValueError:
            pass


async def broadcast_alert(patient_id: str, alert_data: dict):
    """Push alert to all SSE subscribers watching this patient."""
    if patient_id in _sse_subscribers:
        for queue in _sse_subscribers[patient_id]:
            try:
                queue.put_nowait(alert_data)
            except asyncio.QueueFull:
                pass  # subscriber too slow, skip


@router.get("/stream/{patient_id}")
async def alert_stream(
    patient_id: str,
    token: str = None,
    current_user: dict = Depends(get_current_user_optional),
):
    """SSE endpoint — accepts token as query param for EventSource compatibility."""
    # Validate token manually since EventSource can't send headers
    if token:
        try:
            from app.core.security import decode_token
            payload = decode_token(token)
            role = payload.get("role", "")
            if role not in ("doctor", "admin"):
                raise HTTPException(status_code=403, detail="Doctors only")
        except Exception:
            raise HTTPException(status_code=403, detail="Invalid token")
    else:
        if not current_user or current_user.get("role") not in ("doctor", "admin"):
            raise HTTPException(status_code=403, detail="Doctors only")

    async def event_generator():
        queue = register_sse_subscriber(patient_id)
        try:
            yield f"data: {json.dumps({'type': 'connected', 'patient_id': patient_id})}\n\n"
            while True:
                try:
                    alert = await asyncio.wait_for(queue.get(), timeout=30.0)
                    yield f"data: {json.dumps(alert)}\n\n"
                except asyncio.TimeoutError:
                    yield f"data: {json.dumps({'type': 'heartbeat'})}\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            unregister_sse_subscriber(patient_id, queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"},
    )


@router.get("/patient/{patient_id}")
async def get_patient_alerts(
    patient_id: str,
    limit: int = 50,
    unacknowledged_only: bool = False,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    role = current_user.get("role")
    requester_id = current_user.get("sub")

    if role == "patient" and str(requester_id) != str(patient_id):
        raise HTTPException(status_code=403, detail="Access denied")

    try:
        pid = uuid.UUID(patient_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid patient ID")

    query = select(Alert).where(Alert.patient_id == pid)
    if unacknowledged_only:
        query = query.where(Alert.is_acknowledged == False)
    query = query.order_by(desc(Alert.created_at)).limit(min(limit, 200))

    result = await db.execute(query)
    alerts = result.scalars().all()

    return [
        {
            "id": str(a.id),
            "patient_id": str(a.patient_id),
            "vital_id": str(a.vital_id),
            "severity": a.severity,
            "anomaly_type": a.anomaly_type if hasattr(a, 'anomaly_type') else None,
            "llm_interpretation": a.llm_interpretation,
            "is_acknowledged": a.is_acknowledged,
            "acknowledged_by_name": a.acknowledged_by_name,
            "doctor_notes": a.doctor_notes,
            "acknowledged_at": str(a.acknowledged_at) if a.acknowledged_at else None,
            "created_at": str(a.created_at),
        }
        for a in alerts
    ]


class AcknowledgeRequest(BaseModel):
    notes: str = ""

@router.patch("/{alert_id}/acknowledge")
async def acknowledge_alert(
    alert_id: str,
    body: AcknowledgeRequest,
    request: Request,
    current_user: dict = Depends(require_doctor),
    db: AsyncSession = Depends(get_db)
):
    """Doctor acknowledges an alert with required notes."""
    try:
        aid = uuid.UUID(alert_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid alert ID")

    result = await db.execute(select(Alert).where(Alert.id == aid))
    alert = result.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    if alert.is_acknowledged:
        raise HTTPException(status_code=400, detail="Alert already acknowledged")

    # Get doctor's name
    doctor_result = await db.execute(
        select(User).where(User.id == uuid.UUID(current_user["sub"]))
    )
    doctor = doctor_result.scalar_one_or_none()
    doctor_name = decrypt(doctor.full_name_encrypted) if doctor else "Unknown"

    alert.is_acknowledged = True
    alert.acknowledged_by = uuid.UUID(current_user["sub"])
    alert.acknowledged_by_name = doctor_name
    alert.doctor_notes = body.notes
    alert.acknowledged_at = datetime.utcnow()
    await db.commit()

    await write_audit_log(
        action="ACKNOWLEDGE_ALERT",
        user_id=current_user["sub"],
        user_role=current_user["role"],
        resource="alert",
        resource_id=alert_id,
        details={"notes": body.notes, "patient_id": str(alert.patient_id), "doctor_name": doctor_name},
        ip_address=request.client.host,
    )

    return {
        "message": "Alert acknowledged",
        "acknowledged_by": doctor_name,
        "notes": body.notes,
        "acknowledged_at": str(alert.acknowledged_at),
    }