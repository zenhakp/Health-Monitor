from fastapi import APIRouter, Depends, Request, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime, timezone
import uuid

from app.db.database import get_db
from app.db.models import User, Alert, VitalReading
from app.core.security import get_current_user
from app.core.encryption import decrypt, encrypt
from app.core.audit import write_audit_log
from app.api.alerts import broadcast_alert

router = APIRouter()


def _format_datetime(value: datetime | None) -> str | None:
    if not value:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


@router.post("/sos")
async def trigger_sos(
    request: Request,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    patient_id = current_user.get("sub")
    role = current_user.get("role")

    if role != "patient":
        raise HTTPException(status_code=403, detail="Only patients can trigger SOS")

    # Get patient name
    result = await db.execute(select(User).where(User.id == uuid.UUID(patient_id)))
    patient = result.scalar_one_or_none()
    patient_name = decrypt(patient.full_name_encrypted) if patient else "Unknown patient"

    # Use a valid vital reading reference for the SOS alert
    vital_result = await db.execute(
        select(VitalReading)
        .where(VitalReading.patient_id == uuid.UUID(patient_id))
        .order_by(VitalReading.timestamp.desc())
        .limit(1)
    )
    latest_vital = vital_result.scalar_one_or_none()

    if latest_vital:
        vital_id = latest_vital.id
    else:
        placeholder_vital = VitalReading(
            id=uuid.uuid4(),
            patient_id=uuid.UUID(patient_id),
            timestamp=datetime.utcnow(),
            heart_rate_encrypted=encrypt("0"),
            spo2_encrypted=encrypt("0"),
            blood_pressure_sys_encrypted=encrypt("0"),
            blood_pressure_dia_encrypted=encrypt("0"),
            temperature_encrypted=encrypt("0"),
            respiratory_rate_encrypted=encrypt("0"),
            is_anomaly=False,
            anomaly_score=0.0,
        )
        db.add(placeholder_vital)
        await db.flush()
        vital_id = placeholder_vital.id

    sos_alert = Alert(
        id=uuid.uuid4(),
        vital_id=vital_id,
        patient_id=uuid.UUID(patient_id),
        severity="critical",
        anomaly_type="sos_emergency",
        llm_interpretation=f"⚠️ EMERGENCY SOS — {patient_name} has triggered an emergency alert and requires immediate attention. Please contact the patient immediately or dispatch emergency services.",
        is_acknowledged=False,
        created_at=datetime.utcnow(),
    )
    db.add(sos_alert)
    await db.commit()

    # Broadcast to all doctors via SSE
    alert_data = {
        "type": "alert",
        "alert_id": str(sos_alert.id),
        "patient_id": patient_id,
        "patient_name": patient_name,
        "severity": "critical",
        "anomaly_type": "sos_emergency",
        "interpretation": sos_alert.llm_interpretation,
        "timestamp": _format_datetime(sos_alert.created_at),
        "is_sos": True,
    }

    # Broadcast to all patients (doctors monitoring them)
    from app.api.alerts import _sse_subscribers
    for subscriber_patient_id, queues in _sse_subscribers.items():
        for queue in queues:
            try:
                queue.put_nowait(alert_data)
            except Exception:
                pass

    await write_audit_log(
        action="SOS_TRIGGERED",
        user_id=patient_id,
        user_role="patient",
        resource="emergency",
        resource_id=str(sos_alert.id),
        ip_address=request.client.host,
        details={"patient_name": patient_name},
    )

    return {"message": "SOS alert sent to all available doctors", "alert_id": str(sos_alert.id)}