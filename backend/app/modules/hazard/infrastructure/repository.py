"""
app/modules/hazard/infrastructure/repository.py — PostGIS Repository Implementation for
Landslide Risk & Rainfall Hazard Module.
"""

from __future__ import annotations

from uuid import UUID

from geoalchemy2.shape import from_shape, to_shape
from shapely.geometry import Point, Polygon
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.hazard.application.ports import HazardRepositoryPort
from app.modules.hazard.domain.entities import RainfallObservation, RiskAssessment, RiskZone
from app.modules.hazard.domain.enums import RiskLevel, RiskZoneSource
from app.modules.hazard.infrastructure.models import (
    RainfallObservationModel,
    RiskAssessmentModel,
    RiskZoneModel,
)

# gradient_percent / _GRADIENT_NORMALIZATION_CEILING = base_susceptibility (see risk_scoring.py).
# Kept consistent with SeedRiskZonesFromNetworkUseCase's normalization.
_GRADIENT_NORMALIZATION_CEILING = 40.0


class SqlAlchemyHazardRepository(HazardRepositoryPort):
    """PostGIS implementation for landslide risk zone, rainfall & assessment persistence."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    # ─────────────────────────────────────────────────────────────
    # Risk Zones
    # ─────────────────────────────────────────────────────────────
    def _model_to_entity(self, m: RiskZoneModel) -> RiskZone:
        polygon_shape = to_shape(m.geom)
        ring = [(float(x), float(y)) for x, y in polygon_shape.exterior.coords]

        centroid_shape = to_shape(m.centroid_geom)

        return RiskZone(
            id=m.id,
            name=m.name,
            jurisdiction_id=m.jurisdiction_id,
            source=RiskZoneSource(m.source),
            base_susceptibility=min(m.gradient_percent / _GRADIENT_NORMALIZATION_CEILING, 1.0),
            centroid_lon=centroid_shape.x,
            centroid_lat=centroid_shape.y,
            polygon_coordinates=ring,
            related_edge_id=m.related_edge_id,
            created_at=m.created_at,
        )

    async def get_bounded_risk_zones(
        self,
        min_lon: float,
        min_lat: float,
        max_lon: float,
        max_lat: float,
        limit: int = 500,
    ) -> list[RiskZone]:
        envelope = func.ST_MakeEnvelope(min_lon, min_lat, max_lon, max_lat, 4326)

        stmt = (
            select(RiskZoneModel)
            .where(func.ST_Intersects(RiskZoneModel.geom, envelope))
            .limit(limit)
        )
        res = await self.session.execute(stmt)
        models = res.scalars().all()
        return [self._model_to_entity(m) for m in models]

    async def save_risk_zones(self, zones: list[RiskZone]) -> None:
        for z in zones:
            res = await self.session.execute(select(RiskZoneModel).where(RiskZoneModel.id == z.id))
            if res.scalar_one_or_none():
                continue

            polygon_geom = from_shape(Polygon(z.polygon_coordinates), srid=4326)
            centroid_point = from_shape(Point(z.centroid_lon, z.centroid_lat), srid=4326)
            gradient_percent = z.base_susceptibility * _GRADIENT_NORMALIZATION_CEILING

            self.session.add(
                RiskZoneModel(
                    id=z.id,
                    name=z.name,
                    jurisdiction_id=z.jurisdiction_id,
                    source=z.source.value,
                    gradient_percent=gradient_percent,
                    geom=polygon_geom,
                    centroid_geom=centroid_point,
                    related_edge_id=z.related_edge_id,
                    created_at=z.created_at,
                )
            )
        await self.session.flush()

    async def get_risk_zone_by_id(self, risk_zone_id: UUID) -> RiskZone | None:
        stmt = select(RiskZoneModel).where(RiskZoneModel.id == risk_zone_id)
        res = await self.session.execute(stmt)
        m = res.scalar_one_or_none()
        if not m:
            return None
        return self._model_to_entity(m)

    async def has_any_risk_zones(self) -> bool:
        stmt = select(RiskZoneModel.id).limit(1)
        res = await self.session.execute(stmt)
        return res.scalar_one_or_none() is not None

    # ─────────────────────────────────────────────────────────────
    # Rainfall Observations
    # ─────────────────────────────────────────────────────────────
    async def save_rainfall_observation(self, observation: RainfallObservation) -> None:
        self.session.add(
            RainfallObservationModel(
                id=observation.id,
                risk_zone_id=observation.risk_zone_id,
                rainfall_mm_1h=observation.rainfall_mm_1h,
                rainfall_mm_24h=observation.rainfall_mm_24h,
                rainfall_mm_72h=observation.rainfall_mm_72h,
                observed_at=observation.observed_at,
                source=observation.source,
            )
        )
        await self.session.flush()

    # ─────────────────────────────────────────────────────────────
    # Risk Assessments
    # ─────────────────────────────────────────────────────────────
    def _assessment_model_to_entity(self, m: RiskAssessmentModel) -> RiskAssessment:
        return RiskAssessment(
            id=m.id,
            risk_zone_id=m.risk_zone_id,
            risk_level=RiskLevel(m.risk_level),
            risk_score=m.risk_score,
            rainfall_mm_24h=m.rainfall_mm_24h,
            rainfall_mm_72h=m.rainfall_mm_72h,
            contributing_factors=m.contributing_factors,
            computed_at=m.computed_at,
        )

    async def save_risk_assessment(self, assessment: RiskAssessment) -> None:
        self.session.add(
            RiskAssessmentModel(
                id=assessment.id,
                risk_zone_id=assessment.risk_zone_id,
                risk_level=assessment.risk_level.value,
                risk_score=assessment.risk_score,
                rainfall_mm_24h=assessment.rainfall_mm_24h,
                rainfall_mm_72h=assessment.rainfall_mm_72h,
                contributing_factors=assessment.contributing_factors,
                computed_at=assessment.computed_at,
            )
        )
        await self.session.flush()

    async def get_latest_assessment(self, risk_zone_id: UUID) -> RiskAssessment | None:
        stmt = (
            select(RiskAssessmentModel)
            .where(RiskAssessmentModel.risk_zone_id == risk_zone_id)
            .order_by(RiskAssessmentModel.computed_at.desc())
            .limit(1)
        )
        res = await self.session.execute(stmt)
        m = res.scalar_one_or_none()
        if not m:
            return None
        return self._assessment_model_to_entity(m)

    async def get_latest_assessments_for_zones(
        self, zone_ids: list[UUID]
    ) -> dict[UUID, RiskAssessment]:
        if not zone_ids:
            return {}

        # Rank rows per zone by recency using a window function, then keep rank 1.
        # Correctness-first approach: filter the ranked subquery's own columns
        # rather than remapping onto the ORM entity, which avoids relying on
        # select_entity_from()'s column-matching against a windowed subquery.
        ranked = (
            select(
                RiskAssessmentModel.id,
                RiskAssessmentModel.risk_zone_id,
                RiskAssessmentModel.risk_level,
                RiskAssessmentModel.risk_score,
                RiskAssessmentModel.rainfall_mm_24h,
                RiskAssessmentModel.rainfall_mm_72h,
                RiskAssessmentModel.contributing_factors,
                RiskAssessmentModel.computed_at,
                func.row_number()
                .over(
                    partition_by=RiskAssessmentModel.risk_zone_id,
                    order_by=RiskAssessmentModel.computed_at.desc(),
                )
                .label("rn"),
            )
            .where(RiskAssessmentModel.risk_zone_id.in_(zone_ids))
            .subquery()
        )

        stmt = select(ranked).where(ranked.c.rn == 1)
        res = await self.session.execute(stmt)
        rows = res.all()

        result: dict[UUID, RiskAssessment] = {}
        for row in rows:
            result[row.risk_zone_id] = RiskAssessment(
                id=row.id,
                risk_zone_id=row.risk_zone_id,
                risk_level=RiskLevel(row.risk_level),
                risk_score=row.risk_score,
                rainfall_mm_24h=row.rainfall_mm_24h,
                rainfall_mm_72h=row.rainfall_mm_72h,
                contributing_factors=row.contributing_factors,
                computed_at=row.computed_at,
            )
        return result
