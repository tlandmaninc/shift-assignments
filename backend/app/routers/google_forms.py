import base64
import hashlib
import json
import logging
import os
import secrets
from datetime import datetime, timedelta
from typing import Optional

from cryptography.fernet import Fernet, InvalidToken
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from slowapi import Limiter
from slowapi.util import get_remote_address

from ..config import settings
from ..audit import log_audit, AuditAction
from ..constants import SHIFT_TYPE_CONFIG, DEFAULT_SHIFT_TYPE
from ..storage import storage
from .auth import require_admin

# Rate limiter for sensitive endpoints
limiter = Limiter(key_func=get_remote_address)

# Configure logger
logger = logging.getLogger(__name__)


def _get_cipher() -> Fernet:
    """Get Fernet cipher derived from the application secret key."""
    key = hashlib.sha256(settings.secret_key.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(key))

# OAuth state storage (in-memory for single-server deployment)
_oauth_states: dict[str, datetime] = {}


def generate_oauth_state() -> str:
    """Generate a cryptographically secure state token for OAuth CSRF protection."""
    state = secrets.token_urlsafe(32)
    _oauth_states[state] = datetime.now() + timedelta(minutes=10)
    # Clean up expired states
    now = datetime.now()
    expired = [k for k, v in _oauth_states.items() if v < now]
    for k in expired:
        _oauth_states.pop(k, None)
    return state


def validate_oauth_state(state: str) -> bool:
    """Validate and consume an OAuth state token."""
    if not state or state not in _oauth_states:
        return False
    expiry = _oauth_states.pop(state)
    return datetime.now() < expiry

router = APIRouter(prefix="/google", tags=["google"])

# Google OAuth settings
GOOGLE_CLIENT_ID = settings.google_client_id
GOOGLE_CLIENT_SECRET = settings.google_client_secret
GOOGLE_REDIRECT_URI = settings.google_redirect_uri
SCOPES = [
    "https://www.googleapis.com/auth/forms.body",
    "https://www.googleapis.com/auth/forms.responses.readonly",
    "https://www.googleapis.com/auth/drive",  # Full drive access needed to copy template forms
]

# Token storage (in production, use a database)
TOKEN_FILE = os.path.join(os.path.dirname(__file__), "..", "..", "data", "google_token.json")

# Template form ID (optional - set in .env as GOOGLE_FORM_TEMPLATE_ID)
GOOGLE_FORM_TEMPLATE_ID = settings.google_form_template_id


class FormCreateRequest(BaseModel):
    form_id: int
    title: str
    included_dates: list[str]
    shift_type: Optional[str] = "ect"


class FetchResponsesRequest(BaseModel):
    form_id: int


def get_stored_credentials():
    """Load stored OAuth credentials with decryption."""
    if os.path.exists(TOKEN_FILE):
        try:
            with open(TOKEN_FILE, "rb") as f:
                encrypted_data = f.read()

            # Decrypt the token data
            cipher = _get_cipher()
            try:
                decrypted = cipher.decrypt(encrypted_data)
                token_data = json.loads(decrypted.decode())
            except InvalidToken:
                # Handle legacy unencrypted tokens (migrate on next save)
                logger.warning("Found unencrypted token file, will encrypt on next save")
                with open(TOKEN_FILE, "r") as f:
                    token_data = json.load(f)

            from google.oauth2.credentials import Credentials

            # Restore expiry so the expired check works correctly
            expiry = None
            if token_data.get("expiry"):
                expiry = datetime.fromisoformat(token_data["expiry"])

            creds = Credentials(
                token=token_data.get("token"),
                refresh_token=token_data.get("refresh_token"),
                token_uri="https://oauth2.googleapis.com/token",
                client_id=GOOGLE_CLIENT_ID,
                client_secret=GOOGLE_CLIENT_SECRET,
                scopes=SCOPES,
                expiry=expiry,
            )

            # Refresh if expired
            if creds.expired and creds.refresh_token:
                from google.auth.transport.requests import Request as GoogleRequest
                try:
                    creds.refresh(GoogleRequest())
                    save_credentials(creds)
                except Exception as refresh_err:
                    logger.error(f"Failed to refresh Google token: {refresh_err}")
                    # Token is revoked or invalid — remove it so user can re-authenticate
                    os.remove(TOKEN_FILE)
                    return None

            return creds
        except Exception as e:
            logger.error(f"Error loading credentials: {e}")
            return None
    return None


