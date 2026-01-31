import base64
import hashlib
import json
import logging
import os
import secrets
from datetime import datetime, timedelta
from typing import Optional

from cryptography.fernet import Fernet, InvalidToken
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from slowapi import Limiter
from slowapi.util import get_remote_address

from ..config import settings
from ..audit import log_audit, AuditAction

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
    "https://www.googleapis.com/auth/drive.file",
]

# Token storage (in production, use a database)
TOKEN_FILE = os.path.join(os.path.dirname(__file__), "..", "..", "data", "google_token.json")


class FormCreateRequest(BaseModel):
    form_id: int
    title: str
    included_dates: list[str]


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
            creds = Credentials(
                token=token_data.get("token"),
                refresh_token=token_data.get("refresh_token"),
                token_uri="https://oauth2.googleapis.com/token",
                client_id=GOOGLE_CLIENT_ID,
                client_secret=GOOGLE_CLIENT_SECRET,
                scopes=SCOPES,
            )

            # Refresh if expired
            if creds.expired and creds.refresh_token:
                from google.auth.transport.requests import Request as GoogleRequest
                creds.refresh(GoogleRequest())
                save_credentials(creds)

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
async def get_auth_status():
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
async def authorize(request: Request):
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
async def disconnect():
    """Disconnect Google account."""
    if os.path.exists(TOKEN_FILE):
        os.remove(TOKEN_FILE)
    log_audit(AuditAction.GOOGLE_DISCONNECT, {})
    return {"message": "Disconnected from Google"}


def get_banner_image_url(creds) -> Optional[str]:
    """Upload banner image to Google Drive and return a public URL for Forms API."""
    from googleapiclient.discovery import build
    from googleapiclient.http import MediaFileUpload

    # Path to banner image
    banner_path = os.path.join(
        os.path.dirname(__file__), "..", "..", "..", "frontend", "public", "ect_banner.png"
    )

    if not os.path.exists(banner_path):
        logger.warning(f"Banner image not found at {banner_path}")
        return None

    try:
        drive_service = build("drive", "v3", credentials=creds)

        # Check if banner already exists in Drive
        results = drive_service.files().list(
            q="name='ect_form_banner.png' and trashed=false",
            spaces="drive",
            fields="files(id, name, webContentLink)"
        ).execute()

        files = results.get("files", [])
        if files:
            # Banner already uploaded, get its web content link
            file_id = files[0]["id"]
            logger.info(f"Using existing banner image from Drive: {file_id}")
            # Return direct download URL
            return f"https://drive.google.com/uc?export=view&id={file_id}"

        # Upload the banner image
        file_metadata = {
            "name": "ect_form_banner.png",
            "mimeType": "image/png"
        }
        media = MediaFileUpload(banner_path, mimetype="image/png")
        file = drive_service.files().create(
            body=file_metadata,
            media_body=media,
            fields="id,webContentLink"
        ).execute()

        file_id = file.get("id")

        # Make the file publicly readable (required for Forms API)
        drive_service.permissions().create(
            fileId=file_id,
            body={"type": "anyone", "role": "reader"}
        ).execute()

        logger.info(f"Uploaded banner image to Drive: {file_id}")
        # Return direct view URL
        return f"https://drive.google.com/uc?export=view&id={file_id}"

    except Exception as e:
        logger.error(f"Failed to upload/get banner image: {e}")
        return None


@router.post("/create-form")
@limiter.limit("10/minute")
async def create_google_form(request: Request, form_request: FormCreateRequest):
    """Create a Google Form with the specified questions. Rate limited."""
    creds = get_stored_credentials()
    if not creds or not creds.valid:
        raise HTTPException(
            status_code=401,
            detail="Not authenticated with Google. Please connect your Google account first.",
        )

    try:
        from googleapiclient.discovery import build

        # Build the Forms API service
        service = build("forms", "v1", credentials=creds)

        # Get or upload banner image to Drive and get public URL
        banner_url = get_banner_image_url(creds)

        # Create the form
        form = {
            "info": {
                "title": form_request.title,
                "documentTitle": form_request.title,
            }
        }

        result = service.forms().create(body=form).execute()
        form_id = result["formId"]

        # Build the questions
        requests_list = []
        current_index = 0

        # Add banner image as header if available
        if banner_url:
            requests_list.append({
                "createItem": {
                    "item": {
                        "title": "",
                        "imageItem": {
                            "image": {
                                "sourceUri": banner_url,
                                "altText": "ECT Shifts Management Banner"
                            }
                        }
                    },
                    "location": {"index": current_index}
                }
            })
            current_index += 1

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
                    "title": "Is this your first month doing ECT?",
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
            day_num = date_obj.day

            requests_list.append({
                "createItem": {
                    "item": {
                        "title": f"Availability on {day_num} ({day_name})",
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
            service.forms().batchUpdate(
                formId=form_id,
                body={"requests": requests_list}
            ).execute()

        # Get the form URL
        form_url = f"https://docs.google.com/forms/d/{form_id}/edit"
        responder_url = f"https://docs.google.com/forms/d/{form_id}/viewform"

        # Log successful form creation
        log_audit(AuditAction.GOOGLE_FORM_CREATE, {
            "google_form_id": form_id,
            "dates_count": len(form_request.included_dates)
        })

        return {
            "success": True,
            "form_id": form_id,
            "edit_url": form_url,
            "responder_url": responder_url,
            "message": f"Google Form created with {len(form_request.included_dates) + 2} questions",
        }

    except Exception as e:
        # Log the actual error for debugging, return generic message to user
        logger.error(f"Failed to create Google Form: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Failed to create Google Form. Please try again later.",
        )
