"""Encrypt cloud credentials at rest using Fernet."""

import base64
import hashlib
import json
from typing import Any

from cryptography.fernet import Fernet

from app.core.config import get_settings


def _fernet() -> Fernet:
    settings = get_settings()
    key = base64.urlsafe_b64encode(
        hashlib.sha256(settings.secret_key.encode()).digest()
    )
    return Fernet(key)


def encrypt_dict(data: dict[str, Any]) -> str:
    payload = json.dumps(data).encode()
    return _fernet().encrypt(payload).decode()


def decrypt_dict(token: str) -> dict[str, Any]:
    payload = _fernet().decrypt(token.encode())
    return json.loads(payload.decode())
