"""
app/scripts/load_pilot_corridor.py — Idempotent Loader for Synthetic Pilot Corridor.

Loads nodes, edges, bridges, and critical facilities for the Guwahati-to-Shillong corridor.
"""

from __future__ import annotations

import asyncio
import json
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID, uuid5

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import AsyncSessionLocal
from app.modules.network.domain.entities import (
    Bridge,
    EdgeRestriction,
    Facility,
    NetworkVersion,
    RoadEdge,
    RoadNode,
)
from app.modules.network.domain.enums import (
    FacilityKind,
    RestrictionKind,
    RoadClass,
    StructuralCondition,
    SurfaceType,
)
from app.modules.network.infrastructure.repository import SqlAlchemyNetworkRepository

# Namespace for deterministic fixture UUIDs
FIXTURE_NAMESPACE = UUID("6ba7b810-9dad-11d1-80b4-00c04fd430c8")

# Known jurisdiction IDs from Phase 2 seed
JURIS_ASSAM = UUID("00000002-0000-4000-8000-000000000001")
JURIS_MEGHALAYA = UUID("00000002-0000-4000-8000-000000000002")


async def load_pilot_corridor_fixture(db: AsyncSession) -> None:
    fixture_path = Path(__file__).resolve().parent.parent.parent / "contracts" / "fixtures" / "pilot_corridor_synthetic.geojson"
    if not fixture_path.exists():
        raise FileNotFoundError(f"Fixture not found at {fixture_path}")

    with open(fixture_path, encoding="utf-8") as f:
        data = json.load(f)

    now = datetime.now(UTC)
    version_id = uuid5(FIXTURE_NAMESPACE, "network_version_v1.0-pilot")
    version = NetworkVersion(
        id=version_id,
        code="v1.0-pilot",
        name="Guwahati-Shillong Strategic Lifeline Corridor",
        status="ACTIVE",
        built_at=now,
        metadata=data.get("metadata", {}),
    )

    nodes: list[RoadNode] = []
    node_index_to_id: dict[int, UUID] = {}

    edges: list[RoadEdge] = []
    bridges: list[Bridge] = []
    bridge_edges: list[tuple[UUID, UUID]] = []
    restrictions: list[EdgeRestriction] = []
    facilities: list[Facility] = []

    # First pass: Nodes
    for feat in data["features"]:
        props = feat["properties"]
        if props.get("element") == "node":
            n_idx = props["node_index"]
            n_id = uuid5(FIXTURE_NAMESPACE, f"node_{n_idx}")
            coords = feat["geometry"]["coordinates"]
            node_index_to_id[n_idx] = n_id

            state_name = props.get("state", "Assam")
            juris_id = JURIS_MEGHALAYA if state_name == "Meghalaya" else JURIS_ASSAM

            nodes.append(
                RoadNode(
                    id=n_id,
                    network_version_id=version_id,
                    node_index=n_idx,
                    lon=coords[0],
                    lat=coords[1],
                    elevation_m=props.get("elevation_m"),
                    jurisdiction_id=juris_id,
                )
            )

    # Second pass: Edges & Bridges
    for feat in data["features"]:
        props = feat["properties"]
        elem = props.get("element")

        if elem == "edge":
            e_idx = props["edge_index"]
            e_id = uuid5(FIXTURE_NAMESPACE, f"edge_{e_idx}")
            s_idx = props["source_index"]
            t_idx = props["target_index"]
            coords = [tuple(c) for c in feat["geometry"]["coordinates"]]

            is_bridge = props.get("is_bridge", False)
            road_class_str = props.get("road_class", "NATIONAL_HIGHWAY")
            surface_str = props.get("surface_type", "PAVED_ASPHALT")

            edge = RoadEdge(
                id=e_id,
                network_version_id=version_id,
                edge_index=e_idx,
                source_node_id=node_index_to_id[s_idx],
                target_node_id=node_index_to_id[t_idx],
                source_index=s_idx,
                target_index=t_idx,
                coordinates=coords,
                length_meters=props["length_meters"],
                road_class=RoadClass(road_class_str),
                surface_type=SurfaceType(surface_str),
                speed_limit_kmh=props["speed_limit_kmh"],
                base_seconds=props["base_seconds"],
                reverse_base_seconds=props.get("reverse_base_seconds", props["base_seconds"]),
                road_name=props.get("road_name"),
                is_bridge=is_bridge,
            )
            edges.append(edge)

            if is_bridge and "bridge_code" in props:
                b_code = props["bridge_code"]
                b_id = uuid5(FIXTURE_NAMESPACE, f"bridge_{b_code}")
                max_w = props.get("max_weight_tonnes")
                is_single = props.get("is_single_lane", False)

                bridge = Bridge(
                    id=b_id,
                    code=b_code,
                    name=props.get("bridge_name", b_code),
                    length_meters=props["length_meters"],
                    max_weight_tonnes=max_w,
                    is_single_lane=is_single,
                    structural_condition=StructuralCondition.GOOD,
                    jurisdiction_id=JURIS_MEGHALAYA,
                )
                bridges.append(bridge)
                bridge_edges.append((b_id, e_id))

                if max_w is not None:
                    restrictions.append(
                        EdgeRestriction(
                            id=uuid5(FIXTURE_NAMESPACE, f"restr_wt_{e_idx}"),
                            edge_id=e_id,
                            kind=RestrictionKind.MAX_WEIGHT,
                            value_numeric=max_w,
                            unit="TONNES",
                            source_reference=f"Bridge limit {b_code}",
                        )
                    )

        elif elem == "facility":
            f_code = props["code"]
            f_id = uuid5(FIXTURE_NAMESPACE, f"fac_{f_code}")
            coords = feat["geometry"]["coordinates"]
            near_n_idx = props.get("nearest_node_index")
            near_n_id = node_index_to_id.get(near_n_idx) if near_n_idx else None

            # Meghalaya vs Assam
            juris_id = JURIS_MEGHALAYA if "SHL" in f_code or "RBH" in f_code else JURIS_ASSAM

            facilities.append(
                Facility(
                    id=f_id,
                    code=f_code,
                    name=props["name"],
                    kind=FacilityKind(props["kind"]),
                    jurisdiction_id=juris_id,
                    lon=coords[0],
                    lat=coords[1],
                    nearest_road_node_id=near_n_id,
                    snap_distance_m=15.0,
                    is_critical=props.get("is_critical", True),
                    is_active=True,
                )
            )

    repo = SqlAlchemyNetworkRepository(db)

    # Persist graph
    await repo.save_network_version(
        version=version,
        nodes=nodes,
        edges=edges,
        bridges=bridges,
        bridge_edge_pairs=bridge_edges,
        restrictions=restrictions,
    )

    # Persist facilities
    await repo.save_facilities(facilities)

    await db.commit()
    print(f"Loaded synthetic pilot corridor: {len(nodes)} nodes, {len(edges)} edges, {len(bridges)} bridges, {len(facilities)} facilities.")


if __name__ == "__main__":
    async def _run() -> None:
        async with AsyncSessionLocal() as session:
            await load_pilot_corridor_fixture(session)

    asyncio.run(_run())
