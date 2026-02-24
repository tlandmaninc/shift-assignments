"""Authentication service for JWT and OAuth operations."""

import fcntl
import hashlib
import json
import os
import secrets
import logging
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional, Tuple

import jwt
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

from ..config import settings
from ..schemas.auth import UserRole


logger = logging.getLogger(__name__)

# Admin email addresses (case-insensitive)
ADMIN_EMAILS = [
    e.strip() for e in os.getenv("ADMIN_EMAILS", "").split(",") if e.strip()
]

# Path to persisted OAuth states file
_OAUTH_STATES_FILE = settings.data_dir / "oauth_states.json"

# Token blacklist for revocation (jti -> expiry)
_token_blacklist: dict[str, datetime] = {}


def blacklist_token(jti: str, exp: datetime) -> None:
    """Add a token JTI to the blacklist until its expiry."""
    _token_blacklist[jti] = exp
    _cleanup_blacklist()


def _cleanup_blacklist() -> None:
    """Remove expired entries from the blacklist."""
    now = datetime.now(timezone.utc)
    expired = [k for k, v in _token_blacklist.items() if v < now]
    for k in expired:
        _token_blacklist.pop(k, None)


def generate_email_user_id(email: str) -> str:
    """Generate a deterministic user ID from an email address."""
    email = email.lower()
    email_hash = hashlib.sha256(email.encode()).hexdigest()[:16]
    return f"email_{email_hash}"


def get_user_role(email: str) -> UserRole:
    """Determine user role based on email address.

    Auto-promotes the first user to admin if ADMIN_EMAILS is empty
    and no admin users exist in storage (fresh deployment bootstrap).
    """
    email_lower = email.lower()
    admin_emails_lower = [e.lower() for e in ADMIN_EMAILS]
    if email_lower in admin_emails_lower:
        return UserRole.ADMIN

    # Bootstrap: auto-promote first user if no admins configured anywhere
    if not ADMIN_EMAILS:
        from ..storage import storage
        users = storage.get_auth_users()
        if not any(u.get('role') == 'admin' for u in users):
            logger.warning(
                "No admin configured. Auto-promoting '%s' to admin.", email
            )
            return UserRole.ADMIN

    return UserRole.BASIC


def _load_oauth_states() -> dict[str, str]:
    """Load OAuth states from JSON file, removing expired entries."""
    path = _OAUTH_STATES_FILE
    if not path.exists():
        return {}
    lock_path = path.with_suffix(".json.lock")
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    lock_file = open(lock_path, "w")
    try:
        fcntl.flock(lock_file, fcntl.LOCK_SH)
        with open(path, "r", encoding="utf-8") as f:
            states = json.load(f)
    except (json.JSONDecodeError, OSError):
        return {}
    finally:
        fcntl.flock(lock_file, fcntl.LOCK_UN)
        lock_file.close()
    # Clean expired
    now = datetime.now().isoformat()
    return {k: v for k, v in states.items() if v > now}


def _save_oauth_states(states: dict[str, str]) -> None:
    """Save OAuth states to JSON file with exclusive lock."""
    path = _OAUTH_STATES_FILE
    path.parent.mkdir(parents=True, exist_ok=True)
    lock_path = path.with_suffix(".json.lock")
    lock_file = open(lock_path, "w")
    try:
        fcntl.flock(lock_file, fcntl.LOCK_EX)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(states, f)
    finally:
        fcntl.flock(lock_file, fcntl.LOCK_UN)
        lock_file.close()


def generate_oauth_state() -> str:
    """Generate a cryptographically secure state token for OAuth CSRF protection.

    State tokens expire after 10 minutes and are persisted to disk.
    """
    state = secrets.token_urlsafe(32)
    expiry = (datetime.now() + timedelta(minutes=10)).isoformat()

    states = _load_oauth_states()
    states[state] = expiry
    _save_oauth_states(states)

    logger.info(
        "Generated OAuth state: %s... (total states: %d)",
        state[:10], len(states),
    )
    return state


