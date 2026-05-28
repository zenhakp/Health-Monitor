import json
import asyncio
from aiokafka import AIOKafkaProducer
from aiokafka.errors import KafkaConnectionError
from app.core.config import settings
import logging

logger = logging.getLogger(__name__)

_producer: AIOKafkaProducer = None


async def get_producer() -> AIOKafkaProducer:
    global _producer
    if _producer is None:
        _producer = AIOKafkaProducer(
            bootstrap_servers=settings.KAFKA_BOOTSTRAP_SERVERS,
            value_serializer=lambda v: json.dumps(v).encode("utf-8"),
            key_serializer=lambda k: k.encode("utf-8") if k else None,
            compression_type="gzip",
            acks="all",  # strongest durability guarantee
            retry_backoff_ms=500,
        )
        await _producer.start()
        logger.info("Kafka producer started")
    return _producer


async def stop_producer():
    global _producer
    if _producer:
        await _producer.stop()
        _producer = None
        logger.info("Kafka producer stopped")


async def publish_vitals(patient_id: str, vitals: dict):
    """Publish a vitals reading to the Kafka vitals topic."""
    try:
        producer = await get_producer()
        await producer.send_and_wait(
            topic=settings.KAFKA_VITALS_TOPIC,
            key=patient_id,
            value=vitals,
        )
    except KafkaConnectionError as e:
        logger.error(f"Kafka connection error publishing vitals: {e}")
        # Don't crash the app if Kafka is down — log and continue
    except Exception as e:
        logger.error(f"Error publishing vitals to Kafka: {e}")


async def publish_alert(patient_id: str, alert: dict):
    """Publish an alert to the Kafka alerts topic."""
    try:
        producer = await get_producer()
        await producer.send_and_wait(
            topic=settings.KAFKA_ALERTS_TOPIC,
            key=patient_id,
            value=alert,
        )
    except Exception as e:
        logger.error(f"Error publishing alert to Kafka: {e}")