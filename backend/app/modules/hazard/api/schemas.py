"""
app/modules/hazard/api/schemas.py — Pydantic DTOs for Landslide Risk & Rainfall Hazard Endpoints.
"""

from __future__ import annotations

from pydantic import BaseModel


class RiskZoneRefreshResponse(BaseModel):
    """Response DTO for the risk-assessment refresh endpoint."""
    zones_refreshed: int


class RiskZoneSeedResponse(BaseModel):
    """Response DTO for the terrain-derived risk-zone seeding endpoint."""
    zones_created: int
