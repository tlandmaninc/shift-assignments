"""Router for dynamic shift type CRUD operations."""

import logging
from fastapi import APIRouter, HTTPException, Depends
from slowapi import Limiter
from slowapi.util import get_remote_address

from ..storage import storage
from ..audit import log_audit, AuditAction
from ..schemas.shift_types import (
    ShiftTypeCreate,
    ShiftTypeUpdate,
    ShiftTypeResponse,
    CrossTypeConstraint,
    CrossTypeConstraintResponse,
    ShiftTypeFeasibilityRequest,
    FeasibilityResponse,
)
from .auth import get_required_user, require_admin

logger = logging.getLogger(__name__)
limiter = Limiter(key_func=get_remote_address)

router = APIRouter(prefix="/shift-types", tags=["shift-types"])

MAX_SHIFT_TYPES = 20


def _to_response(key: str, cfg: dict) -> dict:
    """Convert a stored shift type dict to a response-compatible dict."""
    return {
        "key": key,
        "label": cfg.get("label", key),
        "color": cfg.get("color", "#6B7280"),
        "start_time": cfg.get("start_time", "T080000"),
        "end_time": cfg.get("end_time", "T170000"),
        "next_day_end": cfg.get("next_day_end", False),
        "slots": cfg.get("slots", 1),
        "exclude_weekends": cfg.get("exclude_weekends", True),
        "calendar_title": cfg.get("calendar_title", f"{key} Shift"),
        "calendar_desc": cfg.get("calendar_desc", ""),
        "slot_details": cfg.get("slot_details"),
        "constraints": cfg.get("constraints", {}),
        "is_builtin": cfg.get("is_builtin", False),
    }


# ==================== Cross-Type Constraints ====================
# NOTE: These must be defined BEFORE /{key} routes to avoid path conflicts.

@router.get("/cross-constraints", response_model=list[CrossTypeConstraintResponse])
async def list_cross_constraints(user: dict = Depends(get_required_user)):
    """List all cross-type constraints."""
    return storage.get_cross_type_constraints()


@router.post(
    "/cross-constraints",
    response_model=CrossTypeConstraintResponse,
    status_code=201,
)
async def create_cross_constraint(
    body: CrossTypeConstraint,
    user: dict = Depends(require_admin),
):
    """Create a cross-type constraint (admin only)."""
    for type_key in (body.type_a, body.type_b):
        if not storage.get_shift_type(type_key):
            raise HTTPException(
                status_code=404, detail=f"Shift type '{type_key}' not found"
            )
    try:
        saved = storage.save_cross_type_constraint(body.model_dump(exclude={"id"}))
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))

    log_audit(AuditAction.CROSS_CONSTRAINT_CREATE, {
        "type_a": body.type_a, "type_b": body.type_b,
        "rule": body.rule, "user": user.get("email", "unknown"),
    })
    return saved


@router.delete("/cross-constraints/{constraint_id}", status_code=204)
async def delete_cross_constraint(
    constraint_id: str,
    user: dict = Depends(require_admin),
):
    """Delete a cross-type constraint (admin only)."""
    deleted = storage.delete_cross_type_constraint(constraint_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Constraint not found")

    log_audit(AuditAction.CROSS_CONSTRAINT_DELETE, {
        "id": constraint_id, "user": user.get("email", "unknown"),
    })


# ==================== Feasibility Validation ====================

@router.post("/validate", response_model=FeasibilityResponse)
async def validate_feasibility(
    body: ShiftTypeFeasibilityRequest,
    user: dict = Depends(require_admin),
):
    """Validate whether scheduling constraints are feasible."""
    errors = []
    warnings = []
    c = body.constraints
    total_slots = body.num_dates * body.slots

    max_capacity = c.max_shifts_per_month * body.num_employees
    if total_slots > max_capacity:
        errors.append(
            f"Impossible: {total_slots} slots needed but only "
            f"{max_capacity} capacity ({body.num_employees} employees x "
            f"{c.max_shifts_per_month} max/month)"
        )

    if c.max_shifts_per_week * body.num_employees < 7 * body.slots:
        warnings.append(
            "Weekly constraint is tight — scheduling may fail for "
            "weeks with many shift dates"
        )

    if c.require_minimum_one_shift and total_slots < body.num_employees:
        errors.append(
            f"Cannot guarantee 1 shift per employee: only {total_slots} "
            f"slots for {body.num_employees} employees"
        )

    if (c.max_shifts_per_month >= 2
            and c.require_different_weekdays
            and not c.allow_consecutive_days
            and body.num_dates <= 2):
        warnings.append(
            "With few dates, requiring different weekdays AND "
            "no consecutive days is very restrictive"
        )

    return FeasibilityResponse(
        feasible=len(errors) == 0,
        errors=errors,
        warnings=warnings,
    )


# ==================== Shift Type CRUD ====================

@router.get("", response_model=list[ShiftTypeResponse])
async def list_shift_types(user: dict = Depends(get_required_user)):
    """List all shift types (built-in + custom)."""
    types = storage.get_shift_types()
    return [_to_response(k, v) for k, v in types.items()]


@router.get("/{key}", response_model=ShiftTypeResponse)
async def get_shift_type(key: str, user: dict = Depends(get_required_user)):
    """Get a single shift type by key."""
    cfg = storage.get_shift_type(key)
    if not cfg:
        raise HTTPException(status_code=404, detail=f"Shift type '{key}' not found")
    return _to_response(key, cfg)


@router.post("", response_model=ShiftTypeResponse, status_code=201)
async def create_shift_type(
    body: ShiftTypeCreate,
    user: dict = Depends(require_admin),
):
    """Create a new shift type (admin only)."""
    existing = storage.get_shift_type(body.key)
    if existing:
        raise HTTPException(
            status_code=409, detail=f"Shift type '{body.key}' already exists"
        )

    types = storage.get_shift_types()
    if len(types) >= MAX_SHIFT_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Maximum of {MAX_SHIFT_TYPES} shift types allowed",
        )

    config = body.model_dump()
    key = config.pop("key")

    saved = storage.save_shift_type(key, config)
    log_audit(AuditAction.SHIFT_TYPE_CREATE, {
        "key": key, "label": body.label, "user": user.get("email", "unknown"),
    })
    return _to_response(key, saved)


@router.put("/{key}", response_model=ShiftTypeResponse)
async def update_shift_type(
    key: str,
    body: ShiftTypeUpdate,
    user: dict = Depends(require_admin),
):
    """Update a shift type (admin only). Built-in types can have constraints edited."""
    existing = storage.get_shift_type(key)
    if not existing:
        raise HTTPException(status_code=404, detail=f"Shift type '{key}' not found")

    updates = body.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    merged = {**existing, **updates}
    saved = storage.save_shift_type(key, merged)

    changed_fields = list(updates.keys())
    log_audit(AuditAction.SHIFT_TYPE_UPDATE, {
        "key": key, "changed_fields": changed_fields,
        "user": user.get("email", "unknown"),
    })
    return _to_response(key, saved)


@router.delete("/{key}", status_code=204)
async def delete_shift_type(key: str, user: dict = Depends(require_admin)):
    """Delete a custom shift type (admin only). Cannot delete built-in types."""
    try:
        deleted = storage.delete_shift_type(key)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if not deleted:
        raise HTTPException(status_code=404, detail=f"Shift type '{key}' not found")

    log_audit(AuditAction.SHIFT_TYPE_DELETE, {
        "key": key, "user": user.get("email", "unknown"),
    })
