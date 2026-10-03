"""
tests/integration/ai/test_voice_report.py — voice note -> field report against a live seeded DB.

The speech provider is a fake (no network); everything else - Reporting facade, edge snapping,
Policy 21, persistence, idempotency - is real. Requires the pilot corridor + demo seed.
"""

from __future__ import annotations

import uuid
from uuid import UUID

import pytest

from app.core.db import AsyncSessionLocal
from app.core.security import PrincipalContext
from app.modules.ai.application.ports import SpeechTranslationPort
from app.modules.ai.application.submit_voice_report import (
    SubmitTextReportUseCase,
    SubmitVoiceReportUseCase,
)
from app.modules.ai.domain.entities import TextTranslation, VoiceTranscript
from app.modules.ai.domain.enums import ModelStatus
from app.modules.identity.domain.enums import Capability, OrgKind, Role
from app.modules.incidents.infrastructure.repository import SqlAlchemyIncidentRepository
from app.modules.reporting.infrastructure.repository import SqlAlchemyReportingRepository
from app.modules.reporting.public import (
    LocationPoint,
    ReportingModule,
    ReportSeverity,
    ReportType,
)

USER_FIELD_OFFICER = UUID("d0000005-0000-4000-8000-000000000005")
ORG_FIELD_ID = UUID("00000000-0000-4000-a000-000000000002")
JURIS_KAMRUP = UUID("00000003-0000-4000-8000-000000000001")
LOC = LocationPoint(longitude=91.870, latitude=26.065, accuracy_m=10.0)


class FakeTranslator(SpeechTranslationPort):
    def __init__(self, text: str = "There is a landslide on the road") -> None:
        self.text = text
        self.calls = 0

    async def transcribe_and_translate(
        self, audio_bytes: bytes, source_language: str, target_language: str = "en"
    ) -> VoiceTranscript:
        self.calls += 1
        return VoiceTranscript(
            source_language, target_language, "original text", self.text, ModelStatus.LOADED
        )

    async def translate_text(
        self, text: str, source_language: str, target_language: str = "en"
    ) -> TextTranslation:
        self.calls += 1
        return TextTranslation(
            source_language, target_language, text, self.text, ModelStatus.LOADED
        )


@pytest.fixture
def principal() -> PrincipalContext:
    return PrincipalContext(
        user_id=USER_FIELD_OFFICER,
        org_id=ORG_FIELD_ID,
        org_name="Assam Field Authority",
        org_kind=OrgKind.FIELD_AUTHORITY,
        role=Role.FIELD_OFFICER,
        capabilities=frozenset([Capability.SUBMIT_REPORT]),
        jurisdiction_ids=frozenset([JURIS_KAMRUP]),
    )


def _use_case(session, translator: FakeTranslator) -> SubmitVoiceReportUseCase:  # type: ignore[no-untyped-def]
    reporting = ReportingModule(
        SqlAlchemyReportingRepository(session), incident_repo=SqlAlchemyIncidentRepository(session)
    )
    return SubmitVoiceReportUseCase(translator, reporting)


class TestVoiceReportIntegration:
    async def test_persists_report_snapped_and_awaiting_review(
        self, principal: PrincipalContext
    ) -> None:
        translator = FakeTranslator()
        async with AsyncSessionLocal() as session:
            result = await _use_case(session, translator).execute(principal, b"a", "hi", LOC)
            await session.commit()
        report = result.report
        assert report.report_type is ReportType.LANDSLIDE and result.report_type_inferred
        assert report.severity is ReportSeverity.MEDIUM and result.severity_defaulted
        assert report.review_state.value == "SUBMITTED"  # human review, no auto-escalation
        assert report.candidate_edge_id is not None  # snapped to the corridor
        assert report.description.startswith("[Voice report - auto-transcribed, unverified]")

        async with AsyncSessionLocal() as session:
            stored = await ReportingModule(SqlAlchemyReportingRepository(session)).get_report(
                report.id
            )
        assert stored is not None and stored.description == report.description

    async def test_idempotent_replay_skips_second_asr_call(
        self, principal: PrincipalContext
    ) -> None:
        translator = FakeTranslator()
        op_id = f"voice_{uuid.uuid4().hex[:10]}"
        async with AsyncSessionLocal() as session:
            first = await _use_case(session, translator).execute(
                principal, b"a", "hi", LOC, client_operation_id=op_id
            )
            await session.commit()
        async with AsyncSessionLocal() as session:
            again = await _use_case(session, translator).execute(
                principal, b"a", "hi", LOC, client_operation_id=op_id
            )
        assert again.replayed and again.report.id == first.report.id
        assert translator.calls == 1

    async def test_explicit_high_severity_follows_policy_21(
        self, principal: PrincipalContext
    ) -> None:
        async with AsyncSessionLocal() as session:
            result = await _use_case(session, FakeTranslator()).execute(
                principal, b"a", "hi", LOC, ReportType.LANDSLIDE, ReportSeverity.HIGH
            )
            await session.commit()
        assert result.report.review_state.value == "PROVISIONAL_CAUTION"
        assert not result.report_type_inferred and not result.severity_defaulted

    async def test_inferred_type_can_never_trigger_provisional_caution(
        self, principal: PrincipalContext
    ) -> None:
        async with AsyncSessionLocal() as session:
            result = await _use_case(
                session, FakeTranslator("Flooding and a bridge has collapsed")
            ).execute(principal, b"a", "hi", LOC)
            await session.commit()
        # type inferred + severity defaulted to MEDIUM -> stays a normal SUBMITTED report
        assert result.report.review_state.value == "SUBMITTED"
        assert not result.report.is_provisional_caution


class TestTextReportIntegration:
    async def test_assamese_text_report_persisted_with_translation(
        self, principal: PrincipalContext
    ) -> None:
        translator = FakeTranslator("There is a landslide on the road")
        async with AsyncSessionLocal() as session:
            reporting = ReportingModule(
                SqlAlchemyReportingRepository(session),
                incident_repo=SqlAlchemyIncidentRepository(session),
            )
            result = await SubmitTextReportUseCase(translator, reporting).execute(
                principal, "text in assamese", "as", LOC
            )
            await session.commit()
        report = result.report
        assert report.report_type is ReportType.LANDSLIDE and result.report_type_inferred
        assert report.review_state.value == "SUBMITTED" and report.candidate_edge_id is not None
        assert report.description.startswith("[Text report - machine-translated, unverified]")
        assert "text in assamese" in report.description  # original kept for the reviewer
        assert translator.calls == 1
