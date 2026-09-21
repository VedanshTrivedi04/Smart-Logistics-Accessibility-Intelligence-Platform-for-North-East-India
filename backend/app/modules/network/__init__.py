"""
app/modules/network package.
"""

from app.modules.network.api.router import router
from app.modules.network.public import *  # noqa: F403

__all__ = ["router"]
