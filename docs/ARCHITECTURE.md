# Architecture

This document describes the system design of the ECT Shift Assignment App.

## System Overview

```
┌──────────────────┐      ┌──────────────────┐      ┌────────────────┐
│   Next.js 14     │ HTTP │   FastAPI         │      │  JSON Files    │
│   React 18       │─────>│   Python 3.12     │─────>│  /backend/data │
│   TailwindCSS    │<─────│   Uvicorn ASGI    │<─────│                │
│   Port 3000      │      │   Port 8000       │      │  employees     │
└──────────────────┘      └────────┬──────────┘      │  forms         │
                                   │                  │  history       │
                    ┌──────────────┼──────────────┐   │  assignments   │
                    │              │              │    │  users         │
                    v              v              v    │  exchanges     │
              ┌──────────┐  ┌──────────┐  ┌─────────┐│  chat_history  │
              │ Google   │  │ AI       │  │Firebase ││  audit.log     │
              │ OAuth 2  │  │ Providers│  │Phone OTP│└────────────────┘
              └──────────┘  └──────────┘  └─────────┘
```

## Frontend

### Technology

| Component | Technology |
|-----------|-----------|
| Framework | Next.js 14 (App Router) |
| UI | React 18 + TailwindCSS |
| State | Zustand stores |
| Animation | Framer Motion |
| Charts | Recharts |
| Icons | Lucide React |
| Auth Client | Firebase SDK (phone OTP) |

### Page Structure

```
app/
├── page.tsx              # Home / dashboard
├── layout.tsx            # Root layout with AuthProvider
├── login/                # Google OAuth login
├── profile/              # User profile
├── unauthorized/         # 403 page
├── forms/                # Form generation
├── assignments/          # Shift assignment (admin)
├── employees/            # Employee management (admin)
├── history/              # History and fairness charts
├── shift-exchange/       # Shift swap requests
├── chat/                 # AI chat assistant
└── api/                  # Next.js API proxy routes
```

### Key Patterns

- **Auth Context** (`contexts/AuthContext.tsx`): Wraps the app with user state, auto-refreshes JWT tokens on 401.
- **Middleware** (`middleware.ts`): Checks for `ect_access_token` cookie on protected routes, redirects to `/login` if missing.
- **API Client** (`lib/api.ts`): Centralized fetch wrapper with `credentials: 'include'` for cookie-based auth.
- **Zustand Stores** (`lib/stores/`): Client-side state for forms, assignments, and chat.

## Backend

### Technology

| Component | Technology |
|-----------|-----------|
| Framework | FastAPI 0.109 |
| Server | Uvicorn (ASGI) |
| Validation | Pydantic v2 |
| Data Processing | Pandas, NumPy |
| Auth | PyJWT, google-auth |
| Rate Limiting | slowapi |
| Templates | Jinja2 (calendar HTML) |

### Module Structure

```
app/
├── main.py               # FastAPI app, CORS, middleware, router mounting
├── config.py             # Pydantic Settings (env var loading)
├── storage.py            # JSON file read/write with file locking
├── constants.py          # Shift type configs (ECT, Internal, ER)
├── audit.py              # Audit logging service
├── routers/              # API endpoint handlers
│   ├── auth.py           # Google OAuth + JWT endpoints
│   ├── assignments.py    # Shift generation and calendar export
│   ├── employees.py      # Employee CRUD + merge + translate
│   ├── forms.py          # Form creation and date generation
│   ├── history.py        # Historical data and fairness metrics
│   ├── exchanges.py      # Shift exchange + WebSocket
│   ├── chat.py           # AI chat with SSE streaming
│   ├── google_forms.py   # Google Forms API integration
│   └── github.py         # GitHub integration (placeholder)
├── schemas/              # Pydantic request/response models
├── services/             # Business logic layer
│   ├── auth_service.py   # JWT creation, OAuth flow, role checks
│   ├── scheduler.py      # Backtracking scheduling algorithm
│   ├── chat_service.py   # Chat orchestration
│   ├── exchange_service.py
│   ├── firebase_service.py
│   ├── email_service.py
│   ├── ws_manager.py     # WebSocket connection manager
│   ├── calendar_*.py     # Calendar generation services
│   ├── csv_parser.py     # Google Forms CSV parsing
│   └── ai_providers/     # Pluggable AI provider abstraction
│       ├── base.py       # Abstract AIProvider interface
│       ├── factory.py    # Provider factory (reads AI_PROVIDER env)
│       ├── gemini.py     # Google Gemini (recommended, free tier)
│       ├── ollama.py     # Local Ollama (offline)
│       └── openai.py     # OpenAI-compatible (Groq, Together, etc.)
└── utils/                # Shared utilities
    ├── date_utils.py     # Date parsing and formatting
    └── name_translator.py # Hebrew/English name translation
```

### Key Patterns

- **Router-Service-Schema separation**: Routers handle HTTP, services contain business logic, schemas validate data.
- **Dependency injection**: FastAPI `Depends()` for auth (`require_admin`, `require_employee`).
- **JSON storage**: `storage.py` provides `load_json()` / `save_json()` with atomic writes. No SQL database needed.
- **AI Provider abstraction**: Factory pattern selects provider from `AI_PROVIDER` env var. All providers implement the same `AIProvider` base class.

## Authentication Flow

