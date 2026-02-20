"""Shift exchange service for managing swap requests and constraint validation."""

import asyncio
import logging
from datetime import date, datetime
from typing import Optional

from ..constants import DEFAULT_SHIFT_TYPE
from ..storage import storage

logger = logging.getLogger(__name__)

# Global lock for serializing swap executions
_exchange_lock = asyncio.Lock()


def _flatten_assignments(assignments: dict) -> dict[str, str]:
    """Flatten normalized assignments to the legacy {date: name} format.

    Works with both old ``{date: name}`` and new ``{date: [list]}`` formats.
    For dates with multiple assignments, only the first entry is used (swap
    validation applies per shift-type independently).
    """
    flat: dict[str, str] = {}
    for date_str, value in assignments.items():
        if isinstance(value, str):
            flat[date_str] = value
        elif isinstance(value, list) and value:
            flat[date_str] = value[0]["employee_name"]
    return flat


def _parse_date(date_str: str) -> date:
    """Parse a YYYY-MM-DD string to a date object."""
    return date.fromisoformat(date_str)


def _get_month_year(date_str: str) -> str:
    """Extract YYYY-MM from a YYYY-MM-DD string."""
    return date_str[:7]


def validate_swap(
    assignments: dict[str, str],
    requester_name: str,
    requester_date: str,
    target_name: str,
    target_date: str,
    employees: list[dict],
) -> list[str]:
    """
    Validate a swap against all hard constraints from the scheduler.

    Returns a list of validation error strings. Empty list means the swap is valid.
    """
    errors = []

    # 1. Both employees must own their claimed dates
    if assignments.get(requester_date) != requester_name:
        errors.append(f"{requester_name} is not assigned to {requester_date}")
    if assignments.get(target_date) != target_name:
        errors.append(f"{target_name} is not assigned to {target_date}")

    if errors:
        return errors

    # Simulate the swap
    simulated = dict(assignments)
    simulated[requester_date] = target_name
    simulated[target_date] = requester_name

    # Build per-employee shift data from simulated assignments
    emp_shifts: dict[str, list[date]] = {}
    for date_str, emp_name in simulated.items():
        d = _parse_date(date_str)
        emp_shifts.setdefault(emp_name, []).append(d)

    # Build employee lookup
    emp_lookup = {e["name"]: e for e in employees}

    for name in [requester_name, target_name]:
        shifts = sorted(emp_shifts.get(name, []))
        emp = emp_lookup.get(name, {})

        # 2. Max 2 shifts per month
        if len(shifts) > 2:
            errors.append(f"{name} would have {len(shifts)} shifts (max 2)")

        # 3. Max 1 shift per ISO week
        week_counts: dict[int, int] = {}
        for d in shifts:
            wk = d.isocalendar()[1]
            week_counts[wk] = week_counts.get(wk, 0) + 1
            if week_counts[wk] > 1:
                errors.append(f"{name} would have multiple shifts in ISO week {wk}")

        # 4. No consecutive calendar days
        for i in range(len(shifts) - 1):
            if (shifts[i + 1] - shifts[i]).days == 1:
                errors.append(
                    f"{name} would have consecutive shifts on {shifts[i]} and {shifts[i+1]}"
                )

        # 5. If 2 shifts, must be on different weekdays
        if len(shifts) == 2 and shifts[0].weekday() == shifts[1].weekday():
            errors.append(
                f"{name} would have two shifts on the same weekday "
                f"({shifts[0].strftime('%A')})"
            )

        # 6. New employees only in last 2 ISO weeks of the month's dates
        if emp.get("is_new", False):
            all_dates = sorted(_parse_date(ds) for ds in simulated.keys())
            all_weeks = sorted({d.isocalendar()[1] for d in all_dates})
            allowed_weeks = set(all_weeks[-2:]) if len(all_weeks) > 2 else set(all_weeks)
            for d in shifts:
                if d.isocalendar()[1] not in allowed_weeks:
                    errors.append(
                        f"{name} is a new employee and cannot be assigned in week {d.isocalendar()[1]}"
                    )

    return errors


