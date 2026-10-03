"""
app/modules/reporting/application/sync_reports.py — Sub-transaction Isolated Batch Sync Use Case.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from app.core.db import DbSession as AsyncSession
from app.core.exceptions import AppError
from app.core.logging import get_logger
from app.core.security import PrincipalContext
from app.modules.reporting.application.ports import ReportingRepositoryPort
from app.modules.reporting.application.submit_report import SubmitFieldReportUseCase
from app.modules.reporting.domain.entities import LocationPoint, SyncResult
from app.modules.reporting.domain.enums import (
    LaneStatus,
    LocationProvider,
    PassableVehicleClass,
    ReportSeverity,
    ReportType,
    RoadSide,
)
from app.modules.reporting.domain.exceptions import BatchSizeExceededError

logger = get_logger(__name__)


class SyncReportsBatchUseCase:
    """Processes low-bandwidth offline sync batches with sub-transaction isolation."""

    def __init__(
        self,
        session: AsyncSession,
        reporting_repo: ReportingRepositoryPort,
        submit_use_case: SubmitFieldReportUseCase,
    ) -> None:
        self.session = session
        self.reporting_repo = reporting_repo
        self.submit_use_case = submit_use_case

    async def execute(
        self,
        principal: PrincipalContext,
        batch_items: list[dict[str, Any]],
        device_id: str | None = None,
        app_instance_id: str | None = None,
    ) -> dict[str, Any]:
        max_batch_size = 50
        if len(batch_items) > max_batch_size:
            raise BatchSizeExceededError(
                f"Batch size {len(batch_items)} exceeds maximum {max_batch_size} observations"
            )

        succeeded: list[dict[str, Any]] = []
        failed: list[dict[str, Any]] = []

        for item in batch_items:
            client_op_id = item.get("client_operation_id")
            if not client_op_id:
                client_op_id = str(uuid.uuid4())

            # 1. Check persistent sync idempotency cache
            cached = await self.reporting_repo.get_sync_result(principal.user_id, client_op_id)
            if cached:
                succeeded.append(cached.response_payload)
                continue

            # 2. Execute within sub-transaction savepoint
            try:
                async with self.session.begin_nested():
                    loc_data = item["location"]
                    location = LocationPoint(
                        longitude=loc_data["longitude"],
                        latitude=loc_data["latitude"],
                        accuracy_m=loc_data["accuracy_m"],
                        location_provider=LocationProvider(loc_data.get("location_provider", "GPS_HARDWARE")),
                        altitude_m=loc_data.get("altitude_m"),
                    )

                    observed_at = datetime.fromisoformat(item["observed_at"])
                    if observed_at.tzinfo is None:
                        observed_at = observed_at.replace(tzinfo=UTC)

                    media_ids = [UUID(m) for m in item.get("media_ids", [])]
                    candidate_edge = UUID(item["candidate_edge_id"]) if item.get("candidate_edge_id") else None
                    candidate_bridge = UUID(item["candidate_bridge_id"]) if item.get("candidate_bridge_id") else None

                    raw_lane = item.get("lane_status")
                    lane_status = LaneStatus(raw_lane) if raw_lane else None
                    passable_classes = [PassableVehicleClass(c) for c in item.get("passable_classes") or []]
                    life_safety_risk = bool(item.get("life_safety_risk", False))
                    raw_side = item.get("road_side")
                    road_side = RoadSide(raw_side) if raw_side else None

                    report = await self.submit_use_case.execute(
                        principal=principal,
                        report_type=ReportType(item["report_type"]),
                        severity=ReportSeverity(item["severity"]),
                        description=item["description"],
                        location=location,
                        observed_at=observed_at,
                        client_operation_id=client_op_id,
                        device_id=device_id or item.get("device_id"),
                        app_instance_id=app_instance_id or item.get("app_instance_id"),
                        media_ids=media_ids,
                        candidate_edge_id=candidate_edge,
                        candidate_bridge_id=candidate_bridge,
                        lane_status=lane_status,
                        passable_classes=passable_classes,
                        life_safety_risk=life_safety_risk,
                        road_side=road_side,
                    )

                    res_payload = {
                        "client_operation_id": client_op_id,
                        "status": "SUCCESS",
                        "report_id": str(report.id),
                        "review_state": report.review_state.value,
                        "is_provisional_caution": report.is_provisional_caution,
                    }

                    # Cache durable sync result
                    sync_rec = SyncResult(
                        id=uuid.uuid4(),
                        reporter_id=principal.user_id,
                        client_operation_id=client_op_id,
                        status_code=201,
                        response_payload=res_payload,
                    )
                    await self.reporting_repo.save_sync_result(sync_rec)
                    succeeded.append(res_payload)

            except Exception as exc:
                logger.warning(
                    "batch_item_sync_failed",
                    client_op_id=client_op_id,
                    error=str(exc),
                )
                error_code = getattr(exc, "code", "SUBMISSION_FAILED")
                if isinstance(exc, AppError):
                    status_code = exc.http_status
                else:
                    status_code = 400

                failed.append({
                    "client_operation_id": client_op_id,
                    "status": "FAILED",
                    "status_code": status_code,
                    "error_code": error_code,
                    "message": str(exc),
                })

        return {
            "total_submitted": len(batch_items),
            "succeeded_count": len(succeeded),
            "failed_count": len(failed),
            "succeeded": succeeded,
            "failed": failed,
        }
