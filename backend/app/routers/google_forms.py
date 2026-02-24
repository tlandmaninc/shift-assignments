import logging
import os
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from slowapi import Limiter
from slowapi.util import get_remote_address

from ..config import settings
from ..audit import log_audit, AuditAction
from ..constants import SHIFT_TYPE_CONFIG, DEFAULT_SHIFT_TYPE
from ..storage import storage
from ..services.google_credentials import (
    get_stored_credentials,
    TOKEN_FILE,
)
from .auth import require_admin

limiter = Limiter(key_func=get_remote_address)
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/google", tags=["google"])

GOOGLE_FORM_TEMPLATE_ID = settings.google_form_template_id

NEW_EMPLOYEE_QUESTIONS = {
    "ect": {
        "title": "Is this your first month doing ECT shift?",
        "yes_means_new": True,
    },
    "internal": {
        "title": (
            "Have you completed at least 2 Internal shift trainings?"
        ),
        "yes_means_new": False,
    },
    "er": {
        "title": (
            "Do you have at least 1 year of seniority and have you"
            " completed all required ER training?"
        ),
        "yes_means_new": False,
    },
}


class FormCreateRequest(BaseModel):
    form_id: int
    title: str
    included_dates: list[str]
    shift_type: Optional[str] = "ect"


class FetchResponsesRequest(BaseModel):
    form_id: int


@router.get("/status")
async def get_auth_status(user: dict = Depends(require_admin)):
    """Check if Google is authenticated."""
    if not settings.google_client_id or not settings.google_client_secret:
        return {
            "authenticated": False,
            "configured": False,
            "message": (
                "Google OAuth credentials not configured. "
                "Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env"
            ),
        }

    creds = get_stored_credentials()
    if creds and creds.valid:
        return {
            "authenticated": True,
            "configured": True,
            "message": "Connected to Google",
        }

    return {
        "authenticated": False,
        "configured": True,
        "message": "Admin must log out and log back in to connect Google",
    }


@router.post("/disconnect")
async def disconnect(user: dict = Depends(require_admin)):
    """Disconnect Google account."""
    if os.path.exists(TOKEN_FILE):
        os.remove(TOKEN_FILE)
    log_audit(AuditAction.GOOGLE_DISCONNECT, {})
    return {"message": "Disconnected from Google"}


def copy_template_form(creds, new_title: str) -> Optional[str]:
    """Copy the template form using Google Drive API.

    Returns the new form's ID, or None if template is not configured or copy fails.
    """
    if not GOOGLE_FORM_TEMPLATE_ID:
        return None

    try:
        from googleapiclient.discovery import build

        drive_service = build("drive", "v3", credentials=creds)
        copied_file = drive_service.files().copy(
            fileId=GOOGLE_FORM_TEMPLATE_ID,
            body={"name": new_title}
        ).execute()

        new_form_id = copied_file.get("id")
        logger.info(f"Copied template form to new form: {new_form_id}")
        return new_form_id
    except Exception as e:
        logger.warning(f"Failed to copy template form: {e}. Creating from scratch.")
        return None


def clear_form_items(service, form_id: str) -> None:
    """Remove all existing items from a form (used after copying a template)."""
    try:
        form = service.forms().get(formId=form_id).execute()
        items = form.get("items", [])
        if not items:
            return

        delete_requests = [
            {"deleteItem": {"location": {"index": i}}}
            for i in range(len(items) - 1, -1, -1)
        ]
        if delete_requests:
            service.forms().batchUpdate(
                formId=form_id,
                body={"requests": delete_requests}
            ).execute()
            logger.info(f"Cleared {len(items)} items from form")
    except Exception as e:
        logger.warning(f"Failed to clear form items: {e}")


