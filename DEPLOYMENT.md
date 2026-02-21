# Free Deployment Guide

Deploy the ECT Shift Assignment app for **$0/month** using GitHub + Vercel + Render + Gemini AI.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Step 1: Git & GitHub Setup](#step-1-git--github-setup)
3. [Step 2: Deploy Backend to Render](#step-2-deploy-backend-to-render)
4. [Step 3: Deploy Frontend to Vercel](#step-3-deploy-frontend-to-vercel)
5. [Step 4: Connect Frontend & Backend](#step-4-connect-frontend--backend)
6. [Step 5: Verify Deployment](#step-5-verify-deployment)
7. [Troubleshooting](#troubleshooting)
8. [Alternative Options](#alternative-options)

---

## Prerequisites

Before starting, make sure you have:

- [ ] **Git** installed ([Download](https://git-scm.com/downloads))
- [ ] **GitHub account** ([Sign up free](https://github.com/signup))
- [ ] **Gemini API key** ([Get free key](https://aistudio.google.com/app/apikey))
- [ ] **Vercel account** ([Sign up free](https://vercel.com/signup) - use GitHub login)
- [ ] **Render account** ([Sign up free](https://dashboard.render.com/register) - use GitHub login)

---

## Step 1: Git & GitHub Setup

### 1.1 Initialize Git Repository

Open a terminal in your project folder (`c:\CoE\Projects\ECT`) and run:

```bash
# Initialize git repository
git init

# Create .gitignore file
```

### 1.2 Create .gitignore

Create a file named `.gitignore` in the project root with this content:

```gitignore
# Python
__pycache__/
*.py[cod]
*$py.class
*.so
.Python
venv/
ENV/
.env

# Node.js
node_modules/
.next/
out/
.env.local

# IDE
.vscode/
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Data (optional - remove if you want to include sample data)
backend/data/

# Logs
*.log
npm-debug.log*
```

### 1.3 Stage and Commit Files

```bash
# Add all files
git add .

# Create initial commit
git commit -m "Initial commit: ECT Shift Assignment App"
```

### 1.4 Create GitHub Repository

**Option A: Using GitHub CLI (if installed)**
```bash
# Install GitHub CLI if needed: https://cli.github.com/
gh auth login
gh repo create ect-shift-assignment --public --source=. --push
```

**Option B: Using GitHub Website**

1. Go to [github.com/new](https://github.com/new)
2. Fill in:
   - **Repository name**: `ect-shift-assignment` (or your choice)
   - **Description**: "ECT Shift Assignment Web App"
   - **Visibility**: Public (required for free Render/Vercel)
3. Click **Create repository**
4. Follow the instructions shown, or run:

```bash
# Replace YOUR_USERNAME with your GitHub username
git remote add origin https://github.com/YOUR_USERNAME/ect-shift-assignment.git
git branch -M main
git push -u origin main
```

### 1.5 Verify GitHub Repository

1. Go to `https://github.com/YOUR_USERNAME/ect-shift-assignment`
2. You should see all your project files
3. Verify both `backend/` and `frontend/` folders are present

---

## Step 2: Deploy Backend to Render

### 2.1 Create Render Account

1. Go to [dashboard.render.com/register](https://dashboard.render.com/register)
2. Click **GitHub** to sign up with your GitHub account
3. Authorize Render to access your repositories

### 2.2 Create New Web Service

1. Click **New** → **Web Service**
2. Connect your GitHub repository:
   - Find `ect-shift-assignment` in the list
   - Click **Connect**

### 2.3 Configure Build Settings

Fill in the following settings:

| Setting | Value |
|---------|-------|
| **Name** | `ect-backend` (or your choice) |
| **Region** | Select closest to your users |
| **Branch** | `main` |
| **Root Directory** | `backend` |
| **Runtime** | `Python 3` |
| **Build Command** | `pip install uv && uv sync --frozen --no-dev` |
| **Start Command** | `uvicorn app.main:app --host 0.0.0.0 --port $PORT` |
| **Instance Type** | `Free` |

### 2.4 Add Environment Variables

Scroll down to **Environment Variables** and add:

| Key | Value |
|-----|-------|
| `SECRET_KEY` | Click **Generate** to create a random key |
| `ENVIRONMENT` | `production` |
| `AI_PROVIDER` | `gemini` |
| `GEMINI_API_KEY` | Your Gemini API key |
| `GEMINI_MODEL` | `gemini-2.0-flash` |
| `FRONTEND_URL` | `https://placeholder.vercel.app` (update later) |

### 2.5 Deploy

1. Click **Create Web Service**
2. Wait for the build to complete (2-5 minutes)
3. Once deployed, copy your backend URL:
   - It will look like: `https://ect-backend.onrender.com`
   - **Save this URL** - you'll need it for frontend deployment

### 2.6 Verify Backend

Open your backend URL in a browser. You should see:

```json
{
  "name": "ECT Shift Assignment API",
  "version": "1.0.0",
  "docs": "/api/docs"
}
```

Test the health endpoint: `https://YOUR-BACKEND-URL.onrender.com/health`

---

## Step 3: Deploy Frontend to Vercel

### 3.1 Create Vercel Account

1. Go to [vercel.com/signup](https://vercel.com/signup)
2. Click **Continue with GitHub**
3. Authorize Vercel to access your repositories

### 3.2 Import Project

1. Click **Add New...** → **Project**
2. Find `ect-shift-assignment` in the list
3. Click **Import**

### 3.3 Configure Project

| Setting | Value |
|---------|-------|
| **Project Name** | `ect-shift-assignment` (or your choice) |
| **Framework Preset** | `Next.js` (auto-detected) |
| **Root Directory** | Click **Edit** → select `frontend` → **Continue** |

### 3.4 Add Environment Variables

Expand **Environment Variables** and add:

| Key | Value |
|-----|-------|
| `NEXT_PUBLIC_API_URL` | Your Render backend URL (e.g., `https://ect-backend.onrender.com`) |

### 3.5 Deploy

1. Click **Deploy**
2. Wait for the build to complete (1-3 minutes)
3. Once deployed, copy your frontend URL:
   - It will look like: `https://ect-shift-assignment.vercel.app`
   - **Save this URL**

### 3.6 Verify Frontend

Open your Vercel URL in a browser. You should see the ECT app homepage.

---

## Step 4: Connect Frontend & Backend

### 4.1 Update Backend CORS

Now that you have your actual frontend URL, update the backend:

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click on your `ect-backend` service
3. Go to **Environment** tab
4. Find `FRONTEND_URL` and update it:
   - Change from `https://placeholder.vercel.app`
   - To your actual Vercel URL (e.g., `https://ect-shift-assignment.vercel.app`)
5. Click **Save Changes**
6. Render will automatically redeploy

### 4.2 Update Google OAuth (If Using Google Forms)

If you're using Google Forms integration:

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Navigate to **APIs & Services** → **Credentials**
3. Click on your OAuth 2.0 Client ID
4. Update **Authorized redirect URIs**:
   - Add: `https://YOUR-BACKEND-URL.onrender.com/api/google/callback`
5. Click **Save**
6. Update Render environment variables:
   - `GOOGLE_REDIRECT_URI` = `https://YOUR-BACKEND-URL.onrender.com/api/google/callback`

---

## Step 5: Verify Deployment

### 5.1 Test Checklist

- [ ] **Frontend loads**: Visit your Vercel URL
- [ ] **API connection**: Check browser console for CORS errors
- [ ] **Health check**: Visit `https://YOUR-BACKEND.onrender.com/health`
- [ ] **AI chat**: Test the chat feature (should work with Gemini)
- [ ] **API docs**: Visit `https://YOUR-BACKEND.onrender.com/api/docs`

### 5.2 Test AI Integration

```bash
# Test AI health endpoint
curl https://YOUR-BACKEND-URL.onrender.com/api/chat/health
```

Expected response:
```json
{
  "connected": true,
  "model_available": true,
  "model_name": "gemini-2.0-flash",
  "provider": "gemini"
}
```

---

## Troubleshooting

### Backend shows "Service Unavailable"

- **Cause**: Free tier backends sleep after 15 minutes of inactivity
- **Solution**: Wait 30-60 seconds for it to wake up, then refresh

### CORS Errors in Browser Console

- **Cause**: `FRONTEND_URL` doesn't match your actual frontend URL
- **Solution**:
  1. Check Render environment variables
  2. Ensure URL is exact (including `https://`)
  3. No trailing slash

### AI Chat Returns Error

1. Check AI health: `GET /api/chat/health`
2. Verify `GEMINI_API_KEY` is set correctly in Render
3. Ensure `AI_PROVIDER` is set to `gemini`

### Build Fails on Render

1. Check the build logs in Render dashboard
2. Common issues:
   - Missing `pyproject.toml` in backend folder
   - Python version mismatch
   - Wrong root directory setting

### Build Fails on Vercel

1. Check the build logs in Vercel dashboard
2. Common issues:
   - Missing `package.json` in frontend folder
   - Wrong root directory setting
   - TypeScript errors

### Google OAuth Not Working

1. Check redirect URI matches exactly
2. Ensure OAuth consent screen is configured
3. Verify client ID and secret are correct

---

## Alternative Options

### Alternative AI Providers

All free options:

| Provider | Setup | Environment Variables |
|----------|-------|----------------------|
| **Gemini** | [Get Key](https://aistudio.google.com/app/apikey) | `AI_PROVIDER=gemini`, `GEMINI_API_KEY=xxx` |
| **Groq** | [Get Key](https://console.groq.com) | `AI_PROVIDER=groq`, `OPENAI_API_KEY=xxx` |
| **OpenRouter** | [Get Key](https://openrouter.ai) | `AI_PROVIDER=openrouter`, `OPENAI_API_KEY=xxx` |

### Alternative Backend Hosting

| Platform | Free Tier | Deploy Command |
|----------|-----------|----------------|
| **Railway** | $5/month credit | See `railway.toml` |
| **Fly.io** | 3 small VMs | Use `Dockerfile` |
| **Koyeb** | 1 nano instance | Use `Dockerfile` |

### Alternative Frontend Hosting

| Platform | Free Tier | Notes |
|----------|-----------|-------|
| **Netlify** | 100GB bandwidth | Similar to Vercel |
| **Cloudflare Pages** | Unlimited | Very fast CDN |

---

## Environment Variables Reference

### Backend (Render)

| Variable | Required | Description |
|----------|----------|-------------|
| `SECRET_KEY` | Yes | Random 32+ character string |
| `ENVIRONMENT` | Yes | Set to `production` |
| `FRONTEND_URL` | Yes | Your Vercel frontend URL |
| `AI_PROVIDER` | Yes | `gemini` (recommended) |
| `GEMINI_API_KEY` | Yes* | Your Gemini API key |
| `GEMINI_MODEL` | No | Default: `gemini-2.0-flash` |
| `GOOGLE_CLIENT_ID` | No | For Google Forms |
| `GOOGLE_CLIENT_SECRET` | No | For Google Forms |
| `GOOGLE_REDIRECT_URI` | No | OAuth callback URL |
| `GITHUB_TOKEN` | No | For GitHub integration |
| `GITHUB_REPO` | No | For GitHub integration |

*Required if using Gemini as AI provider

### Frontend (Vercel)

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_API_URL` | Yes | Your Render backend URL |

---

## Cost Summary

| Service | Monthly Cost |
|---------|--------------|
| GitHub | Free |
| Vercel (Frontend) | Free |
| Render (Backend) | Free |
| Gemini AI | Free |
| **Total** | **$0/month** |

---

## Next Steps

After successful deployment:

1. **Custom Domain**: Both Vercel and Render support free custom domains
2. **Monitoring**: Use Render's built-in metrics
3. **Upgrades**: Consider Render Starter ($7/month) to prevent sleeping
4. **Backups**: Set up periodic data exports

---

## Quick Reference Card

```
Frontend URL: https://YOUR-APP.vercel.app
Backend URL:  https://YOUR-BACKEND.onrender.com
API Docs:     https://YOUR-BACKEND.onrender.com/api/docs
Health Check: https://YOUR-BACKEND.onrender.com/health
AI Health:    https://YOUR-BACKEND.onrender.com/api/chat/health
```
