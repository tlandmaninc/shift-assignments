# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Project context**: See README.md for project overview and tech stack.

## Core Principles

- **KISS** - Keep It Simple, Stupid. Favor simplicity over cleverness.
- **YAGNI** - You Aren't Gonna Need It. Don't build features until they're needed.
- **Fail Fast** - Validate early, surface errors immediately.

## Code Size Limits

- **Files**: Maximum 600 lines
- **Functions**: Maximum 60 lines
- **Components**: Maximum 150 lines
- **Line length**: 100 characters maximum (Python: 120)

If a file or function exceeds these limits, refactor by extracting smaller units.

## Git Commits

- **Never** add `Co-Authored-By: Claude ...` or any AI model attribution lines to commit messages.
- Commits must be authored solely by the human developer.
- Keep commits focused — only stage files directly relevant to the described change.
- Use conventional commits format: `type(scope): description`

---

## Project Overview

**ECT Shift Assignment Platform** — a full-stack web application for managing shift assignments in a psychiatry department. Features AI-powered fair scheduling, analytics, real-time shift exchange, an AI chat assistant, Google Forms integration, and multilingual support (Hebrew/English).

**Shift types:** ECT, Internal Medicine, ER — each with different slot configurations.

**Users:**
- **Admins** — manage scheduling, forms, employees, and analytics
- **Employees** — view assignments, request shift exchanges, query schedules via AI chat

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| **Frontend** | Next.js (App Router) | 16.1.6 |
| **UI** | React + TypeScript + TailwindCSS | 18.2 / 5.3.3 / 3.4.1 |
| **Animations** | Framer Motion | 11.0.3 |
| **State** | Zustand | 4.5.0 |
| **Charts** | Recharts | 3.7.0 |
| **Icons** | Lucide React | 0.321.0 |
| **Dates** | date-fns | 3.3.1 |
| **Notifications** | React Hot Toast | 2.4.1 |
| **Auth (phone)** | Firebase | 12.9.0 |
| **Backend** | FastAPI + Python | 0.133.1 / 3.12+ |
| **Validation** | Pydantic | 2.12.5 |
| **Data** | Pandas + NumPy | 2.2.0 / 1.26.3 |
| **Auth (JWT)** | PyJWT | 2.8.0+ |
| **Google APIs** | google-auth + google-api-python-client | 2.27 / 2.116 |
| **Rate limiting** | slowapi | 0.1.9+ |
| **AI (default)** | Google Gemini 2.5 Flash | — |
| **Pkg manager** | uv (Python) | 0.6.x |
| **Dev** | Docker Compose, Turbopack | — |
| **Testing** | Jest (frontend) + pytest (backend) | — |
| **CI/CD** | GitHub Actions | — |

---

## Build & Development Commands

### Recommended: Make

```bash
make help            # Show all targets
make setup           # First-time setup: copy .env examples
make dev             # Start dev with Docker Compose (hot-reload)
make dev-build       # Rebuild images and start
make dev-down        # Stop containers
make test            # Run all tests (backend + frontend)
make test-backend    # Run pytest
make test-frontend   # Run Jest
make lint            # TypeScript + Python linting
make logs            # Stream Docker logs
make health          # Check /health endpoint
make prod            # Start production (docker-compose.prod.yaml)
```

### Local (without Docker)

```bash
# Backend
cd backend
cp .env.example .env       # fill in required values
uv sync --dev
uv run uvicorn app.main:app --reload --port 8000

# Frontend
cd frontend
cp .env.example .env.local # fill in required values
npm install
npm run dev                # http://localhost:3000
```

### Docker

```bash
docker compose up --build          # Full rebuild + hot-reload
docker compose restart frontend    # Clear stale Turbopack cache
docker compose logs -f             # Stream logs
```

### Type-checking & Testing

```bash
cd frontend && npx tsc --noEmit         # TypeScript check
cd frontend && npm test -- --watchAll=false  # Jest
cd backend && uv run python -m pytest tests/ -v     # pytest
cd backend && uv run python -m pytest --cov=app     # with coverage
```

> **WSL2 note**: Run all commands from WSL, not Windows CMD/PowerShell.
> File watching inside Docker relies on `WATCHPACK_POLLING=true` (set in docker-compose.yaml).
> If the browser shows stale code after edits, run `docker compose restart frontend`.

---

## Architecture

### System Overview

