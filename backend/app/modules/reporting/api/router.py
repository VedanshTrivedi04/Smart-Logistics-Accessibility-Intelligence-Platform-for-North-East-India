"""
app/modules/reporting/api/router.py — FastAPI Router for Field Reporting & Media Management.
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, status

from app.core.db import DbSession as AsyncSession
from app.core.db import get_db
from app.core.security import (
    PrincipalContext,
    require_capability,
)
from app.modules.identity.domain.enums import Capability
from app.modules.incidents.infrastructure.repository import SqlAlchemyIncidentRepository
from app.modules.reporting.api.schemas import (
    BatchSyncRequest,
    BatchSyncResponse,
    ConfirmUploadRequest,
    DownloadUrlResponse,
    LocationPointDTO,
    MediaResponse,
    ReportAmendmentRequest,
    ReportCreateRequest,
    ReportResponse,
    UploadTicketRequest,
    UploadTicketResponse,
)
from app.modules.reporting.application.amend_report import AmendReportUseCase
from app.modules.reporting.application.media_service import MediaUploadService
from app.modules.reporting.application.submit_report import SubmitFieldReportUseCase
from app.modules.reporting.application.sync_reports import SyncReportsBatchUseCase
from app.modules.reporting.domain.entities import FieldReport, LocationPoint
from app.modules.reporting.domain.enums import ReviewState
from app.modules.reporting.domain.exceptions import ReportNotFoundError
from app.modules.reporting.infrastructure.repository import SqlAlchemyReportingRepository

router = APIRouter(tags=["Field Incident Reporting & Media"])


def _to_response_dto(r: FieldReport) -> ReportResponse:
    return ReportResponse(
        id=r.id,
        reporter_id=r.reporter_id,
        organization_id=r.organization_id,
        jurisdiction_id=r.jurisdiction_id,
        client_operation_id=r.client_operation_id,
        report_type=r.report_type.value,
        severity=r.severity.value,
        review_state=r.review_state.value,
        description=r.description,
        location=LocationPointDTO(
            longitude=r.location.longitude,
            latitude=r.location.latitude,
            accuracy_m=r.location.accuracy_m,
            location_provider=r.location.location_provider,
            altitude_m=r.location.altitude_m,
        ),
        candidate_edge_id=r.candidate_edge_id,
        candidate_bridge_id=r.candidate_bridge_id,
        is_provisional_caution=r.is_provisional_caution,
        rejection_reason=r.rejection_reason.value if r.rejection_reason else None,
        rejection_notes=r.rejection_notes,
        amendment_of_report_id=r.amendment_of_report_id,
        lane_status=r.lane_status,
        passable_classes=r.passable_classes,
        life_safety_risk=r.life_safety_risk,
        observed_at=r.observed_at,
        received_at=r.received_at,
        created_at=r.created_at,
        media_ids=r.media_ids,
        version=r.version,
    )


# ─────────────────────────────────────────────────────────────────
# 1. Report Submission & Offline Sync
# ─────────────────────────────────────────────────────────────────
@router.post(
    "/reports",
    summary="Submit a new field incident observation",
    response_model=ReportResponse,
    status_code=status.HTTP_201_CREATED,
)
async def submit_report(
    req: ReportCreateRequest,
    idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
    db: AsyncSession = Depends(get_db),
    principal: PrincipalContext = Depends(require_capability(Capability.SUBMIT_REPORT)),
) -> ReportResponse:
    reporting_repo = SqlAlchemyReportingRepository(db)
    incident_repo = SqlAlchemyIncidentRepository(db)
    use_case = SubmitFieldReportUseCase(reporting_repo, incident_repo)

    location = LocationPoint(
        longitude=req.location.longitude,
        latitude=req.location.latitude,
        accuracy_m=req.location.accuracy_m,
        location_provider=req.location.location_provider,
        altitude_m=req.location.altitude_m,
    )

    report = await use_case.execute(
        principal=principal,
        report_type=req.report_type,
        severity=req.severity,
        description=req.description,
        location=location,
        observed_at=req.observed_at,
        client_operation_id=req.client_operation_id or idempotency_key,
        device_id=req.device_id,
        app_instance_id=req.app_instance_id,
        media_ids=req.media_ids,
        candidate_edge_id=req.candidate_edge_id,
        candidate_bridge_id=req.candidate_bridge_id,
        lane_status=req.lane_status,
        passable_classes=req.passable_classes,
        life_safety_risk=req.life_safety_risk,
    )
    return _to_response_dto(report)


@router.post(
    "/reports/sync",
    summary="Low-bandwidth offline batch synchronization",
    response_model=BatchSyncResponse,
)
async def sync_reports_batch(
    req: BatchSyncRequest,
    db: AsyncSession = Depends(get_db),
    principal: PrincipalContext = Depends(require_capability(Capability.SUBMIT_REPORT)),
) -> BatchSyncResponse:
    reporting_repo = SqlAlchemyReportingRepository(db)
    incident_repo = SqlAlchemyIncidentRepository(db)
    submit_use_case = SubmitFieldReportUseCase(reporting_repo, incident_repo)
    sync_use_case = SyncReportsBatchUseCase(db, reporting_repo, submit_use_case)

    result = await sync_use_case.execute(
        principal=principal,
        batch_items=req.items,
        device_id=req.device_id,
        app_instance_id=req.app_instance_id,
    )
    return BatchSyncResponse(**result)


# ─────────────────────────────────────────────────────────────────
# 2. Report Retrieval & Verification Queue
# ─────────────────────────────────────────────────────────────────
@router.get(
    "/reports",
    summary="List field reports with status and jurisdiction filtering",
    response_model=list[ReportResponse],
)
async def list_reports(
    review_state: ReviewState | None = Query(None, description="Filter by review state"),
    jurisdiction_id: UUID | None = Query(None, description="Filter by district/state jurisdiction"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    principal: PrincipalContext = Depends(require_capability(Capability.VIEW_REPORT_SUMMARY)),
) -> list[ReportResponse]:
    repo = SqlAlchemyReportingRepository(db)
    reports = await repo.list_reports(
        review_state=review_state,
        jurisdiction_id=jurisdiction_id,
        limit=limit,
        offset=offset,
    )
    return [_to_response_dto(r) for r in reports]


@router.get(
    "/reports/{report_id}",
    summary="Get full observation detail",
    response_model=ReportResponse,
)
async def get_report_detail(
    report_id: UUID,
    db: AsyncSession = Depends(get_db),
    principal: PrincipalContext = Depends(require_capability(Capability.VIEW_REPORT_DETAIL)),
) -> ReportResponse:
    repo = SqlAlchemyReportingRepository(db)
    report = await repo.get_report_by_id(report_id)
    if not report:
        raise ReportNotFoundError(f"Report {report_id} not found.")
    return _to_response_dto(report)


@router.post(
    "/reports/{report_id}/amend",
    summary="Submit an immutable amendment/correction for an earlier observation",
    response_model=ReportResponse,
    status_code=status.HTTP_201_CREATED,
)
async def amend_report(
    report_id: UUID,
    req: ReportAmendmentRequest,
    db: AsyncSession = Depends(get_db),
    principal: PrincipalContext = Depends(require_capability(Capability.SUBMIT_REPORT)),
) -> ReportResponse:
    reporting_repo = SqlAlchemyReportingRepository(db)
    incident_repo = SqlAlchemyIncidentRepository(db)
    submit_use_case = SubmitFieldReportUseCase(reporting_repo, incident_repo)
    amend_use_case = AmendReportUseCase(reporting_repo, submit_use_case)

    location = LocationPoint(
        longitude=req.location.longitude,
        latitude=req.location.latitude,
        accuracy_m=req.location.accuracy_m,
        location_provider=req.location.location_provider,
        altitude_m=req.location.altitude_m,
    )

    amended = await amend_use_case.execute(
        principal=principal,
        original_report_id=report_id,
        reason=req.reason,
        report_type=req.report_type,
        severity=req.severity,
        description=req.description,
        location=location,
        observed_at=req.observed_at,
        media_ids=req.media_ids,
        candidate_edge_id=req.candidate_edge_id,
        candidate_bridge_id=req.candidate_bridge_id,
        lane_status=req.lane_status,
        passable_classes=req.passable_classes,
        life_safety_risk=req.life_safety_risk,
    )
    return _to_response_dto(amended)


# ─────────────────────────────────────────────────────────────────
# 3. Media Pre-signed Upload & Download Pipeline
# ─────────────────────────────────────────────────────────────────
@router.post(
    "/media/upload-ticket",
    summary="Request a time-bounded presigned PUT upload URL",
    response_model=UploadTicketResponse,
)
async def request_upload_ticket(
    req: UploadTicketRequest,
    db: AsyncSession = Depends(get_db),
    principal: PrincipalContext = Depends(require_capability(Capability.SUBMIT_REPORT)),
) -> UploadTicketResponse:
    repo = SqlAlchemyReportingRepository(db)
    service = MediaUploadService(repo)

    res = await service.request_upload_ticket(
        principal=principal,
        file_name=req.file_name,
        file_size_bytes=req.file_size_bytes,
        mime_type=req.mime_type,
        checksum_sha256=req.checksum_sha256,
    )
    return UploadTicketResponse(
        media_id=UUID(str(res["media_id"])),
        upload_url=str(res["upload_url"]),
        upload_method=str(res["upload_method"]),
        upload_headers=dict(res["upload_headers"]),
        upload_fields=dict(res["upload_fields"]),
        object_key=str(res["object_key"]),
        expires_in_seconds=int(res["expires_in_seconds"]),
    )


@router.post(
    "/media/{media_id}/confirm",
    summary="Confirm upload completion and pass derivative metadata",
    response_model=MediaResponse,
)
async def confirm_media_upload(
    media_id: UUID,
    req: ConfirmUploadRequest,
    db: AsyncSession = Depends(get_db),
    principal: PrincipalContext = Depends(require_capability(Capability.SUBMIT_REPORT)),
) -> MediaResponse:
    repo = SqlAlchemyReportingRepository(db)
    service = MediaUploadService(repo)

    media = await service.confirm_upload(
        media_id=media_id,
        width_px=req.width_px,
        height_px=req.height_px,
        exif_lat=req.exif_lat,
        exif_lon=req.exif_lon,
    )
    return MediaResponse(
        id=media.id,
        uploader_id=media.uploader_id,
        bucket=media.bucket,
        object_key=media.object_key,
        file_name=media.file_name,
        file_size_bytes=media.file_size_bytes,
        mime_type=media.mime_type,
        scan_status=media.scan_status.value,
        scan_findings=media.scan_findings,
        width_px=media.width_px,
        height_px=media.height_px,
        created_at=media.created_at,
    )


@router.get(
    "/media/{media_id}/download",
    summary="Generate presigned GET URL for authorized media download",
    response_model=DownloadUrlResponse,
)
async def get_media_download_url(
    media_id: UUID,
    db: AsyncSession = Depends(get_db),
    principal: PrincipalContext = Depends(require_capability(Capability.VIEW_REPORT_MEDIA)),
) -> DownloadUrlResponse:
    repo = SqlAlchemyReportingRepository(db)
    service = MediaUploadService(repo)

    url = await service.generate_download_url(media_id=media_id, principal=principal)
    return DownloadUrlResponse(
        media_id=media_id,
        download_url=url,
        expires_in_seconds=900,
    )