class ExchangeService:
    """Service for managing shift exchanges."""

    def __init__(self):
        self.storage = storage

    def get_employee_shifts(self, employee_id: int, month_year: str) -> list[dict]:
        """Get shifts for a specific employee in a given month."""
        assignment_data = self.storage.get_month_assignment(month_year)
        if not assignment_data:
            return []

        employee = self.storage.get_employee(employee_id)
        if not employee:
            return []

        emp_name = employee["name"]
        assignments = assignment_data.get("assignments", {})

        shifts = []
        for date_str in sorted(assignments.keys()):
            value = assignments[date_str]
            entries = value if isinstance(value, list) else [
                {"employee_name": value, "shift_type": DEFAULT_SHIFT_TYPE}
            ]
            for entry in entries:
                if entry["employee_name"] == emp_name:
                    d = _parse_date(date_str)
                    shifts.append({
                        "date": date_str,
                        "day_of_week": d.strftime("%A"),
                        "employee_name": emp_name,
                        "shift_type": entry.get("shift_type", DEFAULT_SHIFT_TYPE),
                    })

        return shifts

    def get_month_schedule(self, employee_id: int, month_year: str) -> dict:
        """Build a full month schedule suitable for the calendar UI.

        Returns ``{month_year, employee_id, assignments}`` where *assignments*
        is ``{date: [{employee_name, shift_type, is_current_user}]}``.
        """
        assignment_data = self.storage.get_month_assignment(month_year)
        if not assignment_data:
            return {
                "month_year": month_year,
                "employee_id": employee_id,
                "assignments": {},
            }

        employee = self.storage.get_employee(employee_id)
        emp_name = employee["name"] if employee else ""

        raw = assignment_data.get("assignments", {})
        result: dict[str, list[dict]] = {}
        for date_str in sorted(raw.keys()):
            value = raw[date_str]
            entries = value if isinstance(value, list) else [
                {"employee_name": value, "shift_type": DEFAULT_SHIFT_TYPE}
            ]
            result[date_str] = [
                {
                    "employee_name": e.get("employee_name", ""),
                    "shift_type": e.get("shift_type", DEFAULT_SHIFT_TYPE),
                    "is_current_user": e.get("employee_name", "") == emp_name,
                }
                for e in entries
            ]

        return {
            "month_year": month_year,
            "employee_id": employee_id,
            "assignments": result,
        }

    def find_eligible_partners(
        self,
        requester_employee_id: int,
        requester_date: str,
        month_year: str,
    ) -> list[dict]:
        """Find eligible swap partners for a given shift date."""
        assignment_data = self.storage.get_month_assignment(month_year)
        if not assignment_data:
            return []

        assignments = assignment_data.get("assignments", {})
        flat = _flatten_assignments(assignments)
        requester = self.storage.get_employee(requester_employee_id)
        if not requester:
            return []

        requester_name = requester["name"]

        # Verify requester owns the date
        if flat.get(requester_date) != requester_name:
            return []

        # Get all employees
        employees = self.storage.get_employees()
        active_employees = [e for e in employees if e.get("is_active", True)]

        partners = []
        for emp in active_employees:
            if emp["id"] == requester_employee_id:
                continue

            emp_name = emp["name"]
            eligible_dates = []

            # Check each date this employee is assigned
            for date_str, assigned_name in flat.items():
                if assigned_name != emp_name:
                    continue

                # Simulate this swap and validate
                errors = validate_swap(
                    flat,
                    requester_name,
                    requester_date,
                    emp_name,
                    date_str,
                    active_employees,
                )
                if not errors:
                    eligible_dates.append(date_str)

            if eligible_dates:
                partners.append({
                    "employee_id": emp["id"],
                    "employee_name": emp_name,
                    "eligible_dates": sorted(eligible_dates),
                })

        return partners

    async def create_exchange(
        self,
        requester_employee_id: int,
        requester_date: str,
        target_employee_id: int,
        target_date: str,
        reason: Optional[str] = None,
    ) -> dict:
        """Create a new exchange request after pre-validating constraints."""
        month_year = _get_month_year(requester_date)
        target_month = _get_month_year(target_date)
        if month_year != target_month:
            raise ValueError("Both dates must be in the same month")

        assignment_data = self.storage.get_month_assignment(month_year)
        if not assignment_data:
            raise ValueError(f"No assignments found for {month_year}")

        assignments = assignment_data.get("assignments", {})
        flat = _flatten_assignments(assignments)
        requester = self.storage.get_employee(requester_employee_id)
        target = self.storage.get_employee(target_employee_id)

        if not requester:
            raise ValueError("Requester employee not found")
        if not target:
            raise ValueError("Target employee not found")

        employees = [e for e in self.storage.get_employees() if e.get("is_active", True)]
        errors = validate_swap(
            flat,
            requester["name"],
            requester_date,
            target["name"],
            target_date,
            employees,
        )
        if errors:
            raise ValueError(f"Swap validation failed: {'; '.join(errors)}")

        # Check for duplicate pending exchange
        existing = self.storage.get_exchanges(month_year=month_year, status="pending")
        for ex in existing:
            if (
                ex["requester_employee_id"] == requester_employee_id
                and ex["requester_date"] == requester_date
                and ex["target_employee_id"] == target_employee_id
                and ex["target_date"] == target_date
            ):
                raise ValueError("A duplicate exchange request already exists")

        # Look up shift types from the assignment data
        requester_shift_type = self._get_shift_type_for(
            assignments, requester["name"], requester_date
        )
        target_shift_type = self._get_shift_type_for(
            assignments, target["name"], target_date
        )

        exchange = self.storage.save_exchange({
            "month_year": month_year,
            "requester_employee_id": requester_employee_id,
            "requester_employee_name": requester["name"],
            "requester_date": requester_date,
            "requester_shift_type": requester_shift_type,
            "target_employee_id": target_employee_id,
            "target_employee_name": target["name"],
            "target_date": target_date,
            "target_shift_type": target_shift_type,
            "status": "pending",
            "reason": reason,
            "decline_reason": None,
            "validation_errors": None,
            "responded_at": None,
            "completed_at": None,
        })

        return exchange

    async def respond_to_exchange(
        self,
        exchange_id: int,
        action: str,
        responding_employee_id: int,
        decline_reason: Optional[str] = None,
    ) -> dict:
        """Respond to an exchange request (accept or decline)."""
        async with _exchange_lock:
            exchange = self.storage.get_exchange(exchange_id)
            if not exchange:
                raise ValueError("Exchange not found")

            if exchange["status"] != "pending":
                raise ValueError(f"Exchange is no longer pending (status: {exchange['status']})")

            if exchange["target_employee_id"] != responding_employee_id:
                raise ValueError("Only the target employee can respond to this request")

            if action == "decline":
                exchange["status"] = "declined"
                exchange["decline_reason"] = decline_reason
                exchange["responded_at"] = datetime.now().isoformat()
                return self.storage.save_exchange(exchange)

            if action != "accept":
                raise ValueError("Action must be 'accept' or 'decline'")

            # Re-validate against current state
            month_year = exchange["month_year"]
            assignment_data = self.storage.get_month_assignment(month_year)
            if not assignment_data:
                exchange["status"] = "invalid"
                exchange["validation_errors"] = ["Assignment data no longer exists"]
                exchange["responded_at"] = datetime.now().isoformat()
                return self.storage.save_exchange(exchange)

            assignments = assignment_data.get("assignments", {})
            flat = _flatten_assignments(assignments)
            employees = [e for e in self.storage.get_employees() if e.get("is_active", True)]

            errors = validate_swap(
                flat,
                exchange["requester_employee_name"],
                exchange["requester_date"],
                exchange["target_employee_name"],
                exchange["target_date"],
                employees,
            )

            if errors:
                exchange["status"] = "invalid"
                exchange["validation_errors"] = errors
                exchange["responded_at"] = datetime.now().isoformat()
                return self.storage.save_exchange(exchange)

            # Execute the swap
            self._execute_swap(
                month_year,
                assignments,
                exchange["requester_employee_name"],
                exchange["requester_date"],
                exchange["target_employee_name"],
                exchange["target_date"],
            )

            exchange["status"] = "accepted"
            exchange["responded_at"] = datetime.now().isoformat()
            exchange["completed_at"] = datetime.now().isoformat()
            saved = self.storage.save_exchange(exchange)

            # Invalidate conflicting pending exchanges
            self._invalidate_conflicting(
                exchange["id"],
                month_year,
                exchange["requester_employee_id"],
                exchange["target_employee_id"],
                exchange["requester_date"],
                exchange["target_date"],
            )

            return saved

    async def cancel_exchange(self, exchange_id: int, cancelling_employee_id: int) -> dict:
        """Cancel a pending exchange request."""
        exchange = self.storage.get_exchange(exchange_id)
        if not exchange:
            raise ValueError("Exchange not found")

        if exchange["status"] != "pending":
            raise ValueError(f"Exchange is no longer pending (status: {exchange['status']})")

        if exchange["requester_employee_id"] != cancelling_employee_id:
            raise ValueError("Only the requester can cancel this exchange")

        exchange["status"] = "cancelled"
        exchange["responded_at"] = datetime.now().isoformat()
        return self.storage.save_exchange(exchange)

    @staticmethod
    def _get_shift_type_for(
        assignments: dict,
        employee_name: str,
        date_str: str,
    ) -> Optional[str]:
        """Return the shift_type for an employee on a given date, or None."""
        value = assignments.get(date_str)
        if value is None:
            return None
        if isinstance(value, str):
            return DEFAULT_SHIFT_TYPE if value == employee_name else None
        if isinstance(value, list):
            for entry in value:
                if entry.get("employee_name") == employee_name:
                    return entry.get("shift_type", DEFAULT_SHIFT_TYPE)
        return None

    def _execute_swap(
        self,
        month_year: str,
        assignments: dict,
        requester_name: str,
        requester_date: str,
        target_name: str,
        target_date: str,
    ):
        """Execute the actual swap in assignment data.

        Handles both legacy ``{date: name}`` and multi-type ``{date: [list]}`` formats.
        """
        # Helper to swap an employee name inside a value
        def _swap_entry(value, old_name, new_name):
            if isinstance(value, str):
                return new_name if value == old_name else value
            if isinstance(value, list):
                for entry in value:
                    if entry.get("employee_name") == old_name:
                        entry["employee_name"] = new_name
                return value
            return value

        assignments[requester_date] = _swap_entry(
            assignments[requester_date], requester_name, target_name
        )
        assignments[target_date] = _swap_entry(
            assignments[target_date], target_name, requester_name
        )

        # Recalculate shift counts from the (possibly multi-type) assignments
        flat = _flatten_assignments(assignments)
        shift_counts: dict[str, int] = {}
        for emp_name in flat.values():
            shift_counts[emp_name] = shift_counts.get(emp_name, 0) + 1

        # Save updated assignments
        self.storage.save_assignments(month_year, assignments, shift_counts)
        logger.info(
            f"Swap executed: {requester_name} ({requester_date}) <-> "
            f"{target_name} ({target_date})"
        )

    def _invalidate_conflicting(
        self,
        completed_exchange_id: int,
        month_year: str,
        requester_emp_id: int,
        target_emp_id: int,
        requester_date: str,
        target_date: str,
    ):
        """Invalidate other pending exchanges that conflict with a completed swap."""
        pending = self.storage.get_exchanges(month_year=month_year, status="pending")
        affected_dates = {requester_date, target_date}
        affected_employees = {requester_emp_id, target_emp_id}

        for ex in pending:
            if ex["id"] == completed_exchange_id:
                continue

            # If this exchange involves any of the affected dates or employees
            involves_date = (
                ex["requester_date"] in affected_dates
                or ex["target_date"] in affected_dates
            )
            involves_employee = (
                ex["requester_employee_id"] in affected_employees
                or ex["target_employee_id"] in affected_employees
            )

            if involves_date or involves_employee:
                ex["status"] = "invalid"
                ex["validation_errors"] = [
                    "Invalidated due to a conflicting exchange being completed"
                ]
                ex["responded_at"] = datetime.now().isoformat()
                self.storage.save_exchange(ex)
                logger.info(f"Invalidated conflicting exchange #{ex['id']}")


# Global service instance
exchange_service = ExchangeService()
