"""Shift assignment scheduler using backtracking algorithm."""

from datetime import date, timedelta
from typing import Optional
from ..storage import storage
from ..constants import DEFAULT_SHIFT_TYPE, SHIFT_TYPE_CONFIG


def backtracking_assign(
    employees: list[dict],
    dates: list[date],
    historical_shifts: Optional[dict[str, int]] = None,
) -> tuple[dict[str, str], dict[str, int]]:
    """
    Assign shifts using backtracking with constraints.

    Hard constraints:
      - Max 2 shifts per employee per month.
      - Max 1 shift per ISO week per employee.
      - New employees only in the last two ISO weeks present in `dates`.
      - Never assign on a date the employee marked Not Available.
      - Every shift date must be assigned (if feasible).
      - No consecutive shifts for same employee (calendar adjacency: +/- 1 day).
      - If an employee has 2 shifts, they must be on different weekdays.

    Soft constraints (for candidate ordering):
      - Prefer employees with fewer historical shifts (fairness).
      - Prefer employees with fewer remaining availability options (MRV).

    Args:
        employees: List of employee dicts with 'name', 'is_new', 'availability'
        dates: List of dates to assign
        historical_shifts: Optional dict of employee name -> total past shifts

    Returns:
        Tuple of (assignments dict, month_count dict)
        - assignments: {date_iso: employee_name}
        - month_count: {employee_name: shifts_this_month}
    """
    historical_shifts = historical_shifts or {}

    name_to_emp = {e["name"]: e for e in employees}
    emp_names = [e["name"] for e in employees]

    # Availability domain per date
    avail = {}
    for d in dates:
        iso = d.isoformat()
        avail[d] = [e["name"] for e in employees if e["availability"].get(iso, False)]

    # Any date with no available employee makes the problem infeasible
    for d in dates:
        if not avail[d]:
            raise ValueError(f"No available employee for {d}")

    # Capacity check
    emps_with_avail = {e["name"] for e in employees if any(e["availability"].values())}
    if len(dates) > 2 * len(emps_with_avail):
        raise ValueError("Impossible schedule: more shifts than capacity (2 per employee).")

    # New employees can only be scheduled in the last 2 ISO weeks
    weeks = sorted({d.isocalendar()[1] for d in dates})
    allowed_new_weeks = set(weeks[-2:]) if len(weeks) > 2 else set(weeks)

    # MRV ordering: schedule hardest days first
    dates_sorted = sorted(dates, key=lambda d: len(avail[d]))

    month_count = {name: 0 for name in emp_names}
    week_count = {name: {} for name in emp_names}
    assignment = {}

    # Tracking for extra constraints
    assigned_dates_set = {name: set() for name in emp_names}
    assigned_weekdays_set = {name: set() for name in emp_names}

    def violates_consecutive_shift(name: str, d: date) -> bool:
        """No shifts on consecutive calendar days for same employee."""
        prev_day = d - timedelta(days=1)
        next_day = d + timedelta(days=1)
        s = assigned_dates_set[name]
        return (prev_day in s) or (next_day in s)

    def violates_same_weekday_for_second_shift(name: str, d: date) -> bool:
        """If employee already has 1 shift, the 2nd shift must be on a different weekday."""
        if month_count[name] < 1:
            return False
        return d.weekday() in assigned_weekdays_set[name]

    def dfs(idx: int) -> bool:
        if idx == len(dates_sorted):
            # Fairness check: everyone with availability must have at least 1 shift
            for e in employees:
                name = e["name"]
                if any(e["availability"].values()) and month_count[name] == 0:
                    return False
            return True

        d = dates_sorted[idx]
        iso = d.isoformat()
        wn = d.isocalendar()[1]
        wd = d.weekday()

        # Build candidate list under ALL constraints
        cands = []
        for name in avail[d]:
            emp = name_to_emp[name]

            # New employee restriction
            if emp["is_new"] and wn not in allowed_new_weeks:
                continue

            # Max 2 shifts per month
            if month_count[name] >= 2:
                continue

            # Max 1 per ISO week
            if week_count[name].get(wn, 0) >= 1:
                continue

            # No consecutive calendar days
            if violates_consecutive_shift(name, d):
                continue

            # If 2nd shift, weekday must differ from 1st
            if violates_same_weekday_for_second_shift(name, d):
                continue

            cands.append(name)

        if not cands:
            return False

        # LCV-ish ordering: prefer fewer shifts, fewer remaining options, fewer historical
        def key(name: str):
            e = name_to_emp[name]
            remaining = sum(
                1
                for j in range(idx, len(dates_sorted))
                if e["availability"].get(dates_sorted[j].isoformat(), False)
            )
            hist = historical_shifts.get(name, 0)
            return (month_count[name], hist, remaining, name)

        cands.sort(key=key)

        for name in cands:
            # Assign
            assignment[iso] = name
            month_count[name] += 1
            week_count[name][wn] = week_count[name].get(wn, 0) + 1
            assigned_dates_set[name].add(d)
            assigned_weekdays_set[name].add(wd)

            if dfs(idx + 1):
                return True

            # Backtrack
            month_count[name] -= 1
            week_count[name][wn] -= 1
            if week_count[name][wn] == 0:
                del week_count[name][wn]

            assigned_dates_set[name].remove(d)

            still_has_weekday = any(dt.weekday() == wd for dt in assigned_dates_set[name])
            if not still_has_weekday:
                assigned_weekdays_set[name].discard(wd)

            del assignment[iso]

        return False

    ok = dfs(0)
    if not ok:
        raise ValueError("No valid schedule exists under strict rules.")

    return assignment, month_count


