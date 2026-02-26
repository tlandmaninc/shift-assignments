# Dockerfile for ECT Backend
# Works with: Railway, Fly.io, Google Cloud Run, AWS ECS, etc.

FROM python:3.12-slim

# Install uv
COPY --from=ghcr.io/astral-sh/uv:0.6 /uv /uvx /bin/

# Set working directory
WORKDIR /app

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

# Install dependencies (cached layer)
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project && \
    uv run pip install --upgrade pip

# Copy application code
COPY . .

# Create data directory with restricted permissions
RUN mkdir -p /app/data && chmod 700 /app/data

# Make venv binaries available on PATH
ENV PATH="/app/.venv/bin:$PATH"

# Create non-root user for security
RUN adduser --disabled-password --gecos '' appuser && \
    chown -R appuser:appuser /app
USER appuser

# Expose port (default 8000, can be overridden by PORT env var)
EXPOSE 8000

# Health check
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

# Start command
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
