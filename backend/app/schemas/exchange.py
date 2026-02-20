"""Shift exchange schemas for swap requests and responses."""

from enum import Enum
from typing import Optional
from pydantic import BaseModel


class ExchangeStatus(str, Enum):
    """Exchange request status."""
    PENDING = "pending"
    ACCEPTED = "accepted"
    DECLINED = "declined"
    CANCELLED = "cancelled"
    INVALID = "invalid"
    EXPIRED = "expired"


class ShiftExchangeCreate(BaseModel):
    """Request to create a shift exchange."""
    requester_date: str  # YYYY-MM-DD
    target_employee_id: int
    target_date: str  # YYYY-MM-DD
    reason: Optional[str] = None


class ShiftExchangeResponse(BaseModel):
    """Response model for a shift exchange."""
    id: int
    month_year: str
    requester_employee_id: int
    requester_employee_name: str
    requester_date: str
    requester_shift_type: Optional[str] = None
    target_employee_id: int
    target_employee_name: str
    target_date: str
    target_shift_type: Optional[str] = None
    status: ExchangeStatus
    reason: Optional[str] = None
    decline_reason: Optional[str] = None
    validation_errors: Optional[list[str]] = None
    created_at: str
    responded_at: Optional[str] = None
    completed_at: Optional[str] = None


class ShiftExchangeAction(BaseModel):
    """Action on an exchange request."""
    action: str  # "accept" or "decline"
    decline_reason: Optional[str] = None


class EligibleSwapPartner(BaseModel):
    """An eligible partner for a shift swap."""
    employee_id: int
    employee_name: str
    eligible_dates: list[str]
