# ECT Shift Assignment Web App

A modern web application for managing ECT shift assignments with automated scheduling, beautiful calendar visualizations, and fair shift distribution tracking.

## Features

- **Form Generation**: Create monthly availability forms with customizable date exclusions (Fridays/Saturdays always excluded, Tuesdays excluded by default with toggle)
- **Shift Assignment**: Automated scheduling using a backtracking algorithm with constraints:
  - Max 2 shifts per employee per month
  - Max 1 shift per ISO week
  - No consecutive day assignments
  - New employees only scheduled in last 2 weeks
  - Fair distribution based on historical data
- **Beautiful Calendars**: Generate visually appealing HTML calendars with employee color coding
- **History Tracking**: Track assignment history and fairness metrics over time
- **Employee Management**: Manage employee records and view individual statistics

## Tech Stack

- **Backend**: FastAPI (Python)
- **Frontend**: Next.js 14 + TailwindCSS + Framer Motion
- **AI Chat**: Multi-provider support (Gemini, Ollama, Groq, OpenAI-compatible)
- **Storage**: JSON files (no database required)

## Free Deployment

Deploy this app for **$0/month** using Vercel + Render + Gemini AI.

**Quick deploy:**

1. Get free [Gemini API key](https://aistudio.google.com/app/apikey)
2. Deploy backend to [Render](https://render.com) (free tier)
3. Deploy frontend to [Vercel](https://vercel.com) (free tier)

See **[DEPLOYMENT.md](DEPLOYMENT.md)** for complete step-by-step instructions.

## Quick Start

### Backend

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Copy environment file
cp .env.example .env

# Run server
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend

# Install dependencies
npm install

# Run development server
npm run dev
```

The application will be available at:
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/api/docs

## Usage Workflow

### 1. Generate Form Configuration
1. Go to **Generate Form** page
2. Select month and year
3. Toggle "Include Tuesdays" if needed
4. Click dates to manually include/exclude
5. Click **Create Form Configuration**

### 2. Create Google Form (Manual Step)
1. Go to [Google Forms](https://forms.google.com)
2. Create a new form with:
   - Title: "[Month] [Year] Shift Assignment"
   - Question 1: "Employee Name" (Short answer, required)
   - Question 2: "Is this your first month doing ECT?" (Yes/No radio, required)
   - For each date: "Availability on [Date] ([Day])" (Available/Not Available radio, required)

### 3. Generate Assignments
1. Collect responses in Google Forms
2. Open responses in Google Sheets
3. Copy all data (Ctrl+A, Ctrl+C)
4. Go to **Assignments** page
5. Select the form, paste CSV data
6. Click **Generate Assignments**
7. Export calendar as HTML or JSON

### 4. View History
- Check **History** page for fairness metrics
- Monitor shift distribution across employees

## Project Structure

```
ECT/
├── backend/
│   ├── app/
│   │   ├── main.py           # FastAPI application
│   │   ├── config.py         # Settings
│   │   ├── storage.py        # JSON storage
│   │   ├── routers/          # API endpoints
│   │   ├── services/         # Business logic
│   │   ├── schemas/          # Pydantic models
│   │   └── utils/            # Utilities
│   ├── data/                 # JSON data files
│   └── requirements.txt
├── frontend/
│   ├── app/                  # Next.js pages
│   ├── components/           # React components
│   ├── lib/                  # Utilities & API
│   └── package.json
└── README.md
```

## API Endpoints

### Forms
- `GET /api/forms` - List all forms
- `POST /api/forms/create` - Create form configuration
- `POST /api/forms/generate-dates` - Preview dates for a month

### Assignments
- `GET /api/assignments` - List assignments
- `POST /api/assignments/parse-csv` - Parse CSV data
- `POST /api/assignments/generate` - Generate assignments
- `GET /api/assignments/{month_year}/calendar` - Get HTML calendar

### Employees
- `GET /api/employees` - List employees
- `POST /api/employees` - Create employee
- `PUT /api/employees/{id}` - Update employee
- `DELETE /api/employees/{id}` - Deactivate employee

### History

- `GET /api/history` - Get history summary
- `GET /api/history/fairness` - Get fairness metrics

### AI Chat

- `GET /api/chat/health` - Check AI provider status
- `POST /api/chat` - Send message to AI assistant

### GitHub (Placeholder)

- `GET /api/github/status` - Check GitHub integration status
- `GET /api/github/features` - List available features

## Data Storage

All data is stored in JSON files:
- `data/employees.json` - Employee records
- `data/forms.json` - Form configurations
- `data/history.json` - Assignment history
- `data/assignments/YYYY/MM/` - Monthly assignment data and calendars

## License

MIT
