"""Tests for the shared constraint checker."""

from datetime import date
from app.schemas.shift_types import SchedulingConstraints
from app.services.constraint_checker import check_employee_constraints, validate_feasibility


class TestCheckEmployeeConstraints:
    def test_valid_single_shift(self):
        shifts = [date(2026, 3, 2)]
        all_dates = [date(2026, 3, d) for d in range(1, 29)]
        errors = check_employee_constraints("Alice", shifts, False, all_dates)
        assert errors == []

    def test_exceeds_max_per_month(self):
        shifts = [date(2026, 3, 2), date(2026, 3, 9), date(2026, 3, 16)]
        all_dates = [date(2026, 3, d) for d in range(1, 29)]
        errors = check_employee_constraints("Alice", shifts, False, all_dates)
        assert any("max 2" in e for e in errors)

    def test_custom_max_per_month(self):
        c = SchedulingConstraints(max_shifts_per_month=5)
        # Use different weekdays: Mon, Wed, Thu
        shifts = [date(2026, 3, 2), date(2026, 3, 11), date(2026, 3, 19)]
        all_dates = [date(2026, 3, d) for d in range(1, 29)]
        errors = check_employee_constraints("Alice", shifts, False, all_dates, c)
        assert errors == []

    def test_exceeds_max_per_week(self):
        # Mon and Tue in the same ISO week
        shifts = [date(2026, 3, 2), date(2026, 3, 3)]
        all_dates = [date(2026, 3, d) for d in range(1, 29)]
        c = SchedulingConstraints(allow_consecutive_days=True)
        errors = check_employee_constraints("Alice", shifts, False, all_dates, c)
        assert any("ISO week" in e for e in errors)

    def test_consecutive_days_blocked(self):
        shifts = [date(2026, 3, 2), date(2026, 3, 3)]
        all_dates = [date(2026, 3, d) for d in range(1, 29)]
        errors = check_employee_constraints("Alice", shifts, False, all_dates)
        assert any("consecutive" in e for e in errors)

    def test_consecutive_days_allowed(self):
        c = SchedulingConstraints(allow_consecutive_days=True)
        shifts = [date(2026, 3, 2), date(2026, 3, 3)]
        all_dates = [date(2026, 3, d) for d in range(1, 29)]
        errors = check_employee_constraints("Alice", shifts, False, all_dates, c)
        # Still blocked by max_per_week, but not by consecutive
        assert not any("consecutive" in e for e in errors)

    def test_same_weekday_blocked(self):
        # Two Mondays
        shifts = [date(2026, 3, 2), date(2026, 3, 9)]
        all_dates = [date(2026, 3, d) for d in range(1, 29)]
        errors = check_employee_constraints("Alice", shifts, False, all_dates)
        assert any("same weekday" in e for e in errors)

    def test_same_weekday_allowed(self):
        c = SchedulingConstraints(
            require_different_weekdays=False, max_shifts_per_week=1
        )
        shifts = [date(2026, 3, 2), date(2026, 3, 9)]  # Two Mondays
        all_dates = [date(2026, 3, d) for d in range(1, 29)]
        errors = check_employee_constraints("Alice", shifts, False, all_dates, c)
        assert not any("same weekday" in e for e in errors)

    def test_new_employee_restricted(self):
        # Put the shift early in the month (first week)
        shifts = [date(2026, 3, 2)]
        all_dates = [date(2026, 3, d) for d in range(1, 29)]
        errors = check_employee_constraints("Alice", shifts, True, all_dates)
        assert any("new employee" in e for e in errors)

    def test_new_employee_last_weeks_ok(self):
        # Put the shift in the last 2 weeks
        shifts = [date(2026, 3, 23)]
        all_dates = [date(2026, 3, d) for d in range(1, 29)]
        errors = check_employee_constraints("Alice", shifts, True, all_dates)
        assert not any("new employee" in e for e in errors)

    def test_new_employee_restriction_disabled(self):
        c = SchedulingConstraints(new_employee_restricted_weeks=0)
        shifts = [date(2026, 3, 2)]
        all_dates = [date(2026, 3, d) for d in range(1, 29)]
        errors = check_employee_constraints("Alice", shifts, True, all_dates, c)
        assert not any("new employee" in e for e in errors)


class TestValidateFeasibility:
    def test_feasible(self):
        c = SchedulingConstraints(max_shifts_per_month=2)
        result = validate_feasibility(c, num_dates=10, num_employees=6)
        assert result["feasible"] is True

    def test_infeasible_capacity(self):
        c = SchedulingConstraints(max_shifts_per_month=2)
        result = validate_feasibility(c, num_dates=20, num_employees=5)
        assert result["feasible"] is False
        assert any("Impossible" in e for e in result["errors"])

    def test_infeasible_minimum_one(self):
        c = SchedulingConstraints(require_minimum_one_shift=True)
        result = validate_feasibility(c, num_dates=3, num_employees=10, slots=1)
        assert result["feasible"] is False
        assert any("guarantee" in e for e in result["errors"])

    def test_weekly_tight_warning(self):
        c = SchedulingConstraints(max_shifts_per_week=1)
        result = validate_feasibility(c, num_dates=20, num_employees=5, slots=1)
        assert any("tight" in w for w in result["warnings"])
