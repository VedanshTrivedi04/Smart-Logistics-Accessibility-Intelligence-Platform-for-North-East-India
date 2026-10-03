"""
app/modules/reporting/api/schemas.py — Pydantic Request & Response DTOs for Reporting Module.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field

from app.modules.reporting.domain.enums import (
    LaneStatus,
    LocationProvider,
    PassableVehicleClass,
    ReportSeverity,
    ReportType,
    RoadSide,
)


class LocationPointDTO(BaseModel):
    """Geographic coordinates with accuracy and sensor source."""
    longitude: float = Field(..., ge=-180.0, le=180.0, description="Longitude in decimal degrees")
    latitude: float = Field(..., ge=-90.0, le=90.0, description="Latitude in decimal degrees")
    accuracy_m: float = Field(..., gt=0.0, le=5000.0, description="GPS horizontal accuracy radius in meters")
    location_provider: LocationProvider = Field(
        default=LocationProvider.GPS_HARDWARE,
        description="Sensor origin",
    )
    altitude_m: float | None = Field(None, description="Elevation in meters if available")


class ReportCreateRequest(BaseModel):
    """Payload for submitting a new field incident report."""
    report_type: ReportType = Field(..., description="Observed incident type")
    severity: ReportSeverity = Field(..., description="Observed severity rating")
    description: str = Field(..., min_length=3, max_length=2000, description="Field notes and description")
    location: LocationPointDTO = Field(..., description="Observation coordinates")
    observed_at: datetime = Field(..., description="Timestamp of physical field observation")
    client_operation_id: str | None = Field(None, max_length=128, description="Offline idempotency token")
    device_id: str | None = Field(None, max_length=128, description="Device UUID")
    app_instance_id: str | None = Field(None, max_length=128, description="App installation UUID")
    media_ids: list[UUID] = Field(default_factory=list, description="Attached pre-uploaded media IDs (max 5)")
    candidate_edge_id: UUID | None = Field(None, description="Explicitly snapped edge ID")
    candidate_bridge_id: UUID | None = Field(None, description="Explicitly snapped bridge ID")
    lane_status: LaneStatus | None = Field(None, description="Observed lane availability")
    passable_classes: list[PassableVehicleClass] = Field(default_factory=list, max_length=4, description="Vehicle classes observed passing")
    life_safety_risk: bool = Field(False, description="Reporter flags an acute risk to life")
    road_side: RoadSide | None = Field(None, description="Mountain slope side: HILLSIDE, VALLEY_SIDE, BOTH, or UNKNOWN")


class ReportResponse(BaseModel):
    """Full field observation response."""
    id: UUID
    reporter_id: UUID
    organization_id: UUID | None
    jurisdiction_id: UUID | None
    client_operation_id: str | None
    report_type: str
    severity: str
    review_state: str
    description: str
    location: LocationPointDTO
    candidate_edge_id: UUID | None
    candidate_bridge_id: UUID | None
    is_provisional_caution: bool
    rejection_reason: str | None = None
    rejection_notes: str | None = None
    amendment_of_report_id: UUID | None = None
    lane_status: LaneStatus | None = None
    passable_classes: list[PassableVehicleClass] = Field(default_factory=list)
    life_safety_risk: bool = False
    road_side: RoadSide | None = None
    observed_at: datetime
    received_at: datetime
    created_at: datetime
    media_ids: list[UUID]
    version: int


class ReportAmendmentRequest(BaseModel):
    """Request to amend or correct an existing field observation."""
    reason: str = Field(..., min_length=3, max_length=1000, description="Reason for amendment")
    report_type: ReportType
    severity: ReportSeverity
    description: str = Field(..., min_length=3, max_length=2000)
    location: LocationPointDTO
    observed_at: datetime
    media_ids: list[UUID] = Field(default_factory=list)
    candidate_edge_id: UUID | None = None
    candidate_bridge_id: UUID | None = None
    road_side: RoadSide | None = None
    lane_status: LaneStatus | None = None
    passable_classes: list[PassableVehicleClass] = Field(default_factory=list, max_length=4)
    life_safety_risk: bool = False


class BatchSyncRequest(BaseModel):
    """Offline batch sync containing multiple field reports."""
    items: list[dict[str, Any]] = Field(..., min_length=1, max_length=50)
    device_id: str | None = Field(None, max_length=128)
    app_instance_id: str | None = Field(None, max_length=128)


class BatchSyncResponse(BaseModel):
    """Result of batch sync processing with per-item status."""
    total_submitted: int
    succeeded_count: int
    failed_count: int
    succeeded: list[dict[str, Any]]
    failed: list[dict[str, Any]]


class UploadTicketRequest(BaseModel):
    """Request pre-signed upload URL for media attachment."""
    file_name: str = Field(..., min_length=1, max_length=255)
    file_size_bytes: int = Field(..., gt=0, le=10 * 1024 * 1024)
    mime_type: str = Field(..., pattern=r"^image/(jpeg|png|webp)$")
    checksum_sha256: str = Field(..., min_length=64, max_length=64)


class UploadTicketResponse(BaseModel):
    """Direct-upload ticket: a presigned PUT, or a signed multipart POST (Cloudinary)."""
    media_id: UUID
    upload_url: str
    upload_method: str = "PUT"
    upload_headers: dict[str, str] = Field(default_factory=dict)
    upload_fields: dict[str, str] = Field(default_factory=dict)
    object_key: str
    expires_in_seconds: int


class ConfirmUploadRequest(BaseModel):
    """Client confirms upload completion and passes derived metadata."""
    width_px: int | None = Field(None, ge=1, le=4096)
    height_px: int | None = Field(None, ge=1, le=4096)
    exif_lat: float | None = None
    exif_lon: float | None = None


class MediaResponse(BaseModel):
    """Media object metadata."""
    id: UUID
    uploader_id: UUID
    bucket: str
    object_key: str
    file_name: str
    file_size_bytes: int
    mime_type: str
    scan_status: str
    scan_findings: dict[str, Any] | None = None
    width_px: int | None = None
    height_px: int | None = None
    created_at: datetime


class DownloadUrlResponse(BaseModel):
    """Pre-signed GET download URL."""
    media_id: UUID
    download_url: str
    expires_in_seconds: int
