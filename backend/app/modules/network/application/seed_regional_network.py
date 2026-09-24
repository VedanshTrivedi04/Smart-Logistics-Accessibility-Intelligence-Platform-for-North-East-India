"""
app/modules/network/application/seed_regional_network.py — Regional Network Expansion & Geometry Correction.

1. Fixes geometric glitches on the Guwahati-Shillong corridor (e.g. edge 107 Nongpoh spur loop).
2. Seeds real National Highway arterial corridors for all 8 North-Eastern states:
   - Assam - Nagaland (NH-27 / NH-29: Nagaon -> Dimapur -> Kohima)
   - Nagaland - Manipur (NH-2: Kohima -> Maram -> Kangpokpi -> Imphal)
   - Meghalaya - Assam - Mizoram (NH-6 / NH-306: Shillong -> Jowai -> Silchar -> Vairengte -> Aizawl)
   - Assam - Tripura (NH-8: Silchar -> Karimganj -> Dharmanagar -> Ambassa -> Agartala)
   - Assam - Arunachal Pradesh (NH-15 / NH-415: Guwahati -> Tezpur -> Banderdewa -> Itanagar -> Pasighat)
   - West Bengal - Sikkim (NH-10: Siliguri -> Sevoke -> Teesta -> Rangpo -> Singtam -> Gangtok)
3. Seeds Tier-1 lifeline facilities (hospitals & distribution hubs) for each state capital.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from geoalchemy2.functions import ST_GeomFromText
from sqlalchemy import select, update, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.modules.network.infrastructure.models import (
    EdgeStatusCurrentModel,
    FacilityModel,
    NetworkVersionModel,
    RoadEdgeModel,
    RoadNodeModel,
)

logger = get_logger(__name__)

FIXTURE_NAMESPACE = uuid.UUID("6ba7b810-9dad-11d1-80b4-00c04fd430c8")
JURIS_ASSAM = uuid.UUID("00000002-0000-4000-8000-000000000001")
JURIS_MEGHALAYA = uuid.UUID("00000002-0000-4000-8000-000000000002")

# Regional Nodes across North-East India
REGIONAL_NODES = [
    # Nagaland Corridor (NH-27 / NH-29)
    {"index": 301, "name": "Nagaon Central Transport Junction", "lon": 92.684, "lat": 26.345, "elev": 65.0, "state": "Assam"},
    {"index": 302, "name": "Golaghat South Logistics Fork", "lon": 93.978, "lat": 26.512, "elev": 95.0, "state": "Assam"},
    {"index": 303, "name": "Dimapur Central Gateway Hub", "lon": 93.726, "lat": 25.906, "elev": 145.0, "state": "Nagaland"},
    {"index": 304, "name": "Chumukedima Hill Base Checkpoint", "lon": 93.775, "lat": 25.820, "elev": 280.0, "state": "Nagaland"},
    {"index": 305, "name": "Kohima State Capital Transport Terminal", "lon": 94.108, "lat": 25.674, "elev": 1444.0, "state": "Nagaland"},

    # Manipur Corridor (NH-2)
    {"index": 306, "name": "Maram Hill Division", "lon": 94.020, "lat": 25.485, "elev": 1380.0, "state": "Manipur"},
    {"index": 307, "name": "Kangpokpi Mountain Transit Point", "lon": 93.970, "lat": 25.150, "elev": 1050.0, "state": "Manipur"},
    {"index": 308, "name": "Imphal Capital Logistics Depot", "lon": 93.940, "lat": 24.817, "elev": 786.0, "state": "Manipur"},

    # Meghalaya - Barak Valley - Mizoram Corridor (NH-6 / NH-306)
    {"index": 309, "name": "Jowai Commercial Crossroads", "lon": 92.200, "lat": 25.450, "elev": 1380.0, "state": "Meghalaya"},
    {"index": 310, "name": "Khliehriat High Plateau Fork", "lon": 92.360, "lat": 25.350, "elev": 1150.0, "state": "Meghalaya"},
    {"index": 311, "name": "Silchar Barak Multimodal Center", "lon": 92.799, "lat": 24.817, "elev": 35.0, "state": "Assam"},
    {"index": 312, "name": "Vairengte Inter-State Gate", "lon": 92.760, "lat": 24.510, "elev": 180.0, "state": "Mizoram"},
    {"index": 313, "name": "Kolasib Hill Division", "lon": 92.680, "lat": 24.230, "elev": 650.0, "state": "Mizoram"},
    {"index": 314, "name": "Aizawl Central Medical Depot", "lon": 92.717, "lat": 23.730, "elev": 1132.0, "state": "Mizoram"},

    # Tripura Corridor (NH-8)
    {"index": 315, "name": "Karimganj Border Gateway", "lon": 92.350, "lat": 24.870, "elev": 22.0, "state": "Assam"},
    {"index": 316, "name": "Dharmanagar Logistics Railhead", "lon": 92.165, "lat": 24.375, "elev": 30.0, "state": "Tripura"},
    {"index": 317, "name": "Ambassa Transport Terminal", "lon": 91.850, "lat": 23.920, "elev": 75.0, "state": "Tripura"},
    {"index": 318, "name": "Agartala Capital Lifeline Hub", "lon": 91.286, "lat": 23.831, "elev": 15.0, "state": "Tripura"},

    # Arunachal Pradesh Corridor (NH-15 / NH-415 / NH-13)
    {"index": 319, "name": "Mangaldai Regional Junction", "lon": 92.030, "lat": 26.440, "elev": 55.0, "state": "Assam"},
    {"index": 320, "name": "Tezpur Brahmaputra Logistics Terminal", "lon": 92.795, "lat": 26.635, "elev": 68.0, "state": "Assam"},
    {"index": 321, "name": "Banderdewa Capital Entry Gate", "lon": 93.810, "lat": 27.100, "elev": 120.0, "state": "Arunachal Pradesh"},
    {"index": 322, "name": "Itanagar State Capital Terminal", "lon": 93.616, "lat": 27.100, "elev": 320.0, "state": "Arunachal Pradesh"},
    {"index": 323, "name": "Pasighat Siang River Lifeline Hub", "lon": 95.330, "lat": 28.066, "elev": 155.0, "state": "Arunachal Pradesh"},

    # Sikkim Corridor (NH-10)
    {"index": 325, "name": "Siliguri Strategic Logistics Gateway", "lon": 88.430, "lat": 26.727, "elev": 122.0, "state": "West Bengal"},
    {"index": 326, "name": "Sevoke Coronation Bridge Junction", "lon": 88.470, "lat": 26.880, "elev": 180.0, "state": "West Bengal"},
    {"index": 327, "name": "Teesta River Valley Highway Post", "lon": 88.490, "lat": 27.050, "elev": 220.0, "state": "West Bengal"},
    {"index": 328, "name": "Rangpo Sikkim Border Checkpost", "lon": 88.530, "lat": 27.175, "elev": 330.0, "state": "Sikkim"},
    {"index": 329, "name": "Singtam Logistics Interchange", "lon": 88.500, "lat": 27.230, "elev": 410.0, "state": "Sikkim"},
    {"index": 330, "name": "Gangtok STNM Hospital Capital Hub", "lon": 88.613, "lat": 27.338, "elev": 1650.0, "state": "Sikkim"},
]

# Regional Highway Edges with realistic multi-point curves
REGIONAL_EDGES = [
    # ── Jorabat to Dimapur & Kohima (Assam & Nagaland) ──
    {
        "index": 301, "src": 4, "tgt": 301, "name": "NH-27 Guwahati-Nagaon Expressway",
        "class": "NATIONAL_HIGHWAY", "speed": 75, "length": 98000.0,
        "coords": [[91.865, 26.085], [91.980, 26.130], [92.150, 26.170], [92.350, 26.220], [92.520, 26.280], [92.684, 26.345]]
    },
    {
        "index": 302, "src": 301, "tgt": 302, "name": "NH-27 Kaziranga Southern Bypass",
        "class": "NATIONAL_HIGHWAY", "speed": 65, "length": 135000.0,
        "coords": [[92.684, 26.345], [92.950, 26.420], [93.200, 26.480], [93.550, 26.540], [93.780, 26.530], [93.978, 26.512]]
    },
    {
        "index": 303, "src": 302, "tgt": 303, "name": "NH-129 Golaghat-Dimapur Inter-State Link",
        "class": "NATIONAL_HIGHWAY", "speed": 60, "length": 72000.0,
        "coords": [[93.978, 26.512], [93.910, 26.340], [93.820, 26.150], [93.750, 26.000], [93.726, 25.906]]
    },
    {
        "index": 304, "src": 303, "tgt": 304, "name": "NH-29 Dimapur-Chumukedima 4-Lane Arterial",
        "class": "NATIONAL_HIGHWAY", "speed": 55, "length": 14000.0,
        "coords": [[93.726, 25.906], [93.740, 25.875], [93.760, 25.845], [93.775, 25.820]]
    },
    {
        "index": 305, "src": 304, "tgt": 305, "name": "NH-29 Chumukedima-Kohima Mountain Highway",
        "class": "NATIONAL_HIGHWAY", "speed": 40, "length": 58000.0,
        "coords": [[93.775, 25.820], [93.840, 25.790], [93.910, 25.760], [93.990, 25.710], [94.050, 25.680], [94.108, 25.674]]
    },

    # ── Kohima to Imphal (Manipur) ──
    {
        "index": 306, "src": 305, "tgt": 306, "name": "NH-2 Kohima-Maram Trans-Barail Highway",
        "class": "NATIONAL_HIGHWAY", "speed": 45, "length": 42000.0,
        "coords": [[94.108, 25.674], [94.080, 25.620], [94.050, 25.550], [94.020, 25.485]]
    },
    {
        "index": 307, "src": 306, "tgt": 307, "name": "NH-2 Maram-Kangpokpi Hill Section",
        "class": "NATIONAL_HIGHWAY", "speed": 45, "length": 48000.0,
        "coords": [[94.020, 25.485], [94.010, 25.380], [93.990, 25.260], [93.970, 25.150]]
    },
    {
        "index": 308, "src": 307, "tgt": 308, "name": "NH-2 Kangpokpi-Imphal Valley Expressway",
        "class": "NATIONAL_HIGHWAY", "speed": 60, "length": 45000.0,
        "coords": [[93.970, 25.150], [93.960, 25.040], [93.950, 24.920], [93.940, 24.817]]
    },

    # ── Shillong to Silchar & Aizawl (Meghalaya, Barak Valley & Mizoram) ──
    {
        "index": 309, "src": 13, "tgt": 309, "name": "NH-6 Shillong-Jowai High Plateau Road",
        "class": "NATIONAL_HIGHWAY", "speed": 55, "length": 64000.0,
        "coords": [[91.885, 25.575], [91.970, 25.550], [92.060, 25.510], [92.140, 25.480], [92.200, 25.450]]
    },
    {
        "index": 310, "src": 309, "tgt": 310, "name": "NH-6 Jowai-Khliehriat Mineral Corridor",
        "class": "NATIONAL_HIGHWAY", "speed": 50, "length": 38000.0,
        "coords": [[92.200, 25.450], [92.260, 25.410], [92.310, 25.380], [92.360, 25.350]]
    },
    {
        "index": 311, "src": 310, "tgt": 311, "name": "NH-6 Khliehriat-Silchar Mountain Ingress",
        "class": "NATIONAL_HIGHWAY", "speed": 40, "length": 118000.0,
        "coords": [[92.360, 25.350], [92.450, 25.220], [92.550, 25.080], [92.680, 24.950], [92.750, 24.880], [92.799, 24.817]]
    },
    {
        "index": 312, "src": 311, "tgt": 312, "name": "NH-306 Silchar-Vairengte Inter-State Link",
        "class": "NATIONAL_HIGHWAY", "speed": 50, "length": 46000.0,
        "coords": [[92.799, 24.817], [92.780, 24.710], [92.770, 24.610], [92.760, 24.510]]
    },
    {
        "index": 313, "src": 312, "tgt": 313, "name": "NH-306 Vairengte-Kolasib Ridge Highway",
        "class": "NATIONAL_HIGHWAY", "speed": 40, "length": 42000.0,
        "coords": [[92.760, 24.510], [92.730, 24.420], [92.700, 24.320], [92.680, 24.230]]
    },
    {
        "index": 314, "src": 313, "tgt": 314, "name": "NH-306 Kolasib-Aizawl Mountain Arterial",
        "class": "NATIONAL_HIGHWAY", "speed": 40, "length": 82000.0,
        "coords": [[92.680, 24.230], [92.690, 24.080], [92.710, 23.920], [92.700, 23.820], [92.717, 23.730]]
    },

    # ── Silchar to Agartala (Tripura) ──
    {
        "index": 315, "src": 311, "tgt": 315, "name": "NH-37 Silchar-Karimganj Connector",
        "class": "NATIONAL_HIGHWAY", "speed": 55, "length": 52000.0,
        "coords": [[92.799, 24.817], [92.650, 24.840], [92.500, 24.860], [92.350, 24.870]]
    },
    {
        "index": 316, "src": 315, "tgt": 316, "name": "NH-8 Karimganj-Dharmanagar Border Link",
        "class": "NATIONAL_HIGHWAY", "speed": 50, "length": 62000.0,
        "coords": [[92.350, 24.870], [92.280, 24.720], [92.220, 24.550], [92.165, 24.375]]
    },
    {
        "index": 317, "src": 316, "tgt": 317, "name": "NH-8 Dharmanagar-Ambassa Hill Highway",
        "class": "NATIONAL_HIGHWAY", "speed": 50, "length": 68000.0,
        "coords": [[92.165, 24.375], [92.050, 24.220], [91.950, 24.080], [91.850, 23.920]]
    },
    {
        "index": 318, "src": 317, "tgt": 318, "name": "NH-8 Ambassa-Agartala Capital Arterial",
        "class": "NATIONAL_HIGHWAY", "speed": 60, "length": 78000.0,
        "coords": [[91.850, 23.920], [91.680, 23.880], [91.480, 23.850], [91.286, 23.831]]
    },

    # ── Guwahati to Tezpur & Itanagar (Assam & Arunachal Pradesh) ──
    {
        "index": 319, "src": 1, "tgt": 319, "name": "NH-15 Amingaon-Mangaldai North Bank Expressway",
        "class": "NATIONAL_HIGHWAY", "speed": 70, "length": 68000.0,
        "coords": [[91.685, 26.185], [91.780, 26.260], [91.910, 26.350], [92.030, 26.440]]
    },
    {
        "index": 320, "src": 319, "tgt": 320, "name": "NH-15 Mangaldai-Tezpur Brahmaputra Highway",
        "class": "NATIONAL_HIGHWAY", "speed": 70, "length": 86000.0,
        "coords": [[92.030, 26.440], [92.280, 26.510], [92.550, 26.580], [92.795, 26.635]]
    },
    {
        "index": 321, "src": 320, "tgt": 321, "name": "NH-15 Tezpur-Banderdewa Inter-State Highway",
        "class": "NATIONAL_HIGHWAY", "speed": 65, "length": 112000.0,
        "coords": [[92.795, 26.635], [93.120, 26.780], [93.450, 26.940], [93.810, 27.100]]
    },
    {
        "index": 322, "src": 321, "tgt": 322, "name": "NH-415 Banderdewa-Itanagar Capital Expressway",
        "class": "NATIONAL_HIGHWAY", "speed": 50, "length": 28000.0,
        "coords": [[93.810, 27.100], [93.720, 27.105], [93.616, 27.100]]
    },
    {
        "index": 323, "src": 321, "tgt": 323, "name": "NH-515 Banderdewa-Pasighat Trans-Arunachal Road",
        "class": "NATIONAL_HIGHWAY", "speed": 55, "length": 185000.0,
        "coords": [[93.810, 27.100], [94.200, 27.350], [94.650, 27.650], [95.050, 27.900], [95.330, 28.066]]
    },

    # ── Siliguri to Gangtok (Sikkim) ──
    {
        "index": 325, "src": 325, "tgt": 326, "name": "NH-10 Siliguri-Sevoke Coronation Highway",
        "class": "NATIONAL_HIGHWAY", "speed": 55, "length": 22000.0,
        "coords": [[88.430, 26.727], [88.445, 26.780], [88.460, 26.830], [88.470, 26.880]]
    },
    {
        "index": 326, "src": 326, "tgt": 327, "name": "NH-10 Sevoke-Teesta Valley Mountain Corridor",
        "class": "NATIONAL_HIGHWAY", "speed": 40, "length": 24000.0,
        "coords": [[88.470, 26.880], [88.475, 26.940], [88.482, 27.000], [88.490, 27.050]]
    },
    {
        "index": 327, "src": 327, "tgt": 328, "name": "NH-10 Teesta-Rangpo Sikkim Border Highway",
        "class": "NATIONAL_HIGHWAY", "speed": 40, "length": 18000.0,
        "coords": [[88.490, 27.050], [88.505, 27.100], [88.520, 27.140], [88.530, 27.175]]
    },
    {
        "index": 328, "src": 328, "tgt": 329, "name": "NH-10 Rangpo-Singtam Riverbank Arterial",
        "class": "NATIONAL_HIGHWAY", "speed": 45, "length": 12000.0,
        "coords": [[88.530, 27.175], [88.518, 27.200], [88.500, 27.230]]
    },
    {
        "index": 329, "src": 329, "tgt": 330, "name": "NH-10 Singtam-Gangtok Capital Ascent",
        "class": "NATIONAL_HIGHWAY", "speed": 40, "length": 26000.0,
        "coords": [[88.500, 27.230], [88.540, 27.270], [88.580, 27.305], [88.613, 27.338]]
    },
]

# Lifeline Strategic Facilities for Each State
REGIONAL_FACILITIES = [
    {"code": "FAC-NAG-KOH-01", "name": "Naga Hospital Authority Kohima", "kind": "HOSPITAL", "lon": 94.112, "lat": 25.676, "near_node": 305, "state": "Nagaland"},
    {"code": "FAC-MAN-IMP-01", "name": "Jawaharlal Nehru Institute of Medical Sciences (JNIMS)", "kind": "HOSPITAL", "lon": 93.945, "lat": 24.821, "near_node": 308, "state": "Manipur"},
    {"code": "FAC-MIZ-AIZ-01", "name": "Zoram Medical College & Hospital (Falkawn)", "kind": "HOSPITAL", "lon": 92.721, "lat": 23.734, "near_node": 314, "state": "Mizoram"},
    {"code": "FAC-TRP-AGT-01", "name": "Agartala Government Medical College & Hospital", "kind": "HOSPITAL", "lon": 91.291, "lat": 23.835, "near_node": 318, "state": "Tripura"},
    {"code": "FAC-ARU-ITA-01", "name": "Tomo Riba Institute of Health & Medical Sciences", "kind": "HOSPITAL", "lon": 93.620, "lat": 27.104, "near_node": 322, "state": "Arunachal Pradesh"},
    {"code": "FAC-SIK-GTK-01", "name": "STNM Multi-Specialty Hospital Gangtok", "kind": "HOSPITAL", "lon": 88.618, "lat": 27.341, "near_node": 330, "state": "Sikkim"},
    {"code": "FAC-ASM-SLC-01", "name": "Silchar Medical College & Cryogenic Oxygen Plant", "kind": "HOSPITAL", "lon": 92.805, "lat": 24.822, "near_node": 311, "state": "Assam"},
    {"code": "FAC-ASM-TEZ-01", "name": "Tezpur Strategic Disaster Supply Depot", "kind": "DISTRIBUTION_CENTER", "lon": 92.800, "lat": 26.640, "near_node": 320, "state": "Assam"},
    {"code": "FAC-NAG-DMP-01", "name": "Dimapur Multi-Modal Freight Terminal", "kind": "DISTRIBUTION_CENTER", "lon": 93.732, "lat": 25.912, "near_node": 303, "state": "Nagaland"},
]


async def seed_regional_network(db: AsyncSession) -> dict[str, int]:
    """Execute geometry fixes on the GS road and seed the complete 8-state regional network."""
    logger.info("starting_regional_network_seeding")

    # 1. FIX GS ROAD CORRIDOR GLITCHES (Direct PostGIS updates)
    # Edge 107 (Nongpoh Valley Approach): Replace 4km mountain spur loop with true NH-6 alignment
    clean_107_wkt = "SRID=4326;LINESTRING(91.884 25.955, 91.8835 25.946, 91.8821 25.936, 91.8805 25.926, 91.8798 25.918, 91.8812 25.910, 91.881 25.905)"
    await db.execute(
        text("UPDATE road_edges SET geom = ST_GeomFromText(:wkt, 4326) WHERE edge_index = 107"),
        {"wkt": clean_107_wkt}
    )

    # Edge 105 (Khasi Hills Ascending Sector): Clean smooth curvature
    clean_105_wkt = "SRID=4326;LINESTRING(91.875 26.045, 91.8762 26.031, 91.8778 26.012, 91.8795 25.985, 91.8810 25.972, 91.882 25.965)"
    await db.execute(
        text("UPDATE road_edges SET geom = ST_GeomFromText(:wkt, 4326) WHERE edge_index = 105"),
        {"wkt": clean_105_wkt}
    )

    # Edge 108 (Nongpoh-Umsning): Clean curvature
    clean_108_wkt = "SRID=4326;LINESTRING(91.881 25.905, 91.8825 25.875, 91.8850 25.840, 91.8820 25.810, 91.8900 25.775, 91.9060 25.758, 91.912 25.755)"
    await db.execute(
        text("UPDATE road_edges SET geom = ST_GeomFromText(:wkt, 4326) WHERE edge_index = 108"),
        {"wkt": clean_108_wkt}
    )

    # Edge 109 (Barapani Lake Approach): Clean curvature
    clean_109_wkt = "SRID=4326;LINESTRING(91.912 25.755, 91.9095 25.725, 91.9040 25.695, 91.9020 25.678, 91.908 25.665)"
    await db.execute(
        text("UPDATE road_edges SET geom = ST_GeomFromText(:wkt, 4326) WHERE edge_index = 109"),
        {"wkt": clean_109_wkt}
    )

    # 2. Get active network version
    v_res = await db.execute(select(NetworkVersionModel).where(NetworkVersionModel.status == "ACTIVE").limit(1))
    v_model = v_res.scalar_one_or_none()
    if not v_model:
        # Fallback to any version
        v_res = await db.execute(select(NetworkVersionModel).limit(1))
        v_model = v_res.scalar_one_or_none()
        if not v_model:
            raise RuntimeError("No network version found in database")

    network_version_id = v_model.id

    # 3. Insert or update Regional Nodes
    nodes_added = 0
    node_index_to_id: dict[int, uuid.UUID] = {}

    # Map existing nodes
    existing_nodes = (await db.execute(select(RoadNodeModel.node_index, RoadNodeModel.id))).all()
    for row in existing_nodes:
        node_index_to_id[row[0]] = row[1]

    for n in REGIONAL_NODES:
        n_idx = n["index"]
        if n_idx not in node_index_to_id:
            n_id = uuid.uuid5(FIXTURE_NAMESPACE, f"node_{n_idx}")
            wkt = f"SRID=4326;POINT({n['lon']} {n['lat']})"
            db.add(
                RoadNodeModel(
                    id=n_id,
                    network_version_id=network_version_id,
                    node_index=n_idx,
                    geom=ST_GeomFromText(wkt, 4326),
                    elevation_m=n["elev"],
                    jurisdiction_id=JURIS_ASSAM,
                )
            )
            node_index_to_id[n_idx] = n_id
            nodes_added += 1

    await db.flush()

    # 4. Insert Regional Highway Edges
    edges_added = 0
    now = datetime.now(timezone.utc)

    for e in REGIONAL_EDGES:
        e_idx = e["index"]
        # Check if edge already exists
        chk = await db.execute(select(RoadEdgeModel.id).where(RoadEdgeModel.edge_index == e_idx))
        existing_edge_id = chk.scalar_one_or_none()

        pts_str = ", ".join(f"{c[0]} {c[1]}" for c in e["coords"])
        wkt = f"SRID=4326;LINESTRING({pts_str})"
        speed_mps = e["speed"] * 1000.0 / 3600.0
        base_seconds = e["length"] / speed_mps if speed_mps > 0 else 600.0

        if existing_edge_id:
            # Update existing edge geometry
            await db.execute(
                text("""
                    UPDATE road_edges
                    SET geom = ST_GeomFromText(:wkt, 4326),
                        length_meters = :length,
                        base_seconds = :base_sec,
                        reverse_base_seconds = :base_sec
                    WHERE id = :edge_id
                """),
                {"wkt": wkt, "length": e["length"], "base_sec": base_seconds, "edge_id": existing_edge_id}
            )
        else:
            e_id = uuid.uuid5(FIXTURE_NAMESPACE, f"edge_{e_idx}")
            src_node_id = node_index_to_id[e["src"]]
            tgt_node_id = node_index_to_id[e["tgt"]]

            db.add(
                RoadEdgeModel(
                    id=e_id,
                    network_version_id=network_version_id,
                    edge_index=e_idx,
                    source_node_id=src_node_id,
                    target_node_id=tgt_node_id,
                    source_index=e["src"],
                    target_index=e["tgt"],
                    geom=ST_GeomFromText(wkt, 4326),
                    length_meters=e["length"],
                    road_class=e["class"],
                    road_name=e["name"],
                    surface_type="PAVED_ASPHALT",
                    speed_limit_kmh=e["speed"],
                    base_seconds=base_seconds,
                    reverse_base_seconds=base_seconds,
                    elevation_gain_m=0.0,
                    gradient_percent=2.5,
                    is_bridge=False,
                    jurisdiction_id=JURIS_ASSAM,
                )
            )

            # Ensure default OPEN status
            db.add(
                EdgeStatusCurrentModel(
                    edge_id=e_id,
                    status_version=1,
                    status="OPEN",
                    freshness="FRESH",
                    effective_restrictions={},
                    last_verified_at=now,
                    updated_at=now,
                )
            )
            edges_added += 1

    await db.flush()

    # 5. Insert Regional Lifeline Facilities
    fac_added = 0
    for f in REGIONAL_FACILITIES:
        chk_fac = await db.execute(select(FacilityModel.id).where(FacilityModel.code == f["code"]))
        if not chk_fac.scalar_one_or_none():
            fac_id = uuid.uuid5(FIXTURE_NAMESPACE, f"fac_{f['code']}")
            near_id = node_index_to_id.get(f["near_node"])
            wkt = f"SRID=4326;POINT({f['lon']} {f['lat']})"
            juris_map = {
                "Assam": uuid.UUID("00000002-0000-4000-8000-000000000001"),
                "Meghalaya": uuid.UUID("00000002-0000-4000-8000-000000000002"),
                "Manipur": uuid.UUID("00000002-0000-4000-8000-000000000003"),
                "Tripura": uuid.UUID("00000002-0000-4000-8000-000000000004"),
                "Mizoram": uuid.UUID("00000002-0000-4000-8000-000000000005"),
                "Nagaland": uuid.UUID("00000002-0000-4000-8000-000000000006"),
                "Arunachal Pradesh": uuid.UUID("00000002-0000-4000-8000-000000000007"),
                "Sikkim": uuid.UUID("00000002-0000-4000-8000-000000000008"),
            }
            fac_juris = juris_map.get(f.get("state", "Assam"), JURIS_ASSAM)
            db.add(
                FacilityModel(
                    id=fac_id,
                    code=f["code"],
                    name=f["name"],
                    kind=f["kind"],
                    jurisdiction_id=fac_juris,
                    geom=ST_GeomFromText(wkt, 4326),
                    nearest_road_node_id=near_id,
                    snap_distance_m=12.0,
                    is_critical=True,
                    is_active=True,
                )
            )
            fac_added += 1

    await db.commit()
    logger.info("regional_network_seeded", nodes_added=nodes_added, edges_added=edges_added, facilities_added=fac_added)
    return {"nodes_added": nodes_added, "edges_added": edges_added, "facilities_added": fac_added}
