# Shared / Infra and deployment

- **Last updated:** 2026-09-24

- **Source:** compose.yaml, infra/compose.yaml, infra/Makefile, backend/Dockerfile, frontend/Dockerfile
- **Status:** done

- Postgres/PostGIS is on Neon (no local Postgres container). Redis via `redis:alpine`. Backend on :8000 (python 3.12, uv, non-root, /health/live probe), frontend on :3000 (Next standalone output, node:22-alpine, pnpm). Dev frontend runs on :3001.
- memory.md (2026-09-22) says MinIO services were removed, but the root `compose.yaml` still lists `minio`/`createbuckets` at last check; verify which is current.
- Makefile targets: up, down, build, logs.

## Media storage: Cloudinary (added 2026-09-25)
- `STORAGE_BACKEND=cloudinary` in `backend/.env` switches field-report photos from MinIO/S3 to Cloudinary. Required: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` (optional `CLOUDINARY_FOLDER`, default `ner`). Startup fails if they are missing. Secrets live only in the untracked `.env`.
- Adapter: `CloudinaryStorageService` in `backend/app/core/storage.py`. Assets are uploaded with delivery type `authenticated` (no public URL). The browser POSTs multipart with server-signed fields straight to `api.cloudinary.com`; downloads use the signed, expiring `/image/download` link; `get_object` (CV triage) uses the same link server-side. Allowed formats are limited to jpg/png/webp.
- Unlike the S3 path, there is no silent fallback to the in-memory mock if Cloudinary is misconfigured.
- Only runtime field photos use it. Repo images (`map_e2e_*.png`, `icon.svg`) were not uploaded anywhere.
- Unit tests use mocked HTTP (signature matches Cloudinary's documented example). Live check on 2026-09-25 with the project's own account, adapter called directly: signed browser-style upload, `authenticated` type, signed download returns the same bytes as an inline image, tampered signature and unsigned/public-type URLs are refused, `get_object` and `delete_object` work, deleted asset is gone. NOT yet checked end-to-end through the app (wizard upload, then reviewer screen) because `.env` still had `STORAGE_BACKEND=s3` at test time.
- The upload response the officer's browser receives contains a permanent signed delivery URL for their own photo. It is not stored or shown elsewhere.
- Frontend: `sync/transport.ts` `putObject(ticket, ...)` does PUT for S3 tickets and multipart POST for Cloudinary tickets. `public/sw.js` ignores cross-origin and non-GET requests, so uploads are not intercepted.
