"""Tests for the employees router."""

import pytest
from unittest.mock import patch, MagicMock


@pytest.mark.usefixtures("mock_admin")
class TestEmployeesList:
    def test_list_employees(self, client):
        """GET /api/employees returns a list."""
        with patch("app.routers.employees.storage") as mock_storage:
            mock_storage.get_employees.return_value = [
                {"id": 1, "name": "Alice", "is_active": True, "is_new": False},
                {"id": 2, "name": "Bob", "is_active": True, "is_new": True},
            ]
            mock_storage.get_employee_shift_counts.return_value = {"Alice": 5, "Bob": 2}
            resp = client.get("/api/employees")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        assert len(data) == 2


@pytest.mark.usefixtures("mock_admin")
class TestCreateEmployee:
    def test_create_employee(self, client):
        """POST /api/employees creates a new employee."""
        with patch("app.routers.employees.storage") as mock_storage:
            mock_storage.get_employee_by_name.return_value = None
            mock_storage.save_employee.return_value = {
                "id": 3,
                "name": "Charlie",
                "email": None,
                "is_new": True,
                "is_active": True,
                "color": None,
            }
            resp = client.post(
                "/api/employees",
                json={"name": "Charlie"},
            )
        assert resp.status_code == 200
        assert resp.json()["name"] == "Charlie"

    def test_duplicate_name_returns_400(self, client):
        """POST /api/employees with existing name returns 400."""
        with patch("app.routers.employees.storage") as mock_storage:
            mock_storage.get_employee_by_name.return_value = {"id": 1, "name": "Alice"}
            resp = client.post(
                "/api/employees",
                json={"name": "Alice"},
            )
        assert resp.status_code == 400
        assert "already exists" in resp.json()["detail"]


@pytest.mark.usefixtures("mock_admin")
class TestGetEmployee:
    def test_missing_employee_returns_404(self, client):
        """GET /api/employees/{id} returns 404 for non-existent."""
        with patch("app.routers.employees.storage") as mock_storage:
            mock_storage.get_employee.return_value = None
            resp = client.get("/api/employees/999")
        assert resp.status_code == 404


@pytest.mark.usefixtures("mock_admin")
class TestUpdateEmployee:
    def test_update_fields(self, client):
        """PUT /api/employees/{id} updates and returns employee."""
        with patch("app.routers.employees.storage") as mock_storage:
            mock_storage.get_employee.return_value = {
                "id": 1,
                "name": "Alice",
                "email": None,
                "is_active": True,
                "is_new": False,
                "color": None,
            }
            mock_storage.save_employee.return_value = {
                "id": 1,
                "name": "Alice Updated",
                "email": "alice@test.com",
                "is_active": True,
                "is_new": False,
                "color": None,
            }
            mock_storage.get_employee_shift_counts.return_value = {"Alice Updated": 3}
            resp = client.put(
                "/api/employees/1",
                json={"name": "Alice Updated", "email": "alice@test.com"},
            )
        assert resp.status_code == 200
        assert resp.json()["name"] == "Alice Updated"


@pytest.mark.usefixtures("mock_admin")
class TestDeleteEmployee:
    def test_delete_deactivates(self, client):
        """DELETE /api/employees/{id} deactivates employee."""
        with patch("app.routers.employees.storage") as mock_storage:
            mock_storage.delete_employee.return_value = True
            resp = client.delete("/api/employees/1")
        assert resp.status_code == 200
        assert resp.json()["success"] is True

    def test_delete_missing_returns_404(self, client):
        """DELETE /api/employees/{id} returns 404 if not found."""
        with patch("app.routers.employees.storage") as mock_storage:
            mock_storage.delete_employee.return_value = False
            resp = client.delete("/api/employees/999")
        assert resp.status_code == 404


@pytest.mark.usefixtures("mock_admin")
class TestEmployeeAssignments:
    def test_get_assignments(self, client):
        """GET /api/employees/{id}/assignments returns assignments."""
        with patch("app.routers.employees.storage") as mock_storage:
            mock_storage.get_employee.return_value = {
                "id": 1,
                "name": "Alice",
                "is_active": True,
                "is_new": False,
            }
            mock_storage.get_assignments.return_value = [
                {"employee_name": "Alice", "date": "2026-03-01", "month_year": "2026-03"},
            ]
            resp = client.get("/api/employees/1/assignments")
        assert resp.status_code == 200
        data = resp.json()
        assert "assignments" in data
        assert data["total"] == 1


@pytest.mark.usefixtures("mock_admin")
class TestFindDuplicates:
    def test_find_duplicates_returns_list(self, client):
        """GET /api/employees/duplicates/find returns a list."""
        with patch("app.routers.employees.storage") as mock_storage:
            mock_storage.find_duplicate_employees.return_value = []
            mock_storage.get_employee_shift_counts.return_value = {}
            resp = client.get("/api/employees/duplicates/find")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)
