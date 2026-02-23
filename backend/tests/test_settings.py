"""Tests for the settings router (page access control)."""

import pytest
from unittest.mock import patch
from app.constants import DEFAULT_PAGE_ACCESS


@pytest.mark.usefixtures("mock_admin")
class TestGetPageAccess:
    def test_returns_default_config(self, client):
        """GET /api/settings/page-access returns defaults when no saved config."""
        with patch("app.routers.settings.storage") as mock_storage:
            mock_storage.get_page_access.return_value = dict(DEFAULT_PAGE_ACCESS)
            resp = client.get("/api/settings/page-access")
        assert resp.status_code == 200
        data = resp.json()
        assert data == DEFAULT_PAGE_ACCESS

    def test_returns_saved_config(self, client):
        """GET /api/settings/page-access returns saved config."""
        saved = {**DEFAULT_PAGE_ACCESS, "history": "admin"}
        with patch("app.routers.settings.storage") as mock_storage:
            mock_storage.get_page_access.return_value = saved
            resp = client.get("/api/settings/page-access")
        assert resp.status_code == 200
        assert resp.json()["history"] == "admin"


@pytest.mark.usefixtures("mock_admin")
class TestUpdatePageAccess:
    def test_update_valid_config(self, client):
        """PUT /api/settings/page-access with valid values saves and returns 200."""
        update = {"history": "admin", "chat": "admin"}
        expected = {**DEFAULT_PAGE_ACCESS, **update}
        with patch("app.routers.settings.storage") as mock_storage:
            mock_storage.save_page_access.return_value = expected
            resp = client.put(
                "/api/settings/page-access",
                json={"config": update},
            )
        assert resp.status_code == 200
        mock_storage.save_page_access.assert_called_once_with(update)

    def test_reject_invalid_value(self, client):
        """PUT with value other than 'admin'/'all' returns 422."""
        resp = client.put(
            "/api/settings/page-access",
            json={"config": {"history": "superadmin"}},
        )
        assert resp.status_code == 422

    def test_reject_invalid_page_key(self, client):
        """PUT with unknown page key returns 422."""
        resp = client.put(
            "/api/settings/page-access",
            json={"config": {"nonexistent": "all"}},
        )
        assert resp.status_code == 422

    def test_partial_config_accepted(self, client):
        """PUT with partial config (not all pages) is accepted."""
        partial = {"chat": "admin"}
        expected = {**DEFAULT_PAGE_ACCESS, **partial}
        with patch("app.routers.settings.storage") as mock_storage:
            mock_storage.save_page_access.return_value = expected
            resp = client.put(
                "/api/settings/page-access",
                json={"config": partial},
            )
        assert resp.status_code == 200


@pytest.mark.usefixtures("mock_employee")
class TestPageAccessPermissions:
    def test_get_allowed_for_basic_user(self, client):
        """GET /api/settings/page-access is accessible to basic users."""
        with patch("app.routers.settings.storage") as mock_storage:
            mock_storage.get_page_access.return_value = dict(DEFAULT_PAGE_ACCESS)
            resp = client.get("/api/settings/page-access")
        assert resp.status_code == 200

    def test_update_blocked_for_basic_user(self, client):
        """PUT /api/settings/page-access is blocked for basic users."""
        resp = client.put(
            "/api/settings/page-access",
            json={"config": {"history": "admin"}},
        )
        assert resp.status_code == 403
