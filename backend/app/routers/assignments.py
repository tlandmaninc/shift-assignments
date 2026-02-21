"""Assignments API router."""

import logging
from datetime import date, datetime
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
from ..constants import SHIFT_TYPE_CONFIG, DEFAULT_SHIFT_TYPE
from ..services.calendar_service import build_shift_calendar_url
from ..services.ws_manager import ws_manager
from ..audit import log_audit, AuditAction
from .auth import require_admin

logger = logging.getLogger(__name__)

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

    # Determine shift type from form
    shift_type = form.get("shift_type", DEFAULT_SHIFT_TYPE)

    # Run scheduler
    scheduler = SchedulerService()
    try:
        assignments, month_count = scheduler.generate_assignments(
            employees=emp_data,
            dates=dates,
            month_year=month_year,
            shift_type=shift_type,
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
        shift_type=shift_type,
        shift_counts=shift_counts,
        calendar_html=calendar_html,
        message=f"Successfully assigned {len(assignments)} shifts to {len({entry['employee_name'] for entries in assignments.values() for entry in entries})} employees",
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


@router.post("/{month_year}/publish")
async def publish_shifts(month_year: str):
    """
    Publish shifts for a month and notify employees via WebSocket.

    Sends each employee their shift dates with Google Calendar links.
    """
    data = storage.get_month_assignment(month_year)
    if not data:
        raise HTTPException(status_code=404, detail=f"No assignments found for {month_year}")

    assignments = data.get("assignments", {})
    if not assignments:
        raise HTTPException(status_code=400, detail="No assignments to publish")

    # Group shifts by employee name (handles both old and new format)
    employee_shifts: dict[str, list[dict]] = {}
    for shift_date, value in assignments.items():
        entries = value if isinstance(value, list) else [
            {"employee_name": value, "shift_type": DEFAULT_SHIFT_TYPE}
        ]
        for entry in entries:
            emp_name = entry["employee_name"]
            shift_type = entry.get("shift_type", DEFAULT_SHIFT_TYPE)
            employee_shifts.setdefault(emp_name, []).append({
                "date": shift_date,
                "shift_type": shift_type,
            })

    # Sort each employee's dates
    for name in employee_shifts:
        employee_shifts[name].sort(key=lambda s: s["date"])

    # Format month for human-readable message
    dt = datetime.strptime(month_year, "%Y-%m")
    month_label = dt.strftime("%B %Y")

    notified = []
    not_linked = []

    for employee_name, shift_entries in employee_shifts.items():
        employee = storage.get_employee_by_name(employee_name)
        if not employee or not employee.get("id"):
            not_linked.append(employee_name)
            continue

        # Build shift list with calendar URLs
        shifts_payload = []
        for s in shift_entries:
            d_dt = datetime.strptime(s["date"], "%Y-%m-%d")
            shifts_payload.append({
                "date": s["date"],
                "day_of_week": d_dt.strftime("%A"),
                "shift_type": s["shift_type"],
                "calendar_url": build_shift_calendar_url(
                    s["date"], employee_name, s["shift_type"]
                ),
            })

        await ws_manager.send_to_employee(employee["id"], {
            "type": "shifts_published",
            "month_year": month_year,
            "shifts": shifts_payload,
            "message": f"Your shifts for {month_label} have been published",
        })

        notified.append(employee_name)

    log_audit(AuditAction.SHIFTS_PUBLISHED, {
        "month_year": month_year,
        "notified_count": len(notified),
        "not_linked_count": len(not_linked),
    })

    return {
        "success": True,
        "month_year": month_year,
        "notified": notified,
        "not_linked": not_linked,
        "message": f"Notified {len(notified)} employees for {month_label}",
    }
