"""
app/modules/ai/infrastructure/feature_store_repository.py — SQLAlchemy Implementation of
FeatureStoreRepositoryPort.
"""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.ai.application.ports import FeatureStoreRepositoryPort
from app.modules.ai.domain.entities import LandslideEvent, TerrainFeatures, WeatherFeatures
from app.modules.ai.domain.enums import SusceptibilityZone
from app.modules.ai.infrastructure.models import (
    EdgeTerrainFeaturesModel,
    EdgeWeatherFeaturesModel,
    LandslideEventModel,
)


class SqlAlchemyFeatureStoreRepository(FeatureStoreRepositoryPort):
    """Persists and retrieves the AI/ML terrain/weather feature store via SQLAlchemy."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def save_terrain_features(self, features: list[TerrainFeatures]) -> None:
        if not features:
            return
        for f in features:
            stmt = pg_insert(EdgeTerrainFeaturesModel).values(
                edge_id=f.edge_id,
                elevation_min_m=f.elevation_min_m,
                elevation_max_m=f.elevation_max_m,
                elevation_mean_m=f.elevation_mean_m,
                slope_pct=f.slope_pct,
                aspect_deg=f.aspect_deg,
                curvature_index=f.curvature_index,
                susceptibility_zone=f.susceptibility_zone.value,
                distance_to_stream_m=f.distance_to_stream_m,
                computed_at=f.computed_at,
            )
            stmt = stmt.on_conflict_do_update(
                index_elements=[EdgeTerrainFeaturesModel.edge_id],
                set_={
                    "elevation_min_m": stmt.excluded.elevation_min_m,
                    "elevation_max_m": stmt.excluded.elevation_max_m,
                    "elevation_mean_m": stmt.excluded.elevation_mean_m,
                    "slope_pct": stmt.excluded.slope_pct,
                    "aspect_deg": stmt.excluded.aspect_deg,
                    "curvature_index": stmt.excluded.curvature_index,
                    "susceptibility_zone": stmt.excluded.susceptibility_zone,
                    "distance_to_stream_m": stmt.excluded.distance_to_stream_m,
                    "computed_at": stmt.excluded.computed_at,
                },
            )
            await self.db.execute(stmt)

    async def get_terrain_features(self, edge_id: UUID) -> TerrainFeatures | None:
        row = await self.db.get(EdgeTerrainFeaturesModel, edge_id)
        if row is None:
            return None
        return TerrainFeatures(
            edge_id=row.edge_id,
            elevation_min_m=row.elevation_min_m,
            elevation_max_m=row.elevation_max_m,
            elevation_mean_m=row.elevation_mean_m,
            slope_pct=row.slope_pct,
            aspect_deg=row.aspect_deg,
            curvature_index=row.curvature_index,
            susceptibility_zone=SusceptibilityZone(row.susceptibility_zone),
            distance_to_stream_m=row.distance_to_stream_m,
            computed_at=row.computed_at,
        )

    async def save_weather_features(self, features: list[WeatherFeatures]) -> None:
        if not features:
            return
        for f in features:
            stmt = pg_insert(EdgeWeatherFeaturesModel).values(
                edge_id=f.edge_id,
                observed_at=f.observed_at,
                rainfall_24h_mm=f.rainfall_24h_mm,
                rainfall_48h_mm=f.rainfall_48h_mm,
                rainfall_72h_mm=f.rainfall_72h_mm,
                ari_score=f.ari_score,
                forecast_rainfall_3h_mm=f.forecast_rainfall_3h_mm,
                forecast_rainfall_6h_mm=f.forecast_rainfall_6h_mm,
                forecast_rainfall_12h_mm=f.forecast_rainfall_12h_mm,
                soil_moisture_index=f.soil_moisture_index,
            )
            stmt = stmt.on_conflict_do_update(
                index_elements=[
                    EdgeWeatherFeaturesModel.edge_id,
                    EdgeWeatherFeaturesModel.observed_at,
                ],
                set_={
                    "rainfall_24h_mm": stmt.excluded.rainfall_24h_mm,
                    "rainfall_48h_mm": stmt.excluded.rainfall_48h_mm,
                    "rainfall_72h_mm": stmt.excluded.rainfall_72h_mm,
                    "ari_score": stmt.excluded.ari_score,
                    "forecast_rainfall_3h_mm": stmt.excluded.forecast_rainfall_3h_mm,
                    "forecast_rainfall_6h_mm": stmt.excluded.forecast_rainfall_6h_mm,
                    "forecast_rainfall_12h_mm": stmt.excluded.forecast_rainfall_12h_mm,
                    "soil_moisture_index": stmt.excluded.soil_moisture_index,
                },
            )
            await self.db.execute(stmt)

    async def get_latest_weather_features(self, edge_id: UUID) -> WeatherFeatures | None:
        result = await self.db.execute(
            select(EdgeWeatherFeaturesModel)
            .where(EdgeWeatherFeaturesModel.edge_id == edge_id)
            .order_by(EdgeWeatherFeaturesModel.observed_at.desc())
            .limit(1)
        )
        row = result.scalar_one_or_none()
        if row is None:
            return None
        return WeatherFeatures(
            edge_id=row.edge_id,
            observed_at=row.observed_at,
            rainfall_24h_mm=row.rainfall_24h_mm,
            rainfall_48h_mm=row.rainfall_48h_mm,
            rainfall_72h_mm=row.rainfall_72h_mm,
            ari_score=row.ari_score,
            forecast_rainfall_3h_mm=row.forecast_rainfall_3h_mm,
            forecast_rainfall_6h_mm=row.forecast_rainfall_6h_mm,
            forecast_rainfall_12h_mm=row.forecast_rainfall_12h_mm,
            soil_moisture_index=row.soil_moisture_index,
        )

    async def save_landslide_events(self, events: list[LandslideEvent]) -> None:
        if not events:
            return
        self.db.add_all(
            [
                LandslideEventModel(
                    id=e.id,
                    edge_id=e.edge_id,
                    longitude=e.longitude,
                    latitude=e.latitude,
                    occurred_at=e.occurred_at,
                    source=e.source,
                    severity=e.severity,
                )
                for e in events
            ]
        )
