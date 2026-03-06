"""JSON-based storage service for all application data."""

import fcntl
import json
import os
import re
from contextlib import contextmanager
from datetime import date, datetime
from pathlib import Path
from typing import Optional
from .config import settings
from .constants import DEFAULT_SHIFT_TYPE, DEFAULT_PAGE_ACCESS
from .utils.name_translator import (
    is_hebrew,
    translate_hebrew_to_english,
    normalize_name,
)


def validate_month_year(month_year: str) -> tuple[str, str]:
    """
    Validate month_year format and return (year, month) tuple.

    Raises ValueError if format is invalid or values are out of range.
    Prevents path traversal attacks.
    """
    if not re.match(r'^\d{4}-\d{2}$', month_year):
        raise ValueError("Invalid month_year format. Expected YYYY-MM")

    year, month = month_year.split("-")
    year_int = int(year)
    month_int = int(month)

    if not (2000 <= year_int <= 2100):
        raise ValueError("Year out of valid range (2000-2100)")
    if not (1 <= month_int <= 12):
        raise ValueError("Month out of valid range (1-12)")

    return year, month


def validate_path_within_directory(path: Path, base_dir: Path) -> None:
    """
    Ensure the resolved path is within the base directory.

    Raises ValueError if path traversal is detected.
    """
    try:
        path.resolve().relative_to(base_dir.resolve())
    except ValueError:
        raise ValueError("Invalid path: directory traversal detected")


class JSONEncoder(json.JSONEncoder):
    """Custom JSON encoder for dates and datetimes."""

    def default(self, obj):
        if isinstance(obj, (date, datetime)):
            return obj.isoformat()
        return super().default(obj)