def validate_oauth_state(state: str) -> bool:
    """Validate and consume an OAuth state token (one-time use)."""
    if not state:
        return False

    states = _load_oauth_states()

    logger.info(
        "Validating OAuth state: %s... (stored states: %d)",
        state[:10], len(states),
    )

    if state not in states:
        logger.warning(
            "State not found. Available states: %s",
            [s[:10] for s in states],
        )
        return False

    expiry_str = states.pop(state)
    _save_oauth_states(states)
    return datetime.now() < datetime.fromisoformat(expiry_str)


def verify_google_id_token(token: str) -> Optional[dict]:
    """
    Verify Google ID token and return user info.

    This is the critical security step - validates the token
    came from Google and extracts verified user information.

    Args:
        token: The Google ID token to verify

    Returns:
        Dict with user info if valid, None otherwise
    """
    try:
        idinfo = id_token.verify_oauth2_token(
            token,
            google_requests.Request(),
            settings.google_client_id
        )

        # Verify issuer
        if idinfo['iss'] not in ['accounts.google.com', 'https://accounts.google.com']:
            logger.warning(f"Invalid token issuer: {idinfo['iss']}")
            return None

        return {
            'id': idinfo['sub'],
            'email': idinfo['email'],
            'name': idinfo.get('name', ''),
            'picture': idinfo.get('picture'),
            'given_name': idinfo.get('given_name'),
            'family_name': idinfo.get('family_name'),
        }
    except ValueError as e:
        logger.error(f"Invalid Google ID token: {e}")
        return None


def create_tokens(
    user_id: str,
    email: str,
    name: str,
    role: str,
    employee_id: Optional[int] = None,
) -> Tuple[str, str]:
    """
    Create access and refresh JWT tokens.

    Args:
        user_id: The user's unique ID
        email: The user's email address
        name: The user's display name
        role: The user's role (admin, basic, or employee)
        employee_id: Optional linked employee ID

    Returns:
        Tuple of (access_token, refresh_token)
    """
    now = datetime.now(timezone.utc)

    # Access token (short-lived, 1 hour)
    access_payload = {
        'sub': user_id,
        'email': email,
        'name': name,
        'role': role,
        'type': 'access',
        'jti': uuid.uuid4().hex,
        'iat': now,
        'exp': now + timedelta(minutes=60),
    }
    if employee_id is not None:
        access_payload['employee_id'] = employee_id

    signing_key = settings.jwt_signing_key or settings.secret_key
    access_token = jwt.encode(
        access_payload,
        signing_key,
        algorithm='HS256'
    )

    # Refresh token (24 hours)
    refresh_payload = {
        'sub': user_id,
        'email': email,
        'name': name,
        'role': role,
        'type': 'refresh',
        'jti': uuid.uuid4().hex,
        'iat': now,
        'exp': now + timedelta(hours=24),
    }
    if employee_id is not None:
        refresh_payload['employee_id'] = employee_id

    refresh_token = jwt.encode(
        refresh_payload,
        signing_key,
        algorithm='HS256'
    )

    return access_token, refresh_token


def verify_token(token: str, token_type: str = 'access') -> Optional[dict]:
    """
    Verify and decode a JWT token.

    Args:
        token: The JWT token to verify
        token_type: Expected token type ('access' or 'refresh')

    Returns:
        Token payload dict if valid, None otherwise
    """
    try:
        signing_key = settings.jwt_signing_key or settings.secret_key
        payload = jwt.decode(
            token,
            signing_key,
            algorithms=['HS256']
        )

        # Verify token type
        if payload.get('type') != token_type:
            logger.warning(
                "Token type mismatch: expected %s, got %s",
                token_type, payload.get('type'),
            )
            return None

        # Check blacklist
        jti = payload.get('jti')
        if jti and jti in _token_blacklist:
            logger.debug("Token jti %s is blacklisted", jti)
            return None

        return payload
    except jwt.ExpiredSignatureError:
        logger.debug("Token expired")
        return None
    except jwt.InvalidTokenError as e:
        logger.warning("Invalid token: %s", e)
        return None
