import base64
import os
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.backends import default_backend
from app.core.config import settings


def _get_key() -> bytes:
    return base64.b64decode(settings.ENCRYPTION_KEY)


def encrypt(plaintext: str) -> str:
    """AES-256-GCM encrypt. Returns base64(nonce + ciphertext + tag)."""
    if not plaintext:
        return plaintext
    key = _get_key()
    aesgcm = AESGCM(key)
    nonce = os.urandom(12)  # 96-bit nonce for GCM
    ciphertext = aesgcm.encrypt(nonce, plaintext.encode("utf-8"), None)
    combined = nonce + ciphertext
    return base64.b64encode(combined).decode("utf-8")


def decrypt(encrypted: str) -> str:
    """Decrypt AES-256-GCM. Returns original plaintext."""
    if not encrypted:
        return encrypted
    key = _get_key()
    aesgcm = AESGCM(key)
    combined = base64.b64decode(encrypted.encode("utf-8"))
    nonce = combined[:12]
    ciphertext = combined[12:]
    plaintext = aesgcm.decrypt(nonce, ciphertext, None)
    return plaintext.decode("utf-8")


def hash_sensitive(value: str) -> str:
    """One-way hash for searchable fields (e.g. phone numbers for lookup)."""
    digest = hashes.Hash(hashes.SHA256(), backend=default_backend())
    digest.update(value.encode("utf-8"))
    return base64.b64encode(digest.finalize()).decode("utf-8")