"""
app/modules/hazard/infrastructure/weather_client.py — Open-Meteo rainfall client.

Open-Meteo (https://open-meteo.com) is a free, public weather API that requires
no API key and no account for non-commercial use. We use its hourly
`precipitation` forecast variable with `past_days=3` to reconstruct trailing
1h / 24h / 72h rainfall totals for a coordinate, by summing the hourly
precipitation values (mm) that fall within each trailing window.

Landslide-risk monitoring must never crash because a third-party weather API is
down or slow: every failure mode here is caught and degrades to zeros rather
than propagating, so RefreshRiskAssessmentsUseCase can keep running for the
zones that do succeed.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import httpx

from app.core.logging import get_logger
from app.modules.hazard.application.ports import WeatherProviderPort

logger = get_logger(__name__)

_OPEN_METEO_BASE_URL = "https://api.open-meteo.com/v1/forecast"
_REQUEST_TIMEOUT_SECONDS = 8.0

_ZERO_RAINFALL: dict[str, float] = {
    "rainfall_mm_1h": 0.0,
    "rainfall_mm_24h": 0.0,
    "rainfall_mm_72h": 0.0,
}


class OpenMeteoWeatherClient(WeatherProviderPort):
    """Fetches trailing rainfall totals from the free Open-Meteo public API."""

    async def get_rainfall(self, lat: float, lon: float) -> dict[str, float]:
        params = {
            "latitude": lat,
            "longitude": lon,
            "hourly": "precipitation",
            "past_days": 3,
            "forecast_days": 1,
            "timezone": "UTC",
        }

        try:
            async with httpx.AsyncClient(timeout=_REQUEST_TIMEOUT_SECONDS) as client:
                response = await client.get(_OPEN_METEO_BASE_URL, params=params)
                response.raise_for_status()
                data = response.json()
        except Exception as exc:
            logger.warning("open_meteo_request_failed", lat=lat, lon=lon, error=str(exc))
            return dict(_ZERO_RAINFALL)

        try:
            return self._sum_trailing_windows(data)
        except Exception as exc:
            logger.warning("open_meteo_response_parse_failed", lat=lat, lon=lon, error=str(exc))
            return dict(_ZERO_RAINFALL)

    @staticmethod
    def _sum_trailing_windows(data: dict) -> dict[str, float]:
        hourly = data.get("hourly", {})
        times = hourly.get("time", [])
        values = hourly.get("precipitation", [])

        if not times or not values or len(times) != len(values):
            return dict(_ZERO_RAINFALL)

        now = datetime.now(timezone.utc)
        window_1h_start = now - timedelta(hours=1)
        window_24h_start = now - timedelta(hours=24)
        window_72h_start = now - timedelta(hours=72)

        sum_1h = 0.0
        sum_24h = 0.0
        sum_72h = 0.0

        for time_str, value in zip(times, values):
            if value is None:
                continue
            try:
                ts = datetime.fromisoformat(time_str)
            except ValueError:
                continue
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
            if ts > now:
                # Skip forecast-future hours; we only want observed/trailing rainfall.
                continue

            if ts >= window_72h_start:
                sum_72h += float(value)
            if ts >= window_24h_start:
                sum_24h += float(value)
            if ts >= window_1h_start:
                sum_1h += float(value)

        return {
            "rainfall_mm_1h": round(sum_1h, 2),
            "rainfall_mm_24h": round(sum_24h, 2),
            "rainfall_mm_72h": round(sum_72h, 2),
        }
