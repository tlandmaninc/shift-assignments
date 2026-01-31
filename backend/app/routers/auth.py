"""Authentication router for Google OAuth user login with role-based access control."""

import os
import logging
import traceback
from typing import Optional
from urllib.parse import urlencode

# Allow OAuth over HTTP for local development (must be set before importing google_auth_oauthlib)
if os.environ.get('ENVIRONMENT', 'development') == 'development':
    os.environ['OAUTHLIB_INSECURE_TRANSPORT'] = '1'

# Relax token scope validation - Google returns long-form scopes (e.g.,
# https://www.googleapis.com/auth/userinfo.email) even when short-form (email) was requested
os.environ['OAUTHLIB_RELAX_TOKEN_SCOPE'] = '1'

from fastapi import APIRouter, HTTPException, Request, Response, Depends
from fastapi.responses import RedirectResponse
from slowapi import Limiter
from slowapi.util import get_remote_address

from ..config import settings
from ..storage import storage
from ..audit import log_audit, AuditAction
from ..services.auth_service import (
    generate_oauth_state,
    validate_oauth_state,
    verify_google_id_token,
    create_tokens,
    verify_token,
    get_user_role,
)
from ..schemas.auth import UserResponse, AuthStatus, UserRole


logger = logging.getLogger(__name__)
limiter = Limiter(key_func=get_remote_address)

router = APIRouter(prefix="/auth", tags=["auth"])

# Cookie names
ACCESS_TOKEN_COOKIE = "ect_access_token"
REFRESH_TOKEN_COOKIE = "ect_refresh_token"

# Google OAuth scopes for user authentication
AUTH_SCOPES = [
    "openid",
    "email",
    "profile",
]


def _get_cookie_settings() -> dict:
    """Get cookie settings based on environment."""
    cookie_settings = {
        "httponly": True,
        "samesite": "lax",
        "path": "/",
    }

    # In production, cookies should be secure (HTTPS only)
    if settings.environment == "production":
        cookie_settings["secure"] = True
    else:
        cookie_settings["secure"] = False

    return cookie_settings


def set_auth_cookies(response: Response, access_token: str, refresh_token: str):
    """Set httpOnly secure cookies for authentication."""
    cookie_settings = _get_cookie_settings()

    # Access token - 1 hour expiry
    response.set_cookie(
        key=ACCESS_TOKEN_COOKIE,
        value=access_token,
        max_age=60 * 60,  # 1 hour
        **cookie_settings
    )

    # Refresh token - 7 days expiry
    response.set_cookie(
        key=REFRESH_TOKEN_COOKIE,
        value=refresh_token,
        max_age=7 * 24 * 60 * 60,  # 7 days
        **cookie_settings
    )


def clear_auth_cookies(response: Response):
    """Clear authentication cookies."""
    cookie_settings = _get_cookie_settings()

    response.delete_cookie(key=ACCESS_TOKEN_COOKIE, **cookie_settings)
    response.delete_cookie(key=REFRESH_TOKEN_COOKIE, **cookie_settings)


async def get_current_user(request: Request) -> Optional[dict]:
    """
    Dependency to get the current authenticated user.

    Returns None if not authenticated (for optional auth).
    Use get_required_user for endpoints that require authentication.
    """
    access_token = request.cookies.get(ACCESS_TOKEN_COOKIE)

    if not access_token:
        return None

    payload = verify_token(access_token, token_type='access')
    if not payload:
        return None

    user = storage.get_auth_user(payload['sub'])
    if not user or not user.get('is_active', True):
        return None

    return user


async def get_required_user(request: Request) -> dict:
    """
    Dependency that requires authentication.

    Raises 401 if not authenticated.
    """
    user = await get_current_user(request)
    if not user:
        raise HTTPException(
            status_code=401,
            detail="Not authenticated"
        )
    return user


async def require_admin(request: Request) -> dict:
    """
    Dependency that requires admin role.

    Raises 401 if not authenticated, 403 if not admin.
    """
    user = await get_required_user(request)
    if user.get('role') != UserRole.ADMIN.value:
        raise HTTPException(
            status_code=403,
            detail="Admin access required"
        )
    return user


@router.get("/google/login")
@limiter.limit("10/minute")
async def google_login(request: Request):
    """
    Initiate Google OAuth login flow.

    Returns the authorization URL to redirect the user to.
    """
    if not settings.google_client_id or not settings.google_client_secret:
        raise HTTPException(
            status_code=400,
            detail="Google OAuth not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET."
        )

    state = generate_oauth_state()

    # Build the callback URI
    # Use the frontend URL for the callback since Next.js will proxy it
    callback_uri = f"{settings.frontend_url}/api/auth/google/callback"

    # Build Google OAuth URL
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": callback_uri,
        "response_type": "code",
        "scope": " ".join(AUTH_SCOPES),
        "access_type": "offline",
        "state": state,
        "prompt": "select_account",  # Always show account selector
    }

    auth_url = f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}"

    return {"authorization_url": auth_url}


