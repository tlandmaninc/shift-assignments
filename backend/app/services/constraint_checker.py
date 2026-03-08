"""Shared constraint validation for scheduling and exchange operations."""

from datetime import date
from ..schemas.shift_types import SchedulingConstraints

# Default constraints match existing hardcoded behavior
DEFAULT_CONSTRAINTS = SchedulingConstraints()


def check_employee_constraints(
    name: str,
    shifts: list[date],
    is_new: bool,
    all_schedule_dates: list[date],
    constraints: SchedulingConstraints | None = None,
) -> list[str]:
    """Validate that one employee's shift list satisfies all constraints.

    Returns list of violation descriptions (empty = valid).
    Used by the exchange validator for post-swap checks.
    """
    c = constraints or DEFAULT_CONSTRAINTS
    errors = []

    # Max shifts per month
    if len(shifts) > c.max_shifts_per_month:
        errors.append(
            f"{name} would have {len(shifts)} shifts "
            f"(max {c.max_shifts_per_month})"
        )

    # Max shifts per ISO week
    week_counts: dict[int, int] = {}
    for d in shifts:
        wk = d.isocalendar()[1]
        week_counts[wk] = week_counts.get(wk, 0) + 1
        if week_counts[wk] > c.max_shifts_per_week:
            errors.append(
                f"{name} would have {week_counts[wk]} shifts in "
                f"ISO week {wk} (max {c.max_shifts_per_week})"
            )

    # Consecutive days
    if not c.allow_consecutive_days:
        sorted_shifts = sorted(shifts)
        for i in range(len(sorted_shifts) - 1):
            if (sorted_shifts[i + 1] - sorted_shifts[i]).days == 1:
                errors.append(
                    f"{name} would have consecutive shifts on "
                    f"{sorted_shifts[i]} and {sorted_shifts[i + 1]}"
                )

    # Different weekdays
    if c.require_different_weekdays and len(shifts) >= 2:
        weekdays = [d.weekday() for d in shifts]
        seen: set[int] = set()
        for wd in weekdays:
            if wd in seen:
                day_name = shifts[weekdays.index(wd)].strftime("%A")
                errors.append(
                    f"{name} would have multiple shifts on the same weekday "
                    f"({day_name})"
                )
                break
            seen.add(wd)

    # New employee restriction
    if is_new and c.new_employee_restricted_weeks > 0 and all_schedule_dates:
        all_weeks = sorted({d.isocalendar()[1] for d in all_schedule_dates})
        n = c.new_employee_restricted_weeks
        allowed = set(all_weeks[-n:]) if len(all_weeks) > n else set(all_weeks)
        for d in shifts:
            if d.isocalendar()[1] not in allowed:
                errors.append(
                    f"{name} is a new employee and cannot be assigned in "
                    f"week {d.isocalendar()[1]}"
                )

    return errors


def validate_feasibility(
    constraints: SchedulingConstraints,
    num_dates: int,
    num_employees: int,
    slots: int = 1,
) -> dict:
    """Quick feasibility pre-check. Returns {feasible, errors, warnings}."""
    errors = []
    warnings = []
    total_slots = num_dates * slots

    max_capacity = constraints.max_shifts_per_month * num_employees
    if total_slots > max_capacity:
        errors.append(
            f"Impossible: {total_slots} slots needed but only "
            f"{max_capacity} capacity ({num_employees} employees x "
            f"{constraints.max_shifts_per_month} max/month)"
        )

    if constraints.max_shifts_per_week * num_employees < 7 * slots:
        warnings.append(
            "Weekly constraint is tight — scheduling may fail for "
            "weeks with many shift dates"
        )

    if constraints.require_minimum_one_shift and total_slots < num_employees:
        errors.append(
            f"Cannot guarantee 1 shift per employee: only {total_slots} "
            f"slots for {num_employees} employees"
        )

    return {"feasible": len(errors) == 0, "errors": errors, "warnings": warnings}
