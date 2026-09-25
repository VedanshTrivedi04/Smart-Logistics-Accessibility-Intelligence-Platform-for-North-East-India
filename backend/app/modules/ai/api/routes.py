"""
app/modules/ai/api/routes.py — FastAPI Router for AI/ML Inference Endpoints.

Wired to the get_*_predictor()/get_*_verifier() factory functions in
app/modules/ai/infrastructure/, which return a real model-backed adapter when
its artifact is present, and transparently fall back to the Phase 0 stub
otherwise — so these routes always respond, even before/without a trained
model on disk.
"""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Form, UploadFile

from app.core.db import DbSession as AsyncSession
from app.core.db import get_db
from app.core.security import require_authenticated, require_capability
from app.core.storage import get_storage_service
from app.modules.ai.api.schemas import (
    AutoTriageReportRequest,
    DispatchRouteResponse,
    EstimateEtaRequest,
    EstimateEtaResponse,
    FeatureContributionResponse,
    OptimizeDispatchRequest,
    OptimizeDispatchResponse,
    PredictRiskRequest,
    PredictRiskResponse,
    TextReportRequest,
    TranscribeVoiceResponse,
    TranslateTextRequest,
    TranslateTextResponse,
    VerifyPhotoResponse,
    VoiceReportInferredFields,
    VoiceReportResponse,
)
from app.modules.ai.application.auto_triage_report import AutoTriageFieldReportUseCase
from app.modules.ai.application.estimate_eta import EstimateETAUseCase
from app.modules.ai.application.optimize_dispatch import OptimizeDispatchUseCase
from app.modules.ai.application.predict_edge_risk import PredictEdgeRiskUseCase
from app.modules.ai.application.submit_voice_report import (
    SubmitTextReportUseCase,
    SubmitVoiceReportUseCase,
)
from app.modules.ai.application.transcribe_voice_report import TranscribeVoiceReportUseCase
from app.modules.ai.application.translate_text import TranslateTextUseCase
from app.modules.ai.application.verify_hazard_photo import VerifyHazardPhotoUseCase
from app.modules.ai.domain.entities import DispatchStop, DispatchVehicle
from app.modules.ai.domain.exceptions import InvalidFeatureVectorError
from app.modules.ai.infrastructure.bhashini_client import get_speech_translation_port
from app.modules.ai.infrastructure.catboost_eta_predictor import get_eta_predictor
from app.modules.ai.infrastructure.feature_store_repository import (
    SqlAlchemyFeatureStoreRepository,
)
from app.modules.ai.infrastructure.onnx_hazard_verifier import get_hazard_verifier
from app.modules.ai.infrastructure.ortools_dispatch_solver import OrToolsDispatchSolver
from app.modules.ai.infrastructure.xgboost_risk_predictor import get_risk_predictor
from app.modules.identity.domain.enums import Capability
from app.modules.identity.domain.principal import PrincipalContext
from app.modules.incidents.infrastructure.repository import SqlAlchemyIncidentRepository
from app.modules.logistics.domain.enums import PriorityTier
from app.modules.logistics.infrastructure.repository import SqlAlchemyLogisticsRepository
from app.modules.network.infrastructure.repository import SqlAlchemyNetworkRepository
from app.modules.network.public import FacilityNotFoundError
from app.modules.reporting.infrastructure.repository import SqlAlchemyReportingRepository
from app.modules.reporting.public import LocationPoint, ReportingModule, ReportSeverity, ReportType
from app.modules.routing.public import VehicleConstraints

# Maps a delivery commitment's priority tier onto the solver's drop-penalty
# weight (aiml developer.md Module 5's w3 term) — higher means the solver
# treats dropping that stop as more costly, so TIER_1 life-saving cargo is
# served before TIER_3 standard cargo whenever capacity is scarce.
_PRIORITY_WEIGHT: dict[PriorityTier, int] = {
    PriorityTier.TIER_1_LIFE_SAVING: 5,
    PriorityTier.TIER_2_ESSENTIAL: 3,
    PriorityTier.TIER_3_STANDARD: 1,
}

router = APIRouter(prefix="/ai", tags=["AI/ML Inference"])