class Storage:
    """Storage for all application data (JSON files or PostgreSQL)."""

    def __init__(self):
        if not settings.database_url:
            self._ensure_data_dir()

    def _ensure_data_dir(self):
        """Ensure data directories exist."""
        settings.data_dir.mkdir(parents=True, exist_ok=True)
        settings.assignments_dir.mkdir(parents=True, exist_ok=True)

    @contextmanager
    def _file_lock(self, path: Path, exclusive: bool = False):
        """Acquire an advisory file lock for safe concurrent access."""
        lock_path = path.with_suffix(path.suffix + '.lock')
        lock_path.parent.mkdir(parents=True, exist_ok=True)
        lock_file = open(lock_path, 'w')
        try:
            fcntl.flock(lock_file, fcntl.LOCK_EX if exclusive else fcntl.LOCK_SH)
            yield
        finally:
            fcntl.flock(lock_file, fcntl.LOCK_UN)
            lock_file.close()

    def _path_to_key(self, path: Path) -> str:
        """Convert a file path to a DB key."""
        try:
            rel = path.relative_to(settings.data_dir)
        except ValueError:
            rel = Path(path.name)
        key = str(rel).replace("\\", "/")
        # Normalise assignment paths: YYYY/MM/assignment.json -> assignments/YYYY-MM
        if key.startswith("assignments/") and key.endswith("/assignment.json"):
            parts = key.split("/")  # ["assignments", YYYY, MM, "assignment.json"]
            if len(parts) == 4:
                return f"assignments/{parts[1]}-{parts[2]}"
        # Strip .json suffix for top-level files
        if key.endswith(".json"):
            key = key[:-5]
        return key

    def _load_json(self, path: Path) -> dict | list:
        """Load JSON data from DB or file."""
        if settings.database_url:
            from .db import db_load
            return db_load(self._path_to_key(path))
        if not path.exists():
            return {}
        with self._file_lock(path):
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)

    def _save_json(self, path: Path, data: dict | list):
        """Save JSON data to DB or file."""
        if settings.database_url:
            from .db import db_save
            db_save(self._path_to_key(path), data)
            return
        path.parent.mkdir(parents=True, exist_ok=True)
        with self._file_lock(path, exclusive=True):
            with open(path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, cls=JSONEncoder)
            os.chmod(path, 0o600)

    # ==================== Employees ====================

    def get_employees(self) -> list[dict]:
        """Get all employees."""
        data = self._load_json(settings.employees_file)
        return data.get("employees", [])

    def get_employee(self, employee_id: int) -> Optional[dict]:
        """Get employee by ID."""
        employees = self.get_employees()
        for emp in employees:
            if emp.get("id") == employee_id:
                return emp
        return None

    def get_employee_by_name(self, name: str) -> Optional[dict]:
        """Get employee by name."""
        employees = self.get_employees()
        for emp in employees:
            if emp.get("name", "").lower() == name.lower():
                return emp
        return None

    def save_employee(self, employee: dict) -> dict:
        """Save or update an employee."""
        employees = self.get_employees()

        if "id" not in employee or employee["id"] is None:
            # New employee - assign ID
            max_id = max((e.get("id", 0) for e in employees), default=0)
            employee["id"] = max_id + 1
            employee["created_at"] = datetime.now().isoformat()
            employees.append(employee)
        else:
            # Update existing
            for i, emp in enumerate(employees):
                if emp.get("id") == employee["id"]:
                    employee["updated_at"] = datetime.now().isoformat()
                    employees[i] = employee
                    break

        self._save_json(settings.employees_file, {"employees": employees})
        return employee

    def delete_employee(self, employee_id: int) -> bool:
        """Delete an employee (soft delete - set inactive)."""
        employees = self.get_employees()
        for emp in employees:
            if emp.get("id") == employee_id:
                emp["is_active"] = False
                emp["updated_at"] = datetime.now().isoformat()
                self._save_json(settings.employees_file, {"employees": employees})
                return True
        return False

    def hard_delete_employee(self, employee_id: int) -> bool:
        """Permanently remove an employee record (right to erasure)."""
        employees = self.get_employees()
        original_len = len(employees)
        employees = [e for e in employees if e.get("id") != employee_id]
        if len(employees) < original_len:
            self._save_json(settings.employees_file, {"employees": employees})
            return True
        return False

    def purge_user_data(self, user_id: str) -> dict:
        """Remove all PII for a user across data files (right to erasure)."""
        purged = {"users": False, "employees": False, "chat": 0, "exchanges": 0}

        # 1. Remove from users.json
        users_data = self._load_json(settings.users_file)
        users = users_data.get("users", [])
        user_record = None
        for u in users:
            if u.get("id") == user_id:
                user_record = u
                break
        if user_record:
            users = [u for u in users if u.get("id") != user_id]
            self._save_json(settings.users_file, {"users": users})
            purged["users"] = True

        # 2. Hard-delete linked employee
        employee_id = user_record.get("employee_id") if user_record else None
        if employee_id is not None:
            purged["employees"] = self.hard_delete_employee(employee_id)

        # 3. Remove chat conversations owned by this user
        chat_data = self._load_json(settings.chat_history_file)
        conversations = chat_data.get("conversations", [])
        before = len(conversations)
        conversations = [
            c for c in conversations if c.get("user_id") != user_id
        ]
        purged["chat"] = before - len(conversations)
        if purged["chat"]:
            self._save_json(
                settings.chat_history_file, {"conversations": conversations}
            )

        # 4. Anonymize exchanges involving the linked employee
        if employee_id is not None:
            ex_data = self._load_json(settings.exchanges_file)
            exchanges = ex_data.get("exchanges", [])
            count = 0
            for ex in exchanges:
                changed = False
                if ex.get("requester_employee_id") == employee_id:
                    ex["requester_employee_name"] = "[deleted]"
                    changed = True
                if ex.get("target_employee_id") == employee_id:
                    ex["target_employee_name"] = "[deleted]"
                    changed = True
                if changed:
                    count += 1
            purged["exchanges"] = count
            if count:
                self._save_json(settings.exchanges_file, {"exchanges": exchanges})

        return purged

    def find_duplicate_employees(self) -> list[dict]:
        """
        Find potential duplicate employees using multi-strategy matching.

        Strategies: Hebrew↔English dictionary, name containment,
        cross-language containment, token overlap, fuzzy similarity.

        Returns a list of dicts sorted by similarity descending.
        """
        from app.utils.name_similarity import find_all_duplicates

        employees = self.get_employees()
        return find_all_duplicates(employees)

    def merge_employees(
        self,
        source_id: int,
        target_id: int,
        keep_target_name: bool = True
    ) -> dict:
        """
        Merge source employee into target employee.

        - Transfers all assignments from source to target
        - Updates history records
        - Deactivates (soft-deletes) the source employee
        - Optionally updates the target name

        Args:
            source_id: ID of employee to merge FROM (will be deactivated)
            target_id: ID of employee to merge INTO (will remain active)
            keep_target_name: If True, keep target's name. If False, may use source's name.

        Returns:
            Dict with merge results
        """
        source = self.get_employee(source_id)
        target = self.get_employee(target_id)

        if not source:
            raise ValueError(f"Source employee with ID {source_id} not found")
        if not target:
            raise ValueError(f"Target employee with ID {target_id} not found")

        source_name = source.get("name", "")
        target_name = target.get("name", "")

        # Update all history/assignment records from source name to target name
        history = self._load_json(settings.history_file)
        all_assignments = history.get("assignments", [])
        updated_count = 0

        for assignment in all_assignments:
            if assignment.get("employee_name") == source_name:
                assignment["employee_name"] = target_name
                assignment["merged_from"] = source_name
                assignment["merged_at"] = datetime.now().isoformat()
                updated_count += 1

        history["assignments"] = all_assignments
        self._save_json(settings.history_file, history)

        # Update monthly assignment files
        self._update_monthly_assignments(source_name, target_name)

        # Merge employee data - keep earliest created_at, combine emails
        if source.get("created_at") and target.get("created_at"):
            if source["created_at"] < target["created_at"]:
                target["created_at"] = source["created_at"]

        # If target has no email but source does, use source's email
        if not target.get("email") and source.get("email"):
            target["email"] = source["email"]

        # If source is not new but target is, update target
        if not source.get("is_new", True) and target.get("is_new", True):
            target["is_new"] = False

        # Save updated target
        target["updated_at"] = datetime.now().isoformat()
        target["merged_from_id"] = source_id
        target["merged_from_name"] = source_name
        self.save_employee(target)

        # Deactivate source employee
        self.delete_employee(source_id)

        return {
            "success": True,
            "source_id": source_id,
            "target_id": target_id,
            "source_name": source_name,
            "target_name": target_name,
            "assignments_updated": updated_count,
            "message": f"Merged '{source_name}' into '{target_name}'. {updated_count} assignments updated.",
        }

    def _update_monthly_assignments(self, old_name: str, new_name: str):
        """Update all monthly assignment files to replace old_name with new_name."""
        assignments_dir = settings.assignments_dir
        if not assignments_dir.exists():
            return

        for year_dir in assignments_dir.iterdir():
            if not year_dir.is_dir():
                continue
            for month_dir in year_dir.iterdir():
                if not month_dir.is_dir():
                    continue

                assignment_file = month_dir / "assignment.json"
                if not assignment_file.exists():
                    continue

                data = self._load_json(assignment_file)
                modified = False

                # Update assignments dict
                if "assignments" in data:
                    for date_str, emp_name in list(data["assignments"].items()):
                        if emp_name == old_name:
                            data["assignments"][date_str] = new_name
                            modified = True

                # Update shift_counts dict
                if "shift_counts" in data:
                    if old_name in data["shift_counts"]:
                        old_count = data["shift_counts"].pop(old_name)
                        data["shift_counts"][new_name] = (
                            data["shift_counts"].get(new_name, 0) + old_count
                        )
                        modified = True

                # Update employees list
                if "employees" in data:
                    source_emp = None
                    target_emp = None
                    for emp in data["employees"]:
                        if emp.get("name") == old_name:
                            source_emp = emp
                        elif emp.get("name") == new_name:
                            target_emp = emp

                    if source_emp:
                        if target_emp:
                            # Merge shift counts
                            target_emp["shifts"] = (
                                target_emp.get("shifts", 0) + source_emp.get("shifts", 0)
                            )
                            data["employees"].remove(source_emp)
                        else:
                            # Just rename
                            source_emp["name"] = new_name
                        modified = True

                if modified:
                    self._save_json(assignment_file, data)

    def translate_and_merge_hebrew_employees(self) -> dict:
        """
        Find all Hebrew employees with English equivalents and merge them.

        Returns summary of all merges performed.
        """
        duplicates = self.find_duplicate_employees()
        results = []

        for dup in duplicates:
            hebrew_emp = dup["hebrew_employee"]
            english_emp = dup["english_employee"]

            # Merge Hebrew into English (keep English name)
            try:
                result = self.merge_employees(
                    source_id=hebrew_emp["id"],
                    target_id=english_emp["id"],
                    keep_target_name=True
                )
                results.append(result)
            except Exception as e:
                results.append({
                    "success": False,
                    "source_name": dup["hebrew_name"],
                    "target_name": dup["english_name"],
                    "error": str(e),
                })

        return {
            "total_duplicates_found": len(duplicates),
            "merges_performed": len([r for r in results if r.get("success")]),
            "results": results,
        }

    def translate_all_hebrew_to_english(self) -> dict:
        """
        Translate ALL Hebrew names to English in the entire system.

        This function:
        1. Translates all Hebrew names in history.json
        2. Updates all monthly assignment files
        3. Renames Hebrew employee records to English
        4. Merges duplicates if English version already exists

        Returns summary of all translations performed.
        """
        translations = []
        errors = []

        # First, merge any duplicates (Hebrew employees with existing English counterparts)
        merge_result = self.translate_and_merge_hebrew_employees()
        translations.extend([
            {"type": "merge", **r} for r in merge_result.get("results", [])
        ])

        # Now translate remaining Hebrew employee names
        employees = self.get_employees()
        for emp in employees:
            if not emp.get("is_active", True):
                continue

            name = emp.get("name", "")
            if not is_hebrew(name):
                continue

            # Try to translate
            english_name = translate_hebrew_to_english(name)
            if not english_name:
                errors.append({
                    "hebrew_name": name,
                    "error": "No translation found in dictionary",
                })
                continue

            # Check if English name already exists (shouldn't after merge, but check anyway)
            existing_english = self.get_employee_by_name(english_name)
            if existing_english and existing_english.get("id") != emp.get("id"):
                # Merge into existing English employee
                try:
                    result = self.merge_employees(
                        source_id=emp["id"],
                        target_id=existing_english["id"],
                        keep_target_name=True
                    )
                    translations.append({"type": "merge", **result})
                except Exception as e:
                    errors.append({
                        "hebrew_name": name,
                        "english_name": english_name,
                        "error": str(e),
                    })
            else:
                # Rename the employee to English
                old_name = emp["name"]
                emp["name"] = english_name
                emp["original_hebrew_name"] = old_name
                emp["updated_at"] = datetime.now().isoformat()
                self.save_employee(emp)

                # Update all history records with this name
                updated_count = self._update_history_name(old_name, english_name)

                translations.append({
                    "type": "rename",
                    "success": True,
                    "source_name": old_name,
                    "target_name": english_name,
                    "assignments_updated": updated_count,
                })

        return {
            "total_translations": len(translations),
            "successful": len([t for t in translations if t.get("success")]),
            "errors": errors,
            "translations": translations,
        }

    def _update_history_name(self, old_name: str, new_name: str) -> int:
        """
        Update all occurrences of old_name to new_name in history and assignments.

        Returns the count of updated records.
        """
        updated_count = 0

        # Update history.json
        history = self._load_json(settings.history_file)
        all_assignments = history.get("assignments", [])

        for assignment in all_assignments:
            if assignment.get("employee_name") == old_name:
                assignment["employee_name"] = new_name
                assignment["translated_from"] = old_name
                assignment["translated_at"] = datetime.now().isoformat()
                updated_count += 1

        history["assignments"] = all_assignments
        self._save_json(settings.history_file, history)

        # Update monthly assignment files
        self._update_monthly_assignments(old_name, new_name)

        return updated_count

    # ==================== Forms ====================

    def get_forms(self) -> list[dict]:
        """Get all forms."""
        data = self._load_json(settings.forms_file)
        return data.get("forms", [])

    def get_form(self, form_id: int) -> Optional[dict]:
        """Get form by ID."""
        forms = self.get_forms()
        for form in forms:
            if form.get("id") == form_id:
                return form
        return None

    def get_form_by_month(self, month_year: str, shift_type: Optional[str] = None) -> Optional[dict]:
        """Get form by month-year and optionally shift_type."""
        forms = self.get_forms()
        for form in forms:
            if form.get("month_year") == month_year:
                if shift_type is None or form.get("shift_type") == shift_type:
                    return form
        return None

    def save_form(self, form: dict) -> dict:
        """Save or update a form."""
        forms = self.get_forms()

        if "id" not in form or form["id"] is None:
            # New form
            max_id = max((f.get("id", 0) for f in forms), default=0)
            form["id"] = max_id + 1
            form["created_at"] = datetime.now().isoformat()
            forms.append(form)
        else:
            # Update existing
            for i, f in enumerate(forms):
                if f.get("id") == form["id"]:
                    form["updated_at"] = datetime.now().isoformat()
                    forms[i] = form
                    break

        self._save_json(settings.forms_file, {"forms": forms})
        return form

    def delete_form(self, form_id: int) -> bool:
        """Delete a form by ID."""
        forms = self.get_forms()
        original_len = len(forms)
        forms = [f for f in forms if f.get("id") != form_id]

        if len(forms) < original_len:
            self._save_json(settings.forms_file, {"forms": forms})
            return True
        return False

    # ==================== Assignments ====================

    def get_assignments(self, month_year: Optional[str] = None) -> list[dict]:
        """Get all assignments, optionally filtered by month."""
        history = self._load_json(settings.history_file)
        assignments = history.get("assignments", [])

        if month_year:
            assignments = [a for a in assignments if a.get("month_year") == month_year]

        return assignments

    def save_assignments(
        self,
        month_year: str,
        assignments: dict,  # date_iso -> employee_name (str) or list of entries
        month_count: dict[str, int],  # employee_name -> shift_count
    ) -> dict:
        """Save assignments for a month with path traversal protection.

        Handles both legacy ``{date: name}`` and multi-type
        ``{date: [{employee_name, shift_type}]}`` formats.
        """
        # Validate month_year format to prevent path traversal
        year, month = validate_month_year(month_year)

        # Load existing history
        history = self._load_json(settings.history_file)
        all_assignments = history.get("assignments", [])

        # Remove existing assignments for this month
        all_assignments = [a for a in all_assignments if a.get("month_year") != month_year]

        # Add new assignments to history (flatten multi-type to individual records)
        now_iso = datetime.now().isoformat()
        for date_str, value in assignments.items():
            if isinstance(value, str):
                # Legacy format: single employee name per date
                all_assignments.append({
                    "date": date_str,
                    "employee_name": value,
                    "month_year": month_year,
                    "created_at": now_iso,
                })
            elif isinstance(value, list):
                # Multi-type format: list of assignment entries per date
                for entry in value:
                    emp_name = entry.get("employee_name", "") if isinstance(entry, dict) else str(entry)
                    all_assignments.append({
                        "date": date_str,
                        "employee_name": emp_name,
                        "shift_type": entry.get("shift_type", DEFAULT_SHIFT_TYPE) if isinstance(entry, dict) else DEFAULT_SHIFT_TYPE,
                        "month_year": month_year,
                        "created_at": now_iso,
                    })

        history["assignments"] = all_assignments
        self._save_json(settings.history_file, history)

        # Also save to YYYY/MM directory
        output_dir = settings.assignments_dir / year / month

        # Ensure path is within assignments directory
        validate_path_within_directory(output_dir, settings.assignments_dir)

        output_dir.mkdir(parents=True, exist_ok=True)

        assignment_data = {
            "month_year": month_year,
            "assignments": assignments,
            "shift_counts": month_count,
            "created_at": now_iso,
        }

        self._save_json(output_dir / "assignment.json", assignment_data)

        return assignment_data

    @staticmethod
    def _normalize_assignments(data: dict) -> dict:
        """Normalize assignment data to the multi-type format.

        Converts old format ``{date: employee_name}`` to
        ``{date: [{employee_name, shift_type}]}``.
        """
        assignments = data.get("assignments", {})
        normalized = {}
        for date_key, value in assignments.items():
            if isinstance(value, str):
                normalized[date_key] = [
                    {"employee_name": value, "shift_type": DEFAULT_SHIFT_TYPE}
                ]
            elif isinstance(value, list):
                normalized[date_key] = value
            else:
                normalized[date_key] = value
        data["assignments"] = normalized
        return data

    def get_month_assignment(self, month_year: str) -> Optional[dict]:
        """Get assignment data for a specific month with path traversal protection."""
        year, month = validate_month_year(month_year)
        path = settings.assignments_dir / year / month / "assignment.json"

        # Ensure path is within assignments directory
        validate_path_within_directory(path, settings.assignments_dir)

        if not path.exists():
            return None

        data = self._load_json(path)
        return self._normalize_assignments(data)

    # ==================== History & Stats ====================

    def _build_name_mapping(self) -> dict[str, str]:
        """
        Build a mapping of all employee names (including Hebrew aliases) to canonical names.

        Returns dict where key is any name variant and value is the canonical (current) name.
        """
        employees = self.get_employees()
        name_map = {}

        for emp in employees:
            canonical_name = emp.get("name", "")

            # Map the canonical name to itself
            name_map[canonical_name] = canonical_name

            # Map merged_from_name (Hebrew name that was merged)
            if emp.get("merged_from_name"):
                name_map[emp["merged_from_name"]] = canonical_name

            # Map original_hebrew_name (if employee was renamed)
            if emp.get("original_hebrew_name"):
                name_map[emp["original_hebrew_name"]] = canonical_name

        return name_map

    def get_employee_shift_counts(
        self, shift_type: Optional[str] = None
    ) -> dict[str, int]:
        """
        Get total shift counts per employee (for fairness).

        Aggregates counts for merged/renamed employees by mapping all name variants
        to the canonical employee name.

        Args:
            shift_type: If provided, only count shifts of this type.
        """
        assignments = self.get_assignments()
        name_map = self._build_name_mapping()
        counts = {}

        for a in assignments:
            if shift_type and a.get("shift_type", DEFAULT_SHIFT_TYPE) != shift_type:
                continue
            name = a.get("employee_name", "")
            # Map to canonical name if mapping exists
            canonical_name = name_map.get(name, name)
            counts[canonical_name] = counts.get(canonical_name, 0) + 1

        return counts

    def get_employee_stats(
        self, active_only: bool = True, shift_type: Optional[str] = None
    ) -> list[dict]:
        """
        Get statistics for employees.

        Properly aggregates data for merged employees by considering all name variants.

        Args:
            active_only: If True, only return stats for active employees (default True).
                         This excludes merged/deactivated Hebrew name entries.
            shift_type: If provided, only count shifts of this type for total_shifts.
        """
        employees = self.get_employees()
        all_assignments = self.get_assignments()
        name_map = self._build_name_mapping()

        # Pre-compute shift counts using canonical names (filtered if shift_type given)
        shift_counts = self.get_employee_shift_counts(shift_type=shift_type)

        stats = []
        for emp in employees:
            # Skip inactive employees if active_only is True
            if active_only and not emp.get("is_active", True):
                continue

            name = emp.get("name", "")

            # Get all name variants for this employee
            name_variants = {name}
            if emp.get("merged_from_name"):
                name_variants.add(emp["merged_from_name"])
            if emp.get("original_hebrew_name"):
                name_variants.add(emp["original_hebrew_name"])

            # Find all assignments for any of this employee's name variants
            emp_assignments = [
                a for a in all_assignments
                if a.get("employee_name") in name_variants
            ]

            # Apply shift_type filter for date/month calculations
            if shift_type:
                filtered_assignments = [
                    a for a in emp_assignments
                    if a.get("shift_type", DEFAULT_SHIFT_TYPE) == shift_type
                ]
            else:
                filtered_assignments = emp_assignments

            # Find last shift date
            last_shift = None
            if filtered_assignments:
                dates = [a.get("date") for a in filtered_assignments]
                last_shift = max(dates)

            # Count unique months
            months = set(a.get("month_year") for a in filtered_assignments)

            # Compute per-type breakdown (always, regardless of filter)
            type_counts: dict[str, int] = {}
            for a in emp_assignments:
                st = a.get("shift_type", DEFAULT_SHIFT_TYPE)
                type_counts[st] = type_counts.get(st, 0) + 1

            stats.append({
                "id": emp.get("id"),
                "name": name,
                "is_active": emp.get("is_active", True),
                "is_new": emp.get("is_new", True),
                "total_shifts": shift_counts.get(name, 0),
                "shifts_by_type": type_counts if type_counts else None,
                "months_active": len(months),
                "last_shift_date": last_shift,
            })

        return stats

    def get_monthly_summaries(
        self, shift_type: Optional[str] = None
    ) -> list[dict]:
        """
        Get summary of shifts per month.

        Uses canonical employee names to properly count unique employees.

        Args:
            shift_type: If provided, only count shifts of this type for totals.
                        The by_type breakdown is always included.
        """
        assignments = self.get_assignments()
        name_map = self._build_name_mapping()

        # Group by month
        monthly: dict[str, dict] = {}
        for a in assignments:
            my = a.get("month_year", "")
            if my not in monthly:
                monthly[my] = {
                    "month_year": my,
                    "total_shifts": 0,
                    "employees": set(),
                    "by_type": {},
                }

            st = a.get("shift_type", DEFAULT_SHIFT_TYPE)
            monthly[my]["by_type"][st] = monthly[my]["by_type"].get(st, 0) + 1

            # When filtering, only count matching type in totals
            if shift_type and st != shift_type:
                continue

            monthly[my]["total_shifts"] += 1
            # Use canonical name for counting unique employees
            name = a.get("employee_name", "")
            canonical_name = name_map.get(name, name)
            monthly[my]["employees"].add(canonical_name)

        # Convert to list
        result = []
        for my, data in sorted(monthly.items(), reverse=True):
            # Skip months with zero matching shifts when filtering
            if shift_type and data["total_shifts"] == 0:
                continue
            result.append({
                "month_year": my,
                "total_shifts": data["total_shifts"],
                "employees_count": len(data["employees"]),
                "by_type": data["by_type"],
            })

        return result


    # ==================== Auth Users ====================

    def get_auth_users(self) -> list[dict]:
        """Get all authenticated users."""
        data = self._load_json(settings.users_file)
        return data.get("users", [])

    def get_auth_user(self, user_id: str) -> Optional[dict]:
        """Get authenticated user by Google ID."""
        users = self.get_auth_users()
        for user in users:
            if user.get("id") == user_id:
                return user
        return None

    def get_auth_user_by_email(self, email: str) -> Optional[dict]:
        """Get authenticated user by email."""
        users = self.get_auth_users()
        for user in users:
            if user.get("email", "").lower() == email.lower():
                return user
        return None

    def save_auth_user(self, user: dict) -> dict:
        """Save or update an authenticated user."""
        users = self.get_auth_users()

        existing_idx = None
        for i, u in enumerate(users):
            if u.get("id") == user["id"]:
                existing_idx = i
                break

        if existing_idx is not None:
            # Update existing user
            user["updated_at"] = datetime.now().isoformat()
            users[existing_idx] = user
        else:
            # New user
            user["created_at"] = datetime.now().isoformat()
            users.append(user)

        self._save_json(settings.users_file, {"users": users})
        return user

    def update_auth_user_last_login(self, user_id: str) -> Optional[dict]:
        """Update authenticated user's last login timestamp."""
        user = self.get_auth_user(user_id)
        if user:
            user["last_login"] = datetime.now().isoformat()
            return self.save_auth_user(user)
        return None

    def link_user_to_employee(self, user_id: str, employee_id: int) -> dict:
        """Link a user account to an employee record."""
        user = self.get_auth_user(user_id)
        if not user:
            raise ValueError(f"User {user_id} not found")

        employee = self.get_employee(employee_id)
        if not employee:
            raise ValueError(f"Employee {employee_id} not found")

        # Check no other user is already linked to this employee
        users = self.get_auth_users()
        for u in users:
            if u.get("employee_id") == employee_id and u.get("id") != user_id:
                raise ValueError(f"Employee {employee_id} is already linked to another user")

        user["employee_id"] = employee_id
        # Only upgrade role to 'employee' if the user is currently 'basic'.
        # Preserve 'admin' role so admins don't lose admin access when linked.
        if user.get("role") == "basic":
            user["role"] = "employee"
        return self.save_auth_user(user)

    def get_user_by_employee_id(self, employee_id: int) -> Optional[dict]:
        """Get user by linked employee ID."""
        users = self.get_auth_users()
        for user in users:
            if user.get("employee_id") == employee_id:
                return user
        return None

    def get_ai_consent(self, user_id: str) -> bool:
        """Check whether a user has given AI data processing consent."""
        user = self.get_auth_user(user_id)
        if not user:
            return False
        return user.get("ai_consent", False) is True

    def set_ai_consent(self, user_id: str, consent: bool) -> Optional[dict]:
        """Set the ai_consent flag on a user record."""
        user = self.get_auth_user(user_id)
        if not user:
            return None
        user["ai_consent"] = consent
        return self.save_auth_user(user)

    # ==================== Chat History ====================

    def get_conversations(self) -> list[dict]:
        """Get all conversations (summaries only, without messages)."""
        data = self._load_json(settings.chat_history_file)
        conversations = data.get("conversations", [])
        summaries = []
        for conv in conversations:
            summaries.append({
                "id": conv.get("id"),
                "title": conv.get("title", "Untitled"),
                "user_id": conv.get("user_id"),
                "created_at": conv.get("created_at", ""),
                "updated_at": conv.get("updated_at", ""),
                "message_count": len(conv.get("messages", [])),
            })
        # Sort by updated_at descending (most recent first)
        summaries.sort(key=lambda c: c.get("updated_at", ""), reverse=True)
        return summaries

    def get_conversation(self, conversation_id: str) -> Optional[dict]:
        """Get full conversation with messages."""
        data = self._load_json(settings.chat_history_file)
        for conv in data.get("conversations", []):
            if conv.get("id") == conversation_id:
                return conv
        return None

    def save_conversation(self, conversation: dict) -> dict:
        """Create or update a conversation."""
        data = self._load_json(settings.chat_history_file)
        conversations = data.get("conversations", [])

        existing_idx = None
        for i, conv in enumerate(conversations):
            if conv.get("id") == conversation.get("id"):
                existing_idx = i
                break

        conversation["updated_at"] = datetime.now().isoformat()

        if existing_idx is not None:
            conversations[existing_idx] = conversation
        else:
            conversation.setdefault("created_at", datetime.now().isoformat())
            conversations.append(conversation)

        self._save_json(settings.chat_history_file, {"conversations": conversations})
        return conversation

    def delete_conversation(self, conversation_id: str) -> bool:
        """Delete a conversation by ID."""
        data = self._load_json(settings.chat_history_file)
        conversations = data.get("conversations", [])
        original_len = len(conversations)
        conversations = [c for c in conversations if c.get("id") != conversation_id]

        if len(conversations) < original_len:
            self._save_json(settings.chat_history_file, {"conversations": conversations})
            return True
        return False

    # ==================== Exchanges ====================

    def get_exchanges(
        self,
        month_year: Optional[str] = None,
        employee_id: Optional[int] = None,
        status: Optional[str] = None,
    ) -> list[dict]:
        """Get exchanges with optional filters and lazy expiry."""
        data = self._load_json(settings.exchanges_file)
        exchanges = data.get("exchanges", [])

        # Lazy expiry: mark pending exchanges as expired if shift date has passed
        now = date.today().isoformat()
        modified = False
        for ex in exchanges:
            if ex.get("status") == "pending":
                if ex.get("requester_date", "") < now or ex.get("target_date", "") < now:
                    ex["status"] = "expired"
                    ex["responded_at"] = datetime.now().isoformat()
                    modified = True
        if modified:
            self._save_json(settings.exchanges_file, {"exchanges": exchanges})

        # Apply filters
        if month_year:
            exchanges = [e for e in exchanges if e.get("month_year") == month_year]
        if employee_id is not None:
            exchanges = [
                e for e in exchanges
                if e.get("requester_employee_id") == employee_id
                or e.get("target_employee_id") == employee_id
            ]
        if status:
            exchanges = [e for e in exchanges if e.get("status") == status]

        return exchanges

    def get_exchange(self, exchange_id: int) -> Optional[dict]:
        """Get a single exchange by ID."""
        data = self._load_json(settings.exchanges_file)
        for ex in data.get("exchanges", []):
            if ex.get("id") == exchange_id:
                return ex
        return None

    def save_exchange(self, exchange: dict) -> dict:
        """Save or update an exchange."""
        data = self._load_json(settings.exchanges_file)
        exchanges = data.get("exchanges", [])

        if "id" not in exchange or exchange["id"] is None:
            max_id = max((e.get("id", 0) for e in exchanges), default=0)
            exchange["id"] = max_id + 1
            exchange["created_at"] = datetime.now().isoformat()
            exchanges.append(exchange)
        else:
            for i, ex in enumerate(exchanges):
                if ex.get("id") == exchange["id"]:
                    exchanges[i] = exchange
                    break

        self._save_json(settings.exchanges_file, {"exchanges": exchanges})
        return exchange

    # ==================== Page Access ====================

    def get_page_access(self) -> dict:
        """Load page access config. Returns defaults if file doesn't exist."""
        data = self._load_json(settings.data_dir / "page_access.json")
        if not data:
            return dict(DEFAULT_PAGE_ACCESS)
        # Merge with defaults so new pages always have a value
        merged = dict(DEFAULT_PAGE_ACCESS)
        merged.update(data)
        return merged

    def save_page_access(self, config: dict) -> dict:
        """Save page access config and return the merged result."""
        merged = dict(DEFAULT_PAGE_ACCESS)
        merged.update(config)
        self._save_json(settings.data_dir / "page_access.json", merged)
        return merged


# Global storage instance
storage = Storage()
