"""
Run this locally before deploying to convert PyTorch model to numpy weights.
This means torch is NOT needed on the deployment server.

Usage: python export_model.py
"""
import sys
sys.path.insert(0, ".")

from app.ml.numpy_inference import NumpyLSTMAnomalyDetector

detector = NumpyLSTMAnomalyDetector()
success = detector.load_from_pytorch(
    "models/lstm_anomaly_detector.pt",
    "models/anomaly_threshold.json"
)

if success:
    print("✅ Numpy weights exported to models/lstm_anomaly_detector_numpy.npz")
    print(f"   Threshold: {detector.threshold:.6f}")
    print(f"   Hidden size: {detector.hidden_size}")
    print(f"   Layers: {len(detector.encoder_cells)}")

    # Verify it works
    import numpy as np
    from app.ml.lstm_model import VitalsNormalizer
    normalizer = VitalsNormalizer()

    normal = np.array([[75, 98, 120, 80, 36.8, 16]] * 10, dtype=np.float32)
    normalized = normalizer.normalize(normal)
    is_anomaly, score, _ = detector.detect(normalized)
    print(f"\nValidation — Normal vitals: is_anomaly={is_anomaly}, score={score:.4f}")

    tachycardia = np.array([[160, 97, 122, 81, 36.9, 17]] * 10, dtype=np.float32)
    norm_t = normalizer.normalize(tachycardia)
    is_anomaly_t, score_t, _ = detector.detect(norm_t)
    print(f"Validation — Tachycardia:   is_anomaly={is_anomaly_t}, score={score_t:.4f}")
else:
    print("❌ Export failed — check that models/ folder has the .pt file")