# ─────────────────────────────────────────────────────────────────
# 1. Edge Disruption Risk Prediction (Module 2)
# ─────────────────────────────────────────────────────────────────
@router.post(
    "/predict-risk",
    summary="Predict disruption/blockage probability for a road edge",
    response_model=PredictRiskResponse,
)
async def predict_risk(
    body: PredictRiskRequest,
    db: AsyncSession = Depends(get_db),
    principal: PrincipalContext = Depends(require_authenticated),
) -> PredictRiskResponse:
    feature_store = SqlAlchemyFeatureStoreRepository(db)
    use_case = PredictEdgeRiskUseCase(
        risk_predictor=get_risk_predictor(), feature_store=feature_store
    )
    result = await use_case.execute(
        edge_id=body.edge_id,
        horizon=body.horizon,
        features=body.features,
    )
    return PredictRiskResponse(
        edge_id=result.edge_id,
        horizon=result.horizon,
        probability=result.probability,
        model_status=result.model_status,
        top_contributions=[
            FeatureContributionResponse(
                feature_name=c.feature_name,
                value=c.value,
                shap_contribution=c.shap_contribution,
            )
            for c in result.top_contributions
        ],
    )


# ─────────────────────────────────────────────────────────────────
# 2. Field-Report Photo Hazard Verification (Module 1)
# ─────────────────────────────────────────────────────────────────
@router.post(
    "/verify-photo",
    summary="Classify a field-report photo for hazard type, severity, and blockage",
    response_model=VerifyPhotoResponse,
)
async def verify_photo(
    file: UploadFile,
    principal: PrincipalContext = Depends(require_authenticated),
) -> VerifyPhotoResponse:
    image_bytes = await file.read()
    use_case = VerifyHazardPhotoUseCase(hazard_verifier=get_hazard_verifier())
    result = await use_case.execute(image_bytes)

    return VerifyPhotoResponse(
        hazard_detected=result.hazard_detected,
        hazard_class=result.hazard_class,
        severity_score=result.severity_score,
        is_roadway_blocked=result.is_roadway_blocked,
        confidence=result.confidence,
        model_status=result.model_status,
        detectable_classes=list(result.detectable_classes),
    )


# ─────────────────────────────────────────────────────────────────
# 3. Auto-Triage a Submitted Field Report's Photo (Module 1)
# ─────────────────────────────────────────────────────────────────
@router.post(
    "/auto-triage-report",
    summary="Run CV hazard verification against an already-submitted report's photo",
    response_model=VerifyPhotoResponse,
)
async def auto_triage_report(
    body: AutoTriageReportRequest,
    db: AsyncSession = Depends(get_db),
    principal: PrincipalContext = Depends(require_authenticated),
) -> VerifyPhotoResponse:
    reporting = ReportingModule(SqlAlchemyReportingRepository(db))
    use_case = AutoTriageFieldReportUseCase(
        hazard_verifier=get_hazard_verifier(),
        reporting=reporting,
        object_storage=get_storage_service(),
    )
    result = await use_case.execute(body.report_id)

    return VerifyPhotoResponse(
        hazard_detected=result.hazard_detected,
        hazard_class=result.hazard_class,
        severity_score=result.severity_score,
        is_roadway_blocked=result.is_roadway_blocked,
        confidence=result.confidence,
        model_status=result.model_status,
        detectable_classes=list(result.detectable_classes),
    )


# ─────────────────────────────────────────────────────────────────
# 4. Terrain/Weather-Aware ETA Estimation (Module 3)
# ─────────────────────────────────────────────────────────────────
@router.post(
    "/estimate-eta",
    summary="Estimate calibrated, terrain/weather-adjusted travel time for a route",
    response_model=EstimateEtaResponse,
)
async def estimate_eta(
    body: EstimateEtaRequest,
    db: AsyncSession = Depends(get_db),
    principal: PrincipalContext = Depends(require_authenticated),
) -> EstimateEtaResponse:
    vehicle = VehicleConstraints(
        vehicle_id=body.vehicle_id,
        max_weight_kg=body.max_weight_kg,
        height_m=body.height_m,
        is_hazmat=body.is_hazmat,
        cargo_priority=body.cargo_priority,
        departure_time=datetime.now(UTC),
    )
    network_repo = SqlAlchemyNetworkRepository(db)
    feature_store = SqlAlchemyFeatureStoreRepository(db)
    use_case = EstimateETAUseCase(
        eta_predictor=get_eta_predictor(),
        network_repo=network_repo,
        feature_store=feature_store,
    )
    result = await use_case.execute(edge_ids=body.edge_ids, vehicle=vehicle)

    return EstimateEtaResponse(
        total_seconds=result.total_seconds,
        lower_bound_seconds=result.lower_bound_seconds,
        upper_bound_seconds=result.upper_bound_seconds,
        model_status=result.model_status,
    )


