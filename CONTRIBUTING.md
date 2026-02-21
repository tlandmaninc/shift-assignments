# Contributing to ECT Shift Assignment App

Thank you for considering contributing to this project! This document explains how to set up your development environment, our coding standards, and the process for submitting changes.

## Getting Started

1. **Fork** the repository on GitHub
2. **Clone** your fork locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/ect-shift-assignment.git
   cd ect-shift-assignment
   ```
3. **Set up** your development environment following [docs/INSTALLATION.md](docs/INSTALLATION.md#local-development)
4. **Create a branch** for your work:
   ```bash
   git checkout -b feature/your-feature-name
   ```

## Development Setup

### Backend

```bash
cd backend
uv sync --dev
cp .env.example .env
# Edit .env with your values
uv run uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
cp .env.example .env.local
# Edit .env.local
npm run dev
```

## Code Style

### Python (Backend)

- Follow [PEP 8](https://peps.python.org/pep-0008/) style guidelines
- Use type hints for function signatures
- Use Pydantic models for request/response schemas
- Keep functions focused and under ~50 lines where practical

### TypeScript (Frontend)

- Follow the existing ESLint configuration
- Use TypeScript types/interfaces for props and data structures
- Use functional components with hooks
- Keep components focused on a single responsibility

## Branch Naming

Use descriptive branch names with a prefix:

| Prefix | Purpose | Example |
|--------|---------|---------|
| `feature/` | New functionality | `feature/export-pdf` |
| `fix/` | Bug fixes | `fix/calendar-timezone` |
| `refactor/` | Code improvements | `refactor/scheduler-cleanup` |
| `docs/` | Documentation changes | `docs/api-examples` |
| `test/` | Test additions or fixes | `test/exchange-service` |

## Commit Messages

Write clear, concise commit messages:

```
<type>(<scope>): <description>

[optional body]
```

**Types:** `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, `style`

**Examples:**
```
feat(scheduler): add constraint for maximum weekly hours
fix(auth): handle expired refresh tokens gracefully
docs(readme): add Docker setup instructions
test(employees): add merge endpoint tests
```

## Pull Request Process

1. **Ensure tests pass** before submitting:
   ```bash
   # Backend tests
   cd backend && uv run python -m pytest tests/ -v

   # Frontend tests
   cd frontend && npm test -- --watchAll=false
   ```

2. **Create the pull request** against the `main` branch

3. **Fill in the PR template** with:
   - What the PR does (summary)
   - How to test it
   - Any breaking changes

4. **Wait for review** -- a maintainer will review your changes

5. **Address feedback** -- push additional commits to your branch as needed

## Testing Requirements

- All existing tests must pass
- New features should include tests
- Bug fixes should include a regression test when practical

### Running Tests

```bash
# Backend
cd backend
uv run python -m pytest tests/ -v

# Frontend
cd frontend
npm test -- --watchAll=false

# Run all tests (using the pre-push hook script)
./.githooks/pre-push
```

### Test Structure

- **Backend tests** live in `backend/tests/` using pytest
- **Frontend tests** live in `frontend/__tests__/` using Jest

See [README-TESTING.md](README-TESTING.md) for detailed test documentation.

## Reporting Bugs

Use [GitHub Issues](../../issues) to report bugs. Include:

1. **Description**: What happened vs. what you expected
2. **Steps to reproduce**: Numbered steps to trigger the bug
3. **Environment**: OS, Python version, Node.js version, browser
4. **Logs/screenshots**: Any error messages or visual evidence

## Requesting Features

Open a [GitHub Issue](../../issues) with the `enhancement` label. Describe:

1. **The problem** you're trying to solve
2. **Your proposed solution**
3. **Alternatives** you've considered

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you agree to uphold this code.

## Questions?

Open a [Discussion](../../discussions) on GitHub or comment on a relevant issue.
