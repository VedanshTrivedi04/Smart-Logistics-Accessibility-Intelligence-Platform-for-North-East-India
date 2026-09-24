"""
app/modules/public/api/schemas.py — Pydantic DTOs for the anonymous public-citizen API.

Every response here is deliberately redacted relative to its authenticated
counterpart: no reporter identity, no organization internals, and incident
locations are rounded (see list_public_incidents.py) rather than exact.
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class PublicIncidentResponse(BaseModel):
    id: UUID
    title: str
    severity: str
    lifecycle: str
    # Rounded to 2 decimal places (~1.1 km at NER latitudes) — enough to place a
    # marker on a regional map, not enough to pinpoint a reporter's exact location.
    approx_lat: float
    approx_lon: float
    created_at: datetime


class PublicRouteEvaluationRequest(BaseModel):
    """No vehicle, org or priority fields: the public endpoint evaluates a fixed
    generic "standard car" profile — a citizen is not picking a logistics vehicle."""

    origin_lat: float = Field(..., ge=-90.0, le=90.0)
    origin_lon: float = Field(..., ge=-180.0, le=180.0)
    destination_lat: float = Field(..., ge=-90.0, le=90.0)
    destination_lon: float = Field(..., ge=-180.0, le=180.0)
