"""Chat tool registry for AI-driven shift type management.

Provides a provider-agnostic tool-calling system. The AI emits structured
JSON blocks (```tool_call {...}```) which the backend parses, executes,
and feeds results back before streaming the final response.
"""

import json
import logging
import re
from typing import Any, Optional

from ..audit import log_audit, AuditAction
from ..schemas.shift_types import (
    SchedulingConstraints,
    ShiftTypeCreate,
    CrossTypeConstraint,
)
from ..storage import storage

logger = logging.getLogger(__name__)

MAX_TOOL_ITERATIONS = 3

# Tool definitions exposed to the AI via system prompt
CHAT_TOOLS = {
    "list_shift_types": {
        "description": "List all configured shift types with their settings",
        "parameters": {},
        "requires_admin": False,
    },
    "get_shift_type": {
        "description": "Get detailed config for a specific shift type",
        "parameters": {"key": "string - shift type key (e.g. 'ect', 'night_rounds')"},
        "requires_admin": False,
    },
    "validate_shift_type": {
        "description": (
            "Validate a proposed shift type configuration before creating it. "
            "Returns validation errors/warnings."
        ),
        "parameters": {
            "key": "string (lowercase, no spaces, e.g. 'night_rounds')",
            "label": "string (display name, e.g. 'Night Rounds')",
            "color": "string (hex color, e.g. '#8B5CF6')",
            "start_time": "string (iCal format, e.g. 'T220000' for 22:00)",
            "end_time": "string (iCal format, e.g. 'T060000' for 06:00)",
            "next_day_end": "boolean (true if shift crosses midnight)",
            "slots": "integer (doctors per shift date, 1-5)",
            "exclude_weekends": "boolean (true to exclude Fri/Sat)",
            "calendar_title": "string (Google Calendar event title)",
            "calendar_desc": "string (optional description)",
            "max_shifts_per_month": "integer (default 2)",
            "max_shifts_per_week": "integer (default 1)",
            "allow_consecutive_days": "boolean (default false)",
            "require_different_weekdays": "boolean (default true)",
        },
        "requires_admin": True,
    },
    "create_shift_type": {
        "description": (
            "Create and persist a new shift type. Call validate_shift_type first. "
            "Only call this after the user confirms."
        ),
        "parameters": {
            "key": "string", "label": "string", "color": "string",
            "start_time": "string", "end_time": "string",
            "next_day_end": "boolean", "slots": "integer",
            "exclude_weekends": "boolean",
            "calendar_title": "string", "calendar_desc": "string",
            "max_shifts_per_month": "integer",
            "max_shifts_per_week": "integer",
            "allow_consecutive_days": "boolean",
            "require_different_weekdays": "boolean",
        },
        "requires_admin": True,
    },
    "update_shift_type": {
        "description": (
            "Update constraints or settings for an existing shift type "
            "(including built-in types like ECT, Internal, ER)."
        ),
        "parameters": {
            "key": "string (existing shift type key)",
            "updates": "object (fields to update, e.g. {max_shifts_per_month: 3})",
        },
        "requires_admin": True,
    },
    "set_cross_type_constraint": {
        "description": (
            "Add or remove a no-same-day constraint between two shift types. "
            "Prevents an employee from having both types on the same day."
        ),
        "parameters": {
            "action": "string ('add' or 'remove')",
            "type_a": "string (shift type key)",
            "type_b": "string (shift type key)",
        },
        "requires_admin": True,
    },
}


