from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from datetime import datetime, timedelta, timezone
import uuid
import numpy as np

from app.db.database import get_db
from app.db.models import VitalReading, PatientBaseline, User
from app.core.security import get_current_user, require_doctor
from app.core.encryption import decrypt

router = APIRouter()


async def _get_readings_array(patient_id: str, days: int, db: AsyncSession):
    """Get last N days of vitals as decrypted arrays."""
    since = datetime.utcnow() - timedelta(days=days)
    result = await db.execute(
        select(VitalReading)
        .where(
            VitalReading.patient_id == uuid.UUID(patient_id),
            VitalReading.timestamp >= since
        )
        .order_by(VitalReading.timestamp.asc())
    )
    readings = result.scalars().all()
    if not readings:
        return [], []

    timestamps = [r.timestamp for r in readings]
    data = []
    for r in readings:
        try:
            data.append({
                "heart_rate": float(decrypt(r.heart_rate_encrypted)),
                "spo2": float(decrypt(r.spo2_encrypted)),
                "blood_pressure_sys": float(decrypt(r.blood_pressure_sys_encrypted)),
                "blood_pressure_dia": float(decrypt(r.blood_pressure_dia_encrypted)),
                "temperature": float(decrypt(r.temperature_encrypted)),
                "respiratory_rate": float(decrypt(r.respiratory_rate_encrypted)),
                "is_anomaly": r.is_anomaly,
                "timestamp": str(r.timestamp),
            })
        except Exception:
            continue
    return data, timestamps


@router.get("/trends/{patient_id}")
async def get_trends(
    patient_id: str,
    days: int = 7,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """7-day vitals trends with simple linear regression predictions."""
    role = current_user.get("role")
    requester_id = current_user.get("sub")

    if role == "patient" and str(requester_id) != str(patient_id):
        raise HTTPException(status_code=403, detail="Access denied")

    data, timestamps = await _get_readings_array(patient_id, days, db)
    if len(data) < 3:
        return {"trends": {}, "predictions": {}, "message": "Not enough data for trend analysis"}

    vital_keys = ["heart_rate", "spo2", "blood_pressure_sys", "blood_pressure_dia", "temperature", "respiratory_rate"]
    trends = {}
    predictions = {}

    x = np.arange(len(data), dtype=float)

    for key in vital_keys:
        values = [d[key] for d in data]
        y = np.array(values)

        # Linear regression
        if len(x) > 1:
            coeffs = np.polyfit(x, y, 1)
            slope = float(coeffs[0])
            trend = "rising" if slope > 0.01 else "falling" if slope < -0.01 else "stable"
            # Predict next 6 readings (~30 min if readings every 5 min)
            next_x = len(x) + 6
            predicted = float(np.polyval(coeffs, next_x))
        else:
            slope = 0
            trend = "stable"
            predicted = values[-1]

        trends[key] = {
            "values": values[-50:],  # last 50 for chart
            "timestamps": [d["timestamp"] for d in data[-50:]],
            "trend": trend,
            "slope": round(slope, 4),
            "mean": round(float(np.mean(y)), 2),
            "min": round(float(np.min(y)), 2),
            "max": round(float(np.max(y)), 2),
            "std": round(float(np.std(y)), 2),
        }
        predictions[key] = round(predicted, 2)

    anomaly_rate = sum(1 for d in data if d["is_anomaly"]) / len(data) * 100

    return {
        "trends": trends,
        "predictions": predictions,
        "anomaly_rate": round(anomaly_rate, 1),
        "total_readings": len(data),
        "period_days": days,
    }


@router.get("/baseline/{patient_id}")
async def get_or_update_baseline(
    patient_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Calculate and update patient's personal vitals baseline."""
    data, _ = await _get_readings_array(patient_id, 30, db)

    if len(data) < 10:
        return {"message": "Need at least 10 readings to establish baseline", "baseline": None}

    # Only use non-anomaly readings for baseline
    normal_data = [d for d in data if not d["is_anomaly"]]
    if len(normal_data) < 5:
        normal_data = data

    vital_keys = ["heart_rate", "spo2", "blood_pressure_sys", "blood_pressure_dia", "temperature", "respiratory_rate"]
    baseline = {f"avg_{k}": round(float(np.mean([d[k] for d in normal_data])), 2) for k in vital_keys}
    baseline["readings_count"] = len(normal_data)
    baseline["calculated_at"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    # Upsert baseline
    result = await db.execute(
        select(PatientBaseline).where(PatientBaseline.patient_id == uuid.UUID(patient_id))
    )
    existing = result.scalar_one_or_none()
    if existing:
        for k, v in baseline.items():
            if hasattr(existing, k):
                setattr(existing, k, v)
    else:
        from app.db.models import PatientBaseline as PB
        new_baseline = PB(id=uuid.uuid4(), patient_id=uuid.UUID(patient_id), **baseline)
        db.add(new_baseline)

    await db.commit()
    return {"baseline": baseline}


@router.get("/report/{patient_id}")
async def get_health_report_data(
    patient_id: str,
    days: int = 30,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Full health report data for PDF generation."""
    role = current_user.get("role")
    requester_id = current_user.get("sub")
    if role == "patient" and str(requester_id) != str(patient_id):
        raise HTTPException(status_code=403, detail="Access denied")

    # Patient info
    p_result = await db.execute(select(User).where(User.id == uuid.UUID(patient_id)))
    patient = p_result.scalar_one_or_none()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    data, _ = await _get_readings_array(patient_id, days, db)

    vital_keys = ["heart_rate", "spo2", "blood_pressure_sys", "blood_pressure_dia", "temperature", "respiratory_rate"]
    vitals_summary = {}
    if data:
        for key in vital_keys:
            values = [d[key] for d in data]
            vitals_summary[key] = {
                "mean": round(float(np.mean(values)), 2),
                "min": round(float(np.min(values)), 2),
                "max": round(float(np.max(values)), 2),
                "std": round(float(np.std(values)), 2),
            }

    anomaly_count = sum(1 for d in data if d["is_anomaly"])

    return {
        "patient_name": decrypt(patient.full_name_encrypted),
        "patient_email": patient.email,
        "period_days": days,
        "total_readings": len(data),
        "anomaly_count": anomaly_count,
        "anomaly_rate": round(anomaly_count / max(len(data), 1) * 100, 1),
        "vitals_summary": vitals_summary,
        "generated_at": str(datetime.utcnow()),
    }