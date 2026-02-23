"""Settings router for admin-configurable page access control."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator

from ..constants import CONFIGURABLE_PAGES, DEFAULT_PAGE_ACCESS
from ..storage import storage
from .auth import get_required_user, require_admin

router = APIRouter(prefix="/settings", tags=["settings"])

VALID_ACCESS_VALUES = {"admin", "all"}


class PageAccessUpdate(BaseModel):
    """Request body for updating page access config."""
    config: dict[str, str]

    @field_validator("config")
    @classmethod
    def validate_config(cls, v: dict[str, str]) -> dict[str, str]:
        for key, value in v.items():
            if key not in CONFIGURABLE_PAGES:
                raise ValueError(f"Unknown page: {key}")
            if value not in VALID_ACCESS_VALUES:
                raise ValueError(
                    f"Invalid access value for '{key}': '{value}'. "
                    f"Must be 'admin' or 'all'."
                )
        return v


@router.get("/page-access")
async def get_page_access(user: dict = Depends(get_required_user)):
    """Get page access config. Any authenticated user can read (needed for sidebar)."""
    return storage.get_page_access()


@router.put("/page-access")
async def update_page_access(
    body: PageAccessUpdate,
    user: dict = Depends(require_admin),
):
    """Update page access config. Admin only."""
    return storage.save_page_access(body.config)
