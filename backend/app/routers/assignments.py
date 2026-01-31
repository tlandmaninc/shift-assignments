"""Assignments API router."""

from datetime import date
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import HTMLResponse
from ..schemas import (
    AssignmentGenerateRequest,
    AssignmentGenerateResponse,
    EmployeeShiftCount,
    AvailabilityRow,
    ParseCSVRequest,
    CalendarExportResponse,
)
from ..storage import storage
from ..services import (
    SchedulerService,
    CalendarGenerator,
    parse_csv_responses,
    validate_availability_data,
)
from .auth import require_admin

# All endpoints in this router require admin access
router = APIRouter(
    prefix="/assignments",
    tags=["assignments"],
    dependencies=[Depends(require_admin)]
)


@router.get("")
async def list_assignments(month_year: str = None):
    """List all assignments, optionally filtered by month."""
    if month_year:
        data = storage.get_month_assignment(month_year)
        if not data:
            return {"assignments": [], "month_year": month_year}
        return data

    # Return all monthly summaries
    summaries = storage.get_monthly_summaries()
    return {"months": summaries}


@router.get("/{month_year}")
async def get_month_assignments(month_year: str):
    """Get assignments for a specific month."""
    data = storage.get_month_assignment(month_year)
    if not data:
        raise HTTPException(status_code=404, detail=f"No assignments found for {month_year}")
    return data


@router.post("/parse-csv")
async def parse_csv(request: ParseCSVRequest):
    """
    Parse CSV data from Google Forms responses.

    Returns parsed employee availability data.
    """
    employees = parse_csv_responses(request.csv_data, request.included_dates)

    if not employees:
        raise HTTPException(
            status_code=400,
            detail="No valid employee data found in CSV"
        )

    return {
        "success": True,
        "employees_count": len(employees),
        "employees": [
            {
                "employee_name": e["name"],
                "is_first_month": e["is_new"],
                "availability": e["availability"],
            }
            for e in employees
        ],
    }


@router.post("/validate")
async def validate_data(
    form_id: int,
    employees: list[AvailabilityRow],
):
    """
    Validate availability data before generating assignments.
    """
    form = storage.get_form(form_id)
    if not form:
        raise HTTPException(status_code=404, detail="Form not found")

    included_dates = form.get("included_dates", [])
    dates = [date.fromisoformat(d) for d in included_dates]

    # Convert to scheduler format
    emp_data = [
        {
            "name": e.employee_name,
            "is_new": e.is_first_month,
            "availability": e.availability,
        }
        for e in employees
    ]

    result = validate_availability_data(emp_data, dates)

    return {
        "valid": result["valid"],
        "errors": result["errors"],
        "warnings": result["warnings"],
        "summary": {
            "employees_count": len(employees),
            "dates_count": len(dates),
        }
    }


@router.post("/generate", response_model=AssignmentGenerateResponse)
async def generate_assignments(request: AssignmentGenerateRequest):
    """
    Generate shift assignments using the backtracking algorithm.
    """
    form = storage.get_form(request.form_id)
    if not form:
        raise HTTPException(status_code=404, detail="Form not found")

    included_dates = form.get("included_dates", [])
    dates = [date.fromisoformat(d) for d in included_dates]
    month_year = form["month_year"]

    # Convert request employees to scheduler format
    emp_data = [
        {
            "name": e.employee_name,
            "is_new": e.is_first_month,
            "availability": e.availability,
        }
        for e in request.employees
    ]

    # Validate first
    validation = validate_availability_data(emp_data, dates)
    if not validation["valid"]:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid data: {'; '.join(validation['errors'])}"
        )

    # Run scheduler
    scheduler = SchedulerService()
    try:
        assignments, month_count = scheduler.generate_assignments(
            employees=emp_data,
            dates=dates,
            month_year=month_year,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Generate calendar HTML
    year, month = int(month_year[:4]), int(month_year[5:7])
    calendar_gen = CalendarGenerator()
    calendar_html = calendar_gen.generate_calendar(year, month, assignments, month_count)

    # Save calendar to file
    calendar_gen.save_calendar(year, month, assignments, month_count)
    calendar_gen.save_json(year, month, assignments, month_count, emp_data)

    # Update form status
    form["status"] = "processed"
    storage.save_form(form)

    # Build response
    shift_counts = [
        EmployeeShiftCount(
            name=e["name"],
            shifts=month_count.get(e["name"], 0),
            is_new=e["is_new"],
        )
        for e in emp_data
    ]

    return AssignmentGenerateResponse(
        success=True,
        month_year=month_year,
        assignments=assignments,
        shift_counts=shift_counts,
        calendar_html=calendar_html,
        message=f"Successfully assigned {len(assignments)} shifts to {len(set(assignments.values()))} employees",
    )


@router.get("/{month_year}/calendar", response_class=HTMLResponse)
async def get_calendar(month_year: str):
    """Get HTML calendar for a month."""
    data = storage.get_month_assignment(month_year)
    if not data:
        raise HTTPException(status_code=404, detail=f"No assignments found for {month_year}")

    year, month = int(month_year[:4]), int(month_year[5:7])
    assignments = data.get("assignments", {})
    shift_counts = data.get("shift_counts", {})

    calendar_gen = CalendarGenerator()
    html = calendar_gen.generate_calendar(year, month, assignments, shift_counts)

    return HTMLResponse(content=html)


@router.get("/{month_year}/export", response_model=CalendarExportResponse)
async def export_calendar(month_year: str):
    """Export calendar data and HTML for download."""
    data = storage.get_month_assignment(month_year)
    if not data:
        raise HTTPException(status_code=404, detail=f"No assignments found for {month_year}")

    year, month = int(month_year[:4]), int(month_year[5:7])
    assignments = data.get("assignments", {})
    shift_counts = data.get("shift_counts", {})

    calendar_gen = CalendarGenerator()
    html = calendar_gen.generate_calendar(year, month, assignments, shift_counts)

    return CalendarExportResponse(
        month_year=month_year,
        html_content=html,
        assignments=assignments,
        shift_counts=shift_counts,
    )
