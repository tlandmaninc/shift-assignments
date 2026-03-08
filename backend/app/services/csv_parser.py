"""CSV parsing service for availability data from Google Forms responses."""

import csv
import html
import io
import re
from datetime import date
from typing import Optional

# Security limits to prevent DoS attacks
MAX_CSV_SIZE = 1_000_000  # 1MB max
MAX_ROWS = 1000
MAX_COLUMNS = 100
MAX_NAME_LENGTH = 100


def sanitize_name(name: str) -> str:
    """Sanitize an employee name: escape HTML, strip control chars, limit length."""
    name = re.sub(r'[\x00-\x1f\x7f]', '', name)
    name = html.escape(name)
    return name[:MAX_NAME_LENGTH]


def parse_date_from_header(header: str, included_dates: Optional[list[str]] = None) -> Optional[str]:
    """
    Extract date from a header like 'Availability on February 1 (Sunday)' or
    'Availability on February 1, 2026 (Sunday)'.

    Returns ISO format date string (YYYY-MM-DD) or None if not parseable.

    Args:
        header: The column header string
        included_dates: Optional list of ISO dates to match against when year is missing
    """
    # Convert month name to number
    months = {
        "january": 1, "february": 2, "march": 3, "april": 4,
        "may": 5, "june": 6, "july": 7, "august": 8,
        "september": 9, "october": 10, "november": 11, "december": 12
    }

    # Pattern 1: "Availability on Month Day, Year (DayName)" - with year
    pattern_with_year = r"Availability on\s+(\w+)\s+(\d+),?\s+(\d{4})"
    match = re.search(pattern_with_year, header, re.IGNORECASE)

    if match:
        month_name, day, year = match.groups()
        month_num = months.get(month_name.lower())
        if not month_num:
            return None
        try:
            d = date(int(year), month_num, int(day))
            return d.isoformat()
        except ValueError:
            return None

    # Pattern 2: "Availability on Month Day (DayName)" - without year
    pattern_without_year = r"Availability on\s+(\w+)\s+(\d+)\s*\("
    match = re.search(pattern_without_year, header, re.IGNORECASE)

    if match:
        month_name, day = match.groups()
        month_num = months.get(month_name.lower())
        if not month_num:
            return None

        day_int = int(day)

        # Try to match against included_dates if provided
        if included_dates:
            for date_iso in included_dates:
                try:
                    d = date.fromisoformat(date_iso)
                    if d.month == month_num and d.day == day_int:
                        return date_iso
                except ValueError:
                    continue

        # Fallback: use current year
        try:
            d = date(date.today().year, month_num, day_int)
            return d.isoformat()
        except ValueError:
            return None

    return None


