"""Shared shift type constants."""

SHIFT_TYPE_CONFIG = {
    "ect": {
        "label": "ECT",
        "color": "#3B82F6",
        "start_time": "T073000",
        "end_time": "T100000",
        "next_day_end": False,
        "slots": 1,
        "exclude_weekends": True,
        "calendar_title": "ECT Shift",
        "calendar_desc": "Psychiatry Department",
    },
    "internal": {
        "label": "Internal",
        "color": "#10B981",
        "start_time": "T080000",
        "end_time": "T100000",
        "next_day_end": True,
        "slots": 1,
        "exclude_weekends": False,
        "calendar_title": "Internal Medicine Shift",
        "calendar_desc": "Psychiatry Department",
    },
    "er": {
        "label": "ER",
        "color": "#EF4444",
        "start_time": "T080000",
        "end_time": "T230000",
        "next_day_end": False,
        "slots": 2,
        "exclude_weekends": False,
        "slot_details": [
            {"label": "Day", "start": "T080000", "end": "T230000", "next_day": False},
            {"label": "Overnight", "start": "T080000", "end": "T100000", "next_day": True},
        ],
        "calendar_title": "ER Shift",
        "calendar_desc": "Emergency Department",
    },
}

DEFAULT_SHIFT_TYPE = "ect"

BUILTIN_SHIFT_TYPE_KEYS = frozenset(SHIFT_TYPE_CONFIG.keys())


def get_all_shift_types() -> dict:
    """Return all shift types from storage (built-in + custom).

    Falls back to SHIFT_TYPE_CONFIG if storage is unavailable.
    """
    try:
        from .storage import storage
        types = storage.get_shift_types()
        if types:
            return types
    except Exception:
        pass
    return dict(SHIFT_TYPE_CONFIG)


def get_shift_type_config(key: str) -> dict:
    """Look up a single shift type config by key.

    Reads from dynamic storage first, falls back to hardcoded defaults.
    """
    all_types = get_all_shift_types()
    return all_types.get(key, all_types.get(DEFAULT_SHIFT_TYPE, {}))

# Page access control defaults.
# Values: "admin" = admin only, "all" = any authenticated user.
DEFAULT_PAGE_ACCESS = {
    "forms": "admin",
    "assignments": "admin",
    "employees": "admin",
    "history": "all",
    "shift-exchange": "all",
    "chat": "all",
}

CONFIGURABLE_PAGES = set(DEFAULT_PAGE_ACCESS.keys())
