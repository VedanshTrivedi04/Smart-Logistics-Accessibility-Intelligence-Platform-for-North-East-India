"""
tests/unit/incidents/test_incident_lifecycle.py — Unit Tests for Incident Lifecycle & Merges.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

import pytest

from app.modules.incidents.domain.entities import Incident, IncidentMerge
from app.modules.incidents.domain.enums import IncidentLifecycle, ResolutionReason
from app.modules.incidents.domain.exceptions import (
    MergeCycleError,
    ReopenIncidentReasonRequiredError,
)
from app.modules.reporting.domain.enums import ReportSeverity


class TestIncidentLifecycle:
    def test_incident_resolution_flow(self) -> None:
        inc = Incident(
            id=uuid.uuid4(),
            primary_report_id=uuid.uuid4(),
            lifecycle=IncidentLifecycle.ACTIVE,
            severity=ReportSeverity.HIGH,
            title="Landslide on NH-6",
            description="Debris slide",
            created_at=datetime.now(timezone.utc),
            version=1,
        )

        resolver = uuid.uuid4()
        inc.resolve(resolver_id=resolver, reason=ResolutionReason.REPAIRS_COMPLETED, notes="Debris cleared by BRO bulldozers")

        assert inc.lifecycle == IncidentLifecycle.RESOLVED
        assert inc.resolution_reason == ResolutionReason.REPAIRS_COMPLETED
        assert inc.resolved_by == resolver
        assert inc.version == 2

    def test_reopen_incident_without_reason_raises_error(self) -> None:
        inc = Incident(
            id=uuid.uuid4(),
            primary_report_id=uuid.uuid4(),
            lifecycle=IncidentLifecycle.RESOLVED,
            severity=ReportSeverity.HIGH,
            title="Landslide on NH-6",
            description="Debris slide",
            created_at=datetime.now(timezone.utc),
            version=2,
        )

        reopener = uuid.uuid4()
        with pytest.raises(ReopenIncidentReasonRequiredError, match="documented reason is strictly required"):
            inc.reopen(reopener_id=reopener, reason="")

    def test_reopen_incident_with_reason_succeeds(self) -> None:
        inc = Incident(
            id=uuid.uuid4(),
            primary_report_id=uuid.uuid4(),
            lifecycle=IncidentLifecycle.RESOLVED,
            severity=ReportSeverity.HIGH,
            title="Landslide on NH-6",
            description="Debris slide",
            created_at=datetime.now(timezone.utc),
            version=2,
        )

        reopener = uuid.uuid4()
        inc.reopen(reopener_id=reopener, reason="Secondary slide triggered by fresh rainfall")

        assert inc.lifecycle == IncidentLifecycle.ACTIVE
        assert inc.reopened_reason == "Secondary slide triggered by fresh rainfall"
        assert inc.reopened_by == reopener
        assert inc.version == 3

    def test_self_merge_raises_error(self) -> None:
        inc_id = uuid.uuid4()
        merge = IncidentMerge(
            id=uuid.uuid4(),
            source_incident_id=inc_id,
            target_incident_id=inc_id,
            merged_by=uuid.uuid4(),
        )
        with pytest.raises(MergeCycleError, match="Cannot merge an incident into itself"):
            merge.validate()