@router.get("/google/callback")
async def google_callback(
    request: Request,
    code: str,
    state: str,
    response: Response,
):
    """
    Handle Google OAuth callback.

    Exchanges the authorization code for tokens, validates the ID token,
    creates/updates the user, and sets authentication cookies.
    """
    frontend_url = settings.frontend_url

    # Validate CSRF state
    if not validate_oauth_state(state):
        logger.warning("OAuth callback with invalid state")
        return RedirectResponse(
            url=f"{frontend_url}/login?error=invalid_state"
        )

    if not settings.google_client_id or not settings.google_client_secret:
        return RedirectResponse(
            url=f"{frontend_url}/login?error=not_configured"
        )

    try:
        from google_auth_oauthlib.flow import Flow

        # Build the callback URI (must match what was used in login)
        callback_uri = f"{settings.frontend_url}/api/auth/google/callback"

        flow = Flow.from_client_config(
            {
                "web": {
                    "client_id": settings.google_client_id,
                    "client_secret": settings.google_client_secret,
                    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                    "token_uri": "https://oauth2.googleapis.com/token",
                    "redirect_uris": [callback_uri],
                }
            },
            scopes=AUTH_SCOPES,
        )
        flow.redirect_uri = callback_uri

        # Exchange code for tokens
        flow.fetch_token(code=code)
        credentials = flow.credentials

        # Verify the ID token and extract user info
        user_info = verify_google_id_token(credentials.id_token)
        if not user_info:
            return RedirectResponse(
                url=f"{frontend_url}/login?error=invalid_token"
            )

        # Determine user role based on email
        role = get_user_role(user_info['email'])

        # Create or update user in storage
        existing_user = storage.get_auth_user(user_info['id'])
        if existing_user:
            # Update existing user
            existing_user['name'] = user_info['name']
            existing_user['picture'] = user_info.get('picture')
            existing_user['email'] = user_info['email']
            existing_user['role'] = role.value  # Update role in case admin list changed
            user = storage.save_auth_user(existing_user)
        else:
            # Create new user
            user = storage.save_auth_user({
                'id': user_info['id'],
                'email': user_info['email'],
                'name': user_info['name'],
                'picture': user_info.get('picture'),
                'role': role.value,
                'is_active': True,
            })

        # Update last login
        storage.update_auth_user_last_login(user['id'])

        # Create JWT tokens
        access_token, refresh_token = create_tokens(
            user_id=user['id'],
            email=user['email'],
            name=user['name'],
            role=user['role']
        )

        # Log successful login
        log_audit(AuditAction.USER_LOGIN, {
            "user_id": user['id'],
            "email": user['email'],
            "role": user['role'],
        })

        # Create redirect response with cookies
        redirect_response = RedirectResponse(
            url=f"{frontend_url}/?login=success",
            status_code=302
        )
        set_auth_cookies(redirect_response, access_token, refresh_token)

        return redirect_response

    except Exception as e:
        logger.error(f"OAuth callback error: {e}")
        logger.error(f"Traceback: {traceback.format_exc()}")
        return RedirectResponse(
            url=f"{frontend_url}/login?error=auth_failed"
        )


@router.post("/logout")
async def logout(response: Response, user: dict = Depends(get_current_user)):
    """
    Log out the current user.

    Clears authentication cookies.
    """
    if user:
        log_audit(AuditAction.USER_LOGOUT, {
            "user_id": user['id'],
            "email": user['email'],
        })

    clear_auth_cookies(response)
    return {"success": True, "message": "Logged out successfully"}


@router.get("/me", response_model=AuthStatus)
async def get_auth_status(user: Optional[dict] = Depends(get_current_user)):
    """
    Get current authentication status and user info.

    Returns authenticated=False if not logged in.
    """
    if not user:
        return AuthStatus(authenticated=False, user=None)

    return AuthStatus(
        authenticated=True,
        user=UserResponse(
            id=user['id'],
            email=user['email'],
            name=user['name'],
            picture=user.get('picture'),
            role=UserRole(user.get('role', 'basic')),
            is_active=user.get('is_active', True),
        )
    )


@router.post("/refresh")
async def refresh_tokens(request: Request, response: Response):
    """
    Refresh the access token using the refresh token.

    Returns new tokens in cookies.
    """
    refresh_token = request.cookies.get(REFRESH_TOKEN_COOKIE)

    if not refresh_token:
        raise HTTPException(status_code=401, detail="No refresh token")

    payload = verify_token(refresh_token, token_type='refresh')
    if not payload:
        clear_auth_cookies(response)
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    # Verify user still exists and is active
    user = storage.get_auth_user(payload['sub'])
    if not user or not user.get('is_active', True):
        clear_auth_cookies(response)
        raise HTTPException(status_code=401, detail="User not found or inactive")

    # Re-check role in case admin list changed
    current_role = get_user_role(user['email'])
    if user.get('role') != current_role.value:
        user['role'] = current_role.value
        storage.save_auth_user(user)

    # Create new tokens
    access_token, new_refresh_token = create_tokens(
        user_id=user['id'],
        email=user['email'],
        name=user['name'],
        role=user['role']
    )

    set_auth_cookies(response, access_token, new_refresh_token)

    return {"success": True, "message": "Tokens refreshed"}