# ─────────────────────────────────────────────────────────────────
# 5. Multi-Stop Dispatch Optimization (Module 5)
# ─────────────────────────────────────────────────────────────────
@router.post(
    "/optimize-dispatch",
    summary="Optimize vehicle-to-delivery assignment and stop ordering (CVRPTW-R)",
    response_model=OptimizeDispatchResponse,
)
async def optimize_dispatch(
    body: OptimizeDispatchRequest,
    db: AsyncSession = Depends(get_db),
    principal: PrincipalContext = Depends(require_authenticated),
) -> OptimizeDispatchResponse:
    network_repo = SqlAlchemyNetworkRepository(db)
    logistics_repo = SqlAlchemyLogisticsRepository(db)

    depot_facility = await network_repo.get_facility_by_id(body.depot_facility_id)
    if depot_facility is None:
        raise FacilityNotFoundError(f"Facility {body.depot_facility_id} not found")
    depot = DispatchStop(
        stop_id=depot_facility.id,
        lon=depot_facility.lon,
        lat=depot_facility.lat,
        demand_kg=0.0,
    )

    stops: list[DispatchStop] = []
    for commitment_id in body.commitment_ids:
        commitment = await logistics_repo.get_commitment_by_id(commitment_id)
        if commitment is None:
            raise InvalidFeatureVectorError(f"Delivery commitment {commitment_id} not found")
        destination = await network_repo.get_facility_by_id(commitment.destination_facility_id)
        if destination is None:
            raise FacilityNotFoundError(f"Facility {commitment.destination_facility_id} not found")
        stops.append(
            DispatchStop(
                stop_id=commitment.id,
                lon=destination.lon,
                lat=destination.lat,
                demand_kg=commitment.consigned_weight_kg,
                priority_weight=_PRIORITY_WEIGHT.get(commitment.priority_tier, 1),
            )
        )

    vehicles: list[DispatchVehicle] = []
    for vehicle_id in body.vehicle_ids:
        vehicle = await logistics_repo.get_vehicle_by_id(vehicle_id)
        if vehicle is None:
            raise InvalidFeatureVectorError(f"Vehicle {vehicle_id} not found")
        vehicles.append(DispatchVehicle(vehicle_id=vehicle.id, capacity_kg=vehicle.max_weight_kg))

    use_case = OptimizeDispatchUseCase(solver=OrToolsDispatchSolver())
    plan = await use_case.execute(depot=depot, stops=stops, vehicles=vehicles)

    return OptimizeDispatchResponse(
        routes=[
            DispatchRouteResponse(
                vehicle_id=r.vehicle_id,
                commitment_ids=r.stop_ids,
                total_distance_meters=r.total_distance_meters,
                total_duration_seconds=r.total_duration_seconds,
            )
            for r in plan.routes
        ],
        unassigned_commitment_ids=plan.unassigned_stop_ids,
    )


# ─────────────────────────────────────────────────────────────────
# 6. Voice-Note Transcription + Translation (Module 4)
# ─────────────────────────────────────────────────────────────────
@router.post(
    "/transcribe-voice",
    summary="Transcribe and translate a field officer's spoken voice note",
    response_model=TranscribeVoiceResponse,
)
async def transcribe_voice(
    file: UploadFile,
    source_language: str = Form(...),
    target_language: str = Form("en"),
    principal: PrincipalContext = Depends(require_authenticated),
) -> TranscribeVoiceResponse:
    audio_bytes = await file.read()
    use_case = TranscribeVoiceReportUseCase(speech_translator=get_speech_translation_port())
    result = await use_case.execute(
        audio_bytes=audio_bytes,
        source_language=source_language,
        target_language=target_language,
    )

    return TranscribeVoiceResponse(
        source_language=result.source_language,
        target_language=result.target_language,
        transcribed_text=result.transcribed_text,
        translated_text=result.translated_text,
        model_status=result.model_status,
    )


