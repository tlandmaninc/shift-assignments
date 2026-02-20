"""Google Calendar URL generation for shift events."""

from datetime import datetime, timedelta
from urllib.parse import urlencode

from ..constants import SHIFT_TYPE_CONFIG, DEFAULT_SHIFT_TYPE

TIMEZONE = "Asia/Jerusalem"


def _build_calendar_url(
    shift_date: str,
    employee_name: str,
    title: str,
    description: str,
    start_time: str,
    end_time: str,
    next_day_end: bool,
) -> str:
    """Build a single Google Calendar event URL."""
    dt = datetime.strptime(shift_date, "%Y-%m-%d")
    date_compact = shift_date.replace("-", "")

    if next_day_end:
        end_dt = dt + timedelta(days=1)
        end_date_compact = end_dt.strftime("%Y%m%d")
    else:
        end_date_compact = date_compact

    params = {
        "action": "TEMPLATE",
        "text": title,
        "details": description,
        "dates": f"{date_compact}{start_time}/{end_date_compact}{end_time}",
        "ctz": TIMEZONE,
    }

    return "https://calendar.google.com/calendar/render?" + urlencode(params)


def build_shift_calendar_url(
    shift_date: str,
    employee_name: str,
    shift_type: str = DEFAULT_SHIFT_TYPE,
) -> str | list[str]:
    """
    Build Google Calendar event creation URL(s) for a shift.

    Args:
        shift_date: Date string in YYYY-MM-DD format.
        employee_name: Name of the assigned employee.
        shift_type: Shift type key (e.g. 'ect', 'internal', 'er').

    Returns:
        Single URL string, or list of URLs if the shift has multiple slots.
    """
    cfg = SHIFT_TYPE_CONFIG.get(shift_type, SHIFT_TYPE_CONFIG[DEFAULT_SHIFT_TYPE])

    dt = datetime.strptime(shift_date, "%Y-%m-%d")
    day_name = dt.strftime("%A")
    month_name = dt.strftime("%B")
    day_num = dt.day

    slot_details = cfg.get("slot_details")
    if slot_details:
        # Generate one calendar URL per slot (e.g. ER Day + ER Overnight)
        urls = []
        for slot in slot_details:
            title = f"{cfg['calendar_title']} ({slot['label']}) - {day_name}, {month_name} {day_num}"
            description = (
                f"{cfg['calendar_title']} ({slot['label']}) assignment for {employee_name}.\n"
                f"{cfg['calendar_desc']}"
            )
            urls.append(_build_calendar_url(
                shift_date, employee_name, title, description,
                slot["start"], slot["end"], slot["next_day"],
            ))
        return urls

    title = f"{cfg['calendar_title']} - {day_name}, {month_name} {day_num}"
    description = (
        f"{cfg['calendar_title']} assignment for {employee_name}.\n"
        f"{cfg['calendar_desc']}"
    )
    next_day_end = cfg.get("next_day_end", False)

    return _build_calendar_url(
        shift_date, employee_name, title, description,
        cfg["start_time"], cfg["end_time"], next_day_end,
    )
