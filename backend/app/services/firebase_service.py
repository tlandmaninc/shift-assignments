"""Firebase Authentication service for phone OTP verification."""

import base64
import json
import logging
import re
from typing import Optional

from ..config import settings

logger = logging.getLogger(__name__)

_firebase_app = None
_firebase_initialized = False


def _initialize_firebase():
    """Lazy-initialize Firebase Admin SDK from base64-encoded service account JSON."""
    global _firebase_app, _firebase_initialized

    if _firebase_initialized:
        return

    _firebase_initialized = True

    if not settings.firebase_service_account_json_base64:
        logger.warning("FIREBASE_SERVICE_ACCOUNT_JSON_BASE64 not set — Firebase phone auth disabled")
        return

    try:
        import firebase_admin
        from firebase_admin import credentials

        sa_json = base64.b64decode(settings.firebase_service_account_json_base64)
        sa_dict = json.loads(sa_json)

        cred = credentials.Certificate(sa_dict)
        _firebase_app = firebase_admin.initialize_app(cred, {
            "projectId": settings.firebase_project_id or sa_dict.get("project_id", ""),
        })
        logger.info("Firebase Admin SDK initialized successfully")
    except Exception as e:
        logger.error(f"Failed to initialize Firebase Admin SDK: {e}")
        _firebase_app = None


def is_firebase_available() -> bool:
    """Check whether Firebase is configured and initialized."""
    _initialize_firebase()
    return _firebase_app is not None


def verify_firebase_token(id_token: str) -> Optional[dict]:
    """
    Verify a Firebase ID token and return decoded claims.

    Returns dict with 'uid' and 'phone_number' on success, None on failure.
    """
    _initialize_firebase()

    if _firebase_app is None:
        logger.error("Firebase not initialized — cannot verify token")
        return None

    try:
        from firebase_admin import auth

        decoded = auth.verify_id_token(id_token)
        phone = decoded.get("phone_number")
        if not phone:
            logger.warning("Firebase token missing phone_number claim")
            return None

        return {
            "uid": decoded["uid"],
            "phone_number": phone,
        }
    except Exception as e:
        error_name = type(e).__name__
        logger.warning(f"Firebase token verification failed ({error_name}): {e}")
        return None


def normalize_phone_number(phone: str) -> str:
    """
    Normalize an Israeli phone number to E.164 format (+972...).

    Accepts formats like 05X-XXX-XXXX, 05XXXXXXXX, +97205XXXXXXX, etc.
    """
    digits = re.sub(r"[^\d+]", "", phone)

    if digits.startswith("+972"):
        return digits
    if digits.startswith("972"):
        return f"+{digits}"
    if digits.startswith("0"):
        return f"+972{digits[1:]}"

    return digits
