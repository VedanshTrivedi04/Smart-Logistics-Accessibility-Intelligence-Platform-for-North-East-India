# Shared / Infra and deployment

- **Last updated:** 2026-09-24

- **Source:** compose.yaml, infra/compose.yaml, infra/Makefile, backend/Dockerfile, frontend/Dockerfile
- **Status:** done

- Postgres/PostGIS is on Neon (no local Postgres container). Redis via `redis:alpine`. Backend on :8000 (python 3.12, uv, non-root, /health/live probe), frontend on :3000 (Next standalone output, node:22-alpine, pnpm). Dev frontend runs on :3001.
- memory.md (2026-09-22) says MinIO services were removed, but the root `compose.yaml` still lists `minio`/`createbuckets` at last check; verify which is current.
- Makefile targets: up, down, build, logs.
