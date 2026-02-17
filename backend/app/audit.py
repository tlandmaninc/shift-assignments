"""Audit logging utility for tracking sensitive operations."""

import logging
from datetime import datetime
from pathlib import Path
from typing import Any

from .config import settings

# Configure audit logger
audit_logger = logging.getLogger("audit")
audit_logger.setLevel(logging.INFO)

# Create file handler for audit log
_audit_log_path = settings.data_dir / "audit.log"
_audit_log_path.parent.mkdir(parents=True, exist_ok=True)

_file_handler = logging.FileHandler(_audit_log_path, encoding="utf-8")
_file_handler.setFormatter(logging.Formatter(
    "%(asctime)s | %(levelname)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
))
audit_logger.addHandler(_file_handler)

# Prevent propagation to root logger
audit_logger.propagate = False


def log_audit(action: str, details: dict[str, Any] | None = None) -> None:
    """
    Log an audit event for sensitive operations.

    Args:
        action: The action being performed (e.g., "EMPLOYEE_MERGE", "FORM_CREATE")
        details: Optional dictionary of additional context
    """
    detail_str = ""
    if details:
        # Safely format details, avoiding sensitive data exposure
        safe_details = {k: v for k, v in details.items() if k not in ("password", "token", "secret")}
        detail_str = f" | {safe_details}"

    audit_logger.info(f"{action}{detail_str}")


# Common audit actions
class AuditAction:
    """Constants for common audit actions."""
    EMPLOYEE_CREATE = "EMPLOYEE_CREATE"
    EMPLOYEE_UPDATE = "EMPLOYEE_UPDATE"
    EMPLOYEE_DELETE = "EMPLOYEE_DELETE"
    EMPLOYEE_MERGE = "EMPLOYEE_MERGE"
    EMPLOYEE_TRANSLATE = "EMPLOYEE_TRANSLATE"
    FORM_CREATE = "FORM_CREATE"
    FORM_UPDATE = "FORM_UPDATE"
    FORM_DELETE = "FORM_DELETE"
    ASSIGNMENT_GENERATE = "ASSIGNMENT_GENERATE"
    GOOGLE_AUTH = "GOOGLE_AUTH"
    GOOGLE_DISCONNECT = "GOOGLE_DISCONNECT"
    GOOGLE_FORM_CREATE = "GOOGLE_FORM_CREATE"
    GOOGLE_FORM_FETCH = "GOOGLE_FORM_FETCH"
    USER_LOGIN = "USER_LOGIN"
    USER_LOGOUT = "USER_LOGOUT"
    PHONE_AUTH_FAILED = "PHONE_AUTH_FAILED"
    SHIFTS_PUBLISHED = "SHIFTS_PUBLISHED"
