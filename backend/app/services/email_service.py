"""Email domain validation for Clalit authentication."""

import logging

logger = logging.getLogger(__name__)

ALLOWED_DOMAINS = {"clalit.org.il"}


def validate_email_domain(email: str) -> bool:
    """Check if email belongs to an allowed Clalit domain."""
    domain = email.strip().lower().split("@")[-1]
    return domain in ALLOWED_DOMAINS
