"""
Numpy-only LSTM inference for cloud deployment.
Loads the trained weights and runs forward pass without PyTorch.
Used when torch is not available (Render free tier).
"""
import numpy as np
import json
import logging
import os

logger = logging.getLogger(__name__)

MODEL_PATH = "models/lstm_anomaly_detector.pt"
THRESHOLD_PATH = "models/anomaly_threshold.json"


def sigmoid(x):
    return 1 / (1 + np.exp(-np.clip(x, -500, 500)))


def tanh(x):
    return np.tanh(np.clip(x, -500, 500))


class NumpyLSTMCell:
    """Single LSTM cell implemented in numpy."""
    def __init__(self, W_ih, W_hh, b_ih, b_hh):
        self.W_ih = W_ih  # (4*hidden, input)
        self.W_hh = W_hh  # (4*hidden, hidden)
        self.b_ih = b_ih  # (4*hidden,)
        self.b_hh = b_hh  # (4*hidden,)

    def forward(self, x, h, c):
        gates = x @ self.W_ih.T + self.b_ih + h @ self.W_hh.T + self.b_hh
        hidden_size = h.shape[-1]
        i = sigmoid(gates[..., :hidden_size])
        f = sigmoid(gates[..., hidden_size:2*hidden_size])
        g = tanh(gates[..., 2*hidden_size:3*hidden_size])
        o = sigmoid(gates[..., 3*hidden_size:])
        c_new = f * c + i * g
        h_new = o * tanh(c_new)
        return h_new, c_new


