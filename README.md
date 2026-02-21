# ECT Shift Assignment App

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Python 3.11+](https://img.shields.io/badge/Python-3.11+-green.svg)](https://python.org)
[![Next.js 14](https://img.shields.io/badge/Next.js-14-black.svg)](https://nextjs.org)

A full-stack web application for managing shift assignments in medical departments (ECT, Internal Medicine, and ER). Features AI-powered scheduling, fair distribution tracking, shift exchange requests, and multilingual (Hebrew/English) support.

## Features

- **Smart Scheduling** -- Backtracking algorithm ensures fair shift distribution with constraint satisfaction
- **Multi-Shift Types** -- Supports ECT, Internal Medicine, and ER shift configurations
- **AI Chat Assistant** -- Query schedules and data using natural language (Gemini, Ollama, or OpenAI-compatible)
- **Shift Exchange** -- Real-time WebSocket notifications for swap requests between employees
- **History & Fairness** -- Visual analytics tracking distribution equity over time
- **Google OAuth** -- Secure authentication with role-based access control (admin, basic, employee)
- **Calendar Export** -- Generate color-coded HTML calendars for distribution
- **Hebrew Support** -- Full RTL multilingual name translation and matching
- **Google Forms** -- Auto-generate availability collection forms

## Quick Start

Choose your installation method:

| Method | Best For | Guide |
|--------|----------|-------|
| **Local Development** | Contributing, customizing | [docs/INSTALLATION.md](docs/INSTALLATION.md#local-development) |
| **Docker** | Easy local deployment | [docs/INSTALLATION.md](docs/INSTALLATION.md#docker) |
| **Free Cloud** (Render + Vercel) | Production, zero cost | [DEPLOYMENT.md](DEPLOYMENT.md) |

### Minimal Local Setup

```bash
# Backend
cd backend && cp .env.example .env   # edit .env with your keys
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Frontend (separate terminal)
cd frontend && cp .env.example .env.local
npm install && npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to use the app. API docs at [http://localhost:8000/api/docs](http://localhost:8000/api/docs).

## Architecture

```
+-------------------+     +-------------------+     +----------------+
|   Next.js 14      |---->|   FastAPI          |---->|  JSON Files    |
|   (Frontend)      |<----|   (Backend)        |<----|  (Storage)     |
|   Port: 3000      |     |   Port: 8000       |     |  /data/        |
+-------------------+     +---------+----------+     +----------------+
                                    |
                    +---------------+---------------+
                    v               v               v
              +-----------+  +-----------+  +---------------+
              | Google    |  |  Gemini   |  |   Firebase    |
              |  OAuth    |  |   API     |  |  (Phone OTP)  |
              +-----------+  +-----------+  +---------------+
```

**Stack:** FastAPI + Next.js 14 + TailwindCSS + JSON Storage + Google Gemini AI

## Prerequisites

- Python 3.11+
- Node.js 20+
- Google Cloud account (for OAuth -- [setup guide](docs/INSTALLATION.md#google-oauth-setup))
- Google Gemini API key -- [free at aistudio.google.com](https://aistudio.google.com)

## Documentation

| Document | Description |
|----------|-------------|
| [docs/INSTALLATION.md](docs/INSTALLATION.md) | Complete setup guide (local, Docker, cloud) |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design and data flow |
| [docs/TESTING.md](docs/TESTING.md) | Running and writing tests |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Free cloud deployment guide (Render + Vercel) |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to contribute |
| [SECURITY.md](SECURITY.md) | Security policy and reporting |
| [CHANGELOG.md](CHANGELOG.md) | Version history |

## Required Environment Variables

See [backend/.env.example](backend/.env.example) and [frontend/.env.example](frontend/.env.example) for complete configuration.

Minimum required:

```bash
# Backend (.env)
SECRET_KEY=...           # 32+ char random string
GOOGLE_CLIENT_ID=...     # Google OAuth client ID
GOOGLE_CLIENT_SECRET=... # Google OAuth client secret
GEMINI_API_KEY=...       # Google Gemini API key (free)
FRONTEND_URL=...         # Your frontend URL
ADMIN_EMAILS=...         # Comma-separated admin emails

# Frontend (.env.local)
NEXT_PUBLIC_API_URL=...  # Backend URL (http://localhost:8000 for local dev)
```

## Project Structure

```
ECT/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI application entry point
│   │   ├── config.py            # Pydantic settings (env vars)
│   │   ├── constants.py         # Shift type configurations
│   │   ├── storage.py           # JSON file storage layer
│   │   ├── audit.py             # Audit logging
│   │   ├── routers/             # API endpoint handlers
│   │   │   ├── auth.py          # OAuth login, JWT refresh, logout
│   │   │   ├── forms.py         # Form CRUD and date generation
│   │   │   ├── assignments.py   # CSV parsing and shift generation
│   │   │   ├── employees.py     # Employee CRUD, merge, translate
│   │   │   ├── history.py       # Historical data and fairness
│   │   │   ├── chat.py          # AI chat endpoint
│   │   │   ├── exchanges.py     # Shift exchange requests + WebSocket
│   │   │   ├── google_forms.py  # Google Forms integration
│   │   │   └── github.py        # GitHub integration (placeholder)
│   │   ├── services/            # Business logic
│   │   │   ├── scheduler.py     # Backtracking shift assignment algorithm
│   │   │   ├── auth_service.py  # JWT tokens, OAuth verification
│   │   │   ├── chat_service.py  # Multi-provider AI chat
│   │   │   ├── ws_manager.py    # WebSocket connection manager
│   │   │   ├── csv_parser.py    # Google Sheets CSV parser
│   │   │   ├── calendar_gen.py  # HTML calendar generation
│   │   │   └── exchange_service.py
│   │   ├── schemas/             # Pydantic request/response models
│   │   └── utils/               # Date utilities, name translator
│   ├── tests/                   # pytest test suite
│   ├── data/                    # JSON data files (gitignored)
│   └── requirements.txt
├── frontend/
│   ├── app/                     # Next.js 14 App Router pages
│   │   ├── page.tsx             # Landing page
│   │   ├── login/               # OAuth login page
│   │   ├── chat/                # AI chat assistant
│   │   ├── forms/               # Form generation
│   │   ├── assignments/         # Shift assignment generation
│   │   ├── employees/           # Employee management
│   │   ├── history/             # History and fairness analytics
│   │   ├── shift-exchange/      # Shift swap requests
│   │   └── profile/             # User profile
│   ├── components/              # Reusable React components
│   ├── lib/                     # API client, stores, utilities
│   └── package.json
├── docker-compose.yaml          # Development Docker setup
├── docker-compose.prod.yaml     # Production Docker setup
├── DEPLOYMENT.md                # Free cloud deployment guide
└── README.md
```

## API Endpoints

### Authentication
- `GET /api/auth/login` -- Initiate Google OAuth flow
- `GET /api/auth/callback` -- OAuth callback handler
- `POST /api/auth/refresh` -- Refresh JWT tokens
- `POST /api/auth/logout` -- Invalidate session

### Forms
- `GET /api/forms` -- List all forms
- `POST /api/forms/create` -- Create form configuration
- `POST /api/forms/generate-dates` -- Preview dates for a month

### Assignments
- `GET /api/assignments` -- List assignments
- `POST /api/assignments/parse-csv` -- Parse Google Sheets CSV data
- `POST /api/assignments/generate` -- Generate shift assignments
- `GET /api/assignments/{month_year}/calendar` -- Get HTML calendar

### Employees
- `GET /api/employees` -- List employees
- `POST /api/employees` -- Create employee
- `PUT /api/employees/{id}` -- Update employee
- `DELETE /api/employees/{id}` -- Deactivate employee

### History
- `GET /api/history` -- Get history summary
- `GET /api/history/fairness` -- Get fairness metrics

### AI Chat
- `GET /api/chat/health` -- Check AI provider status
- `POST /api/chat` -- Send message to AI assistant

### Shift Exchange
- `GET /api/exchanges` -- List exchange requests
- `POST /api/exchanges` -- Create exchange request
- `WS /api/exchanges/ws/{employee_id}` -- Real-time exchange notifications

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) and follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

MIT License -- see [LICENSE](LICENSE) for details.