@router.post("/create-form")
@limiter.limit("10/minute")
async def create_google_form(
    request: Request,
    form_request: FormCreateRequest,
    user: dict = Depends(require_admin),
):
    """Create a Google Form with the specified questions. Rate limited."""
    shift_type = form_request.shift_type or DEFAULT_SHIFT_TYPE
    type_label = SHIFT_TYPE_CONFIG.get(shift_type, {}).get("label", shift_type.upper())
    exclude_weekends = SHIFT_TYPE_CONFIG.get(shift_type, {}).get("exclude_weekends", True)
    title_prefix = form_request.title.replace(" Shift Assignment", "")
    if exclude_weekends:
        form_description = (
            f"Please indicate your availability for each date in "
            f"{title_prefix} (excluding Fridays, Saturdays, etc.)."
        )
    else:
        form_description = (
            f"Please indicate your availability for each date in {title_prefix}."
        )

    creds = get_stored_credentials()
    if not creds or not creds.valid:
        raise HTTPException(
            status_code=401,
            detail="Not authenticated with Google. Please log out and log back in.",
        )

    try:
        from googleapiclient.discovery import build

        forms_service = build("forms", "v1", credentials=creds)

        logger.info(
            f"Creating Google Form: title={form_request.title!r}, "
            f"shift_type={shift_type}, dates={len(form_request.included_dates)}"
        )
        form_id = copy_template_form(creds, form_request.title)
        used_template = form_id is not None
        logger.info(f"Template copy result: form_id={form_id}, used_template={used_template}")

        if form_id:
            clear_form_items(forms_service, form_id)
            forms_service.forms().batchUpdate(
                formId=form_id,
                body={
                    "requests": [{
                        "updateFormInfo": {
                            "info": {
                                "title": form_request.title,
                                "description": form_description
                            },
                            "updateMask": "title,description"
                        }
                    }]
                }
            ).execute()
        else:
            form = {
                "info": {
                    "title": form_request.title,
                    "documentTitle": form_request.title,
                }
            }
            result = forms_service.forms().create(body=form).execute()
            form_id = result["formId"]

        requests_list = []
        current_index = 0

        requests_list.append({
            "createItem": {
                "item": {
                    "title": "Employee Name",
                    "questionItem": {
                        "question": {
                            "required": True,
                            "textQuestion": {"paragraph": False}
                        }
                    }
                },
                "location": {"index": current_index}
            }
        })
        current_index += 1

        requests_list.append({
            "createItem": {
                "item": {
                    "title": NEW_EMPLOYEE_QUESTIONS.get(
                        shift_type,
                        {
                            "title": f"Is this your first month doing"
                            f" {type_label} shift?"
                        },
                    )["title"],
                    "questionItem": {
                        "question": {
                            "required": True,
                            "choiceQuestion": {
                                "type": "RADIO",
                                "options": [{"value": "Yes"}, {"value": "No"}]
                            }
                        }
                    }
                },
                "location": {"index": current_index}
            }
        })
        current_index += 1

        days_full = [
            "Monday", "Tuesday", "Wednesday", "Thursday",
            "Friday", "Saturday", "Sunday",
        ]

        for i, date_str in enumerate(form_request.included_dates):
            date_obj = datetime.strptime(date_str, "%Y-%m-%d")
            day_name = days_full[date_obj.weekday()]
            month_name = date_obj.strftime("%B")
            day_num = date_obj.day

            requests_list.append({
                "createItem": {
                    "item": {
                        "title": f"Availability on {month_name} {day_num} ({day_name})",
                        "questionItem": {
                            "question": {
                                "required": True,
                                "choiceQuestion": {
                                    "type": "RADIO",
                                    "options": [
                                        {"value": "Available"},
                                        {"value": "Not Available"},
                                    ]
                                }
                            }
                        }
                    },
                    "location": {"index": current_index + i}
                }
            })

        if requests_list:
            logger.info(f"Adding {len(requests_list)} questions to form {form_id}")
            batch_response = forms_service.forms().batchUpdate(
                formId=form_id,
                body={"requests": requests_list}
            ).execute()
            logger.info(
                f"batchUpdate response keys: "
                f"{list(batch_response.keys()) if batch_response else 'None'}"
            )
        else:
            logger.warning(f"requests_list is empty — no questions to add for form {form_id}")

        form_url = f"https://docs.google.com/forms/d/{form_id}/edit"
        responder_url = f"https://docs.google.com/forms/d/{form_id}/viewform"

        log_audit(AuditAction.GOOGLE_FORM_CREATE, {
            "google_form_id": form_id,
            "dates_count": len(form_request.included_dates),
            "used_template": used_template
        })

        internal_form = storage.get_form(form_request.form_id)
        if internal_form:
            internal_form["google_form_id"] = form_id
            storage.save_form(internal_form)

        template_note = " (from template with header)" if used_template else ""
        return {
            "success": True,
            "form_id": form_id,
            "edit_url": form_url,
            "responder_url": responder_url,
            "used_template": used_template,
            "message": (
                f"Google Form created{template_note} "
                f"with {len(form_request.included_dates) + 2} questions"
            ),
        }

    except Exception as e:
        logger.error(f"Failed to create Google Form: {str(e)}", exc_info=True)
        error_msg = str(e)
        if "invalid_grant" in error_msg or "Token has been" in error_msg:
            if os.path.exists(TOKEN_FILE):
                os.remove(TOKEN_FILE)
            raise HTTPException(
                status_code=401,
                detail="Google session expired. Please log out and log back in.",
            )
        raise HTTPException(
            status_code=500,
            detail="Failed to create Google Form. Please try again later.",
        )