class NumpyLSTMAnomalyDetector:
    """
    Numpy implementation of the LSTM Autoencoder for inference.
    Loads weights exported from the PyTorch model.
    """

    def __init__(self):
        self.threshold = 0.026
        self.mean_error = 0.001
        self.std_error = 0.005
        self._loaded = False
        self.encoder_cells = []
        self.decoder_cells = []
        self.output_weight = None
        self.output_bias = None
        self.hidden_size = 96
        self.sequence_length = 10

    def load_from_pytorch(self, pt_path: str, threshold_path: str) -> bool:
        """Load weights from PyTorch .pt file using torch."""
        try:
            import torch
            checkpoint = torch.load(pt_path, map_location="cpu")
            state = checkpoint["model_state_dict"]
            config = checkpoint["model_config"]
            self.hidden_size = config["hidden_size"]
            self.sequence_length = config["sequence_length"]
            num_layers = config["num_layers"]

            # Extract encoder weights
            for layer in range(num_layers):
                suffix = "_l0" if layer == 0 else f"_l{layer}"
                cell = NumpyLSTMCell(
                    W_ih=state[f"encoder.weight_ih{suffix}"].numpy(),
                    W_hh=state[f"encoder.weight_hh{suffix}"].numpy(),
                    b_ih=state[f"encoder.bias_ih{suffix}"].numpy(),
                    b_hh=state[f"encoder.bias_hh{suffix}"].numpy(),
                )
                self.encoder_cells.append(cell)

            # Extract decoder weights
            for layer in range(num_layers):
                suffix = "_l0" if layer == 0 else f"_l{layer}"
                cell = NumpyLSTMCell(
                    W_ih=state[f"decoder.weight_ih{suffix}"].numpy(),
                    W_hh=state[f"decoder.weight_hh{suffix}"].numpy(),
                    b_ih=state[f"decoder.bias_ih{suffix}"].numpy(),
                    b_hh=state[f"decoder.bias_hh{suffix}"].numpy(),
                )
                self.decoder_cells.append(cell)

            self.output_weight = state["output_layer.weight"].numpy()
            self.output_bias = state["output_layer.bias"].numpy()

            # Load threshold
            with open(threshold_path) as f:
                data = json.load(f)
            self.threshold = data["threshold"]
            self.mean_error = data["mean_error"]
            self.std_error = data["std_error"]

            # Save numpy weights for future use (no torch needed next time)
            numpy_path = pt_path.replace(".pt", "_numpy.npz")
            self._save_numpy(numpy_path)

            self._loaded = True
            logger.info(f"Numpy detector loaded from PyTorch weights. Threshold: {self.threshold:.6f}")
            return True

        except Exception as e:
            logger.error(f"Failed to load from PyTorch: {e}")
            return False

    def _save_numpy(self, path: str):
        """Save weights as numpy arrays for torch-free loading."""
        arrays = {}
        for i, cell in enumerate(self.encoder_cells):
            arrays[f"enc_{i}_W_ih"] = cell.W_ih
            arrays[f"enc_{i}_W_hh"] = cell.W_hh
            arrays[f"enc_{i}_b_ih"] = cell.b_ih
            arrays[f"enc_{i}_b_hh"] = cell.b_hh
        for i, cell in enumerate(self.decoder_cells):
            arrays[f"dec_{i}_W_ih"] = cell.W_ih
            arrays[f"dec_{i}_W_hh"] = cell.W_hh
            arrays[f"dec_{i}_b_ih"] = cell.b_ih
            arrays[f"dec_{i}_b_hh"] = cell.b_hh
        arrays["output_weight"] = self.output_weight
        arrays["output_bias"] = self.output_bias
        arrays["threshold"] = np.array([self.threshold])
        arrays["mean_error"] = np.array([self.mean_error])
        arrays["std_error"] = np.array([self.std_error])
        arrays["hidden_size"] = np.array([self.hidden_size])
        arrays["sequence_length"] = np.array([self.sequence_length])
        np.savez(path, **arrays)
        logger.info(f"Numpy weights saved to {path}")

    def load_numpy(self, numpy_path: str) -> bool:
        """Load pre-exported numpy weights — no torch needed."""
        try:
            data = np.load(numpy_path)
            self.hidden_size = int(data["hidden_size"][0])
            self.sequence_length = int(data["sequence_length"][0])
            self.threshold = float(data["threshold"][0])
            self.mean_error = float(data["mean_error"][0])
            self.std_error = float(data["std_error"][0])

            i = 0
            self.encoder_cells = []
            while f"enc_{i}_W_ih" in data:
                self.encoder_cells.append(NumpyLSTMCell(
                    data[f"enc_{i}_W_ih"], data[f"enc_{i}_W_hh"],
                    data[f"enc_{i}_b_ih"], data[f"enc_{i}_b_hh"]
                ))
                i += 1

            i = 0
            self.decoder_cells = []
            while f"dec_{i}_W_ih" in data:
                self.decoder_cells.append(NumpyLSTMCell(
                    data[f"dec_{i}_W_ih"], data[f"dec_{i}_W_hh"],
                    data[f"dec_{i}_b_ih"], data[f"dec_{i}_b_hh"]
                ))
                i += 1

            self.output_weight = data["output_weight"]
            self.output_bias = data["output_bias"]
            self._loaded = True
            logger.info(f"Numpy weights loaded. Threshold: {self.threshold:.6f}")
            return True
        except Exception as e:
            logger.error(f"Failed to load numpy weights: {e}")
            return False

    def _lstm_forward(self, x: np.ndarray, cells: list) -> np.ndarray:
        """Run LSTM forward pass. x shape: (seq_len, input_size)"""
        seq_len = x.shape[0]
        h = np.zeros((len(cells), self.hidden_size), dtype=np.float32)
        c = np.zeros((len(cells), self.hidden_size), dtype=np.float32)
        outputs = []
        for t in range(seq_len):
            inp = x[t]
            for layer_idx, cell in enumerate(cells):
                h[layer_idx], c[layer_idx] = cell.forward(
                    inp.reshape(1, -1), h[layer_idx].reshape(1, -1), c[layer_idx].reshape(1, -1)
                )
                h[layer_idx] = h[layer_idx].reshape(-1)
                c[layer_idx] = c[layer_idx].reshape(-1)
                inp = h[layer_idx]
            outputs.append(h[-1].copy())
        return np.array(outputs), h, c

    def reconstruct(self, sequence: np.ndarray) -> np.ndarray:
        """
        Encode sequence, then decode.
        sequence shape: (seq_len, input_size)
        """
        seq_len = sequence.shape[0]
        _, h_enc, _ = self._lstm_forward(sequence, self.encoder_cells)

        # Decoder input: repeat last encoder hidden state
        decoder_input = np.tile(h_enc[-1], (seq_len, 1))
        decoder_output, _, _ = self._lstm_forward(decoder_input, self.decoder_cells)

        # Linear output layer
        reconstruction = decoder_output @ self.output_weight.T + self.output_bias
        return reconstruction

    def reconstruction_error(self, sequence: np.ndarray) -> float:
        """Mean squared reconstruction error."""
        reconstruction = self.reconstruct(sequence)
        return float(np.mean((sequence - reconstruction) ** 2))

    def detect(self, sequence: np.ndarray) -> tuple:
        """Returns (is_anomaly, score, None)"""
        if not self._loaded:
            return False, 0.0, None
        error = self.reconstruction_error(sequence)
        score = min(1.0, max(0.0, (error - self.mean_error) / (3 * self.std_error + 1e-8)))
        return error > self.threshold, score, None