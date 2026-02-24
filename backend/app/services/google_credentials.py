"""Shared Google OAuth credential storage (Forms/Drive scopes).

Extracted from google_forms.py so both auth.py and google_forms.py
can use it without circular imports.
"""

import base64
import hashlib
import json
import logging
import os
from datetime import datetime

from cryptography.fernet import Fernet, InvalidToken

from ..config import settings

logger = logging.getLogger(__name__)

GOOGLE_FORMS_SCOPES = [
    "https://www.googleapis.com/auth/forms.body",
    "https://www.googleapis.com/auth/forms.responses.readonly",
    "https://www.googleapis.com/auth/drive",
]

TOKEN_FILE = os.path.join(
    os.path.dirname(__file__), "..", "..", "data", "google_token.json"
)


def _get_cipher() -> Fernet:
    """Get Fernet cipher derived from the encryption key (falls back to secret key)."""
    source_key = settings.encryption_key or settings.secret_key
    key = hashlib.sha256(source_key.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(key))


def save_credentials(creds) -> None:
    """Save OAuth credentials to file with encryption."""
    os.makedirs(os.path.dirname(TOKEN_FILE), exist_ok=True)
    token_data = {
        "token": creds.token,
        "refresh_token": creds.refresh_token,
        "expiry": creds.expiry.isoformat() if creds.expiry else None,
    }
    cipher = _get_cipher()
    encrypted = cipher.encrypt(json.dumps(token_data).encode())
    with open(TOKEN_FILE, "wb") as f:
        f.write(encrypted)


def get_stored_credentials():
    """Load stored OAuth credentials with decryption and auto-refresh."""
    if not os.path.exists(TOKEN_FILE):
        return None
    try:
        with open(TOKEN_FILE, "rb") as f:
            encrypted_data = f.read()

        cipher = _get_cipher()
        try:
            decrypted = cipher.decrypt(encrypted_data)
            token_data = json.loads(decrypted.decode())
        except InvalidToken:
            logger.warning("Found unencrypted token file, will encrypt on next save")
            with open(TOKEN_FILE, "r") as f:
                token_data = json.load(f)

        from google.oauth2.credentials import Credentials

        expiry = None
        if token_data.get("expiry"):
            expiry = datetime.fromisoformat(token_data["expiry"])

        creds = Credentials(
            token=token_data.get("token"),
            refresh_token=token_data.get("refresh_token"),
            token_uri="https://oauth2.googleapis.com/token",
            client_id=settings.google_client_id,
            client_secret=settings.google_client_secret,
            scopes=GOOGLE_FORMS_SCOPES,
            expiry=expiry,
        )

        if creds.expired and creds.refresh_token:
            from google.auth.transport.requests import Request as GoogleRequest
            try:
                creds.refresh(GoogleRequest())
                save_credentials(creds)
            except Exception as refresh_err:
                logger.error(f"Failed to refresh Google token: {refresh_err}")
                os.remove(TOKEN_FILE)
                return None

        return creds
    except Exception as e:
        logger.error(f"Error loading credentials: {e}")
        return None
