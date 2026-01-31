"""Forms API router."""

from datetime import date
from fastapi import APIRouter, HTTPException
from ..schemas import FormGenerateRequest, FormCreate, FormResponse
from ..storage import storage
from ..utils.date_utils import (
    get_included_dates_for_form,
    get_month_name,
    format_month_year,
)

router = APIRouter(prefix="/forms", tags=["forms"])


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
    included_dates = get_included_dates_for_form(
        year=request.year,
        month=request.month,
        include_tuesdays=request.include_tuesdays,
        additional_excluded=request.excluded_dates,
        force_included=request.included_dates,
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
    # Check if form already exists for this month
    month_year = format_month_year(request.year, request.month)
    existing = storage.get_form_by_month(month_year)

    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"Form already exists for {month_year}"
        )

    # Generate dates
    included_dates = get_included_dates_for_form(
        year=request.year,
        month=request.month,
        include_tuesdays=request.include_tuesdays,
        additional_excluded=request.excluded_dates,
        force_included=request.included_dates,
    )

    month_name = get_month_name(request.month)
    title = f"{month_name} {request.year} Shift Assignment"

    # Save form
    form = storage.save_form({
        "month_year": month_year,
        "title": title,
        "status": "active",
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

    questions = [
        {
            "order": 1,
            "title": "Employee Name",
            "type": "short_answer",
            "required": True,
        },
        {
            "order": 2,
            "title": "Is this your first month doing ECT?",
            "type": "radio",
            "required": True,
            "options": ["Yes", "No"],
        },
    ]

    for idx, date_str in enumerate(included_dates):
        d = date.fromisoformat(date_str)
        day_name = d.strftime("%A")
        date_display = d.strftime("%B %d, %Y").replace(" 0", " ")

        questions.append({
            "order": idx + 3,
            "title": f"Availability on {date_display} ({day_name})",
            "type": "radio",
            "required": True,
            "options": ["Available", "Not Available"],
        })

    return {
        "form_title": form["title"],
        "form_description": f"Please indicate your availability for each date in {form['title'].replace(' Shift Assignment', '')} (excluding Fridays, Saturdays, etc.).",
        "questions": questions,
        "total_questions": len(questions),
    }
