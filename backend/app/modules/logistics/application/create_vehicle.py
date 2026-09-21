"""
app/modules/logistics/application/create_vehicle.py — Register a vehicle use case.
"""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID, uuid4

from app.modules.logistics.application.ports import LogisticsRepositoryPort
from app.modules.logistics.domain.entities import Vehicle
from app.modules.logistics.domain.enums import VehicleType
from app.modules.logistics.domain.exceptions import DuplicateRegistrationError


class CreateVehicleUseCase:
    def __init__(self, repository: LogisticsRepositoryPort):
        self.repository = repository

    async def execute(
        self,
        organization_id: UUID,
        registration_number: str,
        vehicle_type: VehicleType,
        make_model: str,
        max_weight_kg: float,
        empty_weight_kg: float,
        height_m: float,
        width_m: float,
        length_m: float,
        axle_count: int,
        is_hazmat_capable: bool = False,
        is_refrigerated: bool = False,
    ) -> Vehicle:
        norm_reg = registration_number.strip().upper()
        existing = await self.repository.get_vehicle_by_registration(organization_id, norm_reg)
        if existing is not None:
            raise DuplicateRegistrationError(f"Vehicle '{norm_reg}' already exists in this organization")

        now = datetime.now(timezone.utc)
        vehicle = Vehicle(
            id=uuid4(),
            organization_id=organization_id,
            registration_number=norm_reg,
            vehicle_type=vehicle_type,
            make_model=make_model.strip(),
            max_weight_kg=max_weight_kg,
            empty_weight_kg=empty_weight_kg,
            height_m=height_m,
            width_m=width_m,
            length_m=length_m,
            axle_count=axle_count,
            is_hazmat_capable=is_hazmat_capable,
            is_refrigerated=is_refrigerated,
            is_active=True,
            created_at=now,
            updated_at=now,
        )
        return await self.repository.save_vehicle(vehicle)
