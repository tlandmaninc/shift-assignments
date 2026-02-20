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
