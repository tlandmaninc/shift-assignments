"""Tests for the Google Form fetch-responses endpoint and full assignment journey."""

import json
import shutil
import pytest
from pathlib import Path
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

from app.main import app
from app.storage import storage


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture()
def client():
    """FastAPI test client."""
    return TestClient(app, cookies={"access_token": "test"})


@pytest.fixture()
def _mock_admin():
    """Bypass the require_admin dependency for all tests that need it."""
    with patch("app.routers.auth.get_required_user", return_value={"role": "admin", "email": "admin@test.com"}):
        with patch("app.routers.auth.verify_token", return_value={"sub": "admin", "role": "admin", "type": "access"}):
            yield


@pytest.fixture()
def _isolated_data(tmp_path):
    """Redirect settings.data_dir to a temp directory so tests don't pollute real data.

    Copies forms.json and history.json from the real data dir so storage
    helpers still find the files they expect, then restores originals on teardown.
    """
    from app.config import settings

    real_data_dir = settings.data_dir
    tmp_data = tmp_path / "data"
    tmp_data.mkdir()
    (tmp_data / "assignments").mkdir()

    # Seed with existing JSON files that the storage layer reads
    for name in ("forms.json", "history.json", "employees.json"):
        src = real_data_dir / name
        if src.exists():
            shutil.copy2(src, tmp_data / name)
        else:
            (tmp_data / name).write_text("{}")

    original = settings.data_dir
    settings.data_dir = tmp_data
    yield tmp_data
    settings.data_dir = original


@pytest.fixture()
def form_with_google_id():
    """Create a test form record in storage with a linked google_form_id."""
    # Create without ID so save_form auto-assigns one
    form = storage.save_form({
        "month_year": "2026-03",
        "title": "March 2026 Shift Assignment",
        "status": "active",
        "included_dates": [
            "2026-03-01",
            "2026-03-02",
            "2026-03-03",
            "2026-03-04",
            "2026-03-05",
        ],
    })
    # Now update it with google_form_id
    form["google_form_id"] = "1AbCdEfGhIjKlMnOpQrStUvWxYz"
    storage.save_form(form)
    yield form
    storage.delete_form(form["id"])


@pytest.fixture()
def form_without_google_id():
    """Create a test form record without a google_form_id."""
    form = storage.save_form({
        "month_year": "2026-04",
        "title": "April 2026 Shift Assignment",
        "status": "active",
        "included_dates": ["2026-04-01", "2026-04-02"],
    })
    yield form
    storage.delete_form(form["id"])


# ---------------------------------------------------------------------------
# Mock data
# ---------------------------------------------------------------------------

MOCK_EMPLOYEES = [
    {"name": "Ahmad Al-Rashid", "is_new": False},
    {"name": "Sara Jaber", "is_new": True},
    {"name": "Noura Hassan", "is_new": False},
    {"name": "Yousef Khalil", "is_new": False},
    {"name": "Lina Mansour", "is_new": False},
]

# Each employee ~60-80% availability across 5 dates
MOCK_AVAILABILITY = [
    [True, True, False, True, True],    # Ahmad  (4/5)
    [True, False, True, True, False],   # Sara   (3/5)
    [False, True, True, True, True],    # Noura  (4/5)
    [True, True, True, False, True],    # Yousef (4/5)
    [True, True, False, True, False],   # Lina   (3/5)
]

INCLUDED_DATES = [
    "2026-03-01",
    "2026-03-02",
    "2026-03-03",
    "2026-03-04",
    "2026-03-05",
]

DATE_TITLES = [
    "Availability on March 1 (Sunday)",
    "Availability on March 2 (Monday)",
    "Availability on March 3 (Tuesday)",
    "Availability on March 4 (Wednesday)",
    "Availability on March 5 (Thursday)",
]


def _build_mock_form_structure():
    """Build a mock Google Forms API forms().get() response."""
    items = [
        {
            "title": "Employee Name",
            "questionItem": {
                "question": {
                    "questionId": "q1",
                    "textQuestion": {"paragraph": False},
                }
            },
        },
        {
            "title": "Is this your first month doing ECT?",
            "questionItem": {
                "question": {
                    "questionId": "q2",
                    "choiceQuestion": {
                        "type": "RADIO",
                        "options": [{"value": "Yes"}, {"value": "No"}],
                    },
                }
            },
        },
    ]
    for i, title in enumerate(DATE_TITLES):
        items.append({
            "title": title,
            "questionItem": {
                "question": {
                    "questionId": f"q{i + 3}",
                    "choiceQuestion": {
                        "type": "RADIO",
                        "options": [{"value": "Available"}, {"value": "Not Available"}],
                    },
                }
            },
        })
    return {"formId": "1AbCdEfGhIjKlMnOpQrStUvWxYz", "items": items}


