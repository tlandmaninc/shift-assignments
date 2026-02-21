# Changelog

All notable changes to the ECT Shift Assignment App will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

- No unreleased changes yet.

## [1.0.0] - 2025-12-01

### Added

- **Shift Scheduling Engine** — Backtracking algorithm with hard/soft constraint satisfaction for fair automated shift assignment.
- **Multi-Shift Type Support** — ECT, Internal Medicine, and ER shift configurations with independent scheduling.
- **AI Chat Assistant** — Multi-provider support (Google Gemini, Ollama, OpenAI-compatible) with streaming responses and automatic model fallback on quota exhaustion.
- **Shift Exchange System** — Employee-to-employee swap requests with real-time WebSocket notifications and approval workflows.
- **History and Fairness Analytics** — Monthly distribution tracking with fairness scoring, charts (Recharts), and employee statistics.
- **Google OAuth Authentication** — Secure login with JWT tokens, role-based access control (admin, employee, basic), and HTTP-only cookies.
- **Phone OTP Verification** — Firebase-based phone number authentication as secondary auth method.
- **Employee Management** — CRUD operations, duplicate detection and merging, Hebrew-English name translation.
- **Google Forms Integration** — Auto-generate availability collection forms and fetch responses via Google Forms API.
- **Calendar Export** — Color-coded HTML calendar generation with employee color assignments.
- **Form Generator** — Configurable date selection with weekend/Tuesday exclusion and custom date ranges.
- **Audit Logging** — Structured audit trail for all sensitive operations (merges, auth events, data changes).
- **Rate Limiting** — slowapi-based request throttling to prevent abuse.
- **Security Headers** — X-Content-Type-Options, X-Frame-Options, HSTS, Referrer-Policy on all responses.
- **Docker Support** — Dockerfiles for both backend and frontend, docker-compose for local dev and production.
- **CI/CD Pipeline** — GitHub Actions workflow for automated testing (pytest + Jest) and Docker build validation.
- **Comprehensive Test Suite** — Backend pytest tests and frontend Jest tests with pre-push hook enforcement.
- **Hebrew/RTL Support** — Full multilingual name translation, matching, and display.
