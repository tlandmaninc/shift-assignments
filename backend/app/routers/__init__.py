"""API routers."""

from .forms import router as forms_router
from .assignments import router as assignments_router
from .employees import router as employees_router
from .history import router as history_router
from .google_forms import router as google_forms_router
from .chat import router as chat_router
from .github import router as github_router
from .auth import router as auth_router

__all__ = [
    "forms_router",
    "assignments_router",
    "employees_router",
    "history_router",
    "google_forms_router",
    "chat_router",
    "github_router",
    "auth_router",
]
