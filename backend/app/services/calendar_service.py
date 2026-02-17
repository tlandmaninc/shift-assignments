"""Google Calendar URL generation for shift events."""

from datetime import datetime
from urllib.parse import urlencode

# ECT shift times (Israel time)
SHIFT_START = "T073000"
SHIFT_END = "T100000"
TIMEZONE = "Asia/Jerusalem"


def build_shift_calendar_url(shift_date: str, employee_name: str) -> str:
    """
    Build a Google Calendar event creation URL for an ECT shift.

    Args:
        shift_date: Date string in YYYY-MM-DD format.
        employee_name: Name of the assigned employee.

    Returns:
        Google Calendar URL string.
    """
    dt = datetime.strptime(shift_date, "%Y-%m-%d")
    day_name = dt.strftime("%A")
    month_name = dt.strftime("%B")
    day_num = dt.day
    date_compact = shift_date.replace("-", "")

    params = {
        "action": "TEMPLATE",
        "text": f"ECT Shift - {day_name}, {month_name} {day_num}",
        "details": f"ECT shift assignment for {employee_name}.\nPsychiatrics Department",
        "dates": f"{date_compact}{SHIFT_START}/{date_compact}{SHIFT_END}",
        "ctz": TIMEZONE,
    }

    return "https://calendar.google.com/calendar/render?" + urlencode(params)
