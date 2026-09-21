"""
app/modules/logistics/application/create_commitment.py — Register a delivery commitment use case.
"""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID, uuid4

from app.modules.logistics.application.ports import LogisticsRepositoryPort
from app.modules.logistics.domain.entities import DeliveryCommitment
from app.modules.logistics.domain.enums import CargoCategory, DeliveryStatus, PriorityTier


class CreateCommitmentUseCase:
    def __init__(self, repository: LogisticsRepositoryPort):
        self.repository = repository

    async def execute(
        self,
        organization_id: UUID,
        consignment_reference: str,
        cargo_category: CargoCategory,
        priority_tier: PriorityTier,
        consigned_weight_kg: float,
        consigned_quantity_units: int,
        origin_facility_id: UUID,
        destination_facility_id: UUID,
        required_before: datetime,
        consigned_volume_m3: float | None = None,
    ) -> DeliveryCommitment:
        now = datetime.now(timezone.utc)
        commitment = DeliveryCommitment(
            id=uuid4(),
            organization_id=organization_id,
            consignment_reference=consignment_reference.strip().upper(),
            cargo_category=cargo_category,
            priority_tier=priority_tier,
            consigned_weight_kg=consigned_weight_kg,
            consigned_volume_m3=consigned_volume_m3,
            consigned_quantity_units=consigned_quantity_units,
            delivered_quantity_units=0,
            origin_facility_id=origin_facility_id,
            destination_facility_id=destination_facility_id,
            required_before=required_before,
            status=DeliveryStatus.PENDING,
            shortage_reason=None,
            created_at=now,
            updated_at=now,
        )
        return await self.repository.save_commitment(commitment)
