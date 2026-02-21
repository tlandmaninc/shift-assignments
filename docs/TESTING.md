# ECT Testing Guide

## Activating the Pre-Push Hook

To run all tests automatically before every `git push`, activate the custom hook:

```bash
git config core.hooksPath .githooks
```

This only needs to be done once per clone. It is also set up automatically via the `npm prepare` script when you run `npm install` in the frontend directory.

## Running Tests Manually

### Backend (pytest)

```bash
cd backend
python -m pytest tests/ -v
```

### Frontend (Jest)

```bash
cd frontend
npm test -- --watchAll=false
```

### All Tests (using the hook script directly)

```bash
./.githooks/pre-push
```

## Test Structure

### Backend Tests (`backend/tests/`)

| File | Coverage |
|------|----------|
| `test_auth.py` | Authentication endpoints (login, logout, refresh, phone verify) |
| `test_employees.py` | Employee CRUD, merge, translate |
| `test_assignments.py` | CSV parsing, validation, generation |
| `test_exchanges.py` | Shift exchange requests |
| `test_forms.py` | Form CRUD |
| `test_history.py` | History retrieval |
| `test_chat.py` | AI chat endpoint |
| `test_utils.py` | Date utils, name translator |
| `test_fetch_responses.py` | Google Forms integration (original) |

### Frontend Tests (`frontend/__tests__/`)

| File | Coverage |
|------|----------|
| `lib/api.test.ts` | API client functions |
| `lib/utils.test.ts` | Utility helpers |
| `lib/stores.test.ts` | Zustand stores |

## CI Integration

The pre-push hook automatically enforces tests before any push. For CI pipelines,
run the hook script directly or invoke the test commands individually.
