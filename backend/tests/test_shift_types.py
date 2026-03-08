"""Tests for the shift types router and storage."""

import pytest
from unittest.mock import patch


@pytest.mark.usefixtures("mock_admin")
class TestListShiftTypes:
    def test_list_returns_types(self, client):
        with patch("app.routers.shift_types.storage") as mock_storage:
            mock_storage.get_shift_types.return_value = {
                "ect": {"label": "ECT", "color": "#3B82F6", "is_builtin": True},
            }
            resp = client.get("/api/shift-types")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        assert len(data) == 1
        assert data[0]["key"] == "ect"


@pytest.mark.usefixtures("mock_admin")
class TestGetShiftType:
    def test_get_existing(self, client):
        with patch("app.routers.shift_types.storage") as mock_storage:
            mock_storage.get_shift_type.return_value = {
                "label": "ECT", "color": "#3B82F6", "is_builtin": True,
            }
            resp = client.get("/api/shift-types/ect")
        assert resp.status_code == 200
        assert resp.json()["key"] == "ect"

    def test_get_not_found(self, client):
        with patch("app.routers.shift_types.storage") as mock_storage:
            mock_storage.get_shift_type.return_value = None
            resp = client.get("/api/shift-types/nonexistent")
        assert resp.status_code == 404


@pytest.mark.usefixtures("mock_admin")
class TestCreateShiftType:
    def test_create_new(self, client):
        with patch("app.routers.shift_types.storage") as mock_storage:
            mock_storage.get_shift_type.return_value = None
            mock_storage.get_shift_types.return_value = {"ect": {}}
            mock_storage.save_shift_type.return_value = {
                "label": "Night Rounds", "color": "#8B5CF6",
            }
            resp = client.post("/api/shift-types", json={
                "key": "night_rounds",
                "label": "Night Rounds",
                "color": "#8B5CF6",
                "start_time": "T220000",
                "end_time": "T060000",
                "next_day_end": True,
                "slots": 1,
                "exclude_weekends": False,
                "calendar_title": "Night Rounds Shift",
            })
        assert resp.status_code == 201
        assert resp.json()["key"] == "night_rounds"

    def test_create_duplicate_rejected(self, client):
        with patch("app.routers.shift_types.storage") as mock_storage:
            mock_storage.get_shift_type.return_value = {"label": "ECT"}
            resp = client.post("/api/shift-types", json={
                "key": "ect",
                "label": "ECT Dup",
                "color": "#3B82F6",
                "start_time": "T073000",
                "end_time": "T100000",
                "slots": 1,
                "exclude_weekends": True,
                "calendar_title": "ECT Shift",
            })
        assert resp.status_code == 409

    def test_create_max_limit(self, client):
        with patch("app.routers.shift_types.storage") as mock_storage:
            mock_storage.get_shift_type.return_value = None
            mock_storage.get_shift_types.return_value = {
                f"type_{i}": {} for i in range(20)
            }
            resp = client.post("/api/shift-types", json={
                "key": "overflow",
                "label": "Overflow",
                "color": "#000000",
                "start_time": "T080000",
                "end_time": "T170000",
                "slots": 1,
                "exclude_weekends": True,
                "calendar_title": "Overflow Shift",
            })
        assert resp.status_code == 400
        assert "Maximum" in resp.json()["detail"]

    def test_invalid_key_rejected(self, client):
        resp = client.post("/api/shift-types", json={
            "key": "INVALID KEY!",
            "label": "Bad",
            "color": "#000000",
            "start_time": "T080000",
            "end_time": "T170000",
            "slots": 1,
            "exclude_weekends": True,
            "calendar_title": "Bad Shift",
        })
        assert resp.status_code == 422


@pytest.mark.usefixtures("mock_admin")
class TestUpdateShiftType:
    def test_update_existing(self, client):
        with patch("app.routers.shift_types.storage") as mock_storage:
            mock_storage.get_shift_type.return_value = {
                "label": "ECT", "color": "#3B82F6",
            }
            mock_storage.save_shift_type.return_value = {
                "label": "ECT Updated", "color": "#3B82F6",
            }
            resp = client.put("/api/shift-types/ect", json={
                "label": "ECT Updated",
            })
        assert resp.status_code == 200
        assert resp.json()["label"] == "ECT Updated"

    def test_update_not_found(self, client):
        with patch("app.routers.shift_types.storage") as mock_storage:
            mock_storage.get_shift_type.return_value = None
            resp = client.put("/api/shift-types/nonexistent", json={
                "label": "Nope",
            })
        assert resp.status_code == 404

    def test_update_empty_body(self, client):
        with patch("app.routers.shift_types.storage") as mock_storage:
            mock_storage.get_shift_type.return_value = {"label": "ECT"}
            resp = client.put("/api/shift-types/ect", json={})
        assert resp.status_code == 400


