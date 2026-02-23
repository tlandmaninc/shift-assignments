"""Tests for the auth router."""

import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

from app.main import app
from app.routers.auth import AUTH_SCOPES
from app.schemas.auth import UserRole
from app.services.auth_service import get_user_role


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


class TestGoogleLoginScopes:
    def test_authorization_url_includes_forms_scopes(self, client):
        """AUTH_SCOPES should contain forms.body and drive scopes."""
        assert "https://www.googleapis.com/auth/forms.body" in AUTH_SCOPES
        assert "https://www.googleapis.com/auth/drive" in AUTH_SCOPES
        assert "https://www.googleapis.com/auth/forms.responses.readonly" in AUTH_SCOPES

    def test_login_url_contains_forms_scope(self, client):
        """GET /api/auth/google/login URL should include the Forms scope."""
        with patch("app.routers.auth.settings") as mock_settings:
            mock_settings.google_client_id = "test-client-id"
            mock_settings.google_client_secret = "test-secret"
            mock_settings.frontend_url = "http://localhost:3000"
            with patch("app.routers.auth.generate_oauth_state", return_value="state"):
                with patch("app.routers.auth.limiter") as mock_limiter:
                    mock_limiter.limit.return_value = lambda f: f
                    resp = client.get("/api/auth/google/login")
        assert resp.status_code == 200
        url = resp.json()["authorization_url"]
        assert "forms.body" in url