# ─────────────────────────────────────────────────────────────────
# 7. Voice Note -> Field Report (Module 4 + Reporting)
# ─────────────────────────────────────────────────────────────────
@router.post(
    "/voice-report",
    summary="Create a field report from a spoken voice note (Bhashini ASR + translation)",
    response_model=VoiceReportResponse,
    status_code=201,
)
async def submit_voice_report(
    file: UploadFile,
    source_language: str = Form(...),
    latitude: float = Form(...),
    longitude: float = Form(...),
    accuracy_m: float = Form(...),
    report_type: ReportType | None = Form(None),
    severity: ReportSeverity | None = Form(None),
    observed_at: datetime | None = Form(None),
    client_operation_id: str | None = Form(None, max_length=128),
    db: AsyncSession = Depends(get_db),
    principal: PrincipalContext = Depends(require_capability(Capability.SUBMIT_REPORT)),
) -> VoiceReportResponse:
    reporting = ReportingModule(
        SqlAlchemyReportingRepository(db), incident_repo=SqlAlchemyIncidentRepository(db)
    )
    use_case = SubmitVoiceReportUseCase(
        speech_translator=get_speech_translation_port(), reporting=reporting
    )
    result = await use_case.execute(
        principal=principal,
        audio_bytes=await file.read(),
        source_language=source_language,
        location=LocationPoint(longitude=longitude, latitude=latitude, accuracy_m=accuracy_m),
        report_type=report_type,
        severity=severity,
        observed_at=observed_at,
        client_operation_id=client_operation_id,
    )
    # get_db() never commits; routers that write must (see network/routing/hazard routers).
    await db.commit()
    report = result.report
    return VoiceReportResponse(
        report_id=report.id,
        review_state=report.review_state.value,
        report_type=report.report_type.value,
        severity=report.severity.value,
        description=report.description,
        candidate_edge_id=report.candidate_edge_id,
        source_language=source_language,
        transcribed_text=result.transcript.transcribed_text if result.transcript else None,
        translated_text=result.transcript.translated_text if result.transcript else None,
        inferred_fields=VoiceReportInferredFields(
            report_type=result.report_type_inferred, severity=result.severity_defaulted
        ),
        replayed=result.replayed,
    )


# ─────────────────────────────────────────────────────────────────
# 8. Typed text translation + text report (languages without ASR)
# ─────────────────────────────────────────────────────────────────
@router.post(
    "/translate-text",
    summary="Machine-translate typed text (Bhashini); works for Assamese, Manipuri, Bodo, Nepali",
    response_model=TranslateTextResponse,
)
async def translate_text(
    body: TranslateTextRequest,
    principal: PrincipalContext = Depends(require_authenticated),
) -> TranslateTextResponse:
    use_case = TranslateTextUseCase(translator=get_speech_translation_port())
    result = await use_case.execute(
        text=body.text, source_language=body.source_language, target_language=body.target_language
    )
    return TranslateTextResponse(
        source_language=result.source_language,
        target_language=result.target_language,
        source_text=result.source_text,
        translated_text=result.translated_text,
        model_status=result.model_status,
    )


@router.post(
    "/text-report",
    summary="Create a field report from typed text in any Bhashini-translatable language",
    response_model=VoiceReportResponse,
    status_code=201,
)
async def submit_text_report(
    body: TextReportRequest,
    db: AsyncSession = Depends(get_db),
    principal: PrincipalContext = Depends(require_capability(Capability.SUBMIT_REPORT)),
) -> VoiceReportResponse:
    reporting = ReportingModule(
        SqlAlchemyReportingRepository(db), incident_repo=SqlAlchemyIncidentRepository(db)
    )
    use_case = SubmitTextReportUseCase(
        speech_translator=get_speech_translation_port(), reporting=reporting
    )
    result = await use_case.execute(
        principal=principal,
        text=body.text,
        source_language=body.source_language,
        location=LocationPoint(
            longitude=body.longitude, latitude=body.latitude, accuracy_m=body.accuracy_m
        ),
        report_type=body.report_type,
        severity=body.severity,
        observed_at=body.observed_at,
        client_operation_id=body.client_operation_id,
    )
    # get_db() never commits; routers that write must (see network/routing/hazard routers).
    await db.commit()
    report = result.report
    return VoiceReportResponse(
        report_id=report.id,
        review_state=report.review_state.value,
        report_type=report.report_type.value,
        severity=report.severity.value,
        description=report.description,
        candidate_edge_id=report.candidate_edge_id,
        source_language=body.source_language,
        transcribed_text=result.transcript.transcribed_text if result.transcript else None,
        translated_text=result.transcript.translated_text if result.transcript else None,
        inferred_fields=VoiceReportInferredFields(
            report_type=result.report_type_inferred, severity=result.severity_defaulted
        ),
        replayed=result.replayed,
    )