```
┌─────────────────┐         ┌─────────────────────────┐
│  Next.js 14     │ HTTP/WS │  FastAPI Backend         │
│  Frontend       ├────────►│  Port 8000               │
│  Port 3000      │         │  /api/docs (Swagger)     │
└─────────────────┘         └──────┬──────┬────────────┘
                                   │      │
                          ┌────────┘      └──────────┐
                          ▼                          ▼
                   ┌─────────────┐         ┌────────────────┐
                   │ JSON Files  │         │ Google Gemini  │
                   │ /data/      │         │ / Ollama /     │
                   └─────────────┘         │ OpenAI-compat  │
                                           └────────────────┘
```

Next.js rewrites all `/api/*` calls to the backend (configured in `next.config.js`):
- Docker: `BACKEND_URL=http://backend:8000`
- Local: `NEXT_PUBLIC_API_URL=http://localhost:8000`

### Frontend Pages (`frontend/app/`)

| Page | Path | Purpose |
|------|------|---------|
| Dashboard | `page.tsx` | KPI overview, quick actions |
| Login | `login/page.tsx` | Google OAuth + phone OTP |
| Forms | `forms/page.tsx` | Availability form generation |
| Assignments | `assignments/page.tsx` | Run scheduler, view results |
| Employees | `employees/page.tsx` | Employee CRUD, merge, translate |
| History | `history/page.tsx` | Fairness analytics, charts, calendar |
| Shift Exchange | `shift-exchange/page.tsx` | Swap request UI with WebSocket |
| Chat | `chat/page.tsx` | AI chat assistant with SSE streaming |
| Profile | `profile/page.tsx` | User profile + Google Calendar link |

### Backend (`backend/app/`)

| Layer | Path | Purpose |
|-------|------|---------|
| Entry | `main.py` | FastAPI app, middleware (CORS, security headers, rate limiting) |
| Config | `config.py` | Pydantic Settings from env vars |
| Constants | `constants.py` | `SHIFT_TYPE_CONFIG` (ECT, Internal, ER) |
| Storage | `storage.py` | JSON file read/write layer |
| Routers | `routers/` | HTTP endpoint handlers |
| Services | `services/` | Business logic |
| Schemas | `schemas/` | Pydantic request/response models |

**Key Routers:**

| Router | Prefix | Purpose |
|--------|--------|---------|
| `auth.py` | `/api/auth` | OAuth login, JWT refresh, logout, phone OTP |
| `forms.py` | `/api/forms` | Form CRUD and date generation |
| `assignments.py` | `/api/assignments` | CSV parsing, scheduler, calendar export |
| `employees.py` | `/api/employees` | CRUD, merge duplicates, translate Hebrew→English |
| `history.py` | `/api/history` | Historical data, fairness metrics |
| `chat.py` | `/api/chat` | AI chat + SSE streaming |
| `exchanges.py` | `/api/exchanges` | Swap requests + WebSocket at `/ws/{employee_id}` |
| `google_forms.py` | `/api/google` | Google Forms create/fetch |

**Key Services:**

| Service | Purpose |
|---------|---------|
| `scheduler.py` | Backtracking constraint-satisfaction shift assignment |
| `auth_service.py` | JWT creation/verification, OAuth state management |
| `chat_service.py` | Multi-provider AI orchestration |
| `ws_manager.py` | WebSocket connection manager |
| `csv_parser.py` | Google Sheets CSV → employee availability |
| `calendar_gen.py` | Color-coded HTML calendar generation |
| `exchange_service.py` | Shift swap validation and approval |
| `ai_providers/` | Factory + pluggable Gemini / Ollama / OpenAI providers |

### Authentication Flow

1. User clicks login → `GET /api/auth/google/login` → Google OAuth consent
2. Google redirects to `GET /api/auth/callback?code=...&state=...`
3. Backend validates CSRF state, exchanges code, verifies Google ID token
4. JWT access + refresh tokens stored in HTTP-only cookies
5. Frontend auto-refreshes tokens every 50 minutes
6. Role: Admin if email in `ADMIN_EMAILS` env var, else Basic

### Shift Scheduling Algorithm (`services/scheduler.py`)

Depth-first backtracking with constraint satisfaction:

**Hard constraints:**
- Max 2 shifts/employee/month
- Max 1 shift/ISO week/employee
- No consecutive calendar days
- Different weekdays for a 2nd shift
- New employees restricted to last 2 ISO weeks
- Only available dates per employee's form response

