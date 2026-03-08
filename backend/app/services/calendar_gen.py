"""HTML calendar generator for shift assignments."""

import calendar
import json
from datetime import date
from pathlib import Path
from jinja2 import Template
from ..config import settings
from ..constants import DEFAULT_SHIFT_TYPE, get_shift_type_config, get_all_shift_types
from ..utils.date_utils import get_month_name, parse_month_year

CALENDAR_HTML_TEMPLATE = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{ title }}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #1e293b 0%, #111827 100%);
            min-height: 100vh;
            padding: 1.5rem;
            color: #f1f5f9;
        }

        .container {
            max-width: 1200px;
            margin: 0 auto;
        }

        .header {
            text-align: center;
            margin-bottom: 1.25rem;
        }

        .header h1 {
            font-size: 1.75rem;
            font-weight: 700;
            color: #f8fafc;
            margin-bottom: 0.25rem;
        }

        .header p {
            color: #94a3b8;
            font-size: 0.9rem;
            letter-spacing: 0.02em;
        }

        .calendar {
            background: rgba(255, 255, 255, 0.04);
            backdrop-filter: blur(10px);
            border-radius: 0.75rem;
            overflow: hidden;
            box-shadow: 0 10px 30px -8px rgba(0, 0, 0, 0.4);
            border: 1px solid rgba(255, 255, 255, 0.15);
        }

        .calendar-header {
            display: grid;
            grid-template-columns: repeat(7, 1fr);
            background: rgba(255, 255, 255, 0.08);
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .day-header {
            padding: 0.75rem 0.5rem;
            text-align: center;
            font-weight: 600;
            color: #f1f5f9;
            font-size: 0.8rem;
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }

        .calendar-body {
            display: grid;
            grid-template-columns: repeat(7, 1fr);
        }

        .day-cell {
            min-height: 90px;
            padding: 0.5rem;
            border: 1px solid rgba(255, 255, 255, 0.1);
            position: relative;
            transition: all 0.2s ease;
        }

        .day-cell:hover {
            background: rgba(255, 255, 255, 0.06);
        }

        .day-cell.other-month {
            background: rgba(0, 0, 0, 0.12);
        }

        .day-cell.other-month .day-number {
            color: #64748b;
        }

        .day-cell.weekend {
            background: rgba(239, 68, 68, 0.06);
        }

        .day-cell.has-shift {
            background: rgba(96, 165, 250, 0.06);
        }

        .day-number {
            font-size: 0.8rem;
            font-weight: 600;
            color: #e2e8f0;
            margin-bottom: 0.375rem;
        }

        .day-cell.today .day-number {
            background: #3b82f6;
            color: white;
            width: 1.75rem;
            height: 1.75rem;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
        }

        .shift-badge {
            padding: 0.25rem 0.5rem;
            border-radius: 0.375rem;
            font-size: 0.7rem;
            color: white;
            text-align: center;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
            margin-bottom: 0.2rem;
            filter: brightness(1.2) saturate(1.25);
        }

        .shift-badge .type-label {
            font-weight: 700;
            margin-right: 0.25rem;
        }

        .shift-badge .employee-name {
            font-weight: 400;
        }

        .shift-badge.current-user .employee-name {
            font-weight: 700;
        }

        .legend {
            margin-top: 1.25rem;
            display: flex;
            flex-wrap: wrap;
            gap: 0.75rem;
            justify-content: center;
        }

        .legend-item {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.4rem 0.75rem;
            background: rgba(255, 255, 255, 0.08);
            border-radius: 0.5rem;
        }

        .legend-color {
            width: 0.875rem;
            height: 0.875rem;
            border-radius: 0.25rem;
            filter: brightness(1.2) saturate(1.25);
        }

        .legend-name {
            font-size: 0.825rem;
            color: #f1f5f9;
        }

        .legend-count {
            font-size: 0.75rem;
            color: #94a3b8;
            margin-left: 0.25rem;
        }

        .summary {
            margin-top: 1.25rem;
            background: rgba(255, 255, 255, 0.06);
            border-radius: 0.75rem;
            padding: 1.25rem;
        }

        .summary h2 {
            font-size: 1.05rem;
            margin-bottom: 0.75rem;
            color: #f1f5f9;
        }

        .summary-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
            gap: 0.625rem;
        }

        .summary-card {
            background: rgba(255, 255, 255, 0.06);
            padding: 0.75rem 1rem;
            border-radius: 0.5rem;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .summary-card .name {
            font-weight: 500;
            font-size: 0.875rem;
            color: #e2e8f0;
        }

        .summary-card .count {
            background: rgba(96, 165, 250, 0.2);
            padding: 0.2rem 0.625rem;
            border-radius: 1rem;
            font-size: 0.8rem;
            color: #93c5fd;
            font-weight: 600;
        }

        @media print {
            @page {
                size: landscape;
                margin: 1cm;
            }

            * {
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
            }

            body {
                background: white;
                color: black;
                padding: 0;
            }

            .calendar {
                box-shadow: none;
                border: 1px solid #ccc;
                background: white;
            }

            .calendar-header {
                background: #f1f5f9;
            }

            .day-header {
                color: #334155;
            }

            .day-cell {
                border: 1px solid #e5e7eb;
                background: white;
            }

            .day-cell.weekend {
                background: #fef2f2;
            }

            .day-cell.has-shift {
                background: #eff6ff;
            }

            .day-cell.other-month {
                background: #f8fafc;
            }

            .header h1 {
                color: #1e293b;
            }

            .header p, .day-number, .legend-name {
                color: #374151;
            }

            .legend-item {
                background: #f8fafc;
            }

            .legend-count {
                color: #4b5563;
            }

            .summary {
                background: #f8fafc;
            }

            .summary h2 {
                color: #1e293b;
            }

            .summary-card {
                background: #f1f5f9;
            }

            .summary-card .name {
                color: #1e293b;
            }

            .summary-card .count {
                color: #3b82f6;
                background: #dbeafe;
            }

            /* All employee names become regular weight when printing */
            .shift-badge .employee-name {
                font-weight: 400 !important;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>{{ title }}</h1>
            <p>Shift Assignments</p>
        </div>

        <div class="calendar">
            <div class="calendar-header">
                <div class="day-header">Sun</div>
                <div class="day-header">Mon</div>
                <div class="day-header">Tue</div>
                <div class="day-header">Wed</div>
                <div class="day-header">Thu</div>
                <div class="day-header">Fri</div>
                <div class="day-header">Sat</div>
            </div>
            <div class="calendar-body">
                {% for day in days %}
                <div class="day-cell {{ day.classes }}">
                    {% if day.number %}
                    <div class="day-number">{{ day.number }}</div>
                    {% for assignment in day.assignments %}
                    <div class="shift-badge{{ ' current-user' if assignment.is_current_user else '' }}" style="background-color: {{ assignment.color }}">
                        <span class="type-label">{{ assignment.type_label }}</span>
                        <span class="employee-name">{{ assignment.employee }}</span>
                    </div>
                    {% endfor %}
                    {% endif %}
                </div>
                {% endfor %}
            </div>
        </div>

        <div class="legend">
            {% for st in shift_types %}
            <div class="legend-item">
                <div class="legend-color" style="background-color: {{ st.color }}"></div>
                <span class="legend-name">{{ st.label }}</span>
            </div>
            {% endfor %}
        </div>

        <div class="summary">
            <h2>Shift Summary</h2>
            <div class="summary-grid">
                {% for emp in employees %}
                <div class="summary-card">
                    <span class="name">{{ emp.name }}</span>
                    <span class="count">{{ emp.shifts }} shifts</span>
                </div>
                {% endfor %}
            </div>
        </div>
    </div>
</body>
</html>
"""


class CalendarGenerator:
    """Generator for HTML calendars from shift assignments."""

    def __init__(self):
        self.template = Template(CALENDAR_HTML_TEMPLATE)

    def generate_calendar(
        self,
        year: int,
        month: int,
        assignments: dict,
        month_count: dict[str, int],
        current_user_name: str | None = None,
    ) -> str:
        """
        Generate HTML calendar for a month.

        Args:
            year: Year
            month: Month
            assignments: Dict of date_iso -> employee_name (str) or list of
                         ``{employee_name, shift_type}`` dicts.
            month_count: Dict of employee_name -> shift count
            current_user_name: Optional name to bold in the calendar view.

        Returns:
            HTML string
        """
        month_name = get_month_name(month)
        title = f"{month_name} {year}"

        # Build calendar grid
        cal = calendar.Calendar(firstweekday=6)  # Sunday first
        month_days = cal.monthdayscalendar(year, month)

        days = []
        today = date.today()
        active_types: set[str] = set()

        for week in month_days:
            for day_num in week:
                if day_num == 0:
                    days.append({
                        "number": None,
                        "classes": "other-month",
                        "assignments": [],
                    })
                else:
                    d = date(year, month, day_num)
                    date_iso = d.isoformat()
                    weekday = d.weekday()

                    classes = []
                    if d == today:
                        classes.append("today")
                    if weekday in (4, 5):  # Friday, Saturday
                        classes.append("weekend")

                    # Normalize value to list of entries
                    value = assignments.get(date_iso)
                    entries: list[dict] = []
                    if isinstance(value, str):
                        entries = [{"employee_name": value, "shift_type": DEFAULT_SHIFT_TYPE}]
                    elif isinstance(value, list):
                        entries = value

                    badge_list = []
                    if entries:
                        classes.append("has-shift")
                        for entry in entries:
                            emp_name = entry["employee_name"]
                            shift_type = entry.get("shift_type", DEFAULT_SHIFT_TYPE)
                            type_cfg = get_shift_type_config(shift_type)
                            active_types.add(shift_type)
                            badge_list.append({
                                "employee": emp_name,
                                "color": type_cfg["color"],
                                "type_label": type_cfg["label"],
                                "is_current_user": (
                                    current_user_name is not None
                                    and emp_name == current_user_name
                                ),
                            })

                    days.append({
                        "number": day_num,
                        "classes": " ".join(classes),
                        "assignments": badge_list,
                    })

        # Build shift type legend entries (only for types actually used)
        shift_types_legend = [
            {"label": cfg["label"], "color": cfg["color"]}
            for st, cfg in get_all_shift_types().items()
            if st in active_types
        ]

        # Build employee list for summary
        employees = [
            {"name": name, "shifts": count}
            for name, count in sorted(month_count.items())
            if count > 0
        ]

        return self.template.render(
            title=title,
            days=days,
            shift_types=shift_types_legend,
            employees=employees,
        )

    def save_calendar(
        self,
        year: int,
        month: int,
        assignments: dict,
        month_count: dict[str, int],
    ) -> Path | None:
        """
        Generate and save HTML calendar.

        Args:
            year: Year
            month: Month
            assignments: Dict of date_iso -> employee_name or list of dicts
            month_count: Dict of employee_name -> shift count

        Returns:
            Path to saved HTML file, or None when using DB (calendar is
            regenerated on-the-fly from assignment data).
        """
        if settings.database_url:
            return None

        html = self.generate_calendar(year, month, assignments, month_count)

        # Create directory structure
        output_dir = settings.assignments_dir / str(year) / f"{month:02d}"
        output_dir.mkdir(parents=True, exist_ok=True)

        # Save HTML
        html_path = output_dir / "calendar.html"
        html_path.write_text(html, encoding="utf-8")

        return html_path

    def save_json(
        self,
        year: int,
        month: int,
        assignments: dict,
        month_count: dict[str, int],
        employees: list[dict],
    ) -> Path | None:
        """
        Save assignment data as JSON.

        Args:
            year: Year
            month: Month
            assignments: Dict of date_iso -> employee_name or list of dicts
            month_count: Dict of employee_name -> shift count
            employees: List of employee data

        Returns:
            Path to saved JSON file, or None when using DB.
        """
        data = {
            "year": year,
            "month": month,
            "month_year": f"{year}-{month:02d}",
            "assignments": assignments,
            "shift_counts": month_count,
            "employees": [
                {
                    "name": e["name"],
                    "is_new": e["is_new"],
                    "shifts": month_count.get(e["name"], 0),
                }
                for e in employees
            ],
            "total_shifts": len(assignments),
        }

        if settings.database_url:
            from ..db import db_save
            db_save(f"assignments/{year}-{month:02d}", data)
            return None

        output_dir = settings.assignments_dir / str(year) / f"{month:02d}"
        output_dir.mkdir(parents=True, exist_ok=True)

        json_path = output_dir / "assignment.json"
        json_path.write_text(json.dumps(data, indent=2), encoding="utf-8")

        return json_path
