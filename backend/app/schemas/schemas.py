"""Pydantic schemas for API validation."""

from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel, Field


# Employee Schemas
class EmployeeBase(BaseModel):
    """Base employee schema."""
    name: str = Field(..., min_length=1, max_length=255)
    email: Optional[str] = None
    is_new: bool = True
    color: Optional[str] = None


class EmployeeCreate(EmployeeBase):
    """Schema for creating an employee."""
    pass


class EmployeeUpdate(BaseModel):
    """Schema for updating an employee."""
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    email: Optional[str] = None
    is_active: Optional[bool] = None
    is_new: Optional[bool] = None
    color: Optional[str] = None


class EmployeeResponse(BaseModel):
    """Schema for employee response."""
    id: int
    name: str
    email: Optional[str] = None
    is_new: bool = True
    is_active: bool = True
    color: Optional[str] = None
    total_shifts: int = 0
    created_at: Optional[str] = None
    merged_from_id: Optional[int] = None
    merged_from_name: Optional[str] = None


class EmployeeDuplicate(BaseModel):
    """Schema for a duplicate employee pair."""
    hebrew_employee: EmployeeResponse
    english_employee: EmployeeResponse
    hebrew_name: str
    english_name: str


class EmployeeMergeRequest(BaseModel):
    """Schema for merging two employees."""
    source_id: int = Field(..., description="ID of employee to merge FROM (will be deactivated)")
    target_id: int = Field(..., description="ID of employee to merge INTO (will remain active)")


class EmployeeMergeResult(BaseModel):
    """Schema for a single merge result."""
    success: bool
    source_id: Optional[int] = None
    target_id: Optional[int] = None
    source_name: str
    target_name: str
    assignments_updated: int = 0
    message: Optional[str] = None
    error: Optional[str] = None


class EmployeeMergeAllResponse(BaseModel):
    """Schema for bulk merge response."""
    total_duplicates_found: int
    merges_performed: int
    results: list[EmployeeMergeResult]


class TranslationResult(BaseModel):
    """Schema for a single translation result."""
    type: str  # "merge" or "rename"
    success: bool
    source_name: str
    target_name: str
    assignments_updated: int = 0
    message: Optional[str] = None
    error: Optional[str] = None


class TranslationError(BaseModel):
    """Schema for a translation error."""
    hebrew_name: str
    english_name: Optional[str] = None
    error: str


class TranslateAllResponse(BaseModel):
    """Schema for translating all Hebrew names to English."""
    total_translations: int
    successful: int
    errors: list[TranslationError]
    translations: list[TranslationResult]


# Form Schemas
class FormBase(BaseModel):
    """Base form schema."""
    month_year: str = Field(..., pattern=r"^\d{4}-\d{2}$")
    title: str


class FormCreate(BaseModel):
    """Schema for creating/saving a form record."""
    month_year: str = Field(..., pattern=r"^\d{4}-\d{2}$")
    title: str
    included_dates: list[str] = []
    status: str = "active"


class FormResponse(BaseModel):
    """Schema for form response."""
    id: int
    month_year: str
    title: str
    status: str
    included_dates: list[str]
    created_at: Optional[str] = None


class FormGenerateRequest(BaseModel):
    """Schema for form/dates configuration request."""
    year: int = Field(..., ge=2020, le=2100)
    month: int = Field(..., ge=1, le=12)
    include_tuesdays: bool = False
    excluded_dates: list[str] = []  # Additional dates to exclude (ISO format)
    included_dates: list[str] = []  # Dates to force-include (overrides defaults)


# CSV/Availability Data Schemas
class AvailabilityRow(BaseModel):
    """Single row of availability data from CSV/form responses."""
    employee_name: str
    is_first_month: bool = True
    availability: dict[str, bool]  # date_iso -> is_available


class AvailabilityDataUpload(BaseModel):
    """Schema for uploading availability data (parsed from CSV)."""
    form_id: int
    employees: list[AvailabilityRow]


class ParseCSVRequest(BaseModel):
    """Schema for parsing CSV data."""
    csv_data: str = Field(..., max_length=1_000_000)  # Max 1MB to prevent DoS
    included_dates: list[str] = Field(..., max_length=100)  # Max 100 dates


# Assignment Generation Schemas
class AssignmentGenerateRequest(BaseModel):
    """Schema for assignment generation request."""
    form_id: int
    employees: list[AvailabilityRow]  # Parsed availability data


class EmployeeShiftCount(BaseModel):
    """Employee shift count in assignment result."""
    name: str
    shifts: int
    is_new: bool


class AssignmentGenerateResponse(BaseModel):
    """Schema for assignment generation response."""
    success: bool
    month_year: str
    assignments: dict[str, str]  # date -> employee name
    shift_counts: list[EmployeeShiftCount]
    calendar_html: str  # HTML content for calendar
    message: str


# History Schemas
class MonthlyAssignment(BaseModel):
    """Monthly assignment summary."""
    month_year: str
    total_shifts: int
    employees_count: int


class EmployeeStats(BaseModel):
    """Employee statistics."""
    id: int
    name: str
    is_active: bool = True
    is_new: bool = True
    total_shifts: int
    months_active: int = 0
    last_shift_date: Optional[str] = None


class HistoryResponse(BaseModel):
    """Schema for history response."""
    monthly_assignments: list[MonthlyAssignment]
    employee_stats: list[EmployeeStats]


class FairnessMetrics(BaseModel):
    """Fairness metrics for shift distribution."""
    average_shifts: float
    median_shifts: float
    std_deviation: float
    min_shifts: int
    max_shifts: int
    fairness_score: float  # 0-100, higher is more fair
    employees: list[EmployeeStats]


# Calendar Export Schema
class CalendarExportResponse(BaseModel):
    """Schema for calendar export."""
    month_year: str
    html_content: str
    assignments: dict[str, str]
    shift_counts: dict[str, int]