```
1. User clicks "Login with Google"
   │
2. Frontend → POST /auth/google/login
   │  Backend generates CSRF state token (10-min expiry)
   │  Returns Google OAuth authorization URL
   │
3. Frontend redirects to Google consent screen
   │
4. Google redirects → /auth/google/callback?code=...&state=...
   │  Backend validates state token (CSRF protection)
   │  Exchanges code for Google tokens
   │  Verifies Google ID token
   │  Creates/updates user in users.json
   │  Determines role:
   │    - Email in ADMIN_EMAILS env → admin
   │    - Linked employee record   → employee
   │    - Otherwise                → basic
   │
5. Backend issues JWT tokens as HTTP-only cookies:
   │  - ect_access_token (short-lived)
   │  - ect_refresh_token (long-lived)
   │
6. Subsequent requests include cookies automatically
   │  Backend validates JWT on protected endpoints
   │  401 → Frontend auto-refreshes via POST /auth/refresh
```

## Data Storage

### Why JSON Files (Not SQL)?

- **Zero infrastructure**: No database server to manage or pay for.
- **Portable**: Data is human-readable and easily backed up.
- **Sufficient scale**: Designed for single-department use (~20-50 employees). JSON handles this efficiently.
- **Simple deployment**: No database migrations, connection strings, or hosting costs.

### File Structure

```
backend/data/
├── employees.json        # Employee registry
├── forms.json            # Form configurations
├── history.json          # Historical assignment records
├── users.json            # User accounts and auth state
├── exchanges.json        # Shift exchange requests
├── chat_history.json     # AI chat conversations
├── audit.log             # Structured audit trail
├── google_token.json     # Google OAuth tokens (service)
└── assignments/          # Generated assignments
    └── {YYYY}/
        └── {MM}/
            ├── assignments.json
            └── calendar.html
```

### Concurrency

`storage.py` uses file-based locking for atomic reads/writes. This is safe for single-server deployments. For multi-server, a shared database would be needed.

## Scheduling Algorithm

The shift scheduler (`services/scheduler.py`) uses a **backtracking algorithm with constraint satisfaction**:

### Hard Constraints (must satisfy)
- Employee cannot work on dates they marked unavailable
- Maximum shifts per employee per period
- No back-to-back shifts (configurable gap)
- Slot limits per shift type (e.g., ER needs 2 employees)

### Soft Constraints (optimization targets)
- **Fair distribution**: Minimize standard deviation of shift counts across employees
- **Historical balance**: Factor in past months' assignment counts
- **New employee consideration**: Reduced load for employees in first 2 weeks
- **Weekend/holiday balance**: Even distribution of undesirable shifts

### Algorithm
1. Sort dates by constraint difficulty (most constrained first)
2. For each date, try assigning eligible employees
3. If assignment violates constraints, backtrack and try alternatives
4. Score final assignment by fairness metrics
5. Return best solution found within iteration limit

## AI Chat Integration

```
User Message
    │
    v
POST /chat/stream (SSE)
    │
    v
chat_service.py
    │  - Loads relevant context (employees, schedules, history)
    │  - Constructs system prompt with department data
    │  - Selects AI provider from factory
    │
    v
ai_providers/factory.py → provider instance
    │
    ├── gemini.py  → Google Gemini API (free: 15 RPM, 1M tokens/min)
    ├── ollama.py  → Local Ollama server (free, offline, private)
    └── openai.py  → Groq/Together/OpenRouter (OpenAI-compatible)
    │
    v
Streaming response via Server-Sent Events (SSE)
    │
    v
Frontend renders tokens in real-time
```

**Fallback**: If Gemini daily quota is exhausted, automatically falls back to alternative models (configurable).

## WebSocket (Shift Exchange)

The shift exchange feature uses WebSocket for real-time notifications:

```
Employee A creates exchange request
    │
    v
POST /exchanges → saved to exchanges.json
    │
    v
ws_manager.py broadcasts to connected clients
    │
    v
Employee B receives real-time notification
    │
    v
Employee B approves/rejects via POST /exchanges/{id}/approve
    │
    v
ws_manager.py notifies Employee A of the decision
```

## Security Layers

| Layer | Implementation |
|-------|---------------|
| Authentication | Google OAuth 2.0 + JWT tokens in HTTP-only cookies |
| Authorization | Role-based (admin/employee/basic) via decorators |
| CSRF Protection | OAuth state tokens with 10-minute expiry |
| Rate Limiting | slowapi on all endpoints |
| Input Validation | Pydantic models + path traversal checks |
| Security Headers | X-Frame-Options, HSTS, X-Content-Type-Options |
| Audit Trail | All sensitive operations logged to audit.log |
| CORS | Restricted to FRONTEND_URL in production |

## Deployment Architecture

### Free Tier (Recommended)

```
┌─────────────┐    ┌───────────────┐    ┌──────────────┐
│   Vercel     │───>│   Render.com  │───>│  Google      │
│   (Frontend) │    │   (Backend)   │    │  Gemini API  │
│   Free tier  │    │   Free tier   │    │  Free tier   │
└─────────────┘    └───────────────┘    └──────────────┘
```

### Docker (Self-hosted)

```
docker-compose.yaml (dev)         docker-compose.prod.yaml (prod)
├── backend  (hot-reload)         ├── backend  (optimized, resource limits)
├── frontend (hot-reload)         ├── frontend (built, static)
└── volumes  (live code)          └── volumes  (data persistence only)
```

See [INSTALLATION.md](INSTALLATION.md) for complete setup instructions.