class SchedulerService:
    """Service for managing shift assignments using JSON storage."""

    def __init__(self):
        self.storage = storage

    def get_historical_shifts(self) -> dict[str, int]:
        """Get total historical shifts per employee."""
        return self.storage.get_employee_shift_counts()

    def generate_assignments(
        self,
        employees: list[dict],
        dates: list[date],
        month_year: str,
        shift_type: str = DEFAULT_SHIFT_TYPE,
    ) -> tuple[dict, dict[str, int]]:
        """
        Generate assignments and store in JSON.

        Args:
            employees: List of employee dicts with 'name', 'is_new', 'availability'
            dates: List of dates to assign
            month_year: Month-year string (YYYY-MM)
            shift_type: Shift type key (e.g. "ect", "internal", "er")

        Returns:
            Tuple of (assignments in multi-type format, shift_counts)
        """
        # Get historical data for fairness
        historical = self.get_historical_shifts()

        slots = SHIFT_TYPE_CONFIG.get(shift_type, {}).get("slots", 1)

        if slots > 1:
            # For multi-slot shifts (e.g. ER with 2 slots), run the scheduler
            # multiple times to assign multiple employees per date.
            all_raw: list[dict[str, str]] = []
            cumulative_month_count: dict[str, int] = {}

            for slot_idx in range(slots):
                # Build adjusted historical counts so fairness accounts for
                # employees already assigned in prior slots.
                adjusted_hist = dict(historical)
                for name, extra in cumulative_month_count.items():
                    adjusted_hist[name] = adjusted_hist.get(name, 0) + extra

                # Filter out employees already assigned to this date in a
                # prior slot by temporarily removing their availability for
                # those dates.
                adjusted_employees = []
                for emp in employees:
                    adj_avail = dict(emp["availability"])
                    for prev_raw in all_raw:
                        for d_iso, assigned_name in prev_raw.items():
                            if assigned_name == emp["name"]:
                                adj_avail[d_iso] = False
                    adjusted_employees.append({**emp, "availability": adj_avail})

                raw, mc = backtracking_assign(adjusted_employees, dates, adjusted_hist)
                all_raw.append(raw)
                for name, count in mc.items():
                    cumulative_month_count[name] = cumulative_month_count.get(name, 0) + count

            # Merge into multi-type format
            assignments: dict[str, list[dict]] = {}
            for raw in all_raw:
                for date_str, emp_name in raw.items():
                    assignments.setdefault(date_str, []).append(
                        {"employee_name": emp_name, "shift_type": shift_type}
                    )
            month_count = cumulative_month_count
        else:
            # Run scheduler
            raw_assignments, month_count = backtracking_assign(employees, dates, historical)

            # Wrap in multi-type format: {date: [{employee_name, shift_type}]}
            assignments = {
                date_str: [{"employee_name": emp_name, "shift_type": shift_type}]
                for date_str, emp_name in raw_assignments.items()
            }

        # Store assignments in JSON
        self.storage.save_assignments(month_year, assignments, month_count)

        # Update/create employees in storage
        for emp in employees:
            existing = self.storage.get_employee_by_name(emp["name"])
            if not existing:
                self.storage.save_employee({
                    "name": emp["name"],
                    "is_new": emp.get("is_new", True),
                    "is_active": True,
                })

        return assignments, month_count