def build_tools_prompt() -> str:
    """Build the tools section for the AI system prompt."""
    lines = [
        "## Available Tools",
        "",
        "You can manage shift types by emitting a tool call in this exact format:",
        "",
        "```tool_call",
        '{"tool": "tool_name", "params": {...}}',
        "```",
        "",
        "Tool calls are INTERNAL — the user never sees them. Always write a",
        "human-friendly message BEFORE and AFTER the tool call block.",
        "",
        "Available tools:",
    ]
    for name, info in CHAT_TOOLS.items():
        admin = " (admin only)" if info["requires_admin"] else ""
        lines.append(f"- **{name}**{admin}: {info['description']}")
    lines.extend([
        "",
        "## Conversion Rules (apply these yourself — NEVER ask users for them)",
        "",
        "**Color name → hex:** red=#EF4444, orange=#F97316, amber=#F59E0B, "
        "yellow=#EAB308, lime=#84CC16, green=#22C55E, emerald=#10B981, "
        "teal=#14B8A6, cyan=#06B6D4, sky=#0EA5E9, blue=#3B82F6, "
        "indigo=#6366F1, violet=#7C3AED, purple=#8B5CF6, fuchsia=#D946EF, "
        "pink=#EC4899, rose=#F43F5E",
        "",
        "**Time → iCal:** \"10pm\"→T220000, \"6am\"→T060000, \"2:30pm\"→T143000, "
        "\"midnight\"→T000000, \"noon\"→T120000. If end < start, set next_day_end=true.",
        "",
        "**Name → key/label:** \"night rounds\" → key: \"night_rounds\", "
        "label: \"Night Rounds\". Key is lowercase with underscores; label is Title Case.",
        "",
        "**calendar_title:** Default to \"{label} Shift\" if not specified.",
        "",
        "## Confirmation Template",
        "",
        "After validating, show the user a plain-language summary like:",
        "  Name: Night Rounds",
        "  Hours: 10:00 PM – 6:00 AM (overnight)",
        "  Color: Purple",
        "  Doctors per shift: 4",
        "  Days: Weekdays only",
        "  Max per month: 3",
        "",
        "Then ask: \"Shall I create this shift type?\"",
        "",
        "## IMPORTANT Rules",
        "- Only use tools when the user explicitly asks to create, modify, "
        "or inspect shift types.",
        "- Always validate before creating. Always confirm with the user "
        "before creating.",
        "- For general questions about shifts, answer from the data context.",
        "- NEVER ask users for hex color codes, iCal time formats, or "
        "internal field names. Convert them yourself using the rules above.",
        "- If validation fails, fix the issue silently or ask in plain "
        "language (e.g. \"What color would you like?\" not \"provide a hex code\").",
    ])
    return "\n".join(lines)


def parse_tool_calls(text: str) -> list[dict]:
    """Parse tool_call blocks from AI response text.

    Looks for ```tool_call ... ``` blocks containing JSON.
    Returns list of {tool, params} dicts.
    """
    pattern = r"```tool_call\s*\n?\s*(\{.*?\})\s*\n?\s*```"
    matches = re.findall(pattern, text, re.DOTALL)
    results = []
    for match in matches:
        try:
            data = json.loads(match)
            if "tool" in data:
                results.append({
                    "tool": data["tool"],
                    "params": data.get("params", {}),
                })
        except json.JSONDecodeError:
            logger.warning("Failed to parse tool call JSON: %s", match[:200])
    return results


def _extract_constraints(params: dict) -> dict:
    """Extract SchedulingConstraints fields from flat params dict."""
    constraint_fields = {
        "max_shifts_per_month", "max_shifts_per_week",
        "allow_consecutive_days", "require_different_weekdays",
        "new_employee_restricted_weeks", "require_minimum_one_shift",
    }
    return {k: v for k, v in params.items() if k in constraint_fields}


def execute_tool(
    tool_name: str,
    params: dict,
    user: Optional[dict] = None,
) -> dict:
    """Execute a chat tool and return the result.

    Returns {success, result, error}.
    """
    tool_def = CHAT_TOOLS.get(tool_name)
    if not tool_def:
        return {"success": False, "error": f"Unknown tool: {tool_name}"}

    # Auth check
    if tool_def.get("requires_admin"):
        if not user or user.get("role") != "admin":
            return {
                "success": False,
                "error": "Only administrators can use this tool.",
            }

    try:
        result = _dispatch_tool(tool_name, params, user)
        log_audit(AuditAction.CHAT_TOOL_EXECUTED, {
            "tool": tool_name, "success": True,
            "user": (user or {}).get("email", "unknown"),
        })
        return {"success": True, "result": result}
    except Exception as e:
        logger.error("Tool execution failed: %s - %s", tool_name, e)
        log_audit(AuditAction.CHAT_TOOL_EXECUTED, {
            "tool": tool_name, "success": False, "error": str(e),
            "user": (user or {}).get("email", "unknown"),
        })
        return {"success": False, "error": str(e)}


def _dispatch_tool(tool_name: str, params: dict, user: Optional[dict]) -> Any:
    """Route tool call to implementation."""
    if tool_name == "list_shift_types":
        return _tool_list_shift_types()
    elif tool_name == "get_shift_type":
        return _tool_get_shift_type(params)
    elif tool_name == "validate_shift_type":
        return _tool_validate_shift_type(params)
    elif tool_name == "create_shift_type":
        return _tool_create_shift_type(params, user)
    elif tool_name == "update_shift_type":
        return _tool_update_shift_type(params, user)
    elif tool_name == "set_cross_type_constraint":
        return _tool_cross_type_constraint(params, user)
    else:
        raise ValueError(f"Unknown tool: {tool_name}")