def save_credentials(creds):
    """Save OAuth credentials to file with encryption."""
    os.makedirs(os.path.dirname(TOKEN_FILE), exist_ok=True)
    token_data = {
        "token": creds.token,
        "refresh_token": creds.refresh_token,
        "expiry": creds.expiry.isoformat() if creds.expiry else None,
    }

    # Encrypt the token data
    cipher = _get_cipher()
    encrypted = cipher.encrypt(json.dumps(token_data).encode())

    with open(TOKEN_FILE, "wb") as f:
        f.write(encrypted)


@router.get("/status")
async def get_auth_status(user: dict = Depends(require_admin)):
    """Check if Google is authenticated."""
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        return {
            "authenticated": False,
            "configured": False,
            "message": "Google OAuth credentials not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env",
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
        "message": "Not authenticated with Google",
    }


@router.get("/authorize")
@limiter.limit("5/minute")
async def authorize(request: Request, user: dict = Depends(require_admin)):
    """Start OAuth flow with rate limiting."""
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        raise HTTPException(
            status_code=400,
            detail="Google OAuth credentials not configured",
        )

    from google_auth_oauthlib.flow import Flow

    flow = Flow.from_client_config(
        {
            "web": {
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "redirect_uris": [GOOGLE_REDIRECT_URI],
            }
        },
        scopes=SCOPES,
    )
    flow.redirect_uri = GOOGLE_REDIRECT_URI

    state = generate_oauth_state()
    authorization_url, _ = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
        state=state,
    )

    return {"authorization_url": authorization_url}


@router.get("/callback")
async def callback(code: str, state: str):
    """Handle OAuth callback with CSRF state validation."""
    frontend_url = settings.frontend_url

    # Validate OAuth state to prevent CSRF attacks
    if not validate_oauth_state(state):
        logger.warning("OAuth callback received with invalid state parameter")
        return RedirectResponse(url=f"{frontend_url}/forms?google_auth=error&message=Invalid+request")

    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        raise HTTPException(
            status_code=400,
            detail="Google OAuth credentials not configured",
        )

    from google_auth_oauthlib.flow import Flow

    flow = Flow.from_client_config(
        {
            "web": {
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "redirect_uris": [GOOGLE_REDIRECT_URI],
            }
        },
        scopes=SCOPES,
    )
    flow.redirect_uri = GOOGLE_REDIRECT_URI

    try:
        flow.fetch_token(code=code)
        creds = flow.credentials
        save_credentials(creds)

        # Log successful authentication
        log_audit(AuditAction.GOOGLE_AUTH, {"status": "success"})

        # Redirect to frontend with success
        return RedirectResponse(url=f"{frontend_url}/forms?google_auth=success")
    except Exception as e:
        # Log the actual error for debugging, return generic message to user
        logger.error(f"OAuth callback error: {str(e)}")
        return RedirectResponse(url=f"{frontend_url}/forms?google_auth=error&message=Authentication+failed")


@router.post("/disconnect")
async def disconnect(user: dict = Depends(require_admin)):
    """Disconnect Google account."""
    if os.path.exists(TOKEN_FILE):
        os.remove(TOKEN_FILE)
    log_audit(AuditAction.GOOGLE_DISCONNECT, {})
    return {"message": "Disconnected from Google"}


