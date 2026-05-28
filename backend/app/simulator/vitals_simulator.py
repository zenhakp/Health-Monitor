import asyncio
import random
import math
import httpx
import logging
from datetime import datetime
from typing import Optional

logger = logging.getLogger(__name__)

# Clinically accurate normal ranges (based on MIT-BIH and PhysioNet research)
NORMAL_RANGES = {
    "heart_rate":          {"mean": 75,   "std": 10,  "min": 60,  "max": 100},
    "spo2":                {"mean": 98,   "std": 1,   "min": 95,  "max": 100},
    "blood_pressure_sys":  {"mean": 120,  "std": 10,  "min": 90,  "max": 140},
    "blood_pressure_dia":  {"mean": 80,   "std": 7,   "min": 60,  "max": 90},
    "temperature":         {"mean": 36.8, "std": 0.3, "min": 36.1,"max": 37.2},
    "respiratory_rate":    {"mean": 16,   "std": 2,   "min": 12,  "max": 20},
}

# Anomaly scenarios based on real clinical conditions
ANOMALY_SCENARIOS = [
    {"name": "tachycardia", "description": "Abnormally high heart rate", "overrides": {"heart_rate": (130, 180)}, "probability": 0.03},
    {"name": "bradycardia", "description": "Abnormally low heart rate", "overrides": {"heart_rate": (30, 50)}, "probability": 0.02},
    {"name": "hypoxia", "description": "Low blood oxygen saturation", "overrides": {"spo2": (82, 92), "respiratory_rate": (24, 35)}, "probability": 0.02},
    {"name": "hypertensive_crisis", "description": "Dangerously high blood pressure", "overrides": {"blood_pressure_sys": (180, 220), "blood_pressure_dia": (110, 130)}, "probability": 0.015},
    {"name": "hypotension", "description": "Dangerously low blood pressure", "overrides": {"blood_pressure_sys": (60, 85), "blood_pressure_dia": (40, 55)}, "probability": 0.015},
    {"name": "fever", "description": "High fever detected", "overrides": {"temperature": (38.5, 40.5), "heart_rate": (95, 120)}, "probability": 0.02},
    {"name": "hypothermia", "description": "Critically low body temperature", "overrides": {"temperature": (34.0, 35.5)}, "probability": 0.01},
]


def _clamp(value: float, min_val: float, max_val: float) -> float:
    return max(min_val, min(max_val, value))


def generate_vitals(
    patient_id: str,
    time_offset: float = 0,
    force_anomaly: Optional[str] = None
) -> dict:
    """
    Generate one vitals reading.
    Uses sinusoidal drift to simulate natural biological variation over time.
    force_anomaly: name of scenario to force (for testing)
    """
    # Natural circadian drift — vitals vary slightly over time
    drift = math.sin(time_offset / 300) * 0.1

    # Check if anomaly should occur
    anomaly_scenario = None
    if force_anomaly:
        for s in ANOMALY_SCENARIOS:
            if s["name"] == force_anomaly:
                anomaly_scenario = s
                break
    else:
        roll = random.random()
        cumulative = 0
        for scenario in ANOMALY_SCENARIOS:
            cumulative += scenario["probability"]
            if roll < cumulative:
                anomaly_scenario = scenario
                break

    vitals = {}
    for key, params in NORMAL_RANGES.items():
        if anomaly_scenario and key in anomaly_scenario["overrides"]:
            low, high = anomaly_scenario["overrides"][key]
            value = random.uniform(low, high)
        else:
            # Normal reading with slight drift and gaussian noise
            value = random.gauss(
                params["mean"] + drift * params["std"],
                params["std"] * 0.5
            )
            value = _clamp(value, params["min"], params["max"])

        # Round appropriately
        if key == "temperature":
            vitals[key] = round(value, 1)
        elif key in ("spo2",):
            vitals[key] = round(value, 1)
        else:
            vitals[key] = round(value, 1)

    vitals["patient_id"] = patient_id
    vitals["timestamp"] = datetime.utcnow().isoformat()
    vitals["simulated_anomaly"] = anomaly_scenario["name"] if anomaly_scenario else None

    return vitals


class VitalsSimulator:
    """
    Simulates IoT wearable devices for multiple patients.
    Publishes vitals to the FastAPI ingest endpoint every interval_seconds.
    """

    def __init__(
        self,
        patient_ids: list[str],
        api_base_url: str,
        auth_token: str,
        interval_seconds: float = 2.0,
    ):
        self.patient_ids = patient_ids
        self.api_base_url = api_base_url
        self.auth_token = auth_token
        self.interval_seconds = interval_seconds
        self.running = False
        self._time_offset = 0

    async def _send_vitals(self, client: httpx.AsyncClient, patient_id: str):
        vitals = generate_vitals(patient_id, self._time_offset)
        payload = {
            "patient_id": patient_id,
            "heart_rate": vitals["heart_rate"],
            "spo2": vitals["spo2"],
            "blood_pressure_sys": vitals["blood_pressure_sys"],
            "blood_pressure_dia": vitals["blood_pressure_dia"],
            "temperature": vitals["temperature"],
            "respiratory_rate": vitals["respiratory_rate"],
        }
        try:
            response = await client.post(
                f"{self.api_base_url}/api/v1/vitals/ingest",
                json=payload,
                headers={"Authorization": f"Bearer {self.auth_token}"},
                timeout=5.0,
            )
            if response.status_code == 201:
                anomaly = vitals.get("simulated_anomaly")
                if anomaly:
                    logger.warning(f"ANOMALY SIMULATED for patient {patient_id[:8]}: {anomaly}")
                else:
                    logger.debug(f"Vitals sent for patient {patient_id[:8]}")
            else:
                logger.error(f"Failed to send vitals: {response.status_code} {response.text}")
        except Exception as e:
            logger.error(f"Error sending vitals for {patient_id[:8]}: {e}")

    async def run(self):
        self.running = True
        logger.info(f"Simulator started for {len(self.patient_ids)} patients, interval={self.interval_seconds}s")

        async with httpx.AsyncClient() as client:
            while self.running:
                tasks = [
                    self._send_vitals(client, pid)
                    for pid in self.patient_ids
                ]
                await asyncio.gather(*tasks, return_exceptions=True)
                self._time_offset += self.interval_seconds
                await asyncio.sleep(self.interval_seconds)

    def stop(self):
        self.running = False
        logger.info("Simulator stopped")