class TestGoogleCallbackCredentials:
    def test_admin_login_saves_google_credentials(self, client):
        """Admin login with refresh_token should call save_credentials."""
        mock_creds = MagicMock()
        mock_creds.id_token = "mock-id-token"
        mock_creds.refresh_token = "mock-refresh-token"

        mock_flow = MagicMock()
        mock_flow.credentials = mock_creds

        user_info = {
            "id": "admin123",
            "email": "admin@test.com",
            "name": "Admin User",
            "picture": None,
        }
        from app.schemas.auth import UserRole

        with patch("app.routers.auth.settings") as mock_settings, \
             patch("app.routers.auth.validate_oauth_state", return_value=True), \
             patch("app.routers.auth.verify_google_id_token", return_value=user_info), \
             patch("app.routers.auth.get_user_role", return_value=UserRole.ADMIN), \
             patch("app.routers.auth.storage") as mock_storage, \
             patch("app.routers.auth.log_audit"), \
             patch("google_auth_oauthlib.flow.Flow.from_client_config", return_value=mock_flow), \
             patch("app.services.google_credentials.save_credentials") as mock_save:
            mock_settings.google_client_id = "cid"
            mock_settings.google_client_secret = "csec"
            mock_settings.frontend_url = "http://localhost:3000"
            mock_storage.get_auth_user.return_value = None
            mock_storage.save_auth_user.return_value = {
                "id": "admin123", "email": "admin@test.com",
                "name": "Admin User", "role": "admin", "is_active": True,
            }
            mock_storage.update_auth_user_last_login.return_value = None

            resp = client.get(
                "/api/auth/google/callback",
                params={"code": "auth-code", "state": "valid-state"},
                follow_redirects=False,
            )
            assert resp.status_code == 302
            mock_save.assert_called_once_with(mock_creds)

    def test_admin_login_no_refresh_token_skips_save(self, client):
        """Admin login without refresh_token should not call save_credentials."""
        mock_creds = MagicMock()
        mock_creds.id_token = "mock-id-token"
        mock_creds.refresh_token = None

        mock_flow = MagicMock()
        mock_flow.credentials = mock_creds

        user_info = {
            "id": "admin123",
            "email": "admin@test.com",
            "name": "Admin User",
            "picture": None,
        }
        from app.schemas.auth import UserRole

        with patch("app.routers.auth.settings") as mock_settings, \
             patch("app.routers.auth.validate_oauth_state", return_value=True), \
             patch("app.routers.auth.verify_google_id_token", return_value=user_info), \
             patch("app.routers.auth.get_user_role", return_value=UserRole.ADMIN), \
             patch("app.routers.auth.storage") as mock_storage, \
             patch("app.routers.auth.log_audit"), \
             patch("google_auth_oauthlib.flow.Flow.from_client_config", return_value=mock_flow), \
             patch("app.services.google_credentials.save_credentials") as mock_save:
            mock_settings.google_client_id = "cid"
            mock_settings.google_client_secret = "csec"
            mock_settings.frontend_url = "http://localhost:3000"
            mock_storage.get_auth_user.return_value = None
            mock_storage.save_auth_user.return_value = {
                "id": "admin123", "email": "admin@test.com",
                "name": "Admin User", "role": "admin", "is_active": True,
            }
            mock_storage.update_auth_user_last_login.return_value = None

            resp = client.get(
                "/api/auth/google/callback",
                params={"code": "auth-code", "state": "valid-state"},
                follow_redirects=False,
            )
            assert resp.status_code == 302
            mock_save.assert_not_called()

    def test_basic_login_does_not_save_credentials(self, client):
        """Non-admin login should not call save_credentials."""
        mock_creds = MagicMock()
        mock_creds.id_token = "mock-id-token"
        mock_creds.refresh_token = "mock-refresh-token"

        mock_flow = MagicMock()
        mock_flow.credentials = mock_creds

        user_info = {
            "id": "user123",
            "email": "user@test.com",
            "name": "Basic User",
            "picture": None,
        }
        from app.schemas.auth import UserRole

        with patch("app.routers.auth.settings") as mock_settings, \
             patch("app.routers.auth.validate_oauth_state", return_value=True), \
             patch("app.routers.auth.verify_google_id_token", return_value=user_info), \
             patch("app.routers.auth.get_user_role", return_value=UserRole.BASIC), \
             patch("app.routers.auth.storage") as mock_storage, \
             patch("app.routers.auth.log_audit"), \
             patch("google_auth_oauthlib.flow.Flow.from_client_config", return_value=mock_flow), \
             patch("app.services.google_credentials.save_credentials") as mock_save:
            mock_settings.google_client_id = "cid"
            mock_settings.google_client_secret = "csec"
            mock_settings.frontend_url = "http://localhost:3000"
            mock_storage.get_auth_user.return_value = None
            mock_storage.save_auth_user.return_value = {
                "id": "user123", "email": "user@test.com",
                "name": "Basic User", "role": "basic", "is_active": True,
            }
            mock_storage.update_auth_user_last_login.return_value = None

            resp = client.get(
                "/api/auth/google/callback",
                params={"code": "auth-code", "state": "valid-state"},
                follow_redirects=False,
            )
            assert resp.status_code == 302
            mock_save.assert_not_called()


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


class TestFirstUserBootstrap:
    """Tests for auto-promoting the first user when no admins are configured."""

    def test_first_user_promoted_when_no_admins(self):
        """With empty ADMIN_EMAILS and no users, first login gets admin."""
        with patch("app.services.auth_service.ADMIN_EMAILS", []), \
             patch("app.storage.storage") as mock_storage:
            mock_storage.get_auth_users.return_value = []
            assert get_user_role("anyone@example.com") == UserRole.ADMIN

    def test_second_user_not_promoted_after_admin_exists(self):
        """With empty ADMIN_EMAILS but an admin in storage, new user is basic."""
        with patch("app.services.auth_service.ADMIN_EMAILS", []), \
             patch("app.storage.storage") as mock_storage:
            mock_storage.get_auth_users.return_value = [
                {"id": "u1", "email": "first@example.com", "role": "admin"}
            ]
            assert get_user_role("another@example.com") == UserRole.BASIC

    def test_no_bootstrap_when_admin_emails_configured(self):
        """With ADMIN_EMAILS set, non-listed user stays basic even with no users."""
        with patch(
            "app.services.auth_service.ADMIN_EMAILS", ["admin@test.com"]
        ):
            assert get_user_role("other@test.com") == UserRole.BASIC
