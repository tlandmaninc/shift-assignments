"""HTML calendar generator for shift assignments."""

import calendar
import json
from datetime import date
from pathlib import Path
from jinja2 import Template
from ..config import settings
from ..utils.date_utils import get_month_name, parse_month_year

# Employee colors for consistent display
EMPLOYEE_COLORS = [
    "#3B82F6",  # Blue
    "#10B981",  # Emerald
    "#F59E0B",  # Amber
    "#EF4444",  # Red
    "#8B5CF6",  # Violet
    "#EC4899",  # Pink
    "#06B6D4",  # Cyan
    "#84CC16",  # Lime
    "#F97316",  # Orange
    "#6366F1",  # Indigo
]

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
            background: linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%);
            min-height: 100vh;
            padding: 2rem;
            color: #f8fafc;
        }

        .container {
            max-width: 1200px;
            margin: 0 auto;
        }

        .header {
            text-align: center;
            margin-bottom: 2rem;
        }

        .header h1 {
            font-size: 2.5rem;
            font-weight: 700;
            background: linear-gradient(90deg, #60a5fa, #a78bfa);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            margin-bottom: 0.5rem;
        }

        .header p {
            color: #94a3b8;
            font-size: 1.1rem;
        }

        .calendar {
            background: rgba(255, 255, 255, 0.05);
            backdrop-filter: blur(10px);
            border-radius: 1rem;
            overflow: hidden;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
            border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .calendar-header {
            display: grid;
            grid-template-columns: repeat(7, 1fr);
            background: rgba(255, 255, 255, 0.1);
        }

        .day-header {
            padding: 1rem;
            text-align: center;
            font-weight: 600;
            color: #e2e8f0;
            font-size: 0.875rem;
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }

        .calendar-body {
            display: grid;
            grid-template-columns: repeat(7, 1fr);
        }

        .day-cell {
            min-height: 100px;
            padding: 0.75rem;
            border: 1px solid rgba(255, 255, 255, 0.05);
            position: relative;
            transition: all 0.2s ease;
        }

        .day-cell:hover {
            background: rgba(255, 255, 255, 0.05);
        }

        .day-cell.other-month {
            background: rgba(0, 0, 0, 0.2);
        }

        .day-cell.other-month .day-number {
            color: #475569;
        }

        .day-cell.weekend {
            background: rgba(239, 68, 68, 0.1);
        }

        .day-cell.has-shift {
            background: rgba(59, 130, 246, 0.1);
        }

        .day-number {
            font-size: 0.875rem;
            font-weight: 500;
            color: #94a3b8;
            margin-bottom: 0.5rem;
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
            padding: 0.375rem 0.75rem;
            border-radius: 0.5rem;
            font-size: 0.75rem;
            font-weight: 600;
            color: white;
            text-align: center;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }

        .legend {
            margin-top: 2rem;
            display: flex;
            flex-wrap: wrap;
            gap: 1rem;
            justify-content: center;
        }

        .legend-item {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.5rem 1rem;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 0.5rem;
        }

        .legend-color {
            width: 1rem;
            height: 1rem;
            border-radius: 0.25rem;
        }

        .legend-name {
            font-size: 0.875rem;
            color: #e2e8f0;
        }

        .legend-count {
            font-size: 0.75rem;
            color: #94a3b8;
            margin-left: 0.25rem;
        }

        .summary {
            margin-top: 2rem;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 1rem;
            padding: 1.5rem;
        }

        .summary h2 {
            font-size: 1.25rem;
            margin-bottom: 1rem;
            color: #e2e8f0;
        }

        .summary-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
            gap: 1rem;
        }

        .summary-card {
            background: rgba(255, 255, 255, 0.05);
            padding: 1rem;
            border-radius: 0.5rem;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .summary-card .name {
            font-weight: 500;
        }

        .summary-card .count {
            background: rgba(59, 130, 246, 0.2);
            padding: 0.25rem 0.75rem;
            border-radius: 1rem;
            font-size: 0.875rem;
            color: #60a5fa;
        }

        @media print {
            body {
                background: white;
                color: black;
                padding: 1rem;
            }

            .calendar {
                box-shadow: none;
                border: 1px solid #ccc;
            }

            .day-cell {
                border: 1px solid #e5e7eb;
            }

            .header h1 {
                color: #1e3a5f;
                -webkit-text-fill-color: #1e3a5f;
            }

            .header p, .day-number, .legend-name {
                color: #374151;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>{{ title }}</h1>
            <p>ECT Shift Assignments</p>
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
                    {% if day.employee %}
                    <div class="shift-badge" style="background-color: {{ day.color }}">
                        {{ day.employee }}
                    </div>
                    {% endif %}
                    {% endif %}
                </div>
                {% endfor %}
            </div>
        </div>

        <div class="legend">
            {% for emp in employees %}
            <div class="legend-item">
                <div class="legend-color" style="background-color: {{ emp.color }}"></div>
                <span class="legend-name">{{ emp.name }}</span>
                <span class="legend-count">({{ emp.shifts }} shifts)</span>
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

    def get_employee_color(self, name: str, employee_colors: dict[str, str]) -> str:
        """Get consistent color for an employee."""
        if name in employee_colors:
            return employee_colors[name]

        # Assign next available color
        idx = len(employee_colors) % len(EMPLOYEE_COLORS)
        color = EMPLOYEE_COLORS[idx]
        employee_colors[name] = color
        return color

    def generate_calendar(
        self,
        year: int,
        month: int,
        assignments: dict[str, str],
        month_count: dict[str, int],
    ) -> str:
        """
        Generate HTML calendar for a month.

        Args:
            year: Year
            month: Month
            assignments: Dict of date_iso -> employee_name
            month_count: Dict of employee_name -> shift count

        Returns:
            HTML string
        """
        month_name = get_month_name(month)
        title = f"{month_name} {year}"

        # Build calendar grid
        cal = calendar.Calendar(firstweekday=6)  # Sunday first
        month_days = cal.monthdayscalendar(year, month)

        employee_colors: dict[str, str] = {}
        days = []
        today = date.today()

        for week in month_days:
            for day_num in week:
                if day_num == 0:
                    days.append({
                        "number": None,
                        "classes": "other-month",
                        "employee": None,
                        "color": None,
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

                    employee = assignments.get(date_iso)
                    color = None
                    if employee:
                        classes.append("has-shift")
                        color = self.get_employee_color(employee, employee_colors)

                    days.append({
                        "number": day_num,
                        "classes": " ".join(classes),
                        "employee": employee,
                        "color": color,
                    })

        # Build employee list for legend
        employees = [
            {
                "name": name,
                "shifts": count,
                "color": self.get_employee_color(name, employee_colors),
            }
            for name, count in sorted(month_count.items())
            if count > 0
        ]

        return self.template.render(
            title=title,
            days=days,
            employees=employees,
        )

    def save_calendar(
        self,
        year: int,
        month: int,
        assignments: dict[str, str],
        month_count: dict[str, int],
    ) -> Path:
        """
        Generate and save HTML calendar.

        Args:
            year: Year
            month: Month
            assignments: Dict of date_iso -> employee_name
            month_count: Dict of employee_name -> shift count

        Returns:
            Path to saved HTML file
        """
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
        assignments: dict[str, str],
        month_count: dict[str, int],
        employees: list[dict],
    ) -> Path:
        """
        Save assignment data as JSON.

        Args:
            year: Year
            month: Month
            assignments: Dict of date_iso -> employee_name
            month_count: Dict of employee_name -> shift count
            employees: List of employee data

        Returns:
            Path to saved JSON file
        """
        output_dir = settings.assignments_dir / str(year) / f"{month:02d}"
        output_dir.mkdir(parents=True, exist_ok=True)

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

        json_path = output_dir / "assignment.json"
        json_path.write_text(json.dumps(data, indent=2), encoding="utf-8")

        return json_path
