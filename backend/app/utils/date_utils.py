"""Date utility functions for shift scheduling."""

import calendar
from datetime import date, timedelta
from typing import Optional

from ..constants import DEFAULT_SHIFT_TYPE, get_shift_type_config


def get_month_dates(year: int, month: int) -> list[date]:
    """Get all dates in a given month."""
    num_days = calendar.monthrange(year, month)[1]
    return [date(year, month, day) for day in range(1, num_days + 1)]


def get_excluded_dates(
    year: int,
    month: int,
    include_tuesdays: bool = False,
    additional_excluded: Optional[list[str]] = None,
    force_included: Optional[list[str]] = None,
    shift_type: Optional[str] = None,
) -> tuple[list[date], list[date]]:
    """
    Calculate included and excluded dates for a month.

    Rules (when exclude_weekends is True, i.e. ECT):
    - Fridays and Saturdays are excluded
    - Tuesdays are excluded by default (unless include_tuesdays=True)

    For 24/7 shift types (Internal, ER) where exclude_weekends is False:
    - All days of the month are included by default

    Additional dates can be manually excluded.
    Some dates can be force-included (overrides defaults).

    Returns:
        Tuple of (included_dates, excluded_dates)
    """
    all_dates = get_month_dates(year, month)
    additional_excluded = additional_excluded or []
    force_included = force_included or []

    # Look up whether this shift type excludes weekends
    st = shift_type or DEFAULT_SHIFT_TYPE
    cfg = get_shift_type_config(st)
    exclude_weekends = cfg.get("exclude_weekends", True)

    # Convert string dates to date objects
    additional_excluded_dates = {
        date.fromisoformat(d) for d in additional_excluded if d
    }
    force_included_dates = {
        date.fromisoformat(d) for d in force_included if d
    }

    included = []
    excluded = []

    for d in all_dates:
        weekday = d.weekday()  # Monday=0, Sunday=6

        # Force-included dates override all exclusion rules
        if d in force_included_dates:
            included.append(d)
            continue

        # Check if date should be excluded
        is_excluded = False

        if exclude_weekends:
            # Friday (4) and Saturday (5) excluded for ECT-type shifts
            if weekday in (4, 5):
                is_excluded = True
            # Tuesday (1) excluded by default unless include_tuesdays is True
            elif weekday == 1 and not include_tuesdays:
                is_excluded = True

        # Check additional exclusions (applies to all shift types)
        if d in additional_excluded_dates:
            is_excluded = True

        if is_excluded:
            excluded.append(d)
        else:
            included.append(d)

    return sorted(included), sorted(excluded)


def get_included_dates_for_form(
    year: int,
    month: int,
    include_tuesdays: bool = False,
    additional_excluded: Optional[list[str]] = None,
    force_included: Optional[list[str]] = None,
    shift_type: Optional[str] = None,
) -> list[date]:
    """Get list of dates to include in the form."""
    included, _ = get_excluded_dates(
        year, month, include_tuesdays, additional_excluded, force_included,
        shift_type=shift_type,
    )
    return included


def format_date_with_day(d: date) -> str:
    """Format date as 'Month Day, Year (DayName)' e.g., 'February 1, 2026 (Sunday)'."""
    return d.strftime("%B %d, %Y (%A)")


def format_date_short(d: date) -> str:
    """Format date as 'Month Day (DayName)' e.g., 'February 1 (Sunday)'."""
    return d.strftime("%B %-d (%A)") if hasattr(d, 'strftime') else d.strftime("%B %d (%A)").replace(" 0", " ")


def get_iso_week(d: date) -> int:
    """Get ISO week number for a date."""
    return d.isocalendar()[1]


def get_month_name(month: int) -> str:
    """Get month name from month number."""
    return calendar.month_name[month]


def parse_month_year(month_year: str) -> tuple[int, int]:
    """Parse 'YYYY-MM' string to (year, month) tuple."""
    parts = month_year.split("-")
    return int(parts[0]), int(parts[1])


def format_month_year(year: int, month: int) -> str:
    """Format year and month as 'YYYY-MM' string."""
    return f"{year:04d}-{month:02d}"
