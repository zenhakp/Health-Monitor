from sqlalchemy import Column, String, Float, Boolean, DateTime, Text, Enum, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship, DeclarativeBase
from datetime import datetime
import uuid
import enum


class Base(DeclarativeBase):
    pass


class UserRole(str, enum.Enum):
    patient = "patient"
    doctor = "doctor"
    admin = "admin"


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    full_name_encrypted = Column(Text, nullable=False)
    phone_encrypted = Column(Text, nullable=True)        # ADD
    address_encrypted = Column(Text, nullable=True)      # ADD
    role = Column(Enum(UserRole), nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    last_login = Column(DateTime, nullable=True)

    vitals = relationship("VitalReading", back_populates="patient",
                          foreign_keys="VitalReading.patient_id")


class VitalReading(Base):
    __tablename__ = "vital_readings"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    patient_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)

    # Stored encrypted
    heart_rate_encrypted = Column(Text, nullable=False)
    spo2_encrypted = Column(Text, nullable=False)
    blood_pressure_sys_encrypted = Column(Text, nullable=False)
    blood_pressure_dia_encrypted = Column(Text, nullable=False)
    temperature_encrypted = Column(Text, nullable=False)
    respiratory_rate_encrypted = Column(Text, nullable=False)

    # Anomaly flags (not sensitive, not encrypted)
    is_anomaly = Column(Boolean, default=False)
    anomaly_score = Column(Float, nullable=True)
    anomaly_type = Column(String(100), nullable=True)

    patient = relationship("User", back_populates="vitals",
                           foreign_keys=[patient_id])
    alert = relationship("Alert", back_populates="vital", uselist=False)


class Alert(Base):
    __tablename__ = "alerts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    vital_id = Column(UUID(as_uuid=True), ForeignKey("vital_readings.id"), nullable=False)
    patient_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    severity = Column(String(20), nullable=False)
    anomaly_type = Column(String(100), nullable=True)
    llm_interpretation = Column(Text, nullable=False)
    is_acknowledged = Column(Boolean, default=False)
    acknowledged_by = Column(UUID(as_uuid=True), nullable=True)
    acknowledged_by_name = Column(String(255), nullable=True)
    doctor_notes = Column(Text, nullable=True)
    acknowledged_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    vital = relationship("VitalReading", back_populates="alert")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    action = Column(String(100), nullable=False)
    user_id = Column(String(255), nullable=False)
    user_role = Column(String(50), nullable=False)
    resource = Column(String(100), nullable=False)
    resource_id = Column(String(255), nullable=True)
    details = Column(Text, nullable=True)
    ip_address = Column(String(45), nullable=True)
    success = Column(Boolean, default=True)
    timestamp = Column(DateTime, nullable=False)