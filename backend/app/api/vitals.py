from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timezone
import uuid

from app.db.database import get_db
from app.db.models import VitalReading, User
from app.core.security import get_current_user, require_doctor
from app.core.encryption import encrypt, decrypt
from app.core.audit import write_audit_log
from app.kafka.producer import publish_vitals
import asyncio
from app.simulator.vitals_simulator import VitalsSimulator

_simulator_tasks: dict = {}

router = APIRouter()


def _format_datetime(value: datetime | None) -> str | None:
    if not value:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


class VitalsInput(BaseModel):
    patient_id: str
    heart_rate: float
    spo2: float
    blood_pressure_sys: float
    blood_pressure_dia: float
    temperature: float
    respiratory_rate: float


class VitalsResponse(BaseModel):
    id: str
    patient_id: str
    timestamp: str
    heart_rate: float
    spo2: float
    blood_pressure_sys: float
    blood_pressure_dia: float
    temperature: float
    respiratory_rate: float
    is_anomaly: bool
    anomaly_score: Optional[float]
    anomaly_type: Optional[str]


def decrypt_vital(reading: VitalReading) -> dict:
    return {
        "id": str(reading.id),
        "patient_id": str(reading.patient_id),
        "timestamp": _format_datetime(reading.timestamp),
        "heart_rate": float(decrypt(reading.heart_rate_encrypted)),
        "spo2": float(decrypt(reading.spo2_encrypted)),
        "blood_pressure_sys": float(decrypt(reading.blood_pressure_sys_encrypted)),
        "blood_pressure_dia": float(decrypt(reading.blood_pressure_dia_encrypted)),
        "temperature": float(decrypt(reading.temperature_encrypted)),
        "respiratory_rate": float(decrypt(reading.respiratory_rate_encrypted)),
        "is_anomaly": reading.is_anomaly,
        "anomaly_score": reading.anomaly_score,
        "anomaly_type": reading.anomaly_type,
    }


@router.post("/ingest", status_code=201)
async def ingest_vitals(
    body: VitalsInput,
    request: Request,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Ingest a vitals reading — called by the simulator."""
    try:
        pid = uuid.UUID(body.patient_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid patient ID")

    # Validate ranges
    if not (30 <= body.heart_rate <= 250):
        raise HTTPException(status_code=422, detail="Heart rate out of valid range")
    if not (70 <= body.spo2 <= 100):
        raise HTTPException(status_code=422, detail="SpO2 out of valid range")
    if not (33.0 <= body.temperature <= 42.0):
        raise HTTPException(status_code=422, detail="Temperature out of valid range")

    reading = VitalReading(
        id=uuid.uuid4(),
        patient_id=pid,
        timestamp=datetime.utcnow(),
        heart_rate_encrypted=encrypt(str(body.heart_rate)),
        spo2_encrypted=encrypt(str(body.spo2)),
        blood_pressure_sys_encrypted=encrypt(str(body.blood_pressure_sys)),
        blood_pressure_dia_encrypted=encrypt(str(body.blood_pressure_dia)),
        temperature_encrypted=encrypt(str(body.temperature)),
        respiratory_rate_encrypted=encrypt(str(body.respiratory_rate)),
        is_anomaly=False,
        anomaly_score=None,
        anomaly_type=None,
    )
    db.add(reading)
    await db.commit()
    await db.refresh(reading)

    # Publish to Kafka for anomaly detection pipeline
    await publish_vitals(body.patient_id, {
        "reading_id": str(reading.id),
        "patient_id": body.patient_id,
        "timestamp": _format_datetime(reading.timestamp),
        "heart_rate": body.heart_rate,
        "spo2": body.spo2,
        "blood_pressure_sys": body.blood_pressure_sys,
        "blood_pressure_dia": body.blood_pressure_dia,
        "temperature": body.temperature,
        "respiratory_rate": body.respiratory_rate,
    })

    return {"reading_id": str(reading.id), "status": "ingested"}


@router.get("/patient/{patient_id}", response_model=List[VitalsResponse])
async def get_patient_vitals(
    patient_id: str,
    limit: int = 50,
    request: Request = None,
    current_user: dict = Depends(get_current_user),  # NOT require_doctor
    db: AsyncSession = Depends(get_db)
):
    """Get recent vitals for a patient."""
    role = current_user.get("role")
    requester_id = current_user.get("sub")

    if role == "patient" and str(requester_id) != str(patient_id):
        raise HTTPException(status_code=403, detail="Access denied")

    try:
        pid = uuid.UUID(patient_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid patient ID")

    result = await db.execute(
        select(VitalReading)
        .where(VitalReading.patient_id == pid)
        .order_by(desc(VitalReading.timestamp))
        .limit(min(limit, 200))
    )
    readings = result.scalars().all()

    return [decrypt_vital(r) for r in readings]


@router.get("/anomalies/{patient_id}")
async def get_anomalies(
    patient_id: str,
    limit: int = 20,
    current_user: dict = Depends(require_doctor),
    db: AsyncSession = Depends(get_db)
):
    """Get anomalous readings for a patient — doctors only."""
    try:
        pid = uuid.UUID(patient_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid patient ID")

    result = await db.execute(
        select(VitalReading)
        .where(VitalReading.patient_id == pid, VitalReading.is_anomaly == True)
        .order_by(desc(VitalReading.timestamp))
        .limit(min(limit, 100))
    )
    readings = result.scalars().all()

    return [decrypt_vital(r) for r in readings]

@router.post("/simulator/start")
async def start_simulator(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Start the vitals simulator for the current patient."""
    patient_id = current_user.get("sub")
    role = current_user.get("role")

    # Patients start simulator for themselves, doctors can too for testing
    if patient_id in _simulator_tasks:
        return {"status": "already_running", "patient_id": patient_id}

    token = None
    # Get a fresh token for the simulator to use
    from app.core.security import create_access_token
    token = create_access_token({"sub": patient_id, "email": current_user.get("email"), "role": role})

    async def run():
        sim = VitalsSimulator(
            patient_ids=[patient_id],
            api_base_url="http://localhost:8000",
            auth_token=token,
            interval_seconds=3.0,
        )
        await sim.run()

    task = asyncio.create_task(run())
    _simulator_tasks[patient_id] = task
    return {"status": "started", "patient_id": patient_id}


@router.post("/simulator/stop")
async def stop_simulator(current_user: dict = Depends(get_current_user)):
    """Stop the vitals simulator for the current patient."""
    patient_id = current_user.get("sub")
    if patient_id in _simulator_tasks:
        _simulator_tasks[patient_id].cancel()
        del _simulator_tasks[patient_id]
        return {"status": "stopped"}
    return {"status": "not_running"}


@router.get("/simulator/status")
async def simulator_status(current_user: dict = Depends(get_current_user)):
    patient_id = current_user.get("sub")
    running = patient_id in _simulator_tasks and not _simulator_tasks[patient_id].done()
    return {"running": running, "patient_id": patient_id}