def parse_csv_responses(
    csv_data: str,
    included_dates: list[str],
) -> list[dict]:
    """
    Parse CSV data from Google Forms responses.

    Expected CSV format (comma or tab-separated):
    - Column 0: Timestamp
    - Column 1: Employee Name
    - Column 2: Is this your first month doing [shift type]? (Yes/No)
    - Columns 3+: Availability on [Date] ([Day]) - Available/Not Available

    Args:
        csv_data: Raw CSV text (supports both comma and tab-separated)
        included_dates: List of dates (ISO format) that should be in the form

    Returns:
        List of employee dicts ready for scheduler:
        [
            {
                "name": "John Doe",
                "is_new": True,
                "availability": {"2026-02-01": True, "2026-02-02": False, ...}
            },
            ...
        ]

    Raises:
        ValueError: If CSV data exceeds size limits
    """
    employees = []

    # Security: Check size limits to prevent DoS
    if len(csv_data) > MAX_CSV_SIZE:
        raise ValueError(f"CSV data exceeds maximum size of {MAX_CSV_SIZE:,} bytes")

    # Detect delimiter: Google Sheets copy/paste uses tabs, CSV files use commas
    # Check the first line to determine the delimiter
    first_line = csv_data.split('\n')[0] if csv_data else ''
    delimiter = '\t' if '\t' in first_line else ','

    # Parse CSV/TSV
    reader = csv.reader(io.StringIO(csv_data), delimiter=delimiter)
    rows = list(reader)

    # Security: Check row limit
    if len(rows) > MAX_ROWS:
        raise ValueError(f"CSV exceeds maximum of {MAX_ROWS} rows")

    if len(rows) < 2:
        return employees  # No data rows

    headers = rows[0]
    data_rows = rows[1:]

    # Security: Check column limit
    if len(headers) > MAX_COLUMNS:
        raise ValueError(f"CSV exceeds maximum of {MAX_COLUMNS} columns")

    # Map header columns to dates
    date_columns = {}  # column_index -> date_iso
    for idx, header in enumerate(headers):
        if idx < 3:  # Skip Timestamp, Name, Is New columns
            continue
        date_iso = parse_date_from_header(header, included_dates)
        if date_iso:
            date_columns[idx] = date_iso

    # Parse each response
    for row in data_rows:
        if len(row) < 3:
            continue

        # Pad row if needed
        while len(row) < len(headers):
            row.append("")

        name = sanitize_name(row[1].strip())
        if not name:
            continue

        # Parse is_new
        is_new_raw = row[2].strip().lower() if len(row) > 2 else "yes"
        is_new = is_new_raw == "yes"

        # Parse availability
        availability = {}
        for col_idx, date_iso in date_columns.items():
            if col_idx < len(row):
                value = row[col_idx].strip().lower()
                availability[date_iso] = value == "available"
            else:
                availability[date_iso] = False

        # Also ensure all included_dates are in availability
        for date_iso in included_dates:
            if date_iso not in availability:
                availability[date_iso] = False

        employees.append({
            "name": name,
            "is_new": is_new,
            "availability": availability,
        })

    return employees


def parse_manual_availability(
    data: list[dict],
    included_dates: list[str],
) -> list[dict]:
    """
    Parse manually entered availability data.

    Args:
        data: List of dicts with format:
            [
                {
                    "employee_name": "John Doe",
                    "is_first_month": True,
                    "availability": {"2026-02-01": True, ...}
                },
                ...
            ]
        included_dates: List of dates that should be covered

    Returns:
        List of employee dicts ready for scheduler
    """
    employees = []

    for entry in data:
        name = entry.get("employee_name", "").strip()
        if not name:
            continue

        is_new = entry.get("is_first_month", True)
        avail = entry.get("availability", {})

        # Ensure all dates are covered
        availability = {}
        for date_iso in included_dates:
            availability[date_iso] = avail.get(date_iso, False)

        employees.append({
            "name": name,
            "is_new": is_new,
            "availability": availability,
        })

    return employees


def validate_availability_data(
    employees: list[dict],
    dates: list[date],
    max_shifts_per_month: int = 2,
) -> dict:
    """
    Validate availability data before running scheduler.

    Returns dict with:
        - valid: bool
        - errors: list of error messages
        - warnings: list of warning messages
    """
    errors = []
    warnings = []

    if not employees:
        errors.append("No employees provided")
        return {"valid": False, "errors": errors, "warnings": warnings}

    if not dates:
        errors.append("No dates provided")
        return {"valid": False, "errors": errors, "warnings": warnings}

    # Check each date has at least one available employee
    for d in dates:
        iso = d.isoformat()
        available_count = sum(
            1 for emp in employees
            if emp.get("availability", {}).get(iso, False)
        )
        if available_count == 0:
            errors.append(f"No employee available for {iso}")

    # Check capacity
    employees_with_avail = [
        emp for emp in employees
        if any(emp.get("availability", {}).values())
    ]
    max_capacity = max_shifts_per_month * len(employees_with_avail)
    if len(dates) > max_capacity:
        errors.append(
            f"Not enough capacity: {len(dates)} shifts needed, "
            f"but only {max_capacity} possible "
            f"({max_shifts_per_month} per employee)"
        )

    # Warnings
    for emp in employees:
        avail_count = sum(1 for v in emp.get("availability", {}).values() if v)
        if avail_count == 0:
            warnings.append(f"Employee '{emp['name']}' has no available dates")
        elif avail_count < 2:
            warnings.append(
                f"Employee '{emp['name']}' only available on {avail_count} date(s)"
            )

    return {
        "valid": len(errors) == 0,
        "errors": errors,
        "warnings": warnings,
    }
