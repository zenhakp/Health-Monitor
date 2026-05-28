from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import List, Optional
import uuid

from app.db.database import get_db
from app.db.models import User, UserRole, VitalReading
from app.core.security import require_doctor, require_patient, get_current_user
from app.core.encryption import decrypt
from app.core.audit import write_audit_log

router = APIRouter()


class PatientSummary(BaseModel):
    id: str
    email: str
    full_name: str
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
            phone=decrypt(p.phone_encrypted) if p.phone_encrypted else "",
            address=decrypt(p.address_encrypted) if p.address_encrypted else "",
            role=str(p.role.value if hasattr(p.role, "value") else p.role),
            is_active=p.is_active,
            created_at=str(p.created_at),
            last_login=str(p.last_login) if p.last_login else None,
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

    # In backend/app/api/patients.py, update both list and get_patient responses:
    return {
        "id": str(patient.id),
        "email": patient.email,
        "full_name": decrypt(patient.full_name_encrypted),
        "phone": decrypt(patient.phone_encrypted) if patient.phone_encrypted else "",
        "address": decrypt(patient.address_encrypted) if patient.address_encrypted else "",
        "role": str(patient.role.value if hasattr(patient.role, 'value') else patient.role),
        "is_active": patient.is_active,
        "created_at": str(patient.created_at),
        "last_login": str(patient.last_login) if patient.last_login else None,
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