**Soft constraints (candidate ordering):**
- Prefer employees with fewer cumulative historical shifts (fairness)
- Prefer most-constrained employees first (MRV heuristic)

### Data Storage

No database — JSON files in `backend/data/` (mounted as Docker volume):

| File | Contents |
|------|---------|
| `employees.json` | Employee records and availability |
| `forms.json` | Form configurations |
| `assignments/YYYY-MM.json` | Monthly shift assignments |
| `history.json` | Cumulative shift counts per employee |
| `users.json` | OAuth user records |
| `exchanges.json` | Shift exchange request log |
| `chat_history.json` | Chat conversations |

### WebSocket (Shift Exchange)

- Endpoint: `WS /api/exchanges/ws/{employee_id}`
- Manager: `services/ws_manager.py`
- Frontend: `components/exchange/WebSocketProvider.tsx`
- State: dispatched to `lib/stores/exchangeStore.ts` (Zustand)
- Message format: `{ "type": "exchange_request", "message": "...", "exchange": {...} }`

---

## Key Directories

```
ECT/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI entry point
│   │   ├── routers/             # API endpoint handlers
│   │   ├── services/            # Business logic
│   │   │   └── ai_providers/   # Pluggable AI (Gemini/Ollama/OpenAI)
│   │   ├── schemas/             # Pydantic models
│   │   └── data/               # JSON storage (gitignored, Docker volume)
│   ├── tests/                   # pytest test suite
│   ├── pyproject.toml           # Python deps + project metadata
│   ├── uv.lock                  # Locked dependency versions
│   └── Dockerfile
├── frontend/
│   ├── app/                     # Next.js App Router pages
│   ├── components/
│   │   ├── layout/              # Header, Sidebar
│   │   ├── chat/                # Chat bubbles, typing indicator
│   │   ├── exchange/            # Shift swap cards, WebSocketProvider
│   │   └── ui/                  # Headless UI primitives (Tooltip, Card, Badge)
│   ├── contexts/
│   │   └── AuthContext.tsx      # Auth state + login/logout
│   ├── lib/
│   │   ├── api.ts               # Typed API client
│   │   ├── stores/              # Zustand stores
│   │   ├── mockData/            # Dev/demo mock data generators
│   │   └── printCalendar.ts     # Calendar print utility
│   ├── next.config.js           # API rewrites, Webpack poll, cache headers
│   └── Dockerfile
├── docker-compose.yaml          # Dev: hot-reload, volume mounts
├── docker-compose.prod.yaml     # Prod: resource limits, named volumes
├── Makefile                     # Dev commands
├── .githooks/                   # Pre-commit hooks
└── .github/workflows/ci.yml     # GitHub Actions CI
```

---

## Environment Variables

### Backend (`backend/.env`)

```bash
# Required
SECRET_KEY=<32+ char random string>
ENVIRONMENT=production                    # development | production | test
FRONTEND_URL=https://your-frontend.vercel.app
ADMIN_EMAILS=admin@example.com            # comma-separated
GOOGLE_CLIENT_ID=<from console.cloud.google.com>
GOOGLE_CLIENT_SECRET=<from console.cloud.google.com>

# AI Provider (default: gemini)
AI_PROVIDER=gemini                        # gemini | ollama | openai | groq | together | openrouter
GEMINI_API_KEY=<from aistudio.google.com>
GEMINI_MODEL=gemini-2.5-flash

# Optional: Ollama (local)
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5:3b

# Optional: OpenAI (paid)
OPENAI_API_KEY=<key>
OPENAI_MODEL=gpt-4o-mini

# Optional: Groq (FREE - https://console.groq.com)
GROQ_API_KEY=<key>
GROQ_MODEL=llama-3.3-70b-versatile

# Optional: Together AI (https://api.together.xyz)
TOGETHER_API_KEY=<key>
TOGETHER_MODEL=meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo

# Optional: OpenRouter (https://openrouter.ai)
OPENROUTER_API_KEY=<key>
OPENROUTER_MODEL=meta-llama/llama-3.2-3b-instruct:free

# Optional: Firebase Phone OTP
FIREBASE_SERVICE_ACCOUNT_BASE64=<base64 JSON>

# Optional: Google Forms integration
GOOGLE_FORM_TEMPLATE_ID=<form ID>
```

