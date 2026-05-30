"""
Improved LSTM training with better anomaly contrast.
Run: python -m app.ml.train
"""
import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset
import os
import json
import logging
import random

from app.ml.lstm_model import VitalsLSTM, VitalsNormalizer

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

MODEL_PATH = "models/lstm_anomaly_detector.pt"
THRESHOLD_PATH = "models/anomaly_threshold.json"
SEQUENCE_LENGTH = 10
NUM_FEATURES = 6
EPOCHS = 50
BATCH_SIZE = 32
LEARNING_RATE = 5e-4


def generate_strict_normal(n_samples: int = 8000) -> np.ndarray:
    """
    Generate ONLY strictly normal vitals — tighter ranges.
    This forces the model to learn a very specific normal pattern,
    making anomalies stand out more.
    """
    sequences = []
    for _ in range(n_samples):
        sequence = []
        # Small random variation per sequence (simulates one patient session)
        base_hr = random.gauss(75, 8)
        base_spo2 = random.gauss(98, 0.8)
        base_sys = random.gauss(118, 8)
        base_dia = random.gauss(78, 5)
        base_temp = random.gauss(36.7, 0.2)
        base_rr = random.gauss(15, 1.5)

        for t in range(SEQUENCE_LENGTH):
            # Tiny reading-to-reading variation (natural biological noise)
            hr = np.clip(base_hr + random.gauss(0, 1.5), 58, 98)
            spo2 = np.clip(base_spo2 + random.gauss(0, 0.3), 95, 100)
            sys_bp = np.clip(base_sys + random.gauss(0, 2), 88, 138)
            dia_bp = np.clip(base_dia + random.gauss(0, 1.5), 58, 88)
            temp = np.clip(base_temp + random.gauss(0, 0.05), 36.0, 37.3)
            rr = np.clip(base_rr + random.gauss(0, 0.5), 11, 19)
            sequence.append([hr, spo2, sys_bp, dia_bp, temp, rr])

        sequences.append(sequence)

    return np.array(sequences, dtype=np.float32)


def train():
    os.makedirs("models", exist_ok=True)

    logger.info("Generating strict normal vitals for training...")
    raw_data = generate_strict_normal(8000)

    normalizer = VitalsNormalizer()
    normalized = normalizer.normalize(raw_data)

    X = torch.tensor(normalized, dtype=torch.float32)
    dataset = TensorDataset(X)
    loader = DataLoader(dataset, batch_size=BATCH_SIZE, shuffle=True)

    model = VitalsLSTM(
        input_size=NUM_FEATURES,
        hidden_size=96,
        num_layers=2,
        sequence_length=SEQUENCE_LENGTH,
    )

    optimizer = torch.optim.Adam(model.parameters(), lr=LEARNING_RATE)
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(optimizer, patience=5, factor=0.5)
    criterion = nn.MSELoss()

    logger.info("Training LSTM autoencoder...")
    best_loss = float("inf")
    for epoch in range(EPOCHS):
        model.train()
        total_loss = 0
        for (batch,) in loader:
            optimizer.zero_grad()
            reconstruction = model(batch)
            loss = criterion(reconstruction, batch)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 0.5)
            optimizer.step()
            total_loss += loss.item()

        avg_loss = total_loss / len(loader)
        scheduler.step(avg_loss)
        if avg_loss < best_loss:
            best_loss = avg_loss
        if (epoch + 1) % 10 == 0:
            logger.info(f"Epoch {epoch+1}/{EPOCHS} — Loss: {avg_loss:.6f} (best: {best_loss:.6f})")

    # Calculate threshold on normal data
    model.eval()
    with torch.no_grad():
        errors = model.reconstruction_error(X).numpy()

    mean_err = float(np.mean(errors))
    std_err = float(np.std(errors))
    # Use mean + 2*std for tighter threshold (more sensitive)
    threshold = mean_err + 2.0 * std_err

    logger.info(f"\nTraining complete:")
    logger.info(f"  Mean normal error: {mean_err:.6f}")
    logger.info(f"  Std normal error:  {std_err:.6f}")
    logger.info(f"  Threshold (mean+2std): {threshold:.6f}")

    # Validate threshold on known anomalies
    logger.info("\nValidating on known anomalies...")
    test_cases = [
        ("Normal", [75, 98, 120, 80, 36.8, 16]),
        ("Tachycardia HR=160", [160, 97, 122, 81, 36.9, 17]),
        ("Bradycardia HR=38", [38, 97, 118, 79, 36.7, 15]),
        ("Hypoxia SpO2=84", [78, 84, 121, 80, 36.8, 26]),
        ("Hypertensive crisis", [92, 97, 195, 125, 36.9, 19]),
        ("Fever temp=39.5", [98, 97, 125, 82, 39.5, 22]),
        ("Hypothermia temp=34", [62, 97, 115, 76, 34.2, 14]),
        ("Hypotension BP=72/48", [105, 97, 72, 48, 36.8, 18]),
    ]

    all_pass = True
    for name, vitals in test_cases:
        seq = np.array([vitals] * SEQUENCE_LENGTH, dtype=np.float32)
        norm_seq = normalizer.normalize(seq[np.newaxis])
        xt = torch.tensor(norm_seq)
        with torch.no_grad():
            err = model.reconstruction_error(xt).item()
        detected = err > threshold
        expected_anomaly = name != "Normal"
        status = "✅" if detected == expected_anomaly else "❌"
        logger.info(f"  {status} {name}: error={err:.6f}, detected={detected}")
        if detected != expected_anomaly:
            all_pass = False

    if not all_pass:
        logger.warning("\n⚠️  Some anomalies not detected — consider lowering threshold or retraining")
    else:
        logger.info("\n✅ All anomalies correctly detected!")

    # Save
    torch.save({
        "model_state_dict": model.state_dict(),
        "model_config": {
            "input_size": NUM_FEATURES,
            "hidden_size": 96,
            "num_layers": 2,
            "sequence_length": SEQUENCE_LENGTH,
        }
    }, MODEL_PATH)

    with open(THRESHOLD_PATH, "w") as f:
        json.dump({
            "threshold": threshold,
            "mean_error": mean_err,
            "std_error": std_err
        }, f, indent=2)

    logger.info(f"\nSaved: {MODEL_PATH}")
    logger.info(f"Saved: {THRESHOLD_PATH}")


if __name__ == "__main__":
    train()