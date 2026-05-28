import json
import asyncio
import logging
from aiokafka import AIOKafkaConsumer
from aiokafka.errors import KafkaConnectionError
from sqlalchemy import select
import uuid
from datetime import datetime

from app.core.config import settings
from app.db.database import async_session_maker
from app.db.models import VitalReading, Alert
from app.ml.anomaly_detector import detector
from app.kafka.producer import publish_alert

logger = logging.getLogger(__name__)


async def get_llm_interpretation(vitals: dict, anomaly_type: str, severity: str) -> str:
    """Get plain-English interpretation from Groq LLM."""
    try:
        from groq import Groq
        from app.core.config import settings

        client = Groq(api_key=settings.GROQ_API_KEY)

        prompt = f"""You are a clinical AI assistant. Analyze this patient vitals anomaly and provide a brief, clear clinical interpretation in 2-3 sentences for a doctor.

Anomaly detected: {anomaly_type}
Severity: {severity}
Current vitals:
- Heart Rate: {vitals.get('heart_rate')} bpm
- SpO2: {vitals.get('spo2')}%
- Blood Pressure: {vitals.get('blood_pressure_sys')}/{vitals.get('blood_pressure_dia')} mmHg
- Temperature: {vitals.get('temperature')}°C
- Respiratory Rate: {vitals.get('respiratory_rate')} breaths/min

Provide: 1) What this likely indicates clinically, 2) Immediate concern level, 3) Suggested immediate action.
Be concise and clinical. Do not diagnose — flag for physician review."""

        response = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=200,
            temperature=0.3,
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        logger.error(f"LLM interpretation failed: {e}")
        return f"Anomaly detected: {anomaly_type}. Severity: {severity}. Please review patient vitals immediately."


def get_severity(anomaly_score: float, anomaly_type: str) -> str:
    critical_types = {"hypoxia", "hypertensive_crisis", "hypothermia", "bradycardia"}
    if anomaly_type in critical_types or anomaly_score > 0.8:
        return "critical"
    elif anomaly_score > 0.5:
        return "high"
    elif anomaly_score > 0.3:
        return "medium"
    return "low"


async def process_vitals_message(message_value: dict):
    """Process a single vitals message from Kafka."""
    patient_id = message_value.get("patient_id")
    reading_id = message_value.get("reading_id")

    if not patient_id or not reading_id:
        return

    # Run anomaly detection
    is_anomaly, anomaly_score, anomaly_type = detector.detect(patient_id, message_value)

    # Update the VitalReading in DB
    async with async_session_maker() as session:
        try:
            result = await session.execute(
                select(VitalReading).where(VitalReading.id == uuid.UUID(reading_id))
            )
            reading = result.scalar_one_or_none()

            if reading:
                reading.is_anomaly = is_anomaly
                reading.anomaly_score = anomaly_score
                reading.anomaly_type = anomaly_type
                await session.commit()

            # Create alert if anomaly detected
            if is_anomaly and anomaly_type:
                severity = get_severity(anomaly_score, anomaly_type)

                # Get LLM interpretation (only for medium+ severity to save API calls)
                if severity in ("medium", "high", "critical"):
                    interpretation = await get_llm_interpretation(
                        message_value, anomaly_type, severity
                    )
                else:
                    interpretation = f"Minor anomaly detected: {anomaly_type}. Score: {anomaly_score:.2f}. Monitor patient."

                alert = Alert(
                    id=uuid.uuid4(),
                    vital_id=uuid.UUID(reading_id),
                    patient_id=uuid.UUID(patient_id),
                    severity=severity,
                    anomaly_type=anomaly_type,  # ADD THIS
                    llm_interpretation=interpretation,
                    is_acknowledged=False,
                    created_at=datetime.utcnow(),
                )
                session.add(alert)
                await session.commit()

                alert_data = {
                    "type": "alert",
                    "alert_id": str(alert.id),
                    "patient_id": patient_id,
                    "severity": severity,
                    "anomaly_type": anomaly_type,
                    "anomaly_score": anomaly_score,
                    "interpretation": interpretation,
                    "vitals": message_value,
                    "timestamp": str(alert.created_at),
                }

                # Broadcast to SSE subscribers
                from app.api.alerts import broadcast_alert
                await broadcast_alert(patient_id, alert_data)

                # Also publish to Kafka alerts topic
                await publish_alert(patient_id, alert_data)

                logger.warning(
                    f"ALERT [{severity.upper()}] patient={patient_id[:8]} "
                    f"type={anomaly_type} score={anomaly_score:.3f}"
                )

        except Exception as e:
            logger.error(f"Error processing vitals message: {e}")
            await session.rollback()


async def start_consumer():
    """Start the Kafka consumer loop with proper retry backoff."""
    model_loaded = detector.load()
    if not model_loaded:
        logger.warning("Running with rule-based detection only (train model for LSTM detection)")

    retry_count = 0
    max_retries = 10

    while True:
        consumer = None
        try:
            consumer = AIOKafkaConsumer(
                settings.KAFKA_VITALS_TOPIC,
                bootstrap_servers=settings.KAFKA_BOOTSTRAP_SERVERS,
                group_id="health-monitor-consumer",
                value_deserializer=lambda v: json.loads(v.decode("utf-8")),
                auto_offset_reset="latest",
                enable_auto_commit=True,
                session_timeout_ms=30000,
                heartbeat_interval_ms=10000,
                request_timeout_ms=40000,
            )
            await consumer.start()
            retry_count = 0
            logger.info("Kafka consumer connected successfully")

            async for message in consumer:
                await process_vitals_message(message.value)

        except KafkaConnectionError as e:
            retry_count += 1
            wait = min(30, 2 ** retry_count)
            logger.warning(f"Kafka not ready (attempt {retry_count}). Retrying in {wait}s...")
            await asyncio.sleep(wait)
        except Exception as e:
            retry_count += 1
            wait = min(30, 2 ** retry_count)
            logger.error(f"Consumer error: {e}. Retrying in {wait}s...")
            await asyncio.sleep(wait)
        finally:
            if consumer:
                try:
                    await consumer.stop()
                except Exception:
                    pass