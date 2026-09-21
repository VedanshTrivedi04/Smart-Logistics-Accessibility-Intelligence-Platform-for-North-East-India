-- NER Logistics Platform — PostgreSQL Initialisation
-- Runs once on first container start (docker-entrypoint-initdb.d)
-- Creates the non-owner runtime role used by the application
-- Migration role (ner_admin) is created by POSTGRES_USER env var

-- ──────────────────────────────────────────────────────────
-- Runtime application role (non-owner, non-superuser)
-- The FastAPI application ALWAYS connects as this role.
-- It cannot DROP tables, bypass RLS, or own any objects.
-- ──────────────────────────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
        CREATE ROLE app_user WITH LOGIN PASSWORD 'app_user_dev';
        -- DEV ONLY password — override via DATABASE_URL in .env
    END IF;
END
$$;

-- Separate read-only role for future analytics/reporting
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_reader') THEN
        CREATE ROLE app_reader WITH LOGIN PASSWORD 'app_reader_dev';
    END IF;
END
$$;

-- Restricted audit writer role (append-only to audit_events)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'audit_writer') THEN
        CREATE ROLE audit_writer;
    END IF;
END
$$;

-- Grant database connection to application role
GRANT CONNECT ON DATABASE ner_logistics TO app_user;
GRANT CONNECT ON DATABASE ner_logistics TO app_reader;

-- Extensions — must be created by superuser (ner_admin owns the DB)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;
CREATE EXTENSION IF NOT EXISTS pgrouting;
CREATE EXTENSION IF NOT EXISTS pg_trgm;  -- For fuzzy text search on facility names
