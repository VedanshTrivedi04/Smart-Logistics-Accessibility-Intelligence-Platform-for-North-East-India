"""
app/modules/hazard package.
"""

from app.modules.hazard.api.router import router
from app.modules.hazard.public import *  # noqa: F403

__all__ = ["router"]
