"""Shared pytest fixtures for ECT backend tests."""

import pytest
from unittest.mock import patch, AsyncMock
from fastapi.testclient import TestClient

from app.main import app


ADMIN_USER = {
    "role": "admin",
    "email": "admin@test.com",
    "id": "test_admin_id",
    "name": "Test Admin",
    "is_active": True,
    "employee_id": 1,
}

EMPLOYEE_USER = {
    "role": "basic",
    "email": "emp@test.com",
    "id": "test_emp_id",
    "name": "Test Employee",
    "is_active": True,
    "employee_id": 1,
}


@pytest.fixture()
def client():
    """FastAPI test client (no auth cookies)."""
    return TestClient(app)


@pytest.fixture()
def mock_admin():
    """Bypass require_admin and get_required_user to return an admin user."""
    async def _admin(request=None):
        return ADMIN_USER

    with patch("app.routers.auth.require_admin", _admin):
        with patch("app.routers.auth.get_required_user", _admin):
            with patch("app.routers.auth.get_current_user", _admin):
                # Also patch verify_token so cookie-based lookup works
                with patch(
                    "app.routers.auth.verify_token",
                    return_value={"sub": "test_admin_id", "role": "admin", "type": "access"},
                ):
                    yield


@pytest.fixture()
def mock_employee():
    """Bypass require_employee and get_required_user to return an employee user."""
    async def _employee(request=None):
        return EMPLOYEE_USER

    with patch("app.routers.auth.require_employee", _employee):
        with patch("app.routers.auth.require_employee_or_admin", _employee):
            with patch("app.routers.auth.get_required_user", _employee):
                with patch("app.routers.auth.get_current_user", _employee):
                    with patch(
                        "app.routers.auth.verify_token",
                        return_value={
                            "sub": "test_emp_id",
                            "role": "basic",
                            "type": "access",
                            "employee_id": 1,
                        },
                    ):
                        yield
