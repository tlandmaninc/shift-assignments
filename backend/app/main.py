"""ECT Shift Assignment API - Main FastAPI Application."""

import uuid
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from starlette.middleware.base import BaseHTTPMiddleware
from .config import settings

MAX_REQUEST_BODY_BYTES = 2 * 1024 * 1024  # 2 MB
from .routers import (
    forms_router,
    assignments_router,
    employees_router,
    history_router,
    google_forms_router,
    chat_router,
    github_router,
    auth_router,
    exchanges_router,
    settings_router,
)

# Rate limiter configuration
limiter = Limiter(key_func=get_remote_address)


class RequestBodySizeLimitMiddleware(BaseHTTPMiddleware):
    """Reject requests whose Content-Length exceeds the allowed maximum."""

    async def dispatch(self, request: Request, call_next):
        content_length = request.headers.get("content-length")
        if content_length and int(content_length) > MAX_REQUEST_BODY_BYTES:
            return JSONResponse(
                status_code=413,
                content={"detail": "Request too large"},
            )
        return await call_next(request)


class RequestIDMiddleware(BaseHTTPMiddleware):
    """Attach a unique request ID to every request/response."""

    async def dispatch(self, request: Request, call_next):
        request_id = str(uuid.uuid4())
        request.state.request_id = request_id
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Middleware to add security headers to all responses."""

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = (
            "camera=(), microphone=(), geolocation=(), payment=()"
        )
        if settings.environment == "production":
            response.headers["Content-Security-Policy"] = (
                "default-src 'self'; "
                "script-src 'self' https://www.gstatic.com/recaptcha/"
                " https://www.google.com/recaptcha/; "
                "style-src 'self' 'unsafe-inline'; "
                "img-src 'self' data: https:; "
                "connect-src 'self' wss: ws:"
                " https://identitytoolkit.googleapis.com"
                " https://securetoken.googleapis.com"
                " https://www.googleapis.com"
                " https://firebase.googleapis.com; "
                "frame-src https://www.google.com/recaptcha/"
                " https://*.firebaseapp.com; "
                "frame-ancestors 'none'"
            )
        if settings.environment == "production":
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response

_is_production = settings.environment == "production"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialise PostgreSQL table when DATABASE_URL is configured."""
    if settings.database_url:
        from .db import init_db
        init_db()
    yield


# Create FastAPI app
app = FastAPI(
    title="ECT Shift Assignment API",
    description="API for managing ECT shift assignments, forms, and employee scheduling",
    version="1.0.0",
    lifespan=lifespan,
    docs_url=None if _is_production else "/api/docs",
    redoc_url=None if _is_production else "/api/redoc",
    openapi_url=None if _is_production else "/api/openapi.json",
)

# Configure CORS - hardened configuration
_allowed_origins = [settings.frontend_url]
if settings.environment == "development":
    _allowed_origins.extend(["http://localhost:3000", "http://127.0.0.1:3000"])

# Middleware stack (evaluated bottom-to-top: body size -> request ID -> CORS -> security headers)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Content-Type", "Authorization", "X-API-Key"],
)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RequestIDMiddleware)
app.add_middleware(RequestBodySizeLimitMiddleware)

# Configure rate limiting
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


# Include routers
app.include_router(auth_router, prefix="/api")
app.include_router(forms_router, prefix="/api")
app.include_router(assignments_router, prefix="/api")
app.include_router(employees_router, prefix="/api")
app.include_router(history_router, prefix="/api")
app.include_router(google_forms_router, prefix="/api")
app.include_router(chat_router, prefix="/api")
app.include_router(github_router, prefix="/api")
app.include_router(exchanges_router, prefix="/api")
app.include_router(settings_router, prefix="/api")


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "name": "ECT Shift Assignment API",
        "version": "1.0.0",
        "docs": "/api/docs",
    }


@app.get("/health")
@app.get("/api/health")
async def health_check():
    """Health check endpoint for monitoring and deployment platforms."""
    return {"status": "healthy"}


@app.get("/api/config")
async def get_config():
    """Get frontend configuration."""
    return {
        "api_version": "1.0.0",
    }


# Exception handlers
@app.exception_handler(ValueError)
async def value_error_handler(request, exc):
    import logging
    if settings.environment == "production":
        logging.getLogger(__name__).warning("ValueError: %s", exc)
        return JSONResponse(
            status_code=400,
            content={"detail": "Invalid input"},
        )
    return JSONResponse(
        status_code=400,
        content={"detail": str(exc)},
    )


@app.exception_handler(Exception)
async def general_exception_handler(request, exc):
    if settings.environment == "development":
        return JSONResponse(
            status_code=500,
            content={"detail": str(exc), "type": type(exc).__name__},
        )
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
    )
