"""Authentication service for JWT and OAuth operations."""

import hashlib
import os
import secrets
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple

import jwt
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

from ..config import settings
from ..schemas.auth import UserRole


logger = logging.getLogger(__name__)

# Admin email addresses (case-insensitive)
ADMIN_EMAILS = [e.strip() for e in os.getenv("ADMIN_EMAILS", "").split(",") if e.strip()]

# CSRF state storage (in-memory, single-server deployment)
_oauth_states: dict[str, datetime] = {}


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


def generate_oauth_state() -> str:
    """
    Generate a cryptographically secure state token for OAuth CSRF protection.

    State tokens expire after 10 minutes.

    Returns:
        A secure random state token
    """
    state = secrets.token_urlsafe(32)
    _oauth_states[state] = datetime.now() + timedelta(minutes=10)

    logger.info(f"Generated OAuth state: {state[:10]}... (total states: {len(_oauth_states)})")

    # Clean up expired states
    now = datetime.now()
    expired = [k for k, v in _oauth_states.items() if v < now]
    for k in expired:
        _oauth_states.pop(k, None)

    return state


def validate_oauth_state(state: str) -> bool:
    """
    Validate and consume an OAuth state token.

    This is a one-time use validation - the token is removed after validation.

    Args:
        state: The state token to validate

    Returns:
        True if state is valid and not expired, False otherwise
    """
    logger.info(f"Validating OAuth state: {state[:10] if state else 'None'}... (stored states: {len(_oauth_states)})")

    if not state or state not in _oauth_states:
        logger.warning(f"State not found. Available states: {[s[:10] for s in _oauth_states.keys()]}")
        return False

    expiry = _oauth_states.pop(state)
    return datetime.now() < expiry


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

    # Access token (short-lived, 1 hour by default)
    access_payload = {
        'sub': user_id,
        'email': email,
        'name': name,
        'role': role,
        'type': 'access',
        'iat': now,
        'exp': now + timedelta(minutes=60),  # 1 hour
    }
    if employee_id is not None:
        access_payload['employee_id'] = employee_id

    access_token = jwt.encode(
        access_payload,
        settings.secret_key,
        algorithm='HS256'
    )

    # Refresh token (long-lived, 7 days by default)
    refresh_payload = {
        'sub': user_id,
        'email': email,
        'name': name,
        'role': role,
        'type': 'refresh',
        'iat': now,
        'exp': now + timedelta(days=7),
    }
    if employee_id is not None:
        refresh_payload['employee_id'] = employee_id

    refresh_token = jwt.encode(
        refresh_payload,
        settings.secret_key,
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
        payload = jwt.decode(
            token,
            settings.secret_key,
            algorithms=['HS256']
        )

        # Verify token type
        if payload.get('type') != token_type:
            logger.warning(f"Token type mismatch: expected {token_type}, got {payload.get('type')}")
            return None

        return payload
    except jwt.ExpiredSignatureError:
        logger.debug("Token expired")
        return None
    except jwt.InvalidTokenError as e:
        logger.warning(f"Invalid token: {e}")
        return None
