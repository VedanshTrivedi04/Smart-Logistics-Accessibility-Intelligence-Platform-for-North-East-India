"""
app/modules/logistics/application/create_driver.py — Register a driver use case.
"""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID, uuid4

from app.modules.logistics.application.ports import LogisticsRepositoryPort
from app.modules.logistics.domain.entities import Driver


class CreateDriverUseCase:
    def __init__(self, repository: LogisticsRepositoryPort):
        self.repository = repository

    async def execute(
        self,
        organization_id: UUID,
        full_name: str,
        phone_e164: str,
        license_number: str,
        license_classes: list[str],
        user_id: UUID | None = None,
    ) -> Driver:
        now = datetime.now(timezone.utc)
        driver = Driver(
            id=uuid4(),
            organization_id=organization_id,
            user_id=user_id,
            full_name=full_name.strip(),
            phone_e164=phone_e164.strip(),
            license_number=license_number.strip().upper(),
            license_classes=license_classes,
            is_active=True,
            created_at=now,
            updated_at=now,
        )
        return await self.repository.save_driver(driver)