def _tool_list_shift_types() -> dict:
    types = storage.get_shift_types()
    summary = {}
    for key, cfg in types.items():
        summary[key] = {
            "label": cfg.get("label", key),
            "color": cfg.get("color"),
            "slots": cfg.get("slots", 1),
            "exclude_weekends": cfg.get("exclude_weekends", True),
            "is_builtin": cfg.get("is_builtin", False),
        }
    return {"shift_types": summary, "count": len(summary)}


def _tool_get_shift_type(params: dict) -> dict:
    key = params.get("key", "")
    cfg = storage.get_shift_type(key)
    if not cfg:
        raise ValueError(f"Shift type '{key}' not found")
    return {"key": key, **cfg}


def _tool_validate_shift_type(params: dict) -> dict:
    key = params.get("key", "")
    errors = []
    warnings = []

    # Check key uniqueness
    existing = storage.get_shift_type(key)
    if existing:
        errors.append(f"Key '{key}' already exists")

    # Check max types
    all_types = storage.get_shift_types()
    if len(all_types) >= 20:
        errors.append("Maximum of 20 shift types reached")

    # Validate via Pydantic
    try:
        constraint_data = _extract_constraints(params)
        constraints = SchedulingConstraints(**constraint_data) if constraint_data else SchedulingConstraints()
        create_params = {
            k: v for k, v in params.items()
            if k not in _extract_constraints(params)
        }
        create_params["constraints"] = constraints.model_dump()
        if "calendar_title" not in create_params:
            create_params["calendar_title"] = f"{params.get('label', key)} Shift"
        ShiftTypeCreate(**create_params)
    except Exception as e:
        errors.append(f"Validation error: {e}")

    return {"valid": len(errors) == 0, "errors": errors, "warnings": warnings}


def _tool_create_shift_type(params: dict, user: Optional[dict]) -> dict:
    key = params.get("key", "")

    # Build the config
    constraint_data = _extract_constraints(params)
    constraints = SchedulingConstraints(**constraint_data) if constraint_data else SchedulingConstraints()

    config = {
        k: v for k, v in params.items()
        if k not in _extract_constraints(params) and k != "key"
    }
    config["constraints"] = constraints.model_dump()
    if "calendar_title" not in config:
        config["calendar_title"] = f"{params.get('label', key)} Shift"
    if "calendar_desc" not in config:
        config["calendar_desc"] = ""

    # Validate
    ShiftTypeCreate(key=key, **config)

    # Check uniqueness
    if storage.get_shift_type(key):
        raise ValueError(f"Shift type '{key}' already exists")

    saved = storage.save_shift_type(key, config)
    log_audit(AuditAction.SHIFT_TYPE_CREATE, {
        "key": key, "label": params.get("label", key),
        "user": (user or {}).get("email", "unknown"),
        "source": "chat",
    })
    return {"created": True, "key": key, "label": saved.get("label", key)}


def _tool_update_shift_type(params: dict, user: Optional[dict]) -> dict:
    key = params.get("key", "")
    updates = params.get("updates", {})
    if not updates:
        raise ValueError("No updates provided")

    existing = storage.get_shift_type(key)
    if not existing:
        raise ValueError(f"Shift type '{key}' not found")

    # Handle constraint updates
    constraint_updates = _extract_constraints(updates)
    if constraint_updates:
        current_constraints = existing.get("constraints", {})
        current_constraints.update(constraint_updates)
        updates["constraints"] = current_constraints
        for field in constraint_updates:
            updates.pop(field, None)

    merged = {**existing, **updates}
    saved = storage.save_shift_type(key, merged)

    log_audit(AuditAction.SHIFT_TYPE_UPDATE, {
        "key": key, "changed_fields": list(updates.keys()),
        "user": (user or {}).get("email", "unknown"),
        "source": "chat",
    })
    return {"updated": True, "key": key}


def _tool_cross_type_constraint(params: dict, user: Optional[dict]) -> dict:
    action = params.get("action", "add")
    type_a = params.get("type_a", "")
    type_b = params.get("type_b", "")

    if action == "add":
        for tk in (type_a, type_b):
            if not storage.get_shift_type(tk):
                raise ValueError(f"Shift type '{tk}' not found")

        constraint = CrossTypeConstraint(type_a=type_a, type_b=type_b)
        saved = storage.save_cross_type_constraint(
            constraint.model_dump(exclude={"id"})
        )
        return {"added": True, "id": saved.get("id")}

    elif action == "remove":
        constraints = storage.get_cross_type_constraints()
        for c in constraints:
            if {c.get("type_a"), c.get("type_b")} == {type_a, type_b}:
                storage.delete_cross_type_constraint(c["id"])
                return {"removed": True}
        raise ValueError(f"No constraint found between '{type_a}' and '{type_b}'")

    else:
        raise ValueError(f"Unknown action: {action}. Use 'add' or 'remove'.")
