import numpy as np
import logging
from collections import defaultdict, deque
from typing import Optional, Tuple

logger = logging.getLogger(__name__)

MODEL_PATH = "models/lstm_anomaly_detector.pt"
NUMPY_MODEL_PATH = "models/lstm_anomaly_detector_numpy.npz"
THRESHOLD_PATH = "models/anomaly_threshold.json"
SEQUENCE_LENGTH = 10
NUM_FEATURES = 6


class AnomalyDetector:
    def __init__(self):
        self._loaded = False
        self.threshold = 0.026
        self.mean_error = 0.001
        self.std_error = 0.005
        self._windows = defaultdict(lambda: deque(maxlen=SEQUENCE_LENGTH))
        self._numpy_detector = None
        self._torch_detector = None

    def load(self) -> bool:
        """Try numpy first (no torch needed), fall back to torch."""
        from app.ml.lstm_model import VitalsNormalizer
        self._normalizer = VitalsNormalizer()

        # Try numpy weights first (preferred for cloud)
        if self._load_numpy():
            return True

        # Fall back to torch
        if self._load_torch():
            return True

        logger.warning("No model loaded — using rule-based detection only")
        return False

    def _load_numpy(self) -> bool:
        try:
            import os
            if not os.path.exists(NUMPY_MODEL_PATH):
                return False
            from app.ml.numpy_inference import NumpyLSTMAnomalyDetector
            detector = NumpyLSTMAnomalyDetector()
            success = detector.load_numpy(NUMPY_MODEL_PATH)
            if success:
                self._numpy_detector = detector
                self.threshold = detector.threshold
                self.mean_error = detector.mean_error
                self.std_error = detector.std_error
                self._loaded = True
                logger.info("Anomaly detector loaded (numpy mode — no torch required)")
                return True
        except Exception as e:
            logger.warning(f"Numpy load failed: {e}")
        return False

    def _load_torch(self) -> bool:
        try:
            import torch
            import os
            if not os.path.exists(MODEL_PATH):
                return False
            from app.ml.lstm_model import VitalsLSTM
            checkpoint = torch.load(MODEL_PATH, map_location="cpu")
            config = checkpoint["model_config"]
            model = VitalsLSTM(**config)
            model.load_state_dict(checkpoint["model_state_dict"])
            model.eval()

            import json
            with open(THRESHOLD_PATH) as f:
                data = json.load(f)
            self.threshold = data["threshold"]
            self.mean_error = data["mean_error"]
            self.std_error = data["std_error"]

            self._torch_detector = model
            self._loaded = True
            logger.info("Anomaly detector loaded (torch mode)")
            return True
        except Exception as e:
            logger.warning(f"Torch load failed: {e}")
        return False

    def _vitals_to_array(self, vitals: dict) -> list:
        return [
            vitals["heart_rate"], vitals["spo2"],
            vitals["blood_pressure_sys"], vitals["blood_pressure_dia"],
            vitals["temperature"], vitals["respiratory_rate"],
        ]

    def _rule_based_check(self, vitals: dict):
        hr = vitals.get("heart_rate", 75)
        spo2 = vitals.get("spo2", 98)
        sys_bp = vitals.get("blood_pressure_sys", 120)
        dia_bp = vitals.get("blood_pressure_dia", 80)
        temp = vitals.get("temperature", 36.8)
        rr = vitals.get("respiratory_rate", 16)

        if hr > 130: return ("tachycardia", min(1.0, (hr - 130) / 50))
        if hr < 50: return ("bradycardia", min(1.0, (50 - hr) / 20))
        if spo2 < 92: return ("hypoxia", min(1.0, (92 - spo2) / 10))
        if sys_bp > 180: return ("hypertensive_crisis", min(1.0, (sys_bp - 180) / 40))
        if sys_bp < 85: return ("hypotension", min(1.0, (85 - sys_bp) / 25))
        if temp > 38.5: return ("fever", min(1.0, (temp - 38.5) / 2))
        if temp < 35.5: return ("hypothermia", min(1.0, (35.5 - temp) / 1.5))
        if rr > 24: return ("tachypnea", min(1.0, (rr - 24) / 10))
        return None

    def detect(self, patient_id: str, vitals: dict) -> Tuple[bool, float, Optional[str]]:
        rule_result = self._rule_based_check(vitals)

        reading = self._vitals_to_array(vitals)
        self._windows[patient_id].append(reading)

        lstm_is_anomaly = False
        lstm_score = 0.0

        if self._loaded and len(self._windows[patient_id]) == SEQUENCE_LENGTH:
            window = np.array(list(self._windows[patient_id]), dtype=np.float32)
            normalized = self._normalizer.normalize(window)

            if self._numpy_detector:
                error = self._numpy_detector.reconstruction_error(normalized)
                lstm_score = min(1.0, max(0.0, (error - self.mean_error) / (3 * self.std_error + 1e-8)))
                lstm_is_anomaly = error > self.threshold

            elif self._torch_detector:
                import torch
                x = torch.tensor(normalized[np.newaxis], dtype=torch.float32)
                with torch.no_grad():
                    error = self._torch_detector.reconstruction_error(x).item()
                lstm_score = min(1.0, max(0.0, (error - self.mean_error) / (3 * self.std_error + 1e-8)))
                lstm_is_anomaly = error > self.threshold

        if rule_result:
            anomaly_type, severity = rule_result
            return True, max(severity, lstm_score), anomaly_type

        if lstm_is_anomaly:
            return True, lstm_score, "statistical_anomaly"

        return False, lstm_score, None


detector = AnomalyDetector()