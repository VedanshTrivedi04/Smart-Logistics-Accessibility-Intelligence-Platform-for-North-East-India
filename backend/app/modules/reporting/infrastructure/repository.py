"""
app/modules/reporting/infrastructure/repository.py — PostGIS SQLAlchemy Implementation for Reporting.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from geoalchemy2.shape import from_shape, to_shape
from shapely.geometry import Point
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.reporting.application.ports import ReportingRepositoryPort
from app.modules.reporting.domain.entities import (
    FieldReport,
    LocationPoint,
    MediaObject,
    ReportAmendment,
    SyncResult,
)
from app.modules.reporting.domain.enums import (
    LocationProvider,
    RejectionReason,
    ReportSeverity,
    ReportType,
    ReviewState,
    ScanStatus,
)
from app.modules.reporting.infrastructure.models import (
    MediaObjectModel,
    ReportAmendmentModel,
    ReportMediaModel,
    ReportModel,
    SyncResultModel,
)


class SqlAlchemyReportingRepository(ReportingRepositoryPort):
    """PostGIS & PostgreSQL storage adapter for field reports and media attachments."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    def _to_domain(self, m: ReportModel) -> FieldReport:
        pt = to_shape(m.geom)
        media_ids = [media_obj.id for media_obj in m.media] if m.media else []
        return FieldReport(
            id=m.id,
            reporter_id=m.reporter_id,
            organization_id=m.organization_id,
            jurisdiction_id=m.jurisdiction_id,
            client_operation_id=m.client_operation_id,
            device_id=m.device_id,
            app_instance_id=m.app_instance_id,
            report_type=ReportType(m.report_type),
            severity=ReportSeverity(m.severity),
            review_state=ReviewState(m.review_state),
            description=m.description,
            location=LocationPoint(
                longitude=pt.x,
                latitude=pt.y,
                accuracy_m=m.accuracy_m,
                location_provider=LocationProvider(m.location_provider),
            ),
            candidate_edge_id=m.candidate_edge_id,
            candidate_bridge_id=m.candidate_bridge_id,
            is_provisional_caution=m.is_provisional_caution,
            rejection_reason=RejectionReason(m.rejection_reason) if m.rejection_reason else None,
            rejection_notes=m.rejection_notes,
            amendment_of_report_id=m.amendment_of_report_id,
            observed_at=m.observed_at,
            received_at=m.received_at,
            created_at=m.created_at,
            media_ids=media_ids,
            version=m.version,
            cv_hazard_class=m.cv_hazard_class,
            cv_severity_score=m.cv_severity_score,
            cv_confidence=m.cv_confidence,
            cv_is_roadway_blocked=m.cv_is_roadway_blocked,
            cv_verified_at=m.cv_verified_at,
        )

    def _media_to_domain(self, m: MediaObjectModel) -> MediaObject:
        return MediaObject(
            id=m.id,
            uploader_id=m.uploader_id,
            bucket=m.bucket,
            object_key=m.object_key,
            file_name=m.file_name,
            file_size_bytes=m.file_size_bytes,
            mime_type=m.mime_type,
            checksum_sha256=m.checksum_sha256,
            scan_status=ScanStatus(m.scan_status),
            scan_findings=m.scan_findings,
            width_px=m.width_px,
            height_px=m.height_px,
            exif_lat=m.exif_lat,
            exif_lon=m.exif_lon,
            created_at=m.created_at,
        )

    async def create_report(self, report: FieldReport) -> FieldReport:
        pt = Point(report.location.longitude, report.location.latitude)
        geom = from_shape(pt, srid=4326)

        m = ReportModel(
            id=report.id,
            reporter_id=report.reporter_id,
            organization_id=report.organization_id,
            jurisdiction_id=report.jurisdiction_id,
            client_operation_id=report.client_operation_id,
            device_id=report.device_id,
            app_instance_id=report.app_instance_id,
            report_type=report.report_type.value,
            severity=report.severity.value,
            review_state=report.review_state.value,
            description=report.description,
            geom=geom,
            accuracy_m=report.location.accuracy_m,
            location_provider=report.location.location_provider.value,
            candidate_edge_id=report.candidate_edge_id,
            candidate_bridge_id=report.candidate_bridge_id,
            is_provisional_caution=report.is_provisional_caution,
            rejection_reason=report.rejection_reason.value if report.rejection_reason else None,
            rejection_notes=report.rejection_notes,
            amendment_of_report_id=report.amendment_of_report_id,
            observed_at=report.observed_at,
            received_at=report.received_at,
            created_at=report.created_at,
            version=report.version,
        )
        self.session.add(m)
        await self.session.flush()

        for mid in report.media_ids:
            rm = ReportMediaModel(report_id=report.id, media_id=mid)
            self.session.add(rm)
        await self.session.flush()

        return report

    async def update_report(self, report: FieldReport) -> FieldReport:
        stmt = select(ReportModel).where(ReportModel.id == report.id).with_for_update()
        res = await self.session.execute(stmt)
        m = res.scalar_one_or_none()
        if not m:
            raise ValueError(f"Report {report.id} not found for update")

        m.review_state = report.review_state.value
        m.is_provisional_caution = report.is_provisional_caution
        m.candidate_edge_id = report.candidate_edge_id
        m.candidate_bridge_id = report.candidate_bridge_id
        m.rejection_reason = report.rejection_reason.value if report.rejection_reason else None
        m.rejection_notes = report.rejection_notes
        m.cv_hazard_class = report.cv_hazard_class
        m.cv_severity_score = report.cv_severity_score
        m.cv_confidence = report.cv_confidence
        m.cv_is_roadway_blocked = report.cv_is_roadway_blocked
        m.cv_verified_at = report.cv_verified_at
        m.version = report.version + 1
        await self.session.flush()

        report.version = m.version
        return report

    async def get_report_by_id(self, report_id: UUID) -> FieldReport | None:
        stmt = (
            select(ReportModel)
            .options(selectinload(ReportModel.media))
            .where(ReportModel.id == report_id)
        )
        res = await self.session.execute(stmt)
        m = res.scalar_one_or_none()
        if not m:
            return None
        return self._to_domain(m)

    async def find_by_client_operation_id(self, reporter_id: UUID, client_op_id: str) -> FieldReport | None:
        stmt = (
            select(ReportModel)
            .options(selectinload(ReportModel.media))
            .where(
                ReportModel.reporter_id == reporter_id,
                ReportModel.client_operation_id == client_op_id,
            )
        )
        res = await self.session.execute(stmt)
        m = res.scalar_one_or_none()
        if not m:
            return None
        return self._to_domain(m)

    async def get_sync_result(self, reporter_id: UUID, client_op_id: str) -> SyncResult | None:
        stmt = select(SyncResultModel).where(
            SyncResultModel.reporter_id == reporter_id,
            SyncResultModel.client_operation_id == client_op_id,
        )
        res = await self.session.execute(stmt)
        m = res.scalar_one_or_none()
        if not m:
            return None
        return SyncResult(
            id=m.id,
            reporter_id=m.reporter_id,
            client_operation_id=m.client_operation_id,
            status_code=m.status_code,
            response_payload=m.response_payload,
            created_at=m.created_at,
        )

    async def save_sync_result(self, sync_result: SyncResult) -> None:
        m = SyncResultModel(
            id=sync_result.id,
            reporter_id=sync_result.reporter_id,
            client_operation_id=sync_result.client_operation_id,
            status_code=sync_result.status_code,
            response_payload=sync_result.response_payload,
            created_at=sync_result.created_at,
        )
        self.session.add(m)
        await self.session.flush()

    async def create_amendment(self, amendment: ReportAmendment) -> ReportAmendment:
        m = ReportAmendmentModel(
            id=amendment.id,
            original_report_id=amendment.original_report_id,
            amendment_report_id=amendment.amendment_report_id,
            reason=amendment.reason,
            created_at=amendment.created_at,
        )
        self.session.add(m)
        await self.session.flush()
        return amendment

    async def create_media(self, media: MediaObject) -> MediaObject:
        m = MediaObjectModel(
            id=media.id,
            uploader_id=media.uploader_id,
            bucket=media.bucket,
            object_key=media.object_key,
            file_name=media.file_name,
            file_size_bytes=media.file_size_bytes,
            mime_type=media.mime_type,
            checksum_sha256=media.checksum_sha256,
            scan_status=media.scan_status.value,
            scan_findings=media.scan_findings,
            width_px=media.width_px,
            height_px=media.height_px,
            exif_lat=media.exif_lat,
            exif_lon=media.exif_lon,
            created_at=media.created_at,
        )
        self.session.add(m)
        await self.session.flush()
        return media

    async def get_media_by_id(self, media_id: UUID) -> MediaObject | None:
        stmt = select(MediaObjectModel).where(MediaObjectModel.id == media_id)
        res = await self.session.execute(stmt)
        m = res.scalar_one_or_none()
        if not m:
            return None
        return self._media_to_domain(m)

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
        stmt = select(MediaObjectModel).where(MediaObjectModel.id == media_id).with_for_update()
        res = await self.session.execute(stmt)
        m = res.scalar_one_or_none()
        if m:
            m.scan_status = status.value
            if findings:
                m.scan_findings = findings
            if width_px is not None:
                m.width_px = width_px
            if height_px is not None:
                m.height_px = height_px
            if exif_lat is not None:
                m.exif_lat = exif_lat
            if exif_lon is not None:
                m.exif_lon = exif_lon
            await self.session.flush()

    async def list_reports(
        self,
        review_state: ReviewState | None = None,
        jurisdiction_id: UUID | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[FieldReport]:
        stmt = select(ReportModel).options(selectinload(ReportModel.media))
        if review_state:
            stmt = stmt.where(ReportModel.review_state == review_state.value)
        if jurisdiction_id:
            stmt = stmt.where(ReportModel.jurisdiction_id == jurisdiction_id)
        stmt = stmt.order_by(ReportModel.observed_at.desc()).limit(limit).offset(offset)
        res = await self.session.execute(stmt)
        models = res.scalars().all()
        return [self._to_domain(m) for m in models]

    async def find_candidate_edges(
        self,
        lon: float,
        lat: float,
        radius_meters: float = 250.0,
    ) -> list[dict[str, Any]]:
        # PostGIS ST_DWithin and ST_Distance using geography cast for meter-precision
        sql = text("""
            SELECT id, edge_index, road_name, road_class, is_bridge,
                   ST_Distance(geom::geography, ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography) as distance_m
            FROM road_edges
            WHERE ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography, :radius)
            ORDER BY distance_m ASC
            LIMIT 5
        """)
        res = await self.session.execute(sql, {"lon": lon, "lat": lat, "radius": radius_meters})
        rows = res.mappings().all()
        return [dict(r) for r in rows]

    async def find_candidate_bridges(
        self,
        lon: float,
        lat: float,
        radius_meters: float = 50.0,
    ) -> list[dict[str, Any]]:
        sql = text("""
            SELECT id, code, name, length_meters, max_weight_tonnes,
                   ST_Distance(geom::geography, ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography) as distance_m
            FROM bridges
            WHERE geom IS NOT NULL
              AND ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography, :radius)
            ORDER BY distance_m ASC
            LIMIT 3
        """)
        res = await self.session.execute(sql, {"lon": lon, "lat": lat, "radius": radius_meters})
        rows = res.mappings().all()
        return [dict(r) for r in rows]
