"""Authentication schemas for user OAuth and role-based access control."""

from datetime import datetime
from enum import Enum
from typing import Optional
from pydantic import BaseModel


class UserRole(str, Enum):
    """User role enumeration."""
    ADMIN = "admin"
    BASIC = "basic"


class GoogleUserInfo(BaseModel):
    """User info from Google OAuth."""
    id: str
    email: str  # Google OAuth already validates the email
    name: str
    picture: Optional[str] = None
    given_name: Optional[str] = None
    family_name: Optional[str] = None


class User(BaseModel):
    """User model for storage."""
    id: str  # Google's unique user ID
    email: str
    name: str
    picture: Optional[str] = None
    role: UserRole = UserRole.BASIC
    is_active: bool = True
    created_at: Optional[str] = None
    last_login: Optional[str] = None


class UserResponse(BaseModel):
    """User response for API."""
    id: str
    email: str
    name: str
    picture: Optional[str] = None
    role: UserRole
    is_active: bool = True


class TokenPayload(BaseModel):
    """JWT token payload."""
    sub: str  # user ID
    email: str
    name: str
    role: str
    exp: datetime
    iat: datetime
    type: str  # "access" or "refresh"


class AuthStatus(BaseModel):
    """Authentication status response."""
    authenticated: bool
    user: Optional[UserResponse] = None
