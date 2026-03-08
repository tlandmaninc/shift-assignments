"""Pydantic schemas for dynamic shift type management."""

from typing import Optional
from pydantic import BaseModel, Field, model_validator


class SchedulingConstraints(BaseModel):
    """Configurable constraints for the backtracking scheduler."""

    max_shifts_per_month: int = Field(
        default=2, ge=1, le=10,
        description="Maximum shifts one employee can work per month",
    )
    max_shifts_per_week: int = Field(
        default=1, ge=1, le=7,
        description="Maximum shifts one employee can work per ISO week",
    )
    allow_consecutive_days: bool = Field(
        default=False,
        description="Whether an employee can work consecutive calendar days",
    )
    require_different_weekdays: bool = Field(
        default=True,
        description="If employee has multiple shifts, must they be on different weekdays",
    )
    new_employee_restricted_weeks: int = Field(
        default=2, ge=0, le=5,
        description="New employees only in the last N ISO weeks (0 = no restriction)",
    )
    require_minimum_one_shift: bool = Field(
        default=True,
        description="Every employee with availability must get at least 1 shift",
    )


class SlotDetailSchema(BaseModel):
    """Time window for a specific slot within a multi-slot shift type."""

    label: str = Field(..., min_length=1, max_length=50)
    start: str = Field(..., pattern=r"^T\d{6}$")
    end: str = Field(..., pattern=r"^T\d{6}$")
    next_day: bool = False


class ShiftTypeCreate(BaseModel):
    """Schema for creating a new shift type."""

    key: str = Field(
        ..., pattern=r"^[a-z][a-z0-9_]{1,29}$",
        description="Unique lowercase key (e.g. 'night_rounds')",
    )
    label: str = Field(..., min_length=1, max_length=50)
    color: str = Field(..., pattern=r"^#[0-9A-Fa-f]{6}$")
    start_time: str = Field(..., pattern=r"^T\d{6}$")
    end_time: str = Field(..., pattern=r"^T\d{6}$")
    next_day_end: bool = False
    slots: int = Field(default=1, ge=1, le=5)
    exclude_weekends: bool = True
    calendar_title: str = Field(..., min_length=1, max_length=100)
    calendar_desc: str = Field(default="", max_length=200)
    slot_details: Optional[list[SlotDetailSchema]] = None
    constraints: SchedulingConstraints = Field(default_factory=SchedulingConstraints)

    @model_validator(mode="after")
    def validate_slot_details(self):
        if self.slots > 1 and self.slot_details is not None:
            if len(self.slot_details) != self.slots:
                raise ValueError(
                    f"slot_details must have exactly {self.slots} entries "
                    f"(got {len(self.slot_details)})"
                )
        return self


class ShiftTypeUpdate(BaseModel):
    """Schema for updating a shift type (partial update)."""

    label: Optional[str] = Field(None, min_length=1, max_length=50)
    color: Optional[str] = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")
    start_time: Optional[str] = Field(None, pattern=r"^T\d{6}$")
    end_time: Optional[str] = Field(None, pattern=r"^T\d{6}$")
    next_day_end: Optional[bool] = None
    slots: Optional[int] = Field(None, ge=1, le=5)
    exclude_weekends: Optional[bool] = None
    calendar_title: Optional[str] = Field(None, min_length=1, max_length=100)
    calendar_desc: Optional[str] = Field(None, max_length=200)
    slot_details: Optional[list[SlotDetailSchema]] = None
    constraints: Optional[SchedulingConstraints] = None


class ShiftTypeResponse(BaseModel):
    """Schema for shift type API responses."""

    key: str
    label: str
    color: str
    start_time: str
    end_time: str
    next_day_end: bool = False
    slots: int = 1
    exclude_weekends: bool = True
    calendar_title: str
    calendar_desc: str = ""
    slot_details: Optional[list[SlotDetailSchema]] = None
    constraints: SchedulingConstraints = Field(default_factory=SchedulingConstraints)
    is_builtin: bool = False


class CrossTypeConstraint(BaseModel):
    """A constraint that spans multiple shift types."""

    id: Optional[str] = None
    type_a: str = Field(..., pattern=r"^[a-z][a-z0-9_]{1,29}$")
    type_b: str = Field(..., pattern=r"^[a-z][a-z0-9_]{1,29}$")
    rule: str = Field(default="no_same_day", pattern=r"^no_same_day$")

    @model_validator(mode="after")
    def validate_different_types(self):
        if self.type_a == self.type_b:
            raise ValueError("type_a and type_b must be different shift types")
        return self


class CrossTypeConstraintResponse(CrossTypeConstraint):
    """Response schema for cross-type constraints."""

    id: str


class ShiftTypeFeasibilityRequest(BaseModel):
    """Request for constraint feasibility validation."""

    constraints: SchedulingConstraints
    num_dates: int = Field(..., ge=1, le=31)
    num_employees: int = Field(..., ge=1, le=200)
    slots: int = Field(default=1, ge=1, le=5)


class FeasibilityResponse(BaseModel):
    """Response from feasibility validation."""

    feasible: bool
    errors: list[str] = []
    warnings: list[str] = []
