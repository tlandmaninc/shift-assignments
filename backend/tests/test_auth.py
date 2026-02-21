"""Tests for the auth router."""

import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture()
def client():
    return TestClient(app)


class TestAuthMe:
    def test_unauthenticated_returns_false(self, client):
        """GET /api/auth/me without cookies returns authenticated=False."""
        resp = client.get("/api/auth/me")
        assert resp.status_code == 200
        data = resp.json()
        assert data["authenticated"] is False
        assert data["user"] is None


class TestLogout:
    def test_logout_returns_success(self, client):
        """POST /api/auth/logout returns success=True."""
        resp = client.post("/api/auth/logout")
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True


class TestGoogleLogin:
    def test_returns_authorization_url(self, client):
        """GET /api/auth/google/login returns authorization_url when configured."""
        with patch("app.routers.auth.settings") as mock_settings:
            mock_settings.google_client_id = "test-client-id"
            mock_settings.google_client_secret = "test-secret"
            mock_settings.frontend_url = "http://localhost:3000"
            with patch("app.routers.auth.generate_oauth_state", return_value="test-state"):
                # Bypass rate limiter
                with patch("app.routers.auth.limiter") as mock_limiter:
                    mock_limiter.limit.return_value = lambda f: f
                    resp = client.get("/api/auth/google/login")
        assert resp.status_code == 200
        data = resp.json()
        assert "authorization_url" in data
        assert "accounts.google.com" in data["authorization_url"]

    def test_not_configured_returns_400(self, client):
        """GET /api/auth/google/login returns 400 when not configured."""
        with patch("app.routers.auth.settings") as mock_settings:
            mock_settings.google_client_id = ""
            mock_settings.google_client_secret = ""
            with patch("app.routers.auth.limiter") as mock_limiter:
                mock_limiter.limit.return_value = lambda f: f
                resp = client.get("/api/auth/google/login")
        assert resp.status_code == 400


class TestRefreshToken:
    def test_no_refresh_token_returns_401(self, client):
        """POST /api/auth/refresh with no refresh token cookie returns 401."""
        resp = client.post("/api/auth/refresh")
        assert resp.status_code == 401
        assert "No refresh token" in resp.json()["detail"]


class TestRoleAccess:
    def test_require_admin_blocks_non_admin(self, client):
        """Admin-only endpoint rejects a basic user."""
        basic_user = {
            "role": "basic",
            "email": "user@test.com",
            "id": "basic_id",
            "name": "Basic User",
            "is_active": True,
        }
        with patch("app.routers.auth.get_current_user", return_value=basic_user):
            with patch(
                "app.routers.auth.verify_token",
                return_value={"sub": "basic_id", "role": "basic", "type": "access"},
            ):
                # Try to access admin-only employees endpoint
                resp = client.get(
                    "/api/employees",
                    cookies={"ect_access_token": "fake"},
                )
        assert resp.status_code == 403

    def test_require_employee_blocks_user_without_employee_id(self, client):
        """Employee-only endpoint rejects a user without employee_id."""
        no_emp_user = {
            "role": "basic",
            "email": "user@test.com",
            "id": "no_emp_id",
            "name": "No Emp User",
            "is_active": True,
        }
        with patch("app.routers.auth.get_current_user", return_value=no_emp_user):
            with patch(
                "app.routers.auth.verify_token",
                return_value={"sub": "no_emp_id", "role": "basic", "type": "access"},
            ):
                resp = client.get(
                    "/api/exchanges/my-shifts?month_year=2026-03",
                    cookies={"ect_access_token": "fake"},
                )
        assert resp.status_code == 403
