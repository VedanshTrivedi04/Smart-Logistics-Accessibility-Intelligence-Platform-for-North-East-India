"""
app/modules/reporting/application/ports.py — Reporting Repository Port.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any
from uuid import UUID

from app.modules.reporting.domain.entities import (
    FieldReport,
    MediaObject,
    ReportAmendment,
    SyncResult,
)
from app.modules.reporting.domain.enums import ReviewState, ScanStatus


class ReportingRepositoryPort(ABC):
    """Abstract port for persisting and querying field observations and media."""

    @abstractmethod
    async def create_report(self, report: FieldReport) -> FieldReport:
        """Persist a new field observation with its spatial point and media links."""
        ...

    @abstractmethod
    async def update_report(self, report: FieldReport) -> FieldReport:
        """Update report review state, adjudication or amendments with version check."""
        ...

    @abstractmethod
    async def get_report_by_id(self, report_id: UUID) -> FieldReport | None:
        """Retrieve a field observation by primary UUID."""
        ...

    @abstractmethod
    async def find_by_client_operation_id(self, reporter_id: UUID, client_op_id: str) -> FieldReport | None:
        """Find a report by its idempotency operation key scoped to the reporter."""
        ...

    @abstractmethod
    async def get_sync_result(self, reporter_id: UUID, client_op_id: str) -> SyncResult | None:
        """Retrieve durable cached response for an offline sync operation."""
        ...

    @abstractmethod
    async def save_sync_result(self, sync_result: SyncResult) -> None:
        """Persist idempotent response payload for a client operation."""
        ...

    @abstractmethod
    async def create_amendment(self, amendment: ReportAmendment) -> ReportAmendment:
        """Persist an immutable audit amendment linking original to new report."""
        ...

    @abstractmethod
    async def create_media(self, media: MediaObject) -> MediaObject:
        """Register a media object record."""
        ...

    @abstractmethod
    async def get_media_by_id(self, media_id: UUID) -> MediaObject | None:
        """Retrieve a media object record by UUID."""
        ...

    @abstractmethod
    async def update_media_scan(
        self,
        media_id: UUID,
        status: ScanStatus,
        findings: dict[str, Any] | None = None,
        width_px: int | None = None,
        height_px: int | None = None,
        exif_lat: float | None = None,
        exif_lon: float | None = None,
    ) -> None:
        """Update quarantine scan status and detection metadata."""
        ...

    @abstractmethod
    async def list_reports(
        self,
        review_state: ReviewState | None = None,
        jurisdiction_id: UUID | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[FieldReport]:
        """List reports filtered by status and jurisdiction scope."""
        ...

    @abstractmethod
    async def find_candidate_edges(
        self,
        lon: float,
        lat: float,
        radius_meters: float = 250.0,
    ) -> list[dict[str, Any]]:
        """Query nearby road edges ranked by perpendicular distance to point."""
        ...

    @abstractmethod
    async def find_candidate_bridges(
        self,
        lon: float,
        lat: float,
        radius_meters: float = 50.0,
    ) -> list[dict[str, Any]]:
        """Query nearby bridges within proximity radius."""
        ...
