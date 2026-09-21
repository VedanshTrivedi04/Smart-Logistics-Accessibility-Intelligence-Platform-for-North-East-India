"""
app/modules/identity/api/schemas.py — Request & Response DTOs for Identity endpoints.
"""

from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, Field


class MeResponse(BaseModel):
    user_id: UUID
    email: str | None = None
    display_name: str
    org_id: UUID
    org_name: str
    org_kind: str
    role: str
    capabilities: list[str]
    jurisdiction_ids: list[UUID] = Field(default_factory=list)
    session_id: UUID | None = None
    dev_mode: bool = False


class CsrfTokenResponse(BaseModel):
    csrf_token: str
    expires_in_hours: int = 8


class OrgChoiceDto(BaseModel):
    org_id: str
    org_name: str
    org_kind: str
    role: str


class SelectOrgRequest(BaseModel):
    org_id: UUID
    selection_token: str


class DevSessionRequest(BaseModel):
    user_id: UUID
    org_id: UUID
    role: str


class MessageResponse(BaseModel):
    message: str
    status: str = "ok"
