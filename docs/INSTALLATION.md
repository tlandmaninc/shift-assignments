# Installation Guide

This guide covers three ways to set up the ECT Shift Assignment App:

1. [Local Development](#local-development) -- for contributing and customizing
2. [Docker](#docker) -- for easy local deployment
3. [Free Cloud Deployment](#free-cloud-deployment) -- for production use at zero cost

---

## Local Development

### Prerequisites

Before starting, verify you have the following installed:

```bash
python3 --version   # 3.11 or higher
node --version      # 20.x or higher
npm --version       # 9.x or higher
git --version       # any recent version
```

If you need to install these:
- **Python**: [python.org/downloads](https://python.org/downloads)
- **Node.js**: [nodejs.org](https://nodejs.org) (LTS recommended)
- **Git**: [git-scm.com/downloads](https://git-scm.com/downloads)

### Step 1: Clone the Repository

```bash
git clone https://github.com/YOUR_USERNAME/ect-shift-assignment.git
cd ect-shift-assignment
```

### Step 2: Backend Setup

Open a terminal and run:

```bash
cd backend

# Create and activate a Python virtual environment
python3 -m venv venv
source venv/bin/activate        # Linux / macOS
# venv\Scripts\activate         # Windows CMD
# venv\Scripts\Activate.ps1     # Windows PowerShell

# Install Python dependencies
pip install -r requirements.txt
```

#### Configure Backend Environment

```bash
cp .env.example .env
```

Open `backend/.env` in your editor and fill in the required values:

| Variable | Required | Description | How to Get |
|----------|----------|-------------|------------|
| `SECRET_KEY` | Yes | Random string, 32+ characters | Run: `python -c "import secrets; print(secrets.token_urlsafe(32))"` |
| `ENVIRONMENT` | Yes | Set to `development` for local | Use `development` |
| `ADMIN_EMAILS` | Yes | Comma-separated admin emails | Your email address |
| `FRONTEND_URL` | Yes | Frontend URL | `http://localhost:3000` |
| `AI_PROVIDER` | Yes | AI backend to use | `gemini` (recommended) |
| `GEMINI_API_KEY` | Yes* | Gemini API key | Free at [aistudio.google.com](https://aistudio.google.com/app/apikey) |
| `GOOGLE_CLIENT_ID` | No** | OAuth client ID | See [Google OAuth Setup](#google-oauth-setup) |
| `GOOGLE_CLIENT_SECRET` | No** | OAuth client secret | See [Google OAuth Setup](#google-oauth-setup) |

*Required if using Gemini as AI provider.
**Required for Google login. The app works without OAuth but authentication will be unavailable.

#### Start the Backend

```bash
uvicorn app.main:app --reload --port 8000
```

Verify it works:
- Open [http://localhost:8000](http://localhost:8000) -- should show the API info JSON
- Open [http://localhost:8000/api/docs](http://localhost:8000/api/docs) -- interactive API documentation
- Open [http://localhost:8000/health](http://localhost:8000/health) -- should return `{"status": "healthy"}`

### Step 3: Frontend Setup

Open a **separate terminal** and run:

```bash
cd frontend

# Install Node.js dependencies
npm install
```

#### Configure Frontend Environment

```bash
cp .env.example .env.local
```

Open `frontend/.env.local` and set:

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_API_URL` | Yes | Backend URL: `http://localhost:8000` |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | No | Only if using phone OTP auth |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | No | Only if using phone OTP auth |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | No | Only if using phone OTP auth |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | No | Only if using phone OTP auth |

#### Start the Frontend

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to use the application.

### Step 4: Verify Everything Works

1. Open [http://localhost:3000](http://localhost:3000) -- the app should load
2. Navigate to the Chat page -- AI chat should respond (if Gemini key is configured)
3. Navigate to Forms -- you should be able to create a form configuration
4. Check [http://localhost:8000/api/chat/health](http://localhost:8000/api/chat/health) -- should show AI provider status

---

## Docker

Docker is the easiest way to run the entire stack locally.

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running

### Step 1: Clone and Configure

```bash
git clone https://github.com/YOUR_USERNAME/ect-shift-assignment.git
cd ect-shift-assignment

# Create backend environment file
cp backend/.env.example backend/.env
```

Edit `backend/.env` with your values. At minimum, set:

```bash
SECRET_KEY=your-random-32-character-secret-key-here
ENVIRONMENT=development
FRONTEND_URL=http://localhost:3000
AI_PROVIDER=gemini
GEMINI_API_KEY=your-gemini-api-key
ADMIN_EMAILS=your-email@example.com
```

### Step 2: Build and Run

```bash
docker compose up --build
```

This will:
1. Build the backend (Python/FastAPI) container
2. Build the frontend (Next.js) container
3. Start both services with health checks
4. Mount `backend/data/` for persistent storage

### Step 3: Access the Application

- **Frontend**: [http://localhost:3000](http://localhost:3000)
- **Backend API**: [http://localhost:8000](http://localhost:8000)
- **API Docs**: [http://localhost:8000/api/docs](http://localhost:8000/api/docs)

### Docker Commands Reference

```bash
# Start in background
docker compose up -d

# View logs
docker compose logs -f

# View logs for a specific service
docker compose logs -f backend

# Stop
docker compose down

# Rebuild after code changes
docker compose up --build

# Production mode
docker compose -f docker-compose.prod.yaml up --build -d
```

### Data Persistence

Backend data is stored in `backend/data/` which is mounted as a volume. Your data persists across container restarts. To reset all data, delete the contents of `backend/data/`.

---

## Free Cloud Deployment

Deploy the app to the internet for **$0/month** using Render (backend) and Vercel (frontend).

For the complete cloud deployment guide with detailed step-by-step instructions, see **[DEPLOYMENT.md](../DEPLOYMENT.md)**.

Below is a condensed overview.

### What You Need

| Service | Purpose | Cost | Sign Up |
|---------|---------|------|---------|
| [GitHub](https://github.com) | Code hosting | Free | [github.com/signup](https://github.com/signup) |
| [Render](https://render.com) | Backend hosting | Free tier | [dashboard.render.com/register](https://dashboard.render.com/register) |
| [Vercel](https://vercel.com) | Frontend hosting | Free tier | [vercel.com/signup](https://vercel.com/signup) |
| [Google AI Studio](https://aistudio.google.com) | Gemini API key | Free | [aistudio.google.com](https://aistudio.google.com/app/apikey) |
| [Google Cloud](https://console.cloud.google.com) | OAuth credentials | Free | [console.cloud.google.com](https://console.cloud.google.com) |

### Quick Overview

**Step 1:** Push your code to GitHub.

**Step 2:** Deploy the backend to Render:
- Create a new Web Service pointing to your GitHub repo
- Set root directory to `backend`, runtime to Python 3
- Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- Add all environment variables from `backend/.env.example`

**Step 3:** Deploy the frontend to Vercel:
- Import your GitHub repo
- Set root directory to `frontend`
- Add env var: `NEXT_PUBLIC_API_URL` = your Render backend URL

**Step 4:** Update `FRONTEND_URL` in Render to your actual Vercel URL.

**Step 5:** Configure Google OAuth redirect URIs to include your deployed URLs.

See [DEPLOYMENT.md](../DEPLOYMENT.md) for the full walkthrough with screenshots and troubleshooting.

---

## Google OAuth Setup

Google OAuth is needed for user authentication (login with Google).

### Step 1: Create a Google Cloud Project

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Click the project dropdown at the top and select **New Project**
3. Name it (e.g., "ECT Shift App") and click **Create**
4. Select the newly created project

### Step 2: Configure OAuth Consent Screen

1. Navigate to **APIs & Services** > **OAuth consent screen**
2. Select **External** user type and click **Create**
3. Fill in:
   - **App name**: ECT Shift Assignment
   - **User support email**: your email
   - **Developer contact**: your email
4. Click **Save and Continue** through the remaining steps
5. Under **Test users**, add the email addresses that should be allowed to log in

### Step 3: Create OAuth Credentials

1. Navigate to **APIs & Services** > **Credentials**
2. Click **Create Credentials** > **OAuth client ID**
3. Select **Web application**
4. Set the name (e.g., "ECT Web Client")
5. Under **Authorized JavaScript origins**, add:
   - `http://localhost:3000` (for local development)
   - Your Vercel URL (for production, e.g., `https://your-app.vercel.app`)
6. Under **Authorized redirect URIs**, add:
   - `http://localhost:8000/api/google/callback` (for local development)
   - Your Render URL callback (for production, e.g., `https://your-backend.onrender.com/api/google/callback`)
7. Click **Create**
8. Copy the **Client ID** and **Client Secret** into your `.env` file

### Step 4: Set Environment Variables

```bash
# In backend/.env
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
```

---

## Troubleshooting

### Backend won't start

- **"SECRET_KEY must be changed from default value"**: Generate a real secret key:
  ```bash
  python -c "import secrets; print(secrets.token_urlsafe(32))"
  ```
- **ModuleNotFoundError**: Make sure you activated the virtual environment and ran `pip install -r requirements.txt`
- **Port already in use**: Another process is using port 8000. Stop it or use a different port:
  ```bash
  uvicorn app.main:app --reload --port 8001
  ```

### Frontend won't start

- **Module not found errors**: Run `npm install` again
- **NEXT_PUBLIC_API_URL not working**: Make sure the variable is in `.env.local` (not `.env`) and restart the dev server. Next.js only reads env files at startup.

### CORS errors in browser

- Check that `FRONTEND_URL` in the backend `.env` exactly matches the URL in your browser (including `http://` or `https://`, no trailing slash)
- For local development, `FRONTEND_URL` should be `http://localhost:3000`

### AI Chat not responding

1. Check [http://localhost:8000/api/chat/health](http://localhost:8000/api/chat/health)
2. Verify `AI_PROVIDER` and `GEMINI_API_KEY` are set correctly
3. The Gemini free tier has rate limits. If you get 429 errors, wait a minute and try again.

### Docker issues

- **Container won't build**: Make sure Docker Desktop is running
- **Backend unhealthy**: Check logs with `docker compose logs backend`
- **Frontend can't reach backend**: The frontend uses `NEXT_PUBLIC_API_URL=http://localhost:8000` to make client-side requests. Make sure port 8000 is published.
