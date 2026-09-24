# syntax=docker/dockerfile:1
FROM python:3.12-slim-bookworm AS base

# Install runtime system packages and CA certificates (required for secure TLS to Neon DB)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy uv package manager binary
COPY --from=ghcr.io/astral-sh/uv:0.5.24 /uv /uvx /bin/

# Set environment variables for Python and uv
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PYTHONPATH="/app:$PYTHONPATH" \
    PATH="/app/.venv/bin:$PATH"

WORKDIR /app

# Copy dependency definition first for caching
COPY pyproject.toml README.md* ./
RUN touch README.md

# Install project dependencies without installing editable project code yet
RUN uv sync --no-dev --no-install-project

# Copy application source code and migrations
COPY app/ ./app
COPY alembic/ ./alembic
COPY alembic.ini ./alembic.ini
COPY openapi.json ./openapi.json
COPY boundries.py ./boundries.py

# Complete installation of the project itself
RUN uv sync --no-dev

# Create non-root system user for security
RUN useradd -m -u 10001 -s /bin/bash appuser && \
    chown -R appuser:appuser /app

USER appuser

EXPOSE 8000

HEALTHCHECK --interval=20s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8000/health/live || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
