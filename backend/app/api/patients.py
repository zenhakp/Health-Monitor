from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timezone
import uuid

from app.db.database import get_db
from app.db.models import User, UserRole, VitalReading
from app.core.security import require_doctor, require_patient, get_current_user
from app.core.encryption import decrypt
from app.core.audit import write_audit_log
from app.db.models import User, UserRole, VitalReading, Alert

router = APIRouter()


def _format_datetime(value: datetime | None) -> str | None:
    if not value:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.isoformat()


class PatientSummary(BaseModel):
    id: str
    email: str
    full_name: str
    avatar_url: str = ""
    phone: str = ""
    address: str = ""
    role: str
    is_active: bool
    created_at: str
    last_login: Optional[str]
    recent_anomaly: bool = False


@router.get("/", response_model=List[PatientSummary])
async def list_patients(
    request: Request,
    current_user: dict = Depends(require_doctor),
    db: AsyncSession = Depends(get_db)
):
    """Doctors and admins can list all patients."""
    result = await db.execute(
        select(User).where(User.role == UserRole.patient, User.is_active == True)
    )
    patients = result.scalars().all()

    await write_audit_log(
        action="LIST_PATIENTS",
        user_id=current_user["sub"],
        user_role=current_user["role"],
        resource="patients",
        ip_address=request.client.host,
    )

    summaries = []
    for p in patients:
        # Check recent anomaly
        anomaly_result = await db.execute(
            select(VitalReading)
            .where(VitalReading.patient_id == p.id, VitalReading.is_anomaly == True)
            .order_by(VitalReading.timestamp.desc())
            .limit(1)
        )
        recent_anomaly = anomaly_result.scalar_one_or_none() is not None

        summaries.append(PatientSummary(
            id=str(p.id),
            email=p.email,
            full_name=decrypt(p.full_name_encrypted),
            avatar_url=p.avatar_url or "",
            phone=decrypt(p.phone_encrypted) if p.phone_encrypted else "",
            address=decrypt(p.address_encrypted) if p.address_encrypted else "",
            role=str(p.role.value if hasattr(p.role, "value") else p.role),
            is_active=p.is_active,
            created_at=_format_datetime(p.created_at),
            last_login=_format_datetime(p.last_login),
            recent_anomaly=recent_anomaly,
        ))

    return summaries


@router.get("/{patient_id}")
async def get_patient(
    patient_id: str,
    request: Request,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Doctors can view any patient. Patients can only view themselves."""
    role = current_user.get("role")
    requester_id = current_user.get("sub")

    if role == "patient" and str(requester_id) != str(patient_id):
        raise HTTPException(status_code=403, detail="Patients can only view their own data")

    try:
        pid = uuid.UUID(patient_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid patient ID format")

    result = await db.execute(select(User).where(User.id == pid))
    patient = result.scalar_one_or_none()

    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    await write_audit_log(
        action="VIEW_PATIENT",
        user_id=requester_id,
        user_role=role,
        resource="patient",
        resource_id=patient_id,
        ip_address=request.client.host,
    )
    return {
        "id": str(patient.id),
        "email": patient.email,
        "full_name": decrypt(patient.full_name_encrypted),
        "avatar_url": patient.avatar_url or "",
        "phone": decrypt(patient.phone_encrypted) if patient.phone_encrypted else "",
        "address": decrypt(patient.address_encrypted) if patient.address_encrypted else "",
        "role": str(patient.role.value if hasattr(patient.role, 'value') else patient.role),
        "is_active": patient.is_active,
        "created_at": _format_datetime(patient.created_at),
        "last_login": _format_datetime(patient.last_login),
    }


@router.delete("/{patient_id}")
async def deactivate_patient(
    patient_id: str,
    request: Request,
    current_user: dict = Depends(require_doctor),
    db: AsyncSession = Depends(get_db)
):
    """Doctors can deactivate patients (soft delete — never hard delete medical records)."""
    try:
        pid = uuid.UUID(patient_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid patient ID format")

    result = await db.execute(select(User).where(User.id == pid))
    patient = result.scalar_one_or_none()

    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    patient.is_active = False
    await db.commit()

    await write_audit_log(
        action="DEACTIVATE_PATIENT",
        user_id=current_user["sub"],
        user_role=current_user["role"],
        resource="patient",
        resource_id=patient_id,
        ip_address=request.client.host,
    )

    return {"message": "Patient deactivated successfully"}

@router.get("/{patient_id}/summary")
async def get_patient_summary(
    patient_id: str,
    current_user: dict = Depends(require_doctor),
    db: AsyncSession = Depends(get_db)
):
    """Full patient summary for doctor view — profile + recent vitals + alert stats."""
    try:
        pid = uuid.UUID(patient_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid patient ID")

    # Patient info
    result = await db.execute(select(User).where(User.id == pid))
    patient = result.scalar_one_or_none()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    # Recent vitals
    vitals_result = await db.execute(
        select(VitalReading)
        .where(VitalReading.patient_id == pid)
        .order_by(VitalReading.timestamp.desc())
        .limit(1)
    )
    latest_vital = vitals_result.scalar_one_or_none()

    # Alert counts
    alerts_result = await db.execute(
        select(Alert).where(Alert.patient_id == pid)
    )
    all_alerts = alerts_result.scalars().all()
    unacked = [a for a in all_alerts if not a.is_acknowledged]
    critical = [a for a in all_alerts if a.severity == "critical"]

    # Total readings
    readings_result = await db.execute(
        select(VitalReading).where(VitalReading.patient_id == pid)
    )
    all_readings = readings_result.scalars().all()
    anomaly_readings = [r for r in all_readings if r.is_anomaly]

    from app.core.encryption import decrypt

    latest_vitals_decrypted = None
    if latest_vital:
        latest_vitals_decrypted = {
            "heart_rate": float(decrypt(latest_vital.heart_rate_encrypted)),
            "spo2": float(decrypt(latest_vital.spo2_encrypted)),
            "blood_pressure_sys": float(decrypt(latest_vital.blood_pressure_sys_encrypted)),
            "blood_pressure_dia": float(decrypt(latest_vital.blood_pressure_dia_encrypted)),
            "temperature": float(decrypt(latest_vital.temperature_encrypted)),
            "respiratory_rate": float(decrypt(latest_vital.respiratory_rate_encrypted)),
            "timestamp": _format_datetime(latest_vital.timestamp),
            "is_anomaly": latest_vital.is_anomaly,
        }

    return {
        "id": str(patient.id),
        "full_name": decrypt(patient.full_name_encrypted),
        "avatar_url": patient.avatar_url or "",
        "email": patient.email,
        "phone": decrypt(patient.phone_encrypted) if patient.phone_encrypted else "",
        "address": decrypt(patient.address_encrypted) if patient.address_encrypted else "",
        "is_active": patient.is_active,
        "created_at": _format_datetime(patient.created_at),
        "last_login": _format_datetime(patient.last_login),
        "stats": {
            "total_readings": len(all_readings),
            "anomaly_count": len(anomaly_readings),
            "total_alerts": len(all_alerts),
            "unacknowledged_alerts": len(unacked),
            "critical_alerts": len(critical),
        },
        "latest_vitals": latest_vitals_decrypted,
    }