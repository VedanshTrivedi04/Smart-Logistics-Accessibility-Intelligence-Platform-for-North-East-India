# NER Logistics Platform — Developer Makefile
# Run from the project root (d:/SIH2026/)
# Requires: uv, docker compose v2

BACKEND_DIR := backend
INFRA_DIR   := infra

.PHONY: help up down build logs infra infra-down migrate migrate-check migrate-generate \
        test test-unit test-integration lint typecheck check-boundaries \
        seed-demo run dev clean

# ─────────────────────────────────────────────────────────────
help:
	@echo ""
	@echo "NER Logistics Platform — Available Make Targets"
	@echo "────────────────────────────────────────────────"
	@echo "  up                 Start full stack (frontend + backend + redis + minio)"
	@echo "  down               Stop all running containers"
	@echo "  build              Build all Docker images"
	@echo "  logs               Follow container logs"
	@echo "  infra              Start Redis + MinIO only (for local dev)"
	@echo "  infra-down         Stop Redis + MinIO containers"
	@echo "  migrate            Run Alembic migrations on Neon DB"
	@echo "  migrate-check      Check for pending migrations (CI)"
	@echo "  migrate-generate   Autogenerate a new migration (provide MSG=...)"
	@echo "  test               Run all tests"
	@echo "  test-unit          Run unit tests only (no DB required)"
	@echo "  test-integration   Run integration tests (requires Neon + Redis)"
	@echo "  lint               Run ruff (linting + formatting check)"
	@echo "  typecheck          Run mypy (strict type checking)"
	@echo "  check-boundaries   Run architecture boundary checker"
	@echo "  seed-demo          Populate deterministic demo dataset (dev only)"
	@echo "  run                Start uvicorn API server (dev mode)"
	@echo "  dev                Start API server + watch for changes (--reload)"
	@echo ""

# ─────────────────────────────────────────────────────────────
# Full Stack Docker Orchestration (Neon DB is remote)
# ─────────────────────────────────────────────────────────────
up:
	docker compose up -d
	@echo "✅ Full stack started. Frontend: http://localhost:3000 | Backend: http://localhost:8000/docs"

down:
	docker compose down
	@echo "✅ All containers stopped."

build:
	docker compose build
	@echo "✅ All container images built."

logs:
	docker compose logs -f

# ─────────────────────────────────────────────────────────────
# Infrastructure Only (Redis + MinIO — Postgres is on Neon)
# ─────────────────────────────────────────────────────────────
infra:
	docker compose up -d redis minio createbuckets
	@echo "✅ Redis + MinIO started. Neon DB is remote — no local Postgres needed."

infra-down:
	docker compose down redis minio createbuckets
	@echo "✅ Infrastructure containers stopped."

# ─────────────────────────────────────────────────────────────
# Database migrations (Alembic → Neon)
# ─────────────────────────────────────────────────────────────
migrate:
	@echo "Running Alembic migrations on Neon DB..."
	@echo "Using DATABASE_URL_DIRECT (non-pooled direct connection)"
	cd $(BACKEND_DIR) && uv run alembic upgrade head

migrate-check:
	@echo "Checking for pending migrations..."
	cd $(BACKEND_DIR) && uv run alembic check

migrate-generate:
	@if [ -z "$(MSG)" ]; then echo "Usage: make migrate-generate MSG='describe change'"; exit 1; fi
	cd $(BACKEND_DIR) && uv run alembic revision --autogenerate -m "$(MSG)"

migrate-history:
	cd $(BACKEND_DIR) && uv run alembic history --verbose

migrate-rollback:
	@echo "Rolling back last migration..."
	cd $(BACKEND_DIR) && uv run alembic downgrade -1

# ─────────────────────────────────────────────────────────────
# Testing
# ─────────────────────────────────────────────────────────────
test:
	cd $(BACKEND_DIR) && uv run pytest tests/ -v --tb=short

test-unit:
	cd $(BACKEND_DIR) && uv run pytest tests/unit/ -v -m unit --tb=short

test-integration:
	cd $(BACKEND_DIR) && uv run pytest tests/integration/ -v -m integration --tb=short

test-cov:
	cd $(BACKEND_DIR) && uv run pytest tests/ --cov=app --cov-report=term-missing --cov-report=html

# ─────────────────────────────────────────────────────────────
# Code quality
# ─────────────────────────────────────────────────────────────
lint:
	@echo "Running ruff check..."
	cd $(BACKEND_DIR) && uv run ruff check .
	@echo "Running ruff format check..."
	cd $(BACKEND_DIR) && uv run ruff format --check .
	@echo "✅ Lint passed."

lint-fix:
	cd $(BACKEND_DIR) && uv run ruff check --fix . && uv run ruff format .

typecheck:
	@echo "Running mypy (strict)..."
	cd $(BACKEND_DIR) && uv run mypy app/
	@echo "✅ Type check passed."

check-boundaries:
	@echo "Checking architecture boundaries..."
	cd $(BACKEND_DIR) && uv run python boundries.py

# All quality checks — run this in CI
check-all: lint typecheck check-boundaries test-unit
	@echo "✅ All quality checks passed."

# ─────────────────────────────────────────────────────────────
# Demo data seeding (development only)
# ─────────────────────────────────────────────────────────────
seed-demo:
	@echo "Seeding deterministic demo dataset..."
	@echo "⚠️  This will run against DATABASE_URL — ensure you're on a dev/branch."
	cd $(BACKEND_DIR) && uv run python -m app.scripts.seed_demo --env development
	@echo "✅ Demo data seeded."

# ─────────────────────────────────────────────────────────────
# Running the API server
# ─────────────────────────────────────────────────────────────
run:
	cd $(BACKEND_DIR) && uv run uvicorn app.main:app --host 0.0.0.0 --port 8000

dev:
	cd $(BACKEND_DIR) && uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# ─────────────────────────────────────────────────────────────
# Utilities
# ─────────────────────────────────────────────────────────────
clean:
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null; true
	find . -name "*.pyc" -delete 2>/dev/null; true
	rm -rf $(BACKEND_DIR)/.coverage $(BACKEND_DIR)/htmlcov/
	@echo "✅ Cleaned up cache files."

export-openapi:
	@echo "Exporting OpenAPI schema..."
	cd $(BACKEND_DIR) && uv run python -c "
from app.main import app
import json
schema = app.openapi()
with open('../contracts/openapi.json', 'w') as f:
    json.dump(schema, f, indent=2)
print('Exported to contracts/openapi.json')
"