def _build_mock_responses():
    """Build a mock Google Forms API forms().responses().list() response."""
    responses = []
    for emp_idx, emp in enumerate(MOCK_EMPLOYEES):
        answers = {
            "q1": {
                "textAnswers": {
                    "answers": [{"value": emp["name"]}]
                }
            },
            "q2": {
                "textAnswers": {
                    "answers": [{"value": "Yes" if emp["is_new"] else "No"}]
                }
            },
        }
        for date_idx in range(5):
            avail = MOCK_AVAILABILITY[emp_idx][date_idx]
            answers[f"q{date_idx + 3}"] = {
                "textAnswers": {
                    "answers": [{"value": "Available" if avail else "Not Available"}]
                }
            }
        responses.append({
            "responseId": f"resp_{emp_idx}",
            "answers": answers,
        })
    return {"responses": responses}


def _mock_google_services():
    """Create a mock for googleapiclient.discovery.build that returns both forms services."""
    mock_service = MagicMock()

    # Mock forms().get()
    mock_service.forms().get.return_value.execute.return_value = _build_mock_form_structure()

    # Mock forms().responses().list()
    mock_service.forms().responses().list.return_value.execute.return_value = _build_mock_responses()

    return mock_service


def _mock_valid_credentials():
    """Return a mock Google OAuth Credentials object that appears valid."""
    creds = MagicMock()
    creds.valid = True
    creds.expired = False
    creds.token = "mock-access-token"
    return creds


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestFetchResponses:
    """Tests for POST /api/google/fetch-responses."""

    @pytest.mark.usefixtures("_mock_admin", "_isolated_data")
    def test_full_assignment_journey_via_google_form_fetch(self, client, form_with_google_id):
        """
        End-to-end test: fetch responses from Google Form, validate, then generate assignments.
        """
        form_id = form_with_google_id["id"]
        mock_creds = _mock_valid_credentials()
        mock_service = _mock_google_services()

        with patch("app.routers.google_forms.get_stored_credentials", return_value=mock_creds), \
             patch("googleapiclient.discovery.build", return_value=mock_service):

            # Step 1: Fetch responses
            resp = client.post(
                "/api/google/fetch-responses",
                json={"form_id": form_id},
            )
            assert resp.status_code == 200, resp.text
            data = resp.json()

            assert data["success"] is True
            assert data["employees_count"] == 5

            employees = data["employees"]
            assert len(employees) == 5

            # Verify each employee's data
            for i, emp in enumerate(employees):
                assert emp["employee_name"] == MOCK_EMPLOYEES[i]["name"]
                assert emp["is_first_month"] == MOCK_EMPLOYEES[i]["is_new"]

                # Check availability matches mock data
                for j, date_iso in enumerate(INCLUDED_DATES):
                    expected = MOCK_AVAILABILITY[i][j]
                    assert emp["availability"][date_iso] is expected, (
                        f"{emp['employee_name']} on {date_iso}: "
                        f"expected {expected}, got {emp['availability'][date_iso]}"
                    )

        # Step 2: Validate (no Google mock needed - uses local storage only)
        resp = client.post(
            f"/api/assignments/validate?form_id={form_id}",
            json=employees,
        )
        assert resp.status_code == 200, resp.text
        validation = resp.json()
        assert validation["valid"] is True

        # Step 3: Generate assignments
        resp = client.post(
            "/api/assignments/generate",
            json={"form_id": form_id, "employees": employees},
        )
        assert resp.status_code == 200, resp.text
        result = resp.json()

        assert result["success"] is True
        assert result["month_year"] == "2026-03"
        # Should have assignments for all 5 dates
        assert len(result["assignments"]) == 5
        # Calendar HTML should be present
        assert "<table" in result["calendar_html"].lower() or "<div" in result["calendar_html"].lower()
        # Shift counts should list all employees who got shifts
        assert len(result["shift_counts"]) > 0

    @pytest.mark.usefixtures("_mock_admin")
    def test_fetch_responses_no_google_form_id(self, client, form_without_google_id):
        """Form without google_form_id should return 400."""
        resp = client.post(
            "/api/google/fetch-responses",
            json={"form_id": form_without_google_id["id"]},
        )
        assert resp.status_code == 400
        assert "No Google Form linked" in resp.json()["detail"]

    @pytest.mark.usefixtures("_mock_admin")
    def test_fetch_responses_no_responses(self, client, form_with_google_id):
        """Google Form with 0 responses should return 400."""
        mock_creds = _mock_valid_credentials()
        mock_service = MagicMock()
        mock_service.forms().get.return_value.execute.return_value = _build_mock_form_structure()
        mock_service.forms().responses().list.return_value.execute.return_value = {"responses": []}

        with patch("app.routers.google_forms.get_stored_credentials", return_value=mock_creds), \
             patch("googleapiclient.discovery.build", return_value=mock_service):

            resp = client.post(
                "/api/google/fetch-responses",
                json={"form_id": form_with_google_id["id"]},
            )
            assert resp.status_code == 400
            assert "No responses found" in resp.json()["detail"]

    @pytest.mark.usefixtures("_mock_admin")
    def test_fetch_responses_google_auth_expired(self, client, form_with_google_id):
        """Expired/missing Google credentials should return 401."""
        with patch("app.routers.google_forms.get_stored_credentials", return_value=None):
            resp = client.post(
                "/api/google/fetch-responses",
                json={"form_id": form_with_google_id["id"]},
            )
            assert resp.status_code == 401
            assert "expired" in resp.json()["detail"].lower() or "reconnect" in resp.json()["detail"].lower()

    @pytest.mark.usefixtures("_mock_admin")
    def test_fetch_responses_form_not_found(self, client):
        """Non-existent form should return 404."""
        resp = client.post(
            "/api/google/fetch-responses",
            json={"form_id": 99999},
        )
        assert resp.status_code == 404

    @pytest.mark.usefixtures("_mock_admin")
    def test_google_form_id_persisted_on_creation(self, client):
        """After calling create-form, the internal form record should have google_form_id."""
        # Create an internal form first (without ID so it gets auto-assigned)
        form = storage.save_form({
            "month_year": "2026-05",
            "title": "May 2026 Shift Assignment",
            "status": "active",
            "included_dates": ["2026-05-03", "2026-05-04"],
        })
        form_id = form["id"]

        try:
            mock_creds = _mock_valid_credentials()
            mock_service = MagicMock()

            # Mock form creation - returns a form with an ID
            mock_service.forms().create.return_value.execute.return_value = {
                "formId": "new_google_form_abc123",
            }
            # Mock batchUpdate (for adding questions)
            mock_service.forms().batchUpdate.return_value.execute.return_value = {}

            with patch("app.routers.google_forms.get_stored_credentials", return_value=mock_creds), \
                 patch("googleapiclient.discovery.build", return_value=mock_service), \
                 patch("app.routers.google_forms.copy_template_form", return_value=None):

                resp = client.post(
                    "/api/google/create-form",
                    json={
                        "form_id": form_id,
                        "title": "May 2026 Shift Assignment",
                        "included_dates": ["2026-05-03", "2026-05-04"],
                    },
                )
                assert resp.status_code == 200, resp.text
                assert resp.json()["success"] is True

                # Verify that google_form_id was persisted on the internal form
                updated_form = storage.get_form(form_id)
                assert updated_form is not None
                assert updated_form.get("google_form_id") == "new_google_form_abc123"
        finally:
            storage.delete_form(form_id)


class TestRemovedEndpoints:
    """Verify the separate Google OAuth endpoints were removed."""

    @pytest.mark.usefixtures("_mock_admin")
    def test_authorize_returns_404(self, client):
        """GET /api/google/authorize should no longer exist."""
        resp = client.get("/api/google/authorize")
        assert resp.status_code in (404, 405)

    @pytest.mark.usefixtures("_mock_admin")
    def test_callback_returns_404(self, client):
        """GET /api/google/callback should no longer exist."""
        resp = client.get("/api/google/callback", params={"code": "x", "state": "y"})
        assert resp.status_code in (404, 405)
