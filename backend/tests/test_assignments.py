"""Tests for the assignments router."""

import pytest
from unittest.mock import patch


@pytest.mark.usefixtures("mock_admin")
class TestListAssignments:
    def test_returns_months_summary(self, client):
        """GET /api/assignments returns monthly summaries."""
        with patch("app.routers.assignments.storage") as mock_storage:
            mock_storage.get_monthly_summaries.return_value = [
                {"month_year": "2026-03", "total_shifts": 20, "employees_count": 5},
            ]
            resp = client.get("/api/assignments")
        assert resp.status_code == 200
        data = resp.json()
        assert "months" in data


@pytest.mark.usefixtures("mock_admin")
class TestGetMonthAssignments:
    def test_unknown_month_returns_404(self, client):
        """GET /api/assignments/{month_year} returns 404 for unknown month."""
        with patch("app.routers.assignments.storage") as mock_storage:
            mock_storage.get_month_assignment.return_value = None
            resp = client.get("/api/assignments/2099-12")
        assert resp.status_code == 404

    def test_valid_month_returns_data(self, client):
        """GET /api/assignments/{month_year} returns data when exists."""
        with patch("app.routers.assignments.storage") as mock_storage:
            mock_storage.get_month_assignment.return_value = {
                "month_year": "2026-03",
                "assignments": {"2026-03-01": "Alice"},
                "shift_counts": {"Alice": 1},
            }
            resp = client.get("/api/assignments/2026-03")
        assert resp.status_code == 200
        assert resp.json()["month_year"] == "2026-03"


@pytest.mark.usefixtures("mock_admin")
class TestParseCSV:
    def test_valid_csv_returns_employees(self, client):
        """POST /api/assignments/parse-csv with valid CSV data returns employees."""
        csv_data = (
            "Timestamp,Employee Name,Is this your first month,"
            "Availability on March 1 (Sunday),Availability on March 2 (Monday)\n"
            "2026-02-01,Alice,No,Available,Not Available\n"
            "2026-02-01,Bob,Yes,Available,Available\n"
        )
        with patch("app.routers.assignments.parse_csv_responses") as mock_parse:
            mock_parse.return_value = [
                {"name": "Alice", "is_new": False, "availability": {"2026-03-01": True, "2026-03-02": False}},
                {"name": "Bob", "is_new": True, "availability": {"2026-03-01": True, "2026-03-02": True}},
            ]
            resp = client.post(
                "/api/assignments/parse-csv",
                json={
                    "csv_data": csv_data,
                    "included_dates": ["2026-03-01", "2026-03-02"],
                },
            )
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["employees_count"] == 2

    def test_empty_csv_returns_400(self, client):
        """POST /api/assignments/parse-csv with empty result returns 400."""
        with patch("app.routers.assignments.parse_csv_responses") as mock_parse:
            mock_parse.return_value = []
            resp = client.post(
                "/api/assignments/parse-csv",
                json={
                    "csv_data": "header1,header2\n",
                    "included_dates": ["2026-03-01"],
                },
            )
        assert resp.status_code == 400
        assert "No valid employee data" in resp.json()["detail"]
