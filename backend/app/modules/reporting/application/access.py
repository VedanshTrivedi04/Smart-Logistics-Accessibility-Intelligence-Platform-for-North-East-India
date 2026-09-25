"""
app/modules/reporting/application/access.py — Who may see which field report.

Rules (deny by default):
- The reporter always sees their own reports and photos.
- Platform administrators see every report (photos still need VIEW_REPORT_MEDIA).
- Everyone else sees reports whose jurisdiction is inside their granted jurisdictions
  (a STATE grant covers its DISTRICTs). A REGION-level grant also covers reports that were
  never assigned a jurisdiction.
- A principal with no jurisdiction grant sees only their own reports.

get_db() enforces nothing by itself and the database has no row-level security on these
tables, so this policy is the isolation boundary for report data.
"""

from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from app.modules.identity.domain.enums import Role
from app.modules.identity.domain.principal import PrincipalContext


@dataclass(frozen=True)
class ReportScope:
    user_id: UUID
    unrestricted: bool = False
    jurisdiction_ids: frozenset[UUID] = frozenset()
    include_unassigned: bool = False


def scope_for(principal: PrincipalContext) -> ReportScope:
    return ReportScope(
        user_id=principal.user_id,
        unrestricted=principal.role == Role.PLATFORM_ADMINISTRATOR,
        jurisdiction_ids=principal.jurisdiction_ids,
        include_unassigned=principal.region_wide,
    )


def can_view_report(scope: ReportScope, reporter_id: UUID, jurisdiction_id: UUID | None) -> bool:
    if scope.unrestricted or reporter_id == scope.user_id:
        return True
    if jurisdiction_id is None:
        return scope.include_unassigned
    return jurisdiction_id in scope.jurisdiction_ids
