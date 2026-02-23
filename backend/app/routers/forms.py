"""Forms API router."""

from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from ..schemas import FormGenerateRequest, FormCreate, FormResponse
from ..storage import storage
from ..constants import SHIFT_TYPE_CONFIG, DEFAULT_SHIFT_TYPE
from ..utils.date_utils import (
    get_included_dates_for_form,
    get_month_name,
    format_month_year,
)
from .auth import require_admin

router = APIRouter(prefix="/forms", tags=["forms"], dependencies=[Depends(require_admin)])


@router.get("", response_model=list[FormResponse])
async def list_forms():
    """List all forms."""
    forms = storage.get_forms()
    return forms


@router.get("/{form_id}", response_model=FormResponse)
async def get_form(form_id: int):
    """Get a specific form."""
    form = storage.get_form(form_id)
    if not form:
        raise HTTPException(status_code=404, detail="Form not found")
    return form


@router.post("/generate-dates")
async def generate_form_dates(request: FormGenerateRequest):
    """
    Generate the list of dates for a form based on settings.

    Returns the dates that would be included in the form.
    """
    shift_type = getattr(request, 'shift_type', None) or DEFAULT_SHIFT_TYPE
    included_dates = get_included_dates_for_form(
        year=request.year,
        month=request.month,
        include_tuesdays=request.include_tuesdays,
        additional_excluded=request.excluded_dates,
        force_included=request.included_dates,
        shift_type=shift_type,
    )

    month_name = get_month_name(request.month)

    return {
        "year": request.year,
        "month": request.month,
        "month_name": month_name,
        "month_year": format_month_year(request.year, request.month),
        "included_dates": [d.isoformat() for d in included_dates],
        "total_dates": len(included_dates),
        "settings": {
            "include_tuesdays": request.include_tuesdays,
            "excluded_dates": request.excluded_dates,
            "force_included_dates": request.included_dates,
        }
    }


@router.post("/create", response_model=FormResponse)
async def create_form(request: FormGenerateRequest):
    """
    Create a new form configuration for a month.

    This saves the form settings and included dates.
    The actual Google Form creation is done manually by the user.
    """
    # Generate dates
    shift_type = request.shift_type or DEFAULT_SHIFT_TYPE

    # Check if form already exists for this month + shift type
    month_year = format_month_year(request.year, request.month)
    existing = storage.get_form_by_month(month_year, shift_type)

    if existing:
        type_label = SHIFT_TYPE_CONFIG.get(shift_type, {}).get("label", shift_type.upper())
        raise HTTPException(
            status_code=400,
            detail=f"{type_label} form already exists for {month_year}"
        )
    included_dates = get_included_dates_for_form(
        year=request.year,
        month=request.month,
        include_tuesdays=request.include_tuesdays,
        additional_excluded=request.excluded_dates,
        force_included=request.included_dates,
        shift_type=shift_type,
    )

    month_name = get_month_name(request.month)
    type_label = SHIFT_TYPE_CONFIG.get(shift_type, {}).get("label", shift_type.upper())
    title = f"{month_name} {request.year} {type_label} Shift Assignment"

    # Save form
    form = storage.save_form({
        "month_year": month_year,
        "title": title,
        "status": "active",
        "shift_type": shift_type,
        "included_dates": [d.isoformat() for d in included_dates],
        "settings": {
            "include_tuesdays": request.include_tuesdays,
            "excluded_dates": request.excluded_dates,
            "force_included_dates": request.included_dates,
        }
    })

    return form


@router.put("/{form_id}/status")
async def update_form_status(form_id: int, status: str):
    """Update form status (active, closed, processed)."""
    form = storage.get_form(form_id)
    if not form:
        raise HTTPException(status_code=404, detail="Form not found")

    if status not in ["active", "closed", "processed"]:
        raise HTTPException(status_code=400, detail="Invalid status")

    form["status"] = status
    storage.save_form(form)

    return {"success": True, "status": status}


@router.delete("/{form_id}")
async def delete_form(form_id: int):
    """Delete a form by ID."""
    form = storage.get_form(form_id)
    if not form:
        raise HTTPException(status_code=404, detail="Form not found")

    if storage.delete_form(form_id):
        return {"success": True, "message": "Form deleted"}
    raise HTTPException(status_code=500, detail="Failed to delete form")


@router.get("/{form_id}/template")
async def get_form_template(form_id: int):
    """
    Get the Google Form template/structure for manual creation.

    Returns the questions that should be added to the Google Form.
    """
    form = storage.get_form(form_id)
    if not form:
        raise HTTPException(status_code=404, detail="Form not found")

    included_dates = form.get("included_dates", [])
    shift_type = form.get("shift_type", DEFAULT_SHIFT_TYPE)
    type_label = SHIFT_TYPE_CONFIG.get(shift_type, {}).get("label", shift_type.upper())

    questions = [
        {
            "order": 1,
            "title": "Employee Name",
            "type": "short_answer",
            "required": True,
        },
        {
            "order": 2,
            "title": f"Is this your first month doing {type_label} shift?",
            "type": "radio",
            "required": True,
            "options": ["Yes", "No"],
        },
    ]

    for idx, date_str in enumerate(included_dates):
        d = date.fromisoformat(date_str)
        day_name = d.strftime("%A")
        date_display = d.strftime("%B ") + str(d.day)

        questions.append({
            "order": idx + 3,
            "title": f"Availability on {date_display} ({day_name})",
            "type": "radio",
            "required": True,
            "options": ["Available", "Not Available"],
        })

    exclude_weekends = SHIFT_TYPE_CONFIG.get(shift_type, {}).get("exclude_weekends", True)
    title_prefix = form["title"].replace(" Shift Assignment", "")
    if exclude_weekends:
        form_desc = f"Please indicate your availability for each date in {title_prefix} (excluding Fridays, Saturdays, etc.)."
    else:
        form_desc = f"Please indicate your availability for each date in {title_prefix}."

    return {
        "form_title": form["title"],
        "form_description": form_desc,
        "questions": questions,
        "total_questions": len(questions),
    }