### Frontend (`frontend/.env.local`)

```bash
NEXT_PUBLIC_API_URL=http://localhost:8000   # or your Render backend URL

# Firebase (only if using phone OTP)
NEXT_PUBLIC_FIREBASE_API_KEY=<key>
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=<project>.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=<project-id>
NEXT_PUBLIC_FIREBASE_APP_ID=<app-id>
```

---

## Naming Conventions

### TypeScript / React
- **Variables/Functions**: `camelCase` — `fetchShifts`, `handleSubmit`
- **Components/Classes**: `PascalCase` — `HistoryPage`, `ShiftCard`
- **Constants**: `UPPER_SNAKE_CASE` — `SHIFT_COLORS`, `SHIFT_TYPE_CONFIG`
- **Component files**: `PascalCase.tsx`; utilities: `camelCase.ts`; pages: `page.tsx`

### Python
- **Variables/Functions**: `snake_case` — `get_shifts`, `assign_employee`
- **Classes**: `PascalCase` — `ShiftService`, `AuthMiddleware`
- **Constants**: `UPPER_SNAKE_CASE`

---

## Development Principles

### SOLID
- **Single Responsibility** — each component/module has one reason to change
- **Open/Closed** — open for extension, closed for modification
- **Interface Segregation** — small focused interfaces over large general ones
- **Dependency Inversion** — depend on abstractions (see AI provider factory pattern)

### Error Handling

**TypeScript:** Handle at page boundary; use `react-hot-toast` for user feedback; try/catch all async calls.

**Python:** `HTTPException` with clear status codes; Pydantic validation at boundaries; fail fast.

### Security
- Never commit secrets — use `.env` files (gitignored); see `.env.example` for required keys
- HTTP-only cookies for JWT tokens (XSS prevention)
- CSRF state tokens on OAuth (10-min expiry, one-time use)
- Rate limiting on auth endpoints (slowapi)
- Pydantic validation on all inputs
- CORS restricted to `FRONTEND_URL` in production

---

## Charting (Recharts)

- Always wrap in a sized `<div>` parent; use `<ResponsiveContainer width="100%" height="100%">`
- **Right-side legends**: use a custom HTML element **outside** `ResponsiveContainer` — Recharts `<Legend align="right">` is unreliable inside `ResponsiveContainer` with dual Y-axes
- **Synchronized multi-pane charts**: use matching `syncId` prop on sibling `<BarChart>` / `<LineChart>`
- **Multi-line SVG labels**: SVG `<text>` ignores `\n` — use `<tspan x={x} dy="1.2em">` elements
- **Center labels on pie/donut**: use an absolutely-positioned `<div>` overlay — Recharts `<Label>` is invisible on dark backgrounds
- **Scrollable custom tooltips**: add `wrapperStyle={{ pointerEvents: 'auto' }}` to `<Tooltip>` to allow scroll inside the pane

---

## Testing

### Backend (pytest)
```bash
cd backend && uv run python -m pytest tests/ -v
cd backend && uv run python -m pytest --cov=app
```
Test files: `tests/test_auth.py`, `test_assignments.py`, `test_employees.py`, `test_forms.py`, `test_history.py`, `test_exchanges.py`, `test_chat.py`, `test_utils.py`

### Frontend (Jest)
```bash
cd frontend && npm test -- --watchAll=false
cd frontend && npm run test:coverage
```

### CI (GitHub Actions)
- Trigger: push to `main`/`develop`, PR to `main`
- Jobs: backend tests (Python 3.12, uv), frontend tests + TypeScript check (Node 20), Docker build check

---

## API Documentation

- Swagger UI: `http://localhost:8000/api/docs`
- ReDoc: `http://localhost:8000/api/redoc`

---

## MCP Servers

### Playwright MCP
Configured for browser automation and visual verification:
- Use `browser_snapshot` for accessibility-tree-based actions
- Use `browser_take_screenshot` for visual verification after code changes
- Always wait for page load / HMR rebuild before screenshotting
- If stale build: run `docker compose restart frontend`, then reload the page

---

## Keeping This File Updated

Update this file when:
- Adding new pages, routes, or major components
- Changing architecture or data flow
- Adding new API endpoints or services
- Adding new tools, integrations, or dev commands
- Discovering patterns worth standardizing

When in doubt, document it here rather than relying on tribal knowledge.
