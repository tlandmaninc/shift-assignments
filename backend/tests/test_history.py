"""Tests for the history router."""

import pytest
from unittest.mock import patch


@pytest.mark.usefixtures("mock_employee")
class TestGetHistory:
    def test_returns_history(self, client):
        """GET /api/history returns monthly_assignments and employee_stats."""
        with patch("app.routers.history.storage") as mock_storage:
            mock_storage.get_monthly_summaries.return_value = [
                {"month_year": "2026-03", "total_shifts": 20, "employees_count": 5},
            ]
            mock_storage.get_employee_stats.return_value = [
                {
                    "id": 1,
                    "name": "Alice",
                    "is_active": True,
                    "is_new": False,
                    "total_shifts": 10,
                    "shifts_by_type": {"ect": 10},
                    "months_active": 3,
                    "last_shift_date": "2026-03-15",
                },
            ]
            resp = client.get("/api/history")
        assert resp.status_code == 200
        data = resp.json()
        assert "monthly_assignments" in data
        assert "employee_stats" in data
        assert len(data["monthly_assignments"]) == 1
        assert len(data["employee_stats"]) == 1

    def test_empty_history(self, client):
        """GET /api/history returns empty lists when no data."""
        with patch("app.routers.history.storage") as mock_storage:
            mock_storage.get_monthly_summaries.return_value = []
            mock_storage.get_employee_stats.return_value = []
            resp = client.get("/api/history")
        assert resp.status_code == 200
        data = resp.json()
        assert data["monthly_assignments"] == []
        assert data["employee_stats"] == []

    def test_response_structure(self, client):
        """Verify the shape of employee_stats entries."""
        with patch("app.routers.history.storage") as mock_storage:
            mock_storage.get_monthly_summaries.return_value = []
            mock_storage.get_employee_stats.return_value = [
                {
                    "id": 2,
                    "name": "Bob",
                    "is_active": True,
                    "is_new": True,
                    "total_shifts": 5,
                    "shifts_by_type": None,
                    "months_active": 1,
                    "last_shift_date": None,
                },
            ]
            resp = client.get("/api/history")
        assert resp.status_code == 200
        stat = resp.json()["employee_stats"][0]
        assert "id" in stat
        assert "name" in stat
        assert "total_shifts" in stat
        assert "months_active" in stat
