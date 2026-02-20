"""Authentication schemas for user OAuth and role-based access control."""

from datetime import datetime
from enum import Enum
from typing import Optional
from pydantic import BaseModel, field_validator


class UserRole(str, Enum):
    """User role enumeration."""
    ADMIN = "admin"
    BASIC = "basic"
    EMPLOYEE = "employee"


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
    employee_id: Optional[int] = None
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
    employee_id: Optional[int] = None
    is_active: bool = True


class TokenPayload(BaseModel):
    """JWT token payload."""
    sub: str  # user ID
    email: str
    name: str
    role: str
    employee_id: Optional[int] = None
    exp: datetime
    iat: datetime
    type: str  # "access" or "refresh"


class AuthStatus(BaseModel):
    """Authentication status response."""
    authenticated: bool
    user: Optional[UserResponse] = None


class PhoneAuthRequest(BaseModel):
    """Request to verify phone authentication via Firebase."""
    email: str
    phone_number: str
    firebase_token: str

    @field_validator('email')
    @classmethod
    def validate_email_format(cls, v: str) -> str:
        v = v.strip().lower()
        if '@' not in v or '.' not in v.split('@')[-1]:
            raise ValueError('Invalid email format')
        return v

    @field_validator('phone_number')
    @classmethod
    def validate_phone(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError('Phone number is required')
        return v

    @field_validator('firebase_token')
    @classmethod
    def validate_token(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError('Firebase token is required')
        return v


class PhoneAuthResponse(BaseModel):
    """Response after phone authentication."""
    success: bool
    message: str
    redirect_url: str = "/"
