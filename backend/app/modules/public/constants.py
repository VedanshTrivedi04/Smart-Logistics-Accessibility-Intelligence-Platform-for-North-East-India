"""
app/modules/public/constants.py — Shared identifiers for the anonymous public-citizen surface.
"""

from __future__ import annotations

from uuid import UUID

# Deterministic id for the system organization (OrgKind.PUBLIC) that anonymous
# public route evaluations are attributed to for audit purposes. Seeded by
# app/scripts/seed_demo.py — must match ORG_PUBLIC_ID there.
PUBLIC_ORG_ID = UUID("00000000-0000-4000-a000-000000000004")
