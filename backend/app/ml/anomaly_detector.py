import numpy as np
import torch
import json
import logging
from collections import defaultdict, deque
from typing import Optional, Tuple

from app.ml.lstm_model import VitalsLSTM, VitalsNormalizer

logger = logging.getLogger(__name__)

MODEL_PATH = "models/lstm_anomaly_detector.pt"
THRESHOLD_PATH = "models/anomaly_threshold.json"
SEQUENCE_LENGTH = 10
NUM_FEATURES = 6


class AnomalyDetector:
    """
    Loads the trained LSTM and detects anomalies in incoming vitals streams.
    Maintains a sliding window of recent readings per patient.
    """

    def __init__(self):
        self.model: Optional[VitalsLSTM] = None
        self.normalizer = VitalsNormalizer()
        self.threshold: float = 0.05
        self.mean_error: float = 0.0
        self.std_error: float = 0.01
        # Sliding window: patient_id -> deque of last SEQUENCE_LENGTH readings
        self._windows: dict[str, deque] = defaultdict(lambda: deque(maxlen=SEQUENCE_LENGTH))
        self._loaded = False

    def load(self) -> bool:
        """Load model from disk. Returns True if successful."""
        try:
            checkpoint = torch.load(MODEL_PATH, map_location="cpu")
            config = checkpoint["model_config"]
            self.model = VitalsLSTM(**config)
            self.model.load_state_dict(checkpoint["model_state_dict"])
            self.model.eval()

            with open(THRESHOLD_PATH) as f:
                data = json.load(f)
            self.threshold = data["threshold"]
            self.mean_error = data["mean_error"]
            self.std_error = data["std_error"]

            self._loaded = True
            logger.info(f"Anomaly detector loaded. Threshold: {self.threshold:.6f}")
            return True
        except FileNotFoundError:
            logger.warning("Model not found — run python -m app.ml.train first")
            return False
        except Exception as e:
            logger.error(f"Error loading model: {e}")
            return False

    def _vitals_to_array(self, vitals: dict) -> list:
        return [
            vitals["heart_rate"],
            vitals["spo2"],
            vitals["blood_pressure_sys"],
            vitals["blood_pressure_dia"],
            vitals["temperature"],
            vitals["respiratory_rate"],
        ]

    def _rule_based_check(self, vitals: dict) -> Optional[Tuple[str, float]]:
        """
        Fast rule-based checks for obvious anomalies.
        Used as a fallback when the model window isn't full yet,
        and as a double-check alongside the LSTM.
        Returns (anomaly_type, severity_score) or None.
        """
        hr = vitals["heart_rate"]
        spo2 = vitals["spo2"]
        sys_bp = vitals["blood_pressure_sys"]
        dia_bp = vitals["blood_pressure_dia"]
        temp = vitals["temperature"]
        rr = vitals["respiratory_rate"]

        if hr > 130:
            return ("tachycardia", min(1.0, (hr - 130) / 50))
        if hr < 50:
            return ("bradycardia", min(1.0, (50 - hr) / 20))
        if spo2 < 92:
            return ("hypoxia", min(1.0, (92 - spo2) / 10))
        if sys_bp > 180:
            return ("hypertensive_crisis", min(1.0, (sys_bp - 180) / 40))
        if sys_bp < 85:
            return ("hypotension", min(1.0, (85 - sys_bp) / 25))
        if temp > 38.5:
            return ("fever", min(1.0, (temp - 38.5) / 2))
        if temp < 35.5:
            return ("hypothermia", min(1.0, (35.5 - temp) / 1.5))
        if rr > 24:
            return ("tachypnea", min(1.0, (rr - 24) / 10))
        return None

    def detect(self, patient_id: str, vitals: dict) -> Tuple[bool, float, Optional[str]]:
        """
        Main detection method.
        Returns: (is_anomaly, anomaly_score, anomaly_type)
        anomaly_score is normalized 0-1 where 1 = most anomalous
        """
        # Always run rule-based check first
        rule_result = self._rule_based_check(vitals)

        # Add to sliding window
        reading = self._vitals_to_array(vitals)
        self._windows[patient_id].append(reading)

        # LSTM check if model loaded and window is full
        lstm_is_anomaly = False
        lstm_score = 0.0

        if self._loaded and len(self._windows[patient_id]) == SEQUENCE_LENGTH:
            window = np.array(list(self._windows[patient_id]), dtype=np.float32)
            normalized = self.normalizer.normalize(window[np.newaxis, :, :])  # add batch dim
            x = torch.tensor(normalized, dtype=torch.float32)

            with torch.no_grad():
                error = self.model.reconstruction_error(x).item()

            # Normalize score to 0-1 range
            lstm_score = min(1.0, max(0.0, (error - self.mean_error) / (3 * self.std_error + 1e-8)))
            lstm_is_anomaly = error > self.threshold

        # Combine both signals
        if rule_result:
            anomaly_type, severity = rule_result
            # Use max of rule severity and LSTM score
            final_score = max(severity, lstm_score)
            return True, final_score, anomaly_type

        if lstm_is_anomaly:
            return True, lstm_score, "statistical_anomaly"

        return False, lstm_score, None


# Singleton instance
detector = AnomalyDetector()