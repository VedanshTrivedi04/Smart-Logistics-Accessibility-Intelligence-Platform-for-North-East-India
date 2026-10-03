"""
app/modules/reporting/domain/entities.py — Domain Entities and Value Objects for Reporting Module.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from app.modules.reporting.domain.enums import (
    LaneStatus,
    LocationProvider,
    PassableVehicleClass,
    RejectionReason,
    ReportSeverity,
    ReportType,
    ReviewState,
    RoadSide,
    ScanStatus,
)
from app.modules.reporting.domain.exceptions import (
    ClockSkewError,
    MediaValidationError,
)

# North-Eastern Region bounding box (89.5 <= lon <= 97.5, 21.5 <= lat <= 29.5)
NER_MIN_LON = 89.5
NER_MAX_LON = 97.5
NER_MIN_LAT = 21.5
NER_MAX_LAT = 29.5


@dataclass(frozen=True)
class LocationPoint:
    """Geographic point with accuracy metric and sensor origin."""
    longitude: float
    latitude: float
    accuracy_m: float
    location_provider: LocationProvider = LocationProvider.GPS_HARDWARE
    altitude_m: float | None = None
    heading_deg: float | None = None
    speed_mps: float | None = None

    def validate(self) -> None:
        """Validate geographic bounds and accuracy constraints."""
        if not (NER_MIN_LON <= self.longitude <= NER_MAX_LON):
            raise ValueError(
                f"Longitude {self.longitude} is outside North-Eastern Region bounds "
                f"[{NER_MIN_LON}, {NER_MAX_LON}]"
            )
        if not (NER_MIN_LAT <= self.latitude <= NER_MAX_LAT):
            raise ValueError(
                f"Latitude {self.latitude} is outside North-Eastern Region bounds "
                f"[{NER_MIN_LAT}, {NER_MAX_LAT}]"
            )
        if self.accuracy_m <= 0.0:
            raise ValueError(f"Location accuracy must be > 0 meters, got {self.accuracy_m}")
        if self.accuracy_m > 5000.0:
            raise ValueError(f"Location accuracy {self.accuracy_m}m exceeds max 5000m threshold")

    @property
    def is_low_accuracy(self) -> bool:
        return self.accuracy_m > 500.0


@dataclass(frozen=True)
class MediaObject:
    """Media object stored in MinIO/S3 with quarantine verification status."""
    id: UUID
    uploader_id: UUID
    bucket: str
    object_key: str
    file_name: str
    file_size_bytes: int
    mime_type: str
    checksum_sha256: str
    scan_status: ScanStatus = ScanStatus.PENDING_SCAN
    scan_findings: dict[str, Any] | None = None
    width_px: int | None = None
    height_px: int | None = None
    exif_lat: float | None = None
    exif_lon: float | None = None
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))

    def validate(self) -> None:
        """Validate file size and MIME constraints."""
        allowed_mimes = {"image/jpeg", "image/png", "image/webp"}
        if self.mime_type not in allowed_mimes:
            raise MediaValidationError(
                f"MIME type '{self.mime_type}' not permitted. Must be one of {allowed_mimes}"
            )
        max_bytes = 10 * 1024 * 1024  # 10 MB
        if self.file_size_bytes > max_bytes:
            raise MediaValidationError(
                f"File size {self.file_size_bytes} exceeds maximum allowed {max_bytes} bytes (10MB)"
            )
        if self.width_px and self.width_px > 4096:
            raise MediaValidationError(f"Image width {self.width_px}px exceeds max 4096px")
        if self.height_px and self.height_px > 4096:
            raise MediaValidationError(f"Image height {self.height_px}px exceeds max 4096px")


@dataclass(frozen=True)
class ReportAmendment:
    """Immutable correction record linked to an earlier field report."""
    id: UUID
    original_report_id: UUID
    amendment_report_id: UUID
    reason: str
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))


@dataclass(frozen=True)
class SyncResult:
    """Durable idempotency record for mobile offline sync operations."""
    id: UUID
    reporter_id: UUID
    client_operation_id: str
    status_code: int
    response_payload: dict[str, Any]
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))


@dataclass
class FieldReport:
    """Field observation record submitted by mobile field officers."""
    id: UUID
    reporter_id: UUID
    report_type: ReportType
    severity: ReportSeverity
    description: str
    location: LocationPoint
    observed_at: datetime
    received_at: datetime
    created_at: datetime
    review_state: ReviewState = ReviewState.SUBMITTED
    organization_id: UUID | None = None
    jurisdiction_id: UUID | None = None
    client_operation_id: str | None = None
    device_id: str | None = None
    app_instance_id: str | None = None
    candidate_edge_id: UUID | None = None
    candidate_bridge_id: UUID | None = None
    is_provisional_caution: bool = False
    rejection_reason: RejectionReason | None = None
    rejection_notes: str | None = None
    amendment_of_report_id: UUID | None = None
    media_ids: list[UUID] = field(default_factory=list)
    version: int = 1
    # Populated by ai.AutoTriageFieldReportUseCase via apply_cv_verification()
    # (see public.py) — set together, always all-or-nothing.
    cv_hazard_class: str | None = None
    cv_severity_score: float | None = None
    cv_confidence: float | None = None
    cv_is_roadway_blocked: bool | None = None
    cv_verified_at: datetime | None = None
    # Reporter-observed passability (an observation, not verified).
    lane_status: LaneStatus | None = None
    passable_classes: list[PassableVehicleClass] = field(default_factory=list)
    life_safety_risk: bool = False
    road_side: RoadSide | None = None

    def validate_timestamps(self, max_skew_seconds: int = 900, max_stale_days: int = 7) -> None:
        """Enforce triple-timestamp consistency."""
        diff_skew = (self.observed_at - self.received_at).total_seconds()
        if diff_skew > max_skew_seconds:
            raise ClockSkewError(
                f"Observed timestamp {self.observed_at.isoformat()} is {diff_skew:.1f}s in the future "
                f"relative to server received timestamp {self.received_at.isoformat()}"
            )

    @property
    def is_stale_observation(self) -> bool:
        """True if observation was made more than 7 days prior to server reception."""
        return (self.received_at - self.observed_at).total_seconds() > (7 * 86400)

    def should_auto_provisional_caution(self, reporter_roles: list[str]) -> bool:
        """
        Policy 21: Auto-Trigger High Severity Caution.
        Triggered only if:
        - report_type in ('LANDSLIDE', 'BRIDGE_COLLAPSE', 'FLOODING')
        - severity in ('HIGH', 'CRITICAL')
        - accuracy <= 100m
        - reporter has FIELD_OFFICER or ROAD_INSPECTION role
        - not stale (> 7 days)
        """
        if self.is_stale_observation:
            return False
        valid_types = {ReportType.LANDSLIDE, ReportType.BRIDGE_COLLAPSE, ReportType.FLOODING}
        valid_severities = {ReportSeverity.HIGH, ReportSeverity.CRITICAL}
        if self.report_type in valid_types and self.severity in valid_severities:
            if self.location.accuracy_m <= 100.0:
                officer_roles = {"FIELD_OFFICER", "ROAD_INSPECTOR", "DISASTER_MANAGER", "FIELD_RESPONDER"}
                if any(r in officer_roles for r in reporter_roles):
                    return True
        return False

    def should_auto_provisional_caution_from_cv(self, confidence_threshold: float = 0.75) -> bool:
        """
        CV-Verified High-Confidence Hazard Auto-Caution (analogous to Policy 21,
        but driven by the AI/ML hazard verification model instead of submission
        metadata). Triggered only if:
        - CV verification has actually run (cv_confidence/cv_is_roadway_blocked set)
        - the model detected the roadway as blocked
        - confidence meets or exceeds confidence_threshold
        - not stale (> 7 days)
        """
        if self.is_stale_observation:
            return False
        if self.cv_confidence is None or self.cv_is_roadway_blocked is None:
            return False
        return self.cv_is_roadway_blocked and self.cv_confidence >= confidence_threshold
