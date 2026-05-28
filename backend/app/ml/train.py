"""
Train the LSTM autoencoder on synthetic normal vitals data.
Run this once: python -m app.ml.train
"""
import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset
import os
import json
import logging

from app.ml.lstm_model import VitalsLSTM, VitalsNormalizer
from app.simulator.vitals_simulator import generate_vitals

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

MODEL_PATH = "models/lstm_anomaly_detector.pt"
THRESHOLD_PATH = "models/anomaly_threshold.json"
SEQUENCE_LENGTH = 10
NUM_FEATURES = 6
EPOCHS = 30
BATCH_SIZE = 64
LEARNING_RATE = 1e-3


def generate_training_data(n_samples: int = 5000) -> np.ndarray:
    """
    Generate normal vitals sequences for training.
    We only train on NORMAL data — the autoencoder learns to reconstruct normal.
    Anomalies have high reconstruction error because they look different.
    """
    logger.info(f"Generating {n_samples} normal vitals sequences...")
    sequences = []

    for _ in range(n_samples):
        sequence = []
        for t in range(SEQUENCE_LENGTH):
            vitals = generate_vitals("train", time_offset=t, force_anomaly=None)
            # We force NO anomaly during training by passing None and using normal scenario
            reading = [
                vitals["heart_rate"],
                vitals["spo2"],
                vitals["blood_pressure_sys"],
                vitals["blood_pressure_dia"],
                vitals["temperature"],
                vitals["respiratory_rate"],
            ]
            sequence.append(reading)
        sequences.append(sequence)

    return np.array(sequences, dtype=np.float32)


def train():
    os.makedirs("models", exist_ok=True)

    # Generate data
    raw_data = generate_training_data(5000)

    # Normalize
    normalizer = VitalsNormalizer()
    normalized = normalizer.normalize(raw_data)

    # Convert to tensors
    X = torch.tensor(normalized, dtype=torch.float32)
    dataset = TensorDataset(X)
    loader = DataLoader(dataset, batch_size=BATCH_SIZE, shuffle=True)

    # Model
    model = VitalsLSTM(
        input_size=NUM_FEATURES,
        hidden_size=64,
        num_layers=2,
        sequence_length=SEQUENCE_LENGTH,
    )

    optimizer = torch.optim.Adam(model.parameters(), lr=LEARNING_RATE)
    criterion = nn.MSELoss()

    logger.info("Starting training...")
    model.train()
    for epoch in range(EPOCHS):
        total_loss = 0
        for (batch,) in loader:
            optimizer.zero_grad()
            reconstruction = model(batch)
            loss = criterion(reconstruction, batch)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            total_loss += loss.item()

        avg_loss = total_loss / len(loader)
        if (epoch + 1) % 5 == 0:
            logger.info(f"Epoch {epoch+1}/{EPOCHS} — Loss: {avg_loss:.6f}")

    # Calculate anomaly threshold on normal data
    # Threshold = mean + 3*std of reconstruction errors on normal data
    logger.info("Calculating anomaly threshold...")
    model.eval()
    with torch.no_grad():
        errors = model.reconstruction_error(X).numpy()

    threshold = float(np.mean(errors) + 3 * np.std(errors))
    logger.info(f"Anomaly threshold set to: {threshold:.6f}")

    # Save model and threshold
    torch.save({
        "model_state_dict": model.state_dict(),
        "model_config": {
            "input_size": NUM_FEATURES,
            "hidden_size": 64,
            "num_layers": 2,
            "sequence_length": SEQUENCE_LENGTH,
        }
    }, MODEL_PATH)

    with open(THRESHOLD_PATH, "w") as f:
        json.dump({"threshold": threshold, "mean_error": float(np.mean(errors)), "std_error": float(np.std(errors))}, f)

    logger.info(f"Model saved to {MODEL_PATH}")
    logger.info(f"Threshold saved to {THRESHOLD_PATH}")
    return threshold


if __name__ == "__main__":
    train()