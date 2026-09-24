"""
app/modules/ai/domain/enums.py — Domain Enums for AI/ML Inference Module.
"""

from __future__ import annotations

from enum import Enum


class RiskHorizon(str, Enum):
    """Forecast horizon for edge disruption risk prediction."""
    H3 = "H3"
    H6 = "H6"
    H12 = "H12"
    H24 = "H24"


class HazardClass(str, Enum):
    """Hazard categories detected by the CV verification model."""
    LANDSLIDE = "LANDSLIDE"
    FLOOD_WATERLOGGING = "FLOOD_WATERLOGGING"
    ROAD_DAMAGE_CRACK = "ROAD_DAMAGE_CRACK"
    TREE_FALL = "TREE_FALL"
    CLEAR_ROAD = "CLEAR_ROAD"


class ModelStatus(str, Enum):
    """Runtime readiness of an inference backend (real model vs. stub fallback)."""
    STUB = "STUB"
    LOADED = "LOADED"


class SusceptibilityZone(str, Enum):
    """GSI Bhusanket landslide susceptibility classification for a road edge."""
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    VERY_HIGH = "VERY_HIGH"
