"""ECT Shift Assignment API - Main FastAPI Application."""

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from starlette.middleware.base import BaseHTTPMiddleware
from .config import settings
from .routers import (
    forms_router,
    assignments_router,
    employees_router,
    history_router,
    google_forms_router,
    chat_router,
    github_router,
    auth_router,
)

# Rate limiter configuration
limiter = Limiter(key_func=get_remote_address)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Middleware to add security headers to all responses."""

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        if settings.environment == "production":
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response

# Create FastAPI app
app = FastAPI(
    title="ECT Shift Assignment API",
    description="API for managing ECT shift assignments, forms, and employee scheduling",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

# Configure CORS - hardened configuration
_allowed_origins = [settings.frontend_url]
if settings.environment == "development":
    _allowed_origins.extend(["http://localhost:3000", "http://127.0.0.1:3000"])

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Content-Type", "Authorization", "X-API-Key"],
)

# Add security headers middleware
app.add_middleware(SecurityHeadersMiddleware)

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
    return {"status": "healthy", "environment": settings.environment}


@app.get("/api/config")
async def get_config():
    """Get frontend configuration."""
    return {
        "api_version": "1.0.0",
        "environment": settings.environment,
    }


# Exception handlers
@app.exception_handler(ValueError)
async def value_error_handler(request, exc):
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
