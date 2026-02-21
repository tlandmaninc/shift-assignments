"""Tests for the forms router."""

import pytest
from unittest.mock import patch


class TestListForms:
    def test_returns_list(self, client):
        """GET /api/forms returns a list of forms."""
        with patch("app.routers.forms.storage") as mock_storage:
            mock_storage.get_forms.return_value = [
                {
                    "id": 1,
                    "month_year": "2026-03",
                    "title": "March 2026 ECT Shift Assignment",
                    "status": "active",
                    "included_dates": ["2026-03-01"],
                    "shift_type": "ect",
                },
            ]
            resp = client.get("/api/forms")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        assert len(data) == 1


class TestGetForm:
    def test_missing_form_returns_404(self, client):
        """GET /api/forms/{id} returns 404 for non-existent form."""
        with patch("app.routers.forms.storage") as mock_storage:
            mock_storage.get_form.return_value = None
            resp = client.get("/api/forms/999")
        assert resp.status_code == 404

    def test_existing_form(self, client):
        """GET /api/forms/{id} returns form when found."""
        with patch("app.routers.forms.storage") as mock_storage:
            mock_storage.get_form.return_value = {
                "id": 1,
                "month_year": "2026-03",
                "title": "March 2026 ECT",
                "status": "active",
                "included_dates": ["2026-03-01"],
                "shift_type": "ect",
            }
            resp = client.get("/api/forms/1")
        assert resp.status_code == 200
        assert resp.json()["id"] == 1


class TestCreateForm:
    def test_create_form(self, client):
        """POST /api/forms/create creates a new form."""
        with patch("app.routers.forms.storage") as mock_storage:
            mock_storage.get_form_by_month.return_value = None
            mock_storage.save_form.return_value = {
                "id": 1,
                "month_year": "2026-04",
                "title": "April 2026 ECT Shift Assignment",
                "status": "active",
                "included_dates": ["2026-04-01", "2026-04-02"],
                "shift_type": "ect",
                "created_at": "2026-02-20T00:00:00",
            }
            resp = client.post(
                "/api/forms/create",
                json={"year": 2026, "month": 4},
            )
        assert resp.status_code == 200
        data = resp.json()
        assert data["month_year"] == "2026-04"

    def test_duplicate_form_returns_400(self, client):
        """POST /api/forms/create with existing month returns 400."""
        with patch("app.routers.forms.storage") as mock_storage:
            mock_storage.get_form_by_month.return_value = {
                "id": 1,
                "month_year": "2026-04",
            }
            resp = client.post(
                "/api/forms/create",
                json={"year": 2026, "month": 4},
            )
        assert resp.status_code == 400
        assert "already exists" in resp.json()["detail"]


class TestDeleteForm:
    def test_delete_form(self, client):
        """DELETE /api/forms/{id} deletes the form."""
        with patch("app.routers.forms.storage") as mock_storage:
            mock_storage.get_form.return_value = {
                "id": 1,
                "month_year": "2026-03",
                "title": "Test",
                "status": "active",
                "included_dates": [],
            }
            mock_storage.delete_form.return_value = True
            resp = client.delete("/api/forms/1")
        assert resp.status_code == 200
        assert resp.json()["success"] is True

    def test_delete_missing_returns_404(self, client):
        """DELETE /api/forms/{id} returns 404 for non-existent."""
        with patch("app.routers.forms.storage") as mock_storage:
            mock_storage.get_form.return_value = None
            resp = client.delete("/api/forms/999")
        assert resp.status_code == 404


class TestUpdateFormStatus:
    def test_update_status(self, client):
        """PUT /api/forms/{id}/status updates status."""
        with patch("app.routers.forms.storage") as mock_storage:
            mock_storage.get_form.return_value = {
                "id": 1,
                "month_year": "2026-03",
                "title": "Test",
                "status": "active",
                "included_dates": [],
            }
            mock_storage.save_form.return_value = None
            resp = client.put("/api/forms/1/status?status=closed")
        assert resp.status_code == 200
        assert resp.json()["status"] == "closed"
