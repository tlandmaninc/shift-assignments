"""Tests for the exchanges router."""

import pytest
from unittest.mock import patch, AsyncMock


@pytest.mark.usefixtures("mock_employee")
class TestMyShifts:
    def test_returns_shifts(self, client):
        """GET /api/exchanges/my-shifts returns shifts list."""
        with patch("app.routers.exchanges.exchange_service") as mock_svc:
            mock_svc.get_employee_shifts.return_value = [
                {"date": "2026-03-01", "day_of_week": "Sunday", "employee_name": "Test", "shift_type": "ect"},
            ]
            resp = client.get("/api/exchanges/my-shifts?month_year=2026-03")
        assert resp.status_code == 200
        data = resp.json()
        assert "shifts" in data
        assert data["month_year"] == "2026-03"

    def test_empty_month(self, client):
        """GET /api/exchanges/my-shifts returns empty list for no assignments."""
        with patch("app.routers.exchanges.exchange_service") as mock_svc:
            mock_svc.get_employee_shifts.return_value = []
            resp = client.get("/api/exchanges/my-shifts?month_year=2026-03")
        assert resp.status_code == 200
        assert resp.json()["shifts"] == []


@pytest.mark.usefixtures("mock_employee")
class TestSchedule:
    def test_returns_schedule(self, client):
        """GET /api/exchanges/schedule returns schedule dict."""
        with patch("app.routers.exchanges.exchange_service") as mock_svc:
            mock_svc.get_month_schedule.return_value = {
                "month_year": "2026-03",
                "employee_id": 1,
                "assignments": {},
            }
            resp = client.get("/api/exchanges/schedule?month_year=2026-03")
        assert resp.status_code == 200
        data = resp.json()
        assert data["month_year"] == "2026-03"


@pytest.mark.usefixtures("mock_employee")
class TestEligiblePartners:
    def test_returns_partners_list(self, client):
        """GET /api/exchanges/eligible/{date} returns partners list."""
        with patch("app.routers.exchanges.exchange_service") as mock_svc:
            mock_svc.find_eligible_partners.return_value = [
                {"employee_id": 2, "employee_name": "Bob", "eligible_dates": ["2026-03-05"]},
            ]
            resp = client.get("/api/exchanges/eligible/2026-03-01")
        assert resp.status_code == 200
        data = resp.json()
        assert "partners" in data
        assert data["shift_date"] == "2026-03-01"


@pytest.mark.usefixtures("mock_employee")
class TestCreateExchange:
    def test_creates_exchange_request(self, client):
        """POST /api/exchanges/ creates exchange and returns response."""
        exchange_data = {
            "id": 1,
            "month_year": "2026-03",
            "requester_employee_id": 1,
            "requester_employee_name": "Test Employee",
            "requester_date": "2026-03-01",
            "requester_shift_type": "ect",
            "target_employee_id": 2,
            "target_employee_name": "Bob",
            "target_date": "2026-03-05",
            "target_shift_type": "ect",
            "status": "pending",
            "reason": "Personal",
            "decline_reason": None,
            "validation_errors": None,
            "created_at": "2026-02-20T10:00:00",
            "responded_at": None,
            "completed_at": None,
        }
        with patch("app.routers.exchanges.exchange_service") as mock_svc:
            mock_svc.create_exchange = AsyncMock(return_value=exchange_data)
            with patch("app.routers.exchanges.ws_manager") as mock_ws:
                mock_ws.send_to_employee = AsyncMock()
                resp = client.post(
                    "/api/exchanges/",
                    json={
                        "requester_date": "2026-03-01",
                        "target_employee_id": 2,
                        "target_date": "2026-03-05",
                        "reason": "Personal",
                    },
                )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "pending"
        assert data["id"] == 1
