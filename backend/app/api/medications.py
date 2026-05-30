from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import List
from datetime import datetime
import uuid
import json

from app.db.database import get_db
from app.db.models import MedicationReminder
from app.core.security import get_current_user
from app.core.encryption import encrypt, decrypt

router = APIRouter()


class MedicationRequest(BaseModel):
    medication_name: str
    dosage: str = ""
    schedule_times: List[str]  # ["08:00", "14:00", "20:00"]


@router.post("/", status_code=201)
async def add_medication(
    body: MedicationRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    patient_id = current_user.get("sub")
    med = MedicationReminder(
        id=uuid.uuid4(),
        patient_id=uuid.UUID(patient_id),
        medication_name_encrypted=encrypt(body.medication_name),
        dosage_encrypted=encrypt(body.dosage) if body.dosage else None,
        schedule_times=json.dumps(body.schedule_times),
        is_active=True,
        created_at=datetime.utcnow(),
    )
    db.add(med)
    await db.commit()
    return {"id": str(med.id), "message": "Medication reminder added"}


@router.get("/")
async def get_medications(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    patient_id = current_user.get("sub")
    result = await db.execute(
        select(MedicationReminder)
        .where(
            MedicationReminder.patient_id == uuid.UUID(patient_id),
            MedicationReminder.is_active == True
        )
    )
    meds = result.scalars().all()
    return [
        {
            "id": str(m.id),
            "medication_name": decrypt(m.medication_name_encrypted),
            "dosage": decrypt(m.dosage_encrypted) if m.dosage_encrypted else "",
            "schedule_times": json.loads(m.schedule_times),
            "created_at": str(m.created_at),
        }
        for m in meds
    ]


@router.put("/{med_id}")
async def update_medication(
    med_id: str,
    body: MedicationRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    patient_id = current_user.get("sub")
    result = await db.execute(
        select(MedicationReminder).where(
            MedicationReminder.id == uuid.UUID(med_id),
            MedicationReminder.patient_id == uuid.UUID(patient_id),
            MedicationReminder.is_active == True,
        )
    )
    med = result.scalar_one_or_none()
    if not med:
        raise HTTPException(status_code=404, detail="Medication not found")

    med.medication_name_encrypted = encrypt(body.medication_name)
    med.dosage_encrypted = encrypt(body.dosage) if body.dosage else None
    med.schedule_times = json.dumps(body.schedule_times)
    await db.commit()
    return {"message": "Medication reminder updated"}


@router.delete("/{med_id}")
async def delete_medication(
    med_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(MedicationReminder).where(MedicationReminder.id == uuid.UUID(med_id))
    )
    med = result.scalar_one_or_none()
    if not med:
        raise HTTPException(status_code=404, detail="Medication not found")
    med.is_active = False
    await db.commit()
    return {"message": "Medication reminder removed"}