@router.post("/fetch-responses")
@limiter.limit("10/minute")
async def fetch_google_form_responses(
    request: Request,
    body: FetchResponsesRequest,
    user: dict = Depends(require_admin),
):
    """Fetch responses from a linked Google Form and return parsed availability data."""
    from ..services.csv_parser import parse_date_from_header

    form = storage.get_form(body.form_id)
    if not form:
        raise HTTPException(status_code=404, detail="Form not found")

    google_form_id = form.get("google_form_id")
    if not google_form_id:
        raise HTTPException(
            status_code=400,
            detail="No Google Form linked to this form. Create a Google Form first.",
        )

    included_dates = form.get("included_dates", [])
    if not included_dates:
        raise HTTPException(status_code=400, detail="Form has no included dates")

    creds = get_stored_credentials()
    if not creds or not creds.valid:
        raise HTTPException(
            status_code=401,
            detail="Google authentication expired. Please log out and log back in.",
        )

    try:
        from googleapiclient.discovery import build

        forms_service = build("forms", "v1", credentials=creds)

        form_structure = forms_service.forms().get(formId=google_form_id).execute()
        items = form_structure.get("items", [])
        logger.info(f"[fetch-responses] Form has {len(items)} items")

        question_map = {}
        for item in items:
            question_item = item.get("questionItem", {})
            question = question_item.get("question", {})
            question_id = question.get("questionId")
            title = item.get("title", "")

            if not question_id:
                continue

            title_lower = title.lower()
            if "employee name" in title_lower:
                question_map[question_id] = "name"
            elif "first month" in title_lower:
                question_map[question_id] = "is_new"
            else:
                date_iso = parse_date_from_header(title, included_dates)
                if date_iso:
                    question_map[question_id] = date_iso
                else:
                    logger.warning(f"[fetch-responses] Could not map question: {title!r}")

        logger.info(f"[fetch-responses] question_map: {question_map}")

        all_responses = []
        page_token = None
        while True:
            kwargs = {"formId": google_form_id}
            if page_token:
                kwargs["pageToken"] = page_token
            resp = forms_service.forms().responses().list(**kwargs).execute()
            batch = resp.get("responses", [])
            logger.info(f"[fetch-responses] Fetched page with {len(batch)} responses")
            all_responses.extend(batch)
            page_token = resp.get("nextPageToken")
            if not page_token:
                break

        logger.info(f"[fetch-responses] Total responses fetched: {len(all_responses)}")

        if not all_responses:
            raise HTTPException(
                status_code=400,
                detail=(
                    "No responses found in the Google Form. "
                    "Note: only actual form submissions are returned — "
                    "rows manually added to the linked Google Sheet are not included. "
                    "Please wait for employees to submit their availability via the form link."
                ),
            )

        employees = []
        for resp_idx, response in enumerate(all_responses):
            answers = response.get("answers", {})
            employee_name = None
            is_first_month = True
            availability = {}

            for q_id, answer_data in answers.items():
                role = question_map.get(q_id)
                if not role:
                    continue

                text_answers = answer_data.get("textAnswers", {})
                answer_list = text_answers.get("answers", [])
                answer_value = answer_list[0].get("value", "") if answer_list else ""

                if role == "name":
                    employee_name = answer_value.strip()
                elif role == "is_new":
                    answered_yes = answer_value.strip().lower() == "yes"
                    form_shift_type = form.get(
                        "shift_type", DEFAULT_SHIFT_TYPE
                    )
                    q_config = NEW_EMPLOYEE_QUESTIONS.get(
                        form_shift_type, {"yes_means_new": True}
                    )
                    is_first_month = (
                        answered_yes
                        if q_config["yes_means_new"]
                        else not answered_yes
                    )
                else:
                    availability[role] = answer_value.strip().lower() == "available"

            if not employee_name:
                logger.warning(
                    f"[fetch-responses] Response {resp_idx}: "
                    f"no employee name found, skipping"
                )
                continue

            logger.info(f"[fetch-responses] Response {resp_idx}: employee={employee_name!r}")

            for date_iso in included_dates:
                if date_iso not in availability:
                    availability[date_iso] = False

            employees.append({
                "employee_name": employee_name,
                "is_first_month": is_first_month,
                "availability": availability,
            })

        log_audit(AuditAction.GOOGLE_FORM_FETCH, {
            "form_id": body.form_id,
            "google_form_id": google_form_id,
            "employees_count": len(employees),
        })

        return {
            "success": True,
            "employees_count": len(employees),
            "total_responses_fetched": len(all_responses),
            "employees": employees,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to fetch Google Form responses: {str(e)}", exc_info=True)
        error_msg = str(e)

        if "invalid_grant" in error_msg or "Token has been" in error_msg:
            if os.path.exists(TOKEN_FILE):
                os.remove(TOKEN_FILE)
            raise HTTPException(
                status_code=401,
                detail="Google session expired. Please log out and log back in.",
            )

        if "403" in error_msg or "Forbidden" in error_msg or "insufficient" in error_msg.lower():
            raise HTTPException(
                status_code=403,
                detail=(
                    "Insufficient permissions to read form responses. "
                    "Please log out and log back in to grant the required scopes."
                ),
            )

        if "404" in error_msg or "not found" in error_msg.lower():
            raise HTTPException(
                status_code=404,
                detail=(
                    "Google Form not found. It may have been deleted. "
                    "Please create a new Google Form for this month."
                ),
            )

        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch Google Form responses: {error_msg}",
        )