@pytest.mark.usefixtures("mock_admin")
class TestDeleteShiftType:
    def test_delete_custom(self, client):
        with patch("app.routers.shift_types.storage") as mock_storage:
            mock_storage.delete_shift_type.return_value = True
            resp = client.delete("/api/shift-types/night_rounds")
        assert resp.status_code == 204

    def test_delete_builtin_blocked(self, client):
        with patch("app.routers.shift_types.storage") as mock_storage:
            mock_storage.delete_shift_type.side_effect = ValueError(
                "Cannot delete built-in type"
            )
            resp = client.delete("/api/shift-types/ect")
        assert resp.status_code == 400
        assert "built-in" in resp.json()["detail"]

    def test_delete_not_found(self, client):
        with patch("app.routers.shift_types.storage") as mock_storage:
            mock_storage.delete_shift_type.return_value = False
            resp = client.delete("/api/shift-types/nonexistent")
        assert resp.status_code == 404


@pytest.mark.usefixtures("mock_admin")
class TestFeasibilityValidation:
    def test_feasible(self, client):
        resp = client.post("/api/shift-types/validate", json={
            "num_dates": 10,
            "num_employees": 6,
            "slots": 1,
            "constraints": {"max_shifts_per_month": 2},
        })
        assert resp.status_code == 200
        assert resp.json()["feasible"] is True

    def test_infeasible(self, client):
        resp = client.post("/api/shift-types/validate", json={
            "num_dates": 20,
            "num_employees": 5,
            "slots": 1,
            "constraints": {"max_shifts_per_month": 2},
        })
        assert resp.status_code == 200
        assert resp.json()["feasible"] is False


@pytest.mark.usefixtures("mock_admin")
class TestCrossTypeConstraints:
    def test_list_empty(self, client):
        with patch("app.routers.shift_types.storage") as mock_storage:
            mock_storage.get_cross_type_constraints.return_value = []
            resp = client.get("/api/shift-types/cross-constraints")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_create_cross_constraint(self, client):
        with patch("app.routers.shift_types.storage") as mock_storage:
            mock_storage.get_shift_type.return_value = {"label": "test"}
            mock_storage.save_cross_type_constraint.return_value = {
                "id": "cc_1", "type_a": "ect", "type_b": "er",
                "rule": "no_same_day",
            }
            resp = client.post("/api/shift-types/cross-constraints", json={
                "type_a": "ect",
                "type_b": "er",
            })
        assert resp.status_code == 201
        assert resp.json()["type_a"] == "ect"

    def test_create_cross_constraint_missing_type(self, client):
        with patch("app.routers.shift_types.storage") as mock_storage:
            mock_storage.get_shift_type.return_value = None
            resp = client.post("/api/shift-types/cross-constraints", json={
                "type_a": "nonexistent",
                "type_b": "ect",
            })
        assert resp.status_code == 404

    def test_delete_cross_constraint(self, client):
        with patch("app.routers.shift_types.storage") as mock_storage:
            mock_storage.delete_cross_type_constraint.return_value = True
            resp = client.delete("/api/shift-types/cross-constraints/cc_1")
        assert resp.status_code == 204

    def test_delete_cross_constraint_not_found(self, client):
        with patch("app.routers.shift_types.storage") as mock_storage:
            mock_storage.delete_cross_type_constraint.return_value = False
            resp = client.delete("/api/shift-types/cross-constraints/cc_999")
        assert resp.status_code == 404


class TestShiftTypeAuthBlocking:
    """Verify non-admin users cannot mutate shift types."""

    @pytest.mark.usefixtures("mock_employee")
    def test_create_blocked_for_employee(self, client):
        resp = client.post("/api/shift-types", json={
            "key": "test",
            "label": "Test",
            "color": "#000000",
            "start_time": "T080000",
            "end_time": "T170000",
            "slots": 1,
            "exclude_weekends": True,
            "calendar_title": "Test",
        })
        assert resp.status_code == 403

    @pytest.mark.usefixtures("mock_employee")
    def test_delete_blocked_for_employee(self, client):
        resp = client.delete("/api/shift-types/ect")
        assert resp.status_code == 403
