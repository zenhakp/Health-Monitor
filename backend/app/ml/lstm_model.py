import numpy as np
import torch
import torch.nn as nn
from typing import Tuple


class VitalsLSTM(nn.Module):
    """
    LSTM-based anomaly detector for multivariate vitals time series.
    Architecture: LSTM encoder -> reconstruction -> anomaly score from reconstruction error.
    This is an LSTM Autoencoder — it learns to reconstruct normal patterns.
    High reconstruction error = anomaly.
    """

    def __init__(
        self,
        input_size: int = 6,      # 6 vital signs
        hidden_size: int = 64,
        num_layers: int = 2,
        sequence_length: int = 10,  # look at last 10 readings
        dropout: float = 0.2,
    ):
        super().__init__()
        self.input_size = input_size
        self.hidden_size = hidden_size
        self.num_layers = num_layers
        self.sequence_length = sequence_length

        # Encoder
        self.encoder = nn.LSTM(
            input_size=input_size,
            hidden_size=hidden_size,
            num_layers=num_layers,
            batch_first=True,
            dropout=dropout if num_layers > 1 else 0,
        )

        # Decoder — reconstructs the input sequence
        self.decoder = nn.LSTM(
            input_size=hidden_size,
            hidden_size=hidden_size,
            num_layers=num_layers,
            batch_first=True,
            dropout=dropout if num_layers > 1 else 0,
        )

        self.output_layer = nn.Linear(hidden_size, input_size)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        x shape: (batch, sequence_length, input_size)
        returns reconstructed x of same shape
        """
        batch_size = x.size(0)

        # Encode
        _, (hidden, cell) = self.encoder(x)

        # Repeat hidden state as decoder input
        decoder_input = hidden[-1].unsqueeze(1).repeat(1, self.sequence_length, 1)

        # Decode
        decoder_output, _ = self.decoder(decoder_input)

        # Reconstruct
        reconstruction = self.output_layer(decoder_output)
        return reconstruction

    def reconstruction_error(self, x: torch.Tensor) -> torch.Tensor:
        """Returns per-sample mean squared reconstruction error."""
        reconstruction = self.forward(x)
        error = torch.mean((x - reconstruction) ** 2, dim=(1, 2))
        return error


class VitalsNormalizer:
    """Min-max normalizer for vitals — keeps model inputs in [0, 1]."""

    # Clinical bounds for normalization
    BOUNDS = {
        0: (30, 250),    # heart_rate
        1: (70, 100),    # spo2
        2: (60, 220),    # blood_pressure_sys
        3: (40, 130),    # blood_pressure_dia
        4: (34.0, 42.0), # temperature
        5: (6, 40),      # respiratory_rate
    }

    def normalize(self, vitals: np.ndarray) -> np.ndarray:
        """vitals shape: (..., 6)"""
        result = np.zeros_like(vitals, dtype=np.float32)
        for i, (low, high) in self.BOUNDS.items():
            result[..., i] = (vitals[..., i] - low) / (high - low)
        return np.clip(result, 0, 1)

    def denormalize(self, normalized: np.ndarray) -> np.ndarray:
        result = np.zeros_like(normalized, dtype=np.float32)
        for i, (low, high) in self.BOUNDS.items():
            result[..., i] = normalized[..., i] * (high - low) + low
        return result