def copy_template_form(creds, new_title: str) -> Optional[str]:
    """
    Copy the template form using Google Drive API.

    Returns the new form's ID, or None if template is not configured or copy fails.
    """
    if not GOOGLE_FORM_TEMPLATE_ID:
        return None

    try:
        from googleapiclient.discovery import build

        drive_service = build("drive", "v3", credentials=creds)

        # Copy the template form
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
    """
    Remove all existing items from a form.

    This is used after copying a template to clear any placeholder questions.
    """
    try:
        # Get the current form to find existing items
        form = service.forms().get(formId=form_id).execute()
        items = form.get("items", [])

        if not items:
            return

        # Build delete requests for all items (in reverse order to maintain indices)
        delete_requests = []
        for i in range(len(items) - 1, -1, -1):
            delete_requests.append({
                "deleteItem": {
                    "location": {"index": i}
                }
            })

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
        form_description = f"Please indicate your availability for each date in {title_prefix} (excluding Fridays, Saturdays, etc.)."
    else:
        form_description = f"Please indicate your availability for each date in {title_prefix}."

    creds = get_stored_credentials()
    if not creds or not creds.valid:
        raise HTTPException(
            status_code=401,
            detail="Not authenticated with Google. Please connect your Google account first.",
        )

    try:
        from googleapiclient.discovery import build

        # Build the Forms API service
        forms_service = build("forms", "v1", credentials=creds)

        # Try to copy from template (preserves header image)
        logger.info(f"Creating Google Form: title={form_request.title!r}, shift_type={shift_type}, dates={len(form_request.included_dates)}")
        form_id = copy_template_form(creds, form_request.title)
        used_template = form_id is not None
        logger.info(f"Template copy result: form_id={form_id}, used_template={used_template}")

        if form_id:
            # Clear any existing items from the copied template
            clear_form_items(forms_service, form_id)

            # Update the form title
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
            # No template - create from scratch
            form = {
                "info": {
                    "title": form_request.title,
                    "documentTitle": form_request.title,
                }
            }
            result = forms_service.forms().create(body=form).execute()
            form_id = result["formId"]

        # Build the questions
        requests_list = []
        current_index = 0

        # Question 1: Employee Name (Text)
        requests_list.append({
            "createItem": {
                "item": {
                    "title": "Employee Name",
                    "questionItem": {
                        "question": {
                            "required": True,
                            "textQuestion": {
                                "paragraph": False,
                            }
                        }
                    }
                },
                "location": {"index": current_index}
            }
        })
        current_index += 1

        # Question 2: First month question (Multiple Choice)
        requests_list.append({
            "createItem": {
                "item": {
                    "title": f"Is this your first month doing {type_label} shift?",
                    "questionItem": {
                        "question": {
                            "required": True,
                            "choiceQuestion": {
                                "type": "RADIO",
                                "options": [
                                    {"value": "Yes"},
                                    {"value": "No"},
                                ]
                            }
                        }
                    }
                },
                "location": {"index": current_index}
            }
        })
        current_index += 1

        # Date availability questions
        # Python weekday(): Monday=0, Tuesday=1, ..., Sunday=6
        days_full = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

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

        # Batch update to add all questions
        if requests_list:
            logger.info(f"Adding {len(requests_list)} questions to form {form_id}")
            batch_response = forms_service.forms().batchUpdate(
                formId=form_id,
                body={"requests": requests_list}
            ).execute()
            logger.info(f"batchUpdate response keys: {list(batch_response.keys()) if batch_response else 'None'}")
        else:
            logger.warning(f"requests_list is empty — no questions to add for form {form_id}")

        # Get the form URL
        form_url = f"https://docs.google.com/forms/d/{form_id}/edit"
        responder_url = f"https://docs.google.com/forms/d/{form_id}/viewform"

        # Log successful form creation
        log_audit(AuditAction.GOOGLE_FORM_CREATE, {
            "google_form_id": form_id,
            "dates_count": len(form_request.included_dates),
            "used_template": used_template
        })

        # Persist google_form_id on the internal form record
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
            "message": f"Google Form created{template_note} with {len(form_request.included_dates) + 2} questions",
        }

    except Exception as e:
        logger.error(f"Failed to create Google Form: {str(e)}", exc_info=True)
        error_msg = str(e)
        # Handle token revocation/expiry that occurs during API calls
        if "invalid_grant" in error_msg or "Token has been" in error_msg:
            if os.path.exists(TOKEN_FILE):
                os.remove(TOKEN_FILE)
            raise HTTPException(
                status_code=401,
                detail="Google session expired. Please reconnect your Google account and try again.",
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

    # Look up internal form
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

    # Check Google credentials
    creds = get_stored_credentials()
    if not creds or not creds.valid:
        raise HTTPException(
            status_code=401,
            detail="Google authentication expired. Please reconnect your Google account.",
        )

    try:
        from googleapiclient.discovery import build

        forms_service = build("forms", "v1", credentials=creds)

        # 1. Get form structure to map questionIds to dates
        form_structure = forms_service.forms().get(formId=google_form_id).execute()
        items = form_structure.get("items", [])

        logger.info(f"[fetch-responses] Form has {len(items)} items")

        # Build mapping: questionId -> role ("name", "is_new", or ISO date)
        question_map = {}
        for item in items:
            question_item = item.get("questionItem", {})
            question = question_item.get("question", {})
            question_id = question.get("questionId")
            title = item.get("title", "")

            if not question_id:
                logger.debug(f"[fetch-responses] Skipping item without questionId: {title!r}")
                continue

            title_lower = title.lower()
            if "employee name" in title_lower:
                question_map[question_id] = "name"
            elif "first month" in title_lower:
                question_map[question_id] = "is_new"
            else:
                # Try to parse as a date question
                date_iso = parse_date_from_header(title, included_dates)
                if date_iso:
                    question_map[question_id] = date_iso
                else:
                    logger.warning(f"[fetch-responses] Could not map question: {title!r}")

        logger.info(f"[fetch-responses] question_map: {question_map}")

        # 2. Fetch all responses (with pagination)
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
                detail="No responses found in the Google Form. "
                       "Note: only actual form submissions are returned — rows manually added to the linked Google Sheet are not included. "
                       "Please wait for employees to submit their availability via the form link.",
            )

        # 3. Convert responses to employee availability format
        employees = []
        for resp_idx, response in enumerate(all_responses):
            answers = response.get("answers", {})
            employee_name = None
            is_first_month = True
            availability = {}

            logger.debug(f"[fetch-responses] Response {resp_idx}: answer keys={list(answers.keys())}")

            for q_id, answer_data in answers.items():
                role = question_map.get(q_id)
                if not role:
                    logger.debug(f"[fetch-responses] Response {resp_idx}: unmapped q_id={q_id!r}")
                    continue

                # Extract the answer text
                text_answers = answer_data.get("textAnswers", {})
                answer_list = text_answers.get("answers", [])
                answer_value = answer_list[0].get("value", "") if answer_list else ""

                if role == "name":
                    employee_name = answer_value.strip()
                elif role == "is_new":
                    is_first_month = answer_value.strip().lower() == "yes"
                else:
                    # It's a date - check availability
                    availability[role] = answer_value.strip().lower() == "available"

            if not employee_name:
                logger.warning(f"[fetch-responses] Response {resp_idx}: no employee name found, skipping. answer_keys={list(answers.keys())}")
                continue

            logger.info(f"[fetch-responses] Response {resp_idx}: employee={employee_name!r}")

            # Ensure all included dates are in availability
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
                detail="Google session expired. Please reconnect your Google account and try again.",
            )

        if "403" in error_msg or "Forbidden" in error_msg or "insufficient" in error_msg.lower():
            raise HTTPException(
                status_code=403,
                detail="Insufficient permissions to read form responses. "
                       "Please disconnect and reconnect Google to grant the required scopes.",
            )

        if "404" in error_msg or "not found" in error_msg.lower():
            raise HTTPException(
                status_code=404,
                detail="Google Form not found. It may have been deleted. "
                       "Please create a new Google Form for this month.",
            )

        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch Google Form responses: {error_msg}",
        )
