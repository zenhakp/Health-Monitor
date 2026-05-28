from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Request
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import Column, String, DateTime, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
import uuid
import os
import aiofiles
from datetime import datetime

from app.db.database import get_db
from app.db.models import Base
from app.core.security import get_current_user, require_doctor
from app.core.audit import write_audit_log
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Request, Query
from fastapi.responses import FileResponse
from app.core.security import decode_token
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

router = APIRouter()

REPORTS_DIR = "reports"
os.makedirs(REPORTS_DIR, exist_ok=True)
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB
_bearer = HTTPBearer(auto_error=False)

def get_current_user_optional_query(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer)
):
    if not credentials:
        return None
    try:
        from app.core.security import decode_token
        return decode_token(credentials.credentials)
    except Exception:
        return None

class HealthReport(Base):
    __tablename__ = "health_reports"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    patient_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    filename = Column(String(255), nullable=False)
    original_name = Column(String(255), nullable=False)
    file_type = Column(String(50), nullable=False)
    description = Column(Text, nullable=True)
    uploaded_at = Column(DateTime, default=datetime.utcnow)


@router.post("/upload")
async def upload_report(
    request: Request,
    file: UploadFile = File(...),
    description: str = "",
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    patient_id = current_user.get("sub")

    allowed_types = ["application/pdf", "image/jpeg", "image/png", "image/jpg"]
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Only PDF and images allowed")

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File too large — max 10MB")

    file_id = str(uuid.uuid4())
    ext = file.filename.split(".")[-1] if "." in file.filename else "pdf"
    saved_filename = f"{file_id}.{ext}"
    file_path = os.path.join(REPORTS_DIR, saved_filename)

    async with aiofiles.open(file_path, "wb") as f:
        await f.write(content)

    report = HealthReport(
        id=uuid.UUID(file_id),
        patient_id=uuid.UUID(patient_id),
        filename=saved_filename,
        original_name=file.filename,
        file_type=file.content_type,
        description=description,
        uploaded_at=datetime.utcnow(),
    )
    db.add(report)
    await db.commit()

    await write_audit_log(
        action="UPLOAD_HEALTH_REPORT",
        user_id=patient_id,
        user_role=current_user.get("role"),
        resource="health_report",
        resource_id=file_id,
        ip_address=request.client.host,
    )

    return {"report_id": file_id, "filename": file.filename, "message": "Report uploaded"}


@router.get("/patient/{patient_id}")
async def get_patient_reports(
    patient_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    role = current_user.get("role")
    requester_id = current_user.get("sub")

    if role == "patient" and str(requester_id) != str(patient_id):
        raise HTTPException(status_code=403, detail="Access denied")

    result = await db.execute(
        select(HealthReport)
        .where(HealthReport.patient_id == uuid.UUID(patient_id))
        .order_by(HealthReport.uploaded_at.desc())
    )
    reports = result.scalars().all()

    return [
        {
            "id": str(r.id),
            "original_name": r.original_name,
            "file_type": r.file_type,
            "description": r.description,
            "uploaded_at": str(r.uploaded_at),
        }
        for r in reports
    ]


@router.get("/view/{report_id}")
async def view_report(
    report_id: str,
    token: str = Query(None),
    current_user: dict = Depends(get_current_user_optional_query),
    db: AsyncSession = Depends(get_db)
):
    # Accept token from query param (for iframe/direct URL access)
    user = current_user
    if not user and token:
        try:
            user = decode_token(token)
        except Exception:
            raise HTTPException(status_code=401, detail="Invalid token")
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    result = await db.execute(
        select(HealthReport).where(HealthReport.id == uuid.UUID(report_id))
    )
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    role = user.get("role")
    requester_id = user.get("sub")
    if role == "patient" and str(requester_id) != str(report.patient_id):
        raise HTTPException(status_code=403, detail="Access denied")

    file_path = os.path.join(REPORTS_DIR, report.filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found on server")

    return FileResponse(
        file_path,
        media_type=report.file_type,
        headers={
            "Content-Disposition": f"inline; filename={report.original_name}",
            "Access-Control-Allow-Origin": "*",
        }
    )