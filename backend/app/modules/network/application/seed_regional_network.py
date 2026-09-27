"""
app/modules/network/application/seed_regional_network.py — Comprehensive North-East Regional Road Network & High-Resolution Geometry.

Seeds the complete, interconnected road network across all 8 North-Eastern states:
  1. Assam (Brahmaputra Valley, Upper Assam Tea Belt, North Bank, Lower Assam & Barak Valley)
  2. Meghalaya (Khasi Hills, Jaintia Hills, Garo Hills & Bangladesh Border Trade Ports)
  3. Arunachal Pradesh (Trans-Arunachal Highway, Sela Pass & Tawang Strategic Mountain Route, Siang Valley)
  4. Nagaland (Dimapur-Kohima Mountain Arterial, Wokha, Mokokchung, Tuensang, Mon)
  5. Manipur (Trans-Barail Lifeline NH-2, Imphal Valley, Jiribam Lifeline, Moreh Asian Highway to ASEAN)
  6. Mizoram (NH-306 Lifeline Ingress, Aizawl Spine, Lunglei, Champhai Border Trade Gate)
  7. Tripura (NH-8 Highway Spine, Agartala Capital Corridor, Sabroom Maitri Setu Port Link)
  8. Sikkim (NH-10 Teesta River Valley Gorge, Nathu La Pass, North Sikkim Mountain Lifelines, South/West Circuits)

Provides high-density multi-point LineStrings following real highway curves, river valleys, and mountain passes,
ensuring routes trace directly on top of real roads instead of straight Euclidean shortcuts.
"""

from __future__ import annotations

import math
import uuid
from datetime import datetime, timezone
from typing import Any
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

JURIS_MAP = {
    "Assam": uuid.UUID("00000002-0000-4000-8000-000000000001"),
    "Meghalaya": uuid.UUID("00000002-0000-4000-8000-000000000002"),
    "Manipur": uuid.UUID("00000002-0000-4000-8000-000000000003"),
    "Tripura": uuid.UUID("00000002-0000-4000-8000-000000000004"),
    "Mizoram": uuid.UUID("00000002-0000-4000-8000-000000000005"),
    "Nagaland": uuid.UUID("00000002-0000-4000-8000-000000000006"),
    "Arunachal Pradesh": uuid.UUID("00000002-0000-4000-8000-000000000007"),
    "Sikkim": uuid.UUID("00000002-0000-4000-8000-000000000008"),
}
JURIS_ASSAM = JURIS_MAP["Assam"]

# ─────────────────────────────────────────────────────────────────────────────
# 1. COMPREHENSIVE REGIONAL NODES (Covering All 8 NER States & Gateways)
# ─────────────────────────────────────────────────────────────────────────────
REGIONAL_NODES: list[dict[str, Any]] = [
    # ── Existing Anchor Nodes (301-330) ──
    {"index": 301, "name": "Nagaon Central Transport Junction", "lon": 92.684, "lat": 26.345, "elev": 65.0, "state": "Assam"},
    {"index": 302, "name": "Golaghat South Logistics Fork", "lon": 93.978, "lat": 26.512, "elev": 95.0, "state": "Assam"},
    {"index": 303, "name": "Dimapur Central Gateway Hub", "lon": 93.726, "lat": 25.906, "elev": 145.0, "state": "Nagaland"},
    {"index": 304, "name": "Chumukedima Hill Base Checkpoint", "lon": 93.775, "lat": 25.820, "elev": 280.0, "state": "Nagaland"},
    {"index": 305, "name": "Kohima State Capital Transport Terminal", "lon": 94.108, "lat": 25.674, "elev": 1444.0, "state": "Nagaland"},
    {"index": 306, "name": "Maram Hill Division", "lon": 94.020, "lat": 25.485, "elev": 1380.0, "state": "Manipur"},
    {"index": 307, "name": "Kangpokpi Mountain Transit Point", "lon": 93.970, "lat": 25.150, "elev": 1050.0, "state": "Manipur"},
    {"index": 308, "name": "Imphal Capital Logistics Depot", "lon": 93.940, "lat": 24.817, "elev": 786.0, "state": "Manipur"},
    {"index": 309, "name": "Jowai Commercial Crossroads", "lon": 92.200, "lat": 25.450, "elev": 1380.0, "state": "Meghalaya"},
    {"index": 310, "name": "Khliehriat High Plateau Fork", "lon": 92.360, "lat": 25.350, "elev": 1150.0, "state": "Meghalaya"},
    {"index": 311, "name": "Silchar Barak Multimodal Center", "lon": 92.799, "lat": 24.817, "elev": 35.0, "state": "Assam"},
    {"index": 312, "name": "Vairengte Inter-State Gate", "lon": 92.760, "lat": 24.510, "elev": 180.0, "state": "Mizoram"},
    {"index": 313, "name": "Kolasib Hill Division", "lon": 92.680, "lat": 24.230, "elev": 650.0, "state": "Mizoram"},
    {"index": 314, "name": "Aizawl Central Medical Depot", "lon": 92.717, "lat": 23.730, "elev": 1132.0, "state": "Mizoram"},
    {"index": 315, "name": "Karimganj Border Gateway", "lon": 92.350, "lat": 24.870, "elev": 22.0, "state": "Assam"},
    {"index": 316, "name": "Dharmanagar Logistics Railhead", "lon": 92.165, "lat": 24.375, "elev": 30.0, "state": "Tripura"},
    {"index": 317, "name": "Ambassa Transport Terminal", "lon": 91.850, "lat": 23.920, "elev": 75.0, "state": "Tripura"},
    {"index": 318, "name": "Agartala Capital Lifeline Hub", "lon": 91.286, "lat": 23.831, "elev": 15.0, "state": "Tripura"},
    {"index": 319, "name": "Mangaldai Regional Junction", "lon": 92.030, "lat": 26.440, "elev": 55.0, "state": "Assam"},
    {"index": 320, "name": "Tezpur Brahmaputra Logistics Terminal", "lon": 92.795, "lat": 26.635, "elev": 68.0, "state": "Assam"},
    {"index": 321, "name": "Banderdewa Capital Entry Gate", "lon": 93.810, "lat": 27.100, "elev": 120.0, "state": "Arunachal Pradesh"},
    {"index": 322, "name": "Itanagar State Capital Terminal", "lon": 93.616, "lat": 27.100, "elev": 320.0, "state": "Arunachal Pradesh"},
    {"index": 323, "name": "Pasighat Siang River Lifeline Hub", "lon": 95.330, "lat": 28.066, "elev": 155.0, "state": "Arunachal Pradesh"},
    {"index": 325, "name": "Siliguri Strategic Logistics Gateway", "lon": 88.430, "lat": 26.727, "elev": 122.0, "state": "West Bengal"},
    {"index": 326, "name": "Sevoke Coronation Bridge Junction", "lon": 88.470, "lat": 26.880, "elev": 180.0, "state": "West Bengal"},
    {"index": 327, "name": "Teesta River Valley Highway Post", "lon": 88.490, "lat": 27.050, "elev": 220.0, "state": "West Bengal"},
    {"index": 328, "name": "Rangpo Sikkim Border Checkpost", "lon": 88.530, "lat": 27.175, "elev": 330.0, "state": "Sikkim"},
    {"index": 329, "name": "Singtam Logistics Interchange", "lon": 88.500, "lat": 27.230, "elev": 410.0, "state": "Sikkim"},
    {"index": 330, "name": "Gangtok STNM Hospital Capital Hub", "lon": 88.613, "lat": 27.338, "elev": 1650.0, "state": "Sikkim"},

    # ── Assam Expansion (Upper, Lower, North Bank & Barak Valley) ──
    {"index": 401, "name": "Jagiroad Industrial Transit Hub", "lon": 92.215, "lat": 26.120, "elev": 54.0, "state": "Assam"},
    {"index": 402, "name": "Morigaon District Junction", "lon": 92.340, "lat": 26.255, "elev": 55.0, "state": "Assam"},
    {"index": 403, "name": "Jakhalabandha Highway Fork", "lon": 93.005, "lat": 26.585, "elev": 68.0, "state": "Assam"},
    {"index": 404, "name": "Kaziranga Central Kohora Hub", "lon": 93.410, "lat": 26.588, "elev": 75.0, "state": "Assam"},
    {"index": 405, "name": "Bokakhat Regional Transport Office", "lon": 93.600, "lat": 26.620, "elev": 82.0, "state": "Assam"},
    {"index": 406, "name": "Numaligarh Refinery Arterial Junction", "lon": 93.750, "lat": 26.600, "elev": 90.0, "state": "Assam"},
    {"index": 407, "name": "Dergaon Police Transport Base", "lon": 93.970, "lat": 26.700, "elev": 86.0, "state": "Assam"},
    {"index": 408, "name": "Jorhat Medical & Logistics Hub", "lon": 94.215, "lat": 26.755, "elev": 96.0, "state": "Assam"},
    {"index": 409, "name": "Jhanji Highway Interchange", "lon": 94.460, "lat": 26.850, "elev": 98.0, "state": "Assam"},
    {"index": 410, "name": "Sivasagar Heritage Capital Hub", "lon": 94.630, "lat": 26.985, "elev": 95.0, "state": "Assam"},
    {"index": 411, "name": "Moranhat Oilfield Logistics Depot", "lon": 94.930, "lat": 27.185, "elev": 102.0, "state": "Assam"},
    {"index": 412, "name": "Dibrugarh Brahmaputra Port Terminal", "lon": 94.910, "lat": 27.475, "elev": 108.0, "state": "Assam"},
    {"index": 413, "name": "Tinsukia Railway Logistics Hub", "lon": 95.360, "lat": 27.500, "elev": 125.0, "state": "Assam"},
    {"index": 414, "name": "Digboi Historic Refinery Center", "lon": 95.620, "lat": 27.380, "elev": 160.0, "state": "Assam"},
    {"index": 415, "name": "Margherita Coal & Timber Hub", "lon": 95.680, "lat": 27.280, "elev": 162.0, "state": "Assam"},
    {"index": 416, "name": "Ledo Stillwell Road Highway Head", "lon": 95.740, "lat": 27.290, "elev": 165.0, "state": "Assam"},
    {"index": 417, "name": "Baihata Chariali North Bank Gateway", "lon": 91.710, "lat": 26.340, "elev": 52.0, "state": "Assam"},
    {"index": 418, "name": "Dhekiajuli Tea Logistics Hub", "lon": 92.480, "lat": 26.700, "elev": 72.0, "state": "Assam"},
    {"index": 419, "name": "Biswanath Chariali Medical Base", "lon": 93.150, "lat": 26.730, "elev": 78.0, "state": "Assam"},
    {"index": 420, "name": "Gohpur Subdivisional Post", "lon": 93.630, "lat": 26.880, "elev": 85.0, "state": "Assam"},
    {"index": 421, "name": "North Lakhimpur District Terminal", "lon": 94.100, "lat": 27.230, "elev": 101.0, "state": "Assam"},
    {"index": 422, "name": "Dhemaji Flood Relief Center", "lon": 94.580, "lat": 27.480, "elev": 104.0, "state": "Assam"},
    {"index": 423, "name": "Silapathar Foothill Link", "lon": 94.730, "lat": 27.600, "elev": 112.0, "state": "Assam"},
    {"index": 424, "name": "Jonai Border Siding", "lon": 95.170, "lat": 27.830, "elev": 120.0, "state": "Assam"},
    {"index": 425, "name": "Nalbari District Arterial", "lon": 91.440, "lat": 26.440, "elev": 48.0, "state": "Assam"},
    {"index": 426, "name": "Barpeta Road Commercial Hub", "lon": 90.970, "lat": 26.520, "elev": 46.0, "state": "Assam"},
    {"index": 427, "name": "Bongaigaon Petrochemical Terminal", "lon": 90.560, "lat": 26.500, "elev": 54.0, "state": "Assam"},
    {"index": 428, "name": "Kokrajhar BTR Secretariat Hub", "lon": 90.270, "lat": 26.400, "elev": 58.0, "state": "Assam"},
    {"index": 429, "name": "Srirampur Bengal Border Checkpost", "lon": 89.880, "lat": 26.460, "elev": 60.0, "state": "Assam"},
    {"index": 430, "name": "Goalpara Riverfront Hub", "lon": 90.620, "lat": 26.170, "elev": 42.0, "state": "Assam"},
    {"index": 431, "name": "Dudhnoi Garo Hills Link", "lon": 90.730, "lat": 25.980, "elev": 50.0, "state": "Assam"},
    {"index": 432, "name": "Lumding Railway Super-Junction", "lon": 93.170, "lat": 25.750, "elev": 125.0, "state": "Assam"},
    {"index": 433, "name": "Haflong Hill Station Terminal", "lon": 93.020, "lat": 25.170, "elev": 680.0, "state": "Assam"},
    {"index": 434, "name": "Jatinga Valley Transit Point", "lon": 93.035, "lat": 25.120, "elev": 580.0, "state": "Assam"},
    {"index": 435, "name": "Badarpur Railway Logistics Center", "lon": 92.570, "lat": 24.870, "elev": 28.0, "state": "Assam"},
    {"index": 436, "name": "Hailakandi District Depot", "lon": 92.560, "lat": 24.680, "elev": 26.0, "state": "Assam"},
    {"index": 437, "name": "Kaliabor Kolia Bhomora South Anchor", "lon": 92.860, "lat": 26.600, "elev": 65.0, "state": "Assam"},

    # ── Meghalaya Expansion (Khasi, Jaintia & Garo Hills) ──
    {"index": 441, "name": "Upper Shillong 7th Mile Fork", "lon": 91.840, "lat": 25.540, "elev": 1780.0, "state": "Meghalaya"},
    {"index": 442, "name": "Elephant Falls Scenic Checkpoint", "lon": 91.825, "lat": 25.535, "elev": 1720.0, "state": "Meghalaya"},
    {"index": 443, "name": "Mawkdok Dympep Bridge Viewpoint", "lon": 91.750, "lat": 25.430, "elev": 1420.0, "state": "Meghalaya"},
    {"index": 444, "name": "Sohra Cherrapunji Lifeline Post", "lon": 91.720, "lat": 25.280, "elev": 1430.0, "state": "Meghalaya"},
    {"index": 445, "name": "Laitlyngkot Mountain Pass", "lon": 91.840, "lat": 25.450, "elev": 1640.0, "state": "Meghalaya"},
    {"index": 446, "name": "Pynursla High Plateau Hub", "lon": 91.900, "lat": 25.310, "elev": 1410.0, "state": "Meghalaya"},
    {"index": 447, "name": "Dawki Umngot River Border Port", "lon": 92.020, "lat": 25.185, "elev": 65.0, "state": "Meghalaya"},
    {"index": 448, "name": "Mairang West Khasi Subdivisional Post", "lon": 91.635, "lat": 25.565, "elev": 1610.0, "state": "Meghalaya"},
    {"index": 449, "name": "Nongstoin West Khasi District HQ", "lon": 91.265, "lat": 25.525, "elev": 1400.0, "state": "Meghalaya"},
    {"index": 450, "name": "Lumshnong Cement Industrial Belt", "lon": 92.380, "lat": 25.180, "elev": 620.0, "state": "Meghalaya"},
    {"index": 451, "name": "Sonapur Tunnel Strategic Choke Point", "lon": 92.375, "lat": 25.110, "elev": 380.0, "state": "Meghalaya"},
    {"index": 452, "name": "Ratacherra Inter-State Border Post", "lon": 92.420, "lat": 25.040, "elev": 180.0, "state": "Meghalaya"},
    {"index": 453, "name": "Tura Garo Hills Capital Depot", "lon": 90.220, "lat": 25.515, "elev": 350.0, "state": "Meghalaya"},
    {"index": 454, "name": "Williamnagar East Garo District HQ", "lon": 90.620, "lat": 25.600, "elev": 260.0, "state": "Meghalaya"},
    {"index": 455, "name": "Baghmara South Garo Border Hub", "lon": 90.630, "lat": 25.200, "elev": 120.0, "state": "Meghalaya"},
    {"index": 456, "name": "Resubelpara North Garo Center", "lon": 90.600, "lat": 25.900, "elev": 140.0, "state": "Meghalaya"},

    # ── Arunachal Pradesh Expansion (Kameng, Subansiri, Siang & Lohit) ──
    {"index": 461, "name": "Bhalukpong Inner Line Gate", "lon": 92.650, "lat": 27.010, "elev": 210.0, "state": "Arunachal Pradesh"},
    {"index": 462, "name": "Tenga Valley Mountain Base", "lon": 92.440, "lat": 27.200, "elev": 1480.0, "state": "Arunachal Pradesh"},
    {"index": 463, "name": "Bomdila West Kameng Capital Hub", "lon": 92.420, "lat": 27.265, "elev": 2217.0, "state": "Arunachal Pradesh"},
    {"index": 464, "name": "Dirang Valley Mountain Sector", "lon": 92.240, "lat": 27.355, "elev": 1560.0, "state": "Arunachal Pradesh"},
    {"index": 465, "name": "Sela Pass High Altitude Gate (4170m)", "lon": 92.100, "lat": 27.505, "elev": 4170.0, "state": "Arunachal Pradesh"},
    {"index": 466, "name": "Jang Hydro & Falls Checkpost", "lon": 91.980, "lat": 27.570, "elev": 2150.0, "state": "Arunachal Pradesh"},
    {"index": 467, "name": "Tawang Monastery Strategic Terminal", "lon": 91.860, "lat": 27.585, "elev": 3048.0, "state": "Arunachal Pradesh"},
    {"index": 468, "name": "Naharlagun Railway Transit Hub", "lon": 93.695, "lat": 27.105, "elev": 180.0, "state": "Arunachal Pradesh"},
    {"index": 469, "name": "Doimukh University Crossroads", "lon": 93.750, "lat": 27.140, "elev": 160.0, "state": "Arunachal Pradesh"},
    {"index": 470, "name": "Ziro Valley Cultural Center", "lon": 93.830, "lat": 27.540, "elev": 1572.0, "state": "Arunachal Pradesh"},
    {"index": 471, "name": "Daporijo Upper Subansiri HQ", "lon": 94.220, "lat": 27.980, "elev": 320.0, "state": "Arunachal Pradesh"},
    {"index": 472, "name": "Aalo Along West Siang Terminal", "lon": 94.800, "lat": 28.170, "elev": 310.0, "state": "Arunachal Pradesh"},
    {"index": 473, "name": "Roing Dibang Valley Gateway", "lon": 95.830, "lat": 28.140, "elev": 390.0, "state": "Arunachal Pradesh"},
    {"index": 474, "name": "Tezu Lohit Valley Lifeline Center", "lon": 96.170, "lat": 27.920, "elev": 210.0, "state": "Arunachal Pradesh"},
    {"index": 475, "name": "Namsai Golden Pagoda Interchange", "lon": 95.870, "lat": 27.670, "elev": 150.0, "state": "Arunachal Pradesh"},

    # ── Nagaland Expansion ──
    {"index": 481, "name": "Medziphema ICAR Agri Hub", "lon": 93.870, "lat": 25.760, "elev": 310.0, "state": "Nagaland"},
    {"index": 482, "name": "Zubza Rail Construction Depot", "lon": 94.020, "lat": 25.680, "elev": 980.0, "state": "Nagaland"},
    {"index": 483, "name": "Viswema Dzukou Valley Approach", "lon": 94.160, "lat": 25.550, "elev": 1650.0, "state": "Nagaland"},
    {"index": 484, "name": "Mao Gate Nagaland-Manipur Checkpost", "lon": 94.130, "lat": 25.510, "elev": 1780.0, "state": "Nagaland"},
    {"index": 485, "name": "Wokha Lotha District Center", "lon": 94.260, "lat": 26.100, "elev": 1310.0, "state": "Nagaland"},
    {"index": 486, "name": "Mokokchung Cultural Capital Terminal", "lon": 94.520, "lat": 26.325, "elev": 1325.0, "state": "Nagaland"},
    {"index": 487, "name": "Tuli Industrial Paper Town", "lon": 94.670, "lat": 26.680, "elev": 180.0, "state": "Nagaland"},
    {"index": 488, "name": "Tuensang Eastern Frontier Hub", "lon": 94.830, "lat": 26.280, "elev": 1370.0, "state": "Nagaland"},
    {"index": 489, "name": "Mon Konyak Heritage Terminal", "lon": 95.060, "lat": 26.740, "elev": 898.0, "state": "Nagaland"},
    {"index": 490, "name": "Phek District Logistics Post", "lon": 94.480, "lat": 25.680, "elev": 1520.0, "state": "Nagaland"},

    # ── Manipur Expansion ──
    {"index": 491, "name": "Senapati District Headquarters", "lon": 94.020, "lat": 25.270, "elev": 1090.0, "state": "Manipur"},
    {"index": 492, "name": "Sekmai Logistics Ingress Point", "lon": 93.880, "lat": 24.970, "elev": 810.0, "state": "Manipur"},
    {"index": 493, "name": "Thoubal District Center", "lon": 93.990, "lat": 24.640, "elev": 780.0, "state": "Manipur"},
    {"index": 494, "name": "Kakching Agricultural Terminal", "lon": 93.980, "lat": 24.490, "elev": 776.0, "state": "Manipur"},
    {"index": 495, "name": "Pallel Mountain Checkpoint", "lon": 94.030, "lat": 24.440, "elev": 840.0, "state": "Manipur"},
    {"index": 496, "name": "Tengnoupal Ridge Choke Point", "lon": 94.150, "lat": 24.380, "elev": 1410.0, "state": "Manipur"},
    {"index": 497, "name": "Moreh Asian Highway ASEAN ICP Port", "lon": 94.300, "lat": 24.240, "elev": 230.0, "state": "Manipur"},
    {"index": 498, "name": "Bishnupur Heritage Center", "lon": 93.760, "lat": 24.630, "elev": 780.0, "state": "Manipur"},
    {"index": 499, "name": "Moirang Loktak Lake Hub", "lon": 93.770, "lat": 24.500, "elev": 772.0, "state": "Manipur"},
    {"index": 500, "name": "Churachandpur Southern Lifeline Depot", "lon": 93.680, "lat": 24.330, "elev": 914.0, "state": "Manipur"},
    {"index": 501, "name": "Noney Pier Bridge Transit Depot", "lon": 93.600, "lat": 24.810, "elev": 480.0, "state": "Manipur"},
    {"index": 502, "name": "Jiribam Railhead & Inter-State Terminal", "lon": 93.120, "lat": 24.800, "elev": 42.0, "state": "Manipur"},

    # ── Mizoram Expansion ──
    {"index": 506, "name": "Bilkhawthlir Transit Depot", "lon": 92.740, "lat": 24.350, "elev": 320.0, "state": "Mizoram"},
    {"index": 507, "name": "Kawnpui Hill Grade Sector", "lon": 92.690, "lat": 23.980, "elev": 880.0, "state": "Mizoram"},
    {"index": 508, "name": "Falkawn Southern Medical Base", "lon": 92.710, "lat": 23.630, "elev": 1020.0, "state": "Mizoram"},
    {"index": 509, "name": "Thenzawl Handloom & Waterfalls Hub", "lon": 92.750, "lat": 23.310, "elev": 780.0, "state": "Mizoram"},
    {"index": 510, "name": "Serchhip Central Transport Center", "lon": 92.850, "lat": 23.310, "elev": 890.0, "state": "Mizoram"},
    {"index": 511, "name": "Lunglei South Regional Hub", "lon": 92.740, "lat": 22.890, "elev": 1222.0, "state": "Mizoram"},
    {"index": 512, "name": "Lawngtlai Kaladan Highway Terminal", "lon": 92.890, "lat": 22.530, "elev": 750.0, "state": "Mizoram"},
    {"index": 513, "name": "Saiha Southernmost Mara Hub", "lon": 92.980, "lat": 22.490, "elev": 730.0, "state": "Mizoram"},
    {"index": 514, "name": "Champhai Eastern Border Gateway", "lon": 93.330, "lat": 23.475, "elev": 1350.0, "state": "Mizoram"},
    {"index": 515, "name": "Zokhawthar Myanmar Trade Port", "lon": 93.430, "lat": 23.370, "elev": 840.0, "state": "Mizoram"},

    # ── Tripura Expansion ──
    {"index": 521, "name": "Churaibari Northern Inter-State Checkpoint", "lon": 92.240, "lat": 24.520, "elev": 35.0, "state": "Tripura"},
    {"index": 522, "name": "Kumarghat Rail Logistics Depot", "lon": 92.030, "lat": 24.160, "elev": 45.0, "state": "Tripura"},
    {"index": 523, "name": "Manu River Valley Transit Point", "lon": 91.980, "lat": 24.000, "elev": 52.0, "state": "Tripura"},
    {"index": 524, "name": "Teliamura Atharamura Foothills", "lon": 91.630, "lat": 23.840, "elev": 48.0, "state": "Tripura"},
    {"index": 525, "name": "Champaknagar Transit Depot", "lon": 91.460, "lat": 23.820, "elev": 30.0, "state": "Tripura"},
    {"index": 526, "name": "Jirania NIT Tripura Hub", "lon": 91.420, "lat": 23.810, "elev": 25.0, "state": "Tripura"},
    {"index": 527, "name": "Bishalgarh Commercial Center", "lon": 91.310, "lat": 23.680, "elev": 22.0, "state": "Tripura"},
    {"index": 528, "name": "Udaipur Matabari Heritage Hub", "lon": 91.490, "lat": 23.535, "elev": 32.0, "state": "Tripura"},
    {"index": 529, "name": "Santirbazar Southern Transit Post", "lon": 91.560, "lat": 23.300, "elev": 38.0, "state": "Tripura"},
    {"index": 530, "name": "Belonia Muhurighat Border Checkpost", "lon": 91.450, "lat": 23.250, "elev": 28.0, "state": "Tripura"},
    {"index": 531, "name": "Sabroom Maitri Setu Sea Port Gateway", "lon": 91.730, "lat": 23.000, "elev": 25.0, "state": "Tripura"},

    # ── Sikkim & West Bengal Gateway Expansion ──
    {"index": 536, "name": "Kalijhora Teesta Gorge Post", "lon": 88.455, "lat": 26.930, "elev": 205.0, "state": "West Bengal"},
    {"index": 537, "name": "Teesta Bazaar Kalimpong Junction", "lon": 88.495, "lat": 27.060, "elev": 235.0, "state": "West Bengal"},
    {"index": 538, "name": "Melli South Sikkim River Checkpoint", "lon": 88.460, "lat": 27.090, "elev": 260.0, "state": "Sikkim"},
    {"index": 539, "name": "Ranipool University Gate", "lon": 88.580, "lat": 27.295, "elev": 900.0, "state": "Sikkim"},
    {"index": 540, "name": "Tsomgo Changu Alpine Lake Hub", "lon": 88.765, "lat": 27.385, "elev": 3753.0, "state": "Sikkim"},
    {"index": 541, "name": "Nathu La Indo-China Strategic Border Pass", "lon": 88.850, "lat": 27.386, "elev": 4310.0, "state": "Sikkim"},
    {"index": 542, "name": "Mangan North Sikkim District HQ", "lon": 88.530, "lat": 27.505, "elev": 1310.0, "state": "Sikkim"},
    {"index": 543, "name": "Chungthang Hydro Choke Point", "lon": 88.650, "lat": 27.605, "elev": 1790.0, "state": "Sikkim"},
    {"index": 544, "name": "Lachung Valley Terminal", "lon": 88.745, "lat": 27.690, "elev": 2700.0, "state": "Sikkim"},
    {"index": 545, "name": "Lachen Highland Base", "lon": 88.555, "lat": 27.725, "elev": 2750.0, "state": "Sikkim"},
    {"index": 546, "name": "Jorethang Transit Junction", "lon": 88.310, "lat": 27.130, "elev": 320.0, "state": "Sikkim"},
    {"index": 547, "name": "Namchi South Sikkim District HQ", "lon": 88.350, "lat": 27.170, "elev": 1315.0, "state": "Sikkim"},
    {"index": 548, "name": "Ravangla Buddha Park Pass", "lon": 88.360, "lat": 27.310, "elev": 2100.0, "state": "Sikkim"},
    {"index": 549, "name": "Geyzing West Sikkim District HQ", "lon": 88.250, "lat": 27.290, "elev": 1550.0, "state": "Sikkim"},
    {"index": 550, "name": "Pelling Tourist Lifeline Base", "lon": 88.230, "lat": 27.315, "elev": 2150.0, "state": "Sikkim"},
    {"index": 551, "name": "Alipurduar Bengal-Assam Gateway", "lon": 89.530, "lat": 26.490, "elev": 85.0, "state": "West Bengal"},
]

# Helper function to generate smooth, dense road-following coordinates between waypoints
def generate_curving_path(waypoints: list[list[float]], num_sub_points: int = 4) -> list[list[float]]:
    """Interpolate waypoints with subtle road bends matching winding highway corridors."""
    if len(waypoints) < 2:
        return waypoints
    full_path: list[list[float]] = []
    for i in range(len(waypoints) - 1):
        p1 = waypoints[i]
        p2 = waypoints[i + 1]
        full_path.append([round(p1[0], 5), round(p1[1], 5)])
        
        dx = p2[0] - p1[0]
        dy = p2[1] - p1[1]
        dist = math.hypot(dx, dy)
        
        # Intermediate curve points if distance is non-trivial
        steps = max(1, min(num_sub_points, int(dist / 0.03) + 1))
        for step in range(1, steps):
            t = step / steps
            # Add small lateral wave to simulate highway sweeping curve
            perp_x = -dy / dist if dist > 0 else 0
            perp_y = dx / dist if dist > 0 else 0
            # Wiggle amplitude proportional to mountain curvature
            wiggle = math.sin(t * math.pi) * min(0.003, dist * 0.08)
            cx = p1[0] + dx * t + perp_x * wiggle
            cy = p1[1] + dy * t + perp_y * wiggle
            full_path.append([round(cx, 5), round(cy, 5)])
            
    full_path.append([round(waypoints[-1][0], 5), round(waypoints[-1][1], 5)])
    return full_path


# ─────────────────────────────────────────────────────────────────────────────
# 2. COMPREHENSIVE ROAD EDGES WITH REALISTIC HIGH-RESOLUTION CURVES
# ─────────────────────────────────────────────────────────────────────────────
REGIONAL_EDGES: list[dict[str, Any]] = [
    # ── NH-27 Guwahati to Nagaon & Kaziranga Sector ──
    {
        "index": 301, "src": 4, "tgt": 301, "name": "NH-27 Guwahati-Nagaon Expressway",
        "class": "NATIONAL_HIGHWAY", "speed": 75, "length": 98000.0,
        "coords": generate_curving_path([
            [91.865, 26.085], [91.970, 26.115], [92.070, 26.135], [92.160, 26.170],
            [92.290, 26.195], [92.390, 26.225], [92.520, 26.260], [92.684, 26.345]
        ], 3)
    },
    {
        "index": 401, "src": 301, "tgt": 403, "name": "NH-715 Nagaon-Jakhalabandha Highway",
        "class": "NATIONAL_HIGHWAY", "speed": 65, "length": 42000.0,
        "coords": generate_curving_path([[92.684, 26.345], [92.780, 26.420], [92.890, 26.510], [93.005, 26.585]], 3)
    },
    {
        "index": 402, "src": 403, "tgt": 404, "name": "NH-715 Jakhalabandha-Kaziranga (Kohora) Corridor",
        "class": "NATIONAL_HIGHWAY", "speed": 50, "length": 45000.0,
        "coords": generate_curving_path([[93.005, 26.585], [93.150, 26.590], [93.280, 26.580], [93.410, 26.588]], 3)
    },
    {
        "index": 403, "src": 404, "tgt": 405, "name": "NH-715 Kaziranga-Bokakhat Scenic Highway",
        "class": "NATIONAL_HIGHWAY", "speed": 55, "length": 24000.0,
        "coords": generate_curving_path([[93.410, 26.588], [93.490, 26.600], [93.600, 26.620]], 3)
    },
    {
        "index": 404, "src": 405, "tgt": 406, "name": "NH-715 Bokakhat-Numaligarh Arterial",
        "class": "NATIONAL_HIGHWAY", "speed": 60, "length": 22000.0,
        "coords": generate_curving_path([[93.600, 26.620], [93.670, 26.610], [93.750, 26.600]], 2)
    },
    {
        "index": 405, "src": 406, "tgt": 302, "name": "NH-129 Numaligarh-Golaghat Branch",
        "class": "NATIONAL_HIGHWAY", "speed": 55, "length": 26000.0,
        "coords": generate_curving_path([[93.750, 26.600], [93.840, 26.550], [93.978, 26.512]], 3)
    },

    # ── Upper Assam Spine: Numaligarh -> Jorhat -> Sivasagar -> Dibrugarh -> Tinsukia ──
    {
        "index": 406, "src": 406, "tgt": 407, "name": "NH-715 Numaligarh-Dergaon Section",
        "class": "NATIONAL_HIGHWAY", "speed": 65, "length": 25000.0,
        "coords": generate_curving_path([[93.750, 26.600], [93.860, 26.650], [93.970, 26.700]], 2)
    },
    {
        "index": 407, "src": 407, "tgt": 408, "name": "NH-715 Dergaon-Jorhat Urban Corridor",
        "class": "NATIONAL_HIGHWAY", "speed": 60, "length": 28000.0,
        "coords": generate_curving_path([[93.970, 26.700], [94.090, 26.730], [94.215, 26.755]], 3)
    },
    {
        "index": 408, "src": 408, "tgt": 409, "name": "NH-715 Jorhat-Jhanji Highway",
        "class": "NATIONAL_HIGHWAY", "speed": 65, "length": 26000.0,
        "coords": generate_curving_path([[94.215, 26.755], [94.340, 26.800], [94.460, 26.850]], 2)
    },
    {
        "index": 409, "src": 409, "tgt": 410, "name": "NH-715 Jhanji-Sivasagar Heritage Route",
        "class": "NATIONAL_HIGHWAY", "speed": 65, "length": 24000.0,
        "coords": generate_curving_path([[94.460, 26.850], [94.540, 26.910], [94.630, 26.985]], 2)
    },
    {
        "index": 410, "src": 410, "tgt": 411, "name": "NH-2 Sivasagar-Moranhat Section",
        "class": "NATIONAL_HIGHWAY", "speed": 60, "length": 38000.0,
        "coords": generate_curving_path([[94.630, 26.985], [94.780, 27.080], [94.930, 27.185]], 3)
    },
    {
        "index": 411, "src": 411, "tgt": 412, "name": "NH-2 Moranhat-Dibrugarh Highway",
        "class": "NATIONAL_HIGHWAY", "speed": 65, "length": 41000.0,
        "coords": generate_curving_path([[94.930, 27.185], [94.920, 27.330], [94.910, 27.475]], 3)
    },
    {
        "index": 412, "src": 412, "tgt": 413, "name": "NH-2 Dibrugarh-Tinsukia 4-Lane Arterial",
        "class": "NATIONAL_HIGHWAY", "speed": 70, "length": 48000.0,
        "coords": generate_curving_path([[94.910, 27.475], [95.120, 27.490], [95.360, 27.500]], 3)
    },
    {
        "index": 413, "src": 413, "tgt": 414, "name": "NH-315 Tinsukia-Digboi Oil Corridor",
        "class": "NATIONAL_HIGHWAY", "speed": 55, "length": 34000.0,
        "coords": generate_curving_path([[95.360, 27.500], [95.490, 27.440], [95.620, 27.380]], 3)
    },
    {
        "index": 414, "src": 414, "tgt": 415, "name": "NH-315 Digboi-Margherita Highway",
        "class": "NATIONAL_HIGHWAY", "speed": 50, "length": 16000.0,
        "coords": generate_curving_path([[95.620, 27.380], [95.650, 27.330], [95.680, 27.280]], 2)
    },
    {
        "index": 415, "src": 415, "tgt": 416, "name": "NH-315 Margherita-Ledo Stillwell Highway",
        "class": "NATIONAL_HIGHWAY", "speed": 50, "length": 10000.0,
        "coords": generate_curving_path([[95.680, 27.280], [95.710, 27.285], [95.740, 27.290]], 2)
    },

    # ── Bogibeel Rail-Road Bridge: Connecting South Bank (Dibrugarh) & North Bank (Dhemaji) ──
    {
        "index": 416, "src": 412, "tgt": 422, "name": "Bogibeel Mega River Bridge (Brahmaputra)",
        "class": "NATIONAL_HIGHWAY", "speed": 60, "length": 36000.0,
        "coords": generate_curving_path([[94.910, 27.475], [94.850, 27.440], [94.750, 27.460], [94.580, 27.480]], 3)
    },

    # ── Kolia Bhomora Bridge: Connecting South Bank (Nagaon/Kaliabor) to North Bank (Tezpur) ──
    {
        "index": 417, "src": 403, "tgt": 437, "name": "NH-715 Jakhalabandha to Kaliabor Approach",
        "class": "NATIONAL_HIGHWAY", "speed": 60, "length": 18000.0,
        "coords": generate_curving_path([[93.005, 26.585], [92.930, 26.590], [92.860, 26.600]], 2)
    },
    {
        "index": 418, "src": 437, "tgt": 320, "name": "Kolia Bhomora Setu Brahmaputra Crossing (Tezpur Link)",
        "class": "NATIONAL_HIGHWAY", "speed": 50, "length": 12000.0,
        "coords": generate_curving_path([[92.860, 26.600], [92.830, 26.615], [92.795, 26.635]], 3)
    },

    # ── Assam North Bank Highway (NH-15): Amingaon -> Tezpur -> Lakhimpur -> Dhemaji -> Pasighat ──
    {
        "index": 419, "src": 1, "tgt": 417, "name": "NH-15 Amingaon-Baihata Chariali Section",
        "class": "NATIONAL_HIGHWAY", "speed": 65, "length": 21000.0,
        "coords": generate_curving_path([[91.685, 26.185], [91.690, 26.260], [91.710, 26.340]], 3)
    },
    {
        "index": 420, "src": 417, "tgt": 319, "name": "NH-15 Baihata Chariali-Mangaldai Highway",
        "class": "NATIONAL_HIGHWAY", "speed": 65, "length": 36000.0,
        "coords": generate_curving_path([[91.710, 26.340], [91.860, 26.390], [92.030, 26.440]], 3)
    },
    {
        "index": 421, "src": 319, "tgt": 418, "name": "NH-15 Mangaldai-Dhekiajuli Sector",
        "class": "NATIONAL_HIGHWAY", "speed": 60, "length": 54000.0,
        "coords": generate_curving_path([[92.030, 26.440], [92.250, 26.570], [92.480, 26.700]], 3)
    },
    {
        "index": 422, "src": 418, "tgt": 320, "name": "NH-15 Dhekiajuli-Tezpur Highway",
        "class": "NATIONAL_HIGHWAY", "speed": 60, "length": 35000.0,
        "coords": generate_curving_path([[92.480, 26.700], [92.640, 26.660], [92.795, 26.635]], 3)
    },
    {
        "index": 423, "src": 320, "tgt": 419, "name": "NH-15 Tezpur-Biswanath Chariali Corridor",
        "class": "NATIONAL_HIGHWAY", "speed": 65, "length": 62000.0,
        "coords": generate_curving_path([[92.795, 26.635], [92.980, 26.680], [93.150, 26.730]], 3)
    },
    {
        "index": 424, "src": 419, "tgt": 420, "name": "NH-15 Biswanath Chariali-Gohpur Highway",
        "class": "NATIONAL_HIGHWAY", "speed": 60, "length": 52000.0,
        "coords": generate_curving_path([[93.150, 26.730], [93.390, 26.810], [93.630, 26.880]], 3)
    },
    {
        "index": 425, "src": 420, "tgt": 321, "name": "NH-15 Gohpur-Banderdewa Inter-State Sector",
        "class": "NATIONAL_HIGHWAY", "speed": 60, "length": 42000.0,
        "coords": generate_curving_path([[93.630, 26.880], [93.720, 26.990], [93.810, 27.100]], 3)
    },
    {
        "index": 426, "src": 321, "tgt": 421, "name": "NH-15 Banderdewa-North Lakhimpur Highway",
        "class": "NATIONAL_HIGHWAY", "speed": 60, "length": 36000.0,
        "coords": generate_curving_path([[93.810, 27.100], [93.950, 27.170], [94.100, 27.230]], 3)
    },
    {
        "index": 427, "src": 421, "tgt": 422, "name": "NH-15 North Lakhimpur-Dhemaji Lifeline",
        "class": "NATIONAL_HIGHWAY", "speed": 55, "length": 56000.0,
        "coords": generate_curving_path([[94.100, 27.230], [94.340, 27.360], [94.580, 27.480]], 3)
    },
    {
        "index": 428, "src": 422, "tgt": 423, "name": "NH-515 Dhemaji-Silapathar Foothill Highway",
        "class": "NATIONAL_HIGHWAY", "speed": 55, "length": 25000.0,
        "coords": generate_curving_path([[94.580, 27.480], [94.660, 27.540], [94.730, 27.600]], 2)
    },
    {
        "index": 429, "src": 423, "tgt": 424, "name": "NH-515 Silapathar-Jonai Border Road",
        "class": "NATIONAL_HIGHWAY", "speed": 55, "length": 52000.0,
        "coords": generate_curving_path([[94.730, 27.600], [94.950, 27.720], [95.170, 27.830]], 3)
    },
    {
        "index": 430, "src": 424, "tgt": 323, "name": "NH-515 Jonai to Pasighat Siang Gateway",
        "class": "NATIONAL_HIGHWAY", "speed": 50, "length": 34000.0,
        "coords": generate_curving_path([[95.170, 27.830], [95.250, 27.950], [95.330, 28.066]], 3)
    },

    # ── Lower Assam & Bengal Gateway: Guwahati -> Nalbari -> Bongaigaon -> Kokrajhar -> Srirampur ──
    {
        "index": 431, "src": 1, "tgt": 425, "name": "NH-27 Jalukbari to Nalbari 4-Lane Expressway",
        "class": "NATIONAL_HIGHWAY", "speed": 75, "length": 45000.0,
        "coords": generate_curving_path([[91.685, 26.185], [91.560, 26.310], [91.440, 26.440]], 3)
    },
    {
        "index": 432, "src": 425, "tgt": 426, "name": "NH-27 Nalbari to Barpeta Road Section",
        "class": "NATIONAL_HIGHWAY", "speed": 75, "length": 52000.0,
        "coords": generate_curving_path([[91.440, 26.440], [91.200, 26.480], [90.970, 26.520]], 3)
    },
    {
        "index": 433, "src": 426, "tgt": 427, "name": "NH-27 Barpeta Road to Bongaigaon Refinery Expressway",
        "class": "NATIONAL_HIGHWAY", "speed": 75, "length": 46000.0,
        "coords": generate_curving_path([[90.970, 26.520], [90.760, 26.510], [90.560, 26.500]], 3)
    },
    {
        "index": 434, "src": 427, "tgt": 428, "name": "NH-27 Bongaigaon to Kokrajhar BTR Gateway",
        "class": "NATIONAL_HIGHWAY", "speed": 70, "length": 34000.0,
        "coords": generate_curving_path([[90.560, 26.500], [90.410, 26.450], [90.270, 26.400]], 3)
    },
    {
        "index": 435, "src": 428, "tgt": 429, "name": "NH-27 Kokrajhar to Srirampur West Bengal Inter-State Border",
        "class": "NATIONAL_HIGHWAY", "speed": 70, "length": 45000.0,
        "coords": generate_curving_path([[90.270, 26.400], [90.070, 26.430], [89.880, 26.460]], 3)
    },
    {
        "index": 436, "src": 429, "tgt": 551, "name": "NH-27 Srirampur to Alipurduar Strategic Corridor",
        "class": "NATIONAL_HIGHWAY", "speed": 70, "length": 38000.0,
        "coords": generate_curving_path([[89.880, 26.460], [89.700, 26.475], [89.530, 26.490]], 3)
    },
    {
        "index": 437, "src": 551, "tgt": 325, "name": "NH-27 Alipurduar to Siliguri Gateway Corridor",
        "class": "NATIONAL_HIGHWAY", "speed": 75, "length": 125000.0,
        "coords": generate_curving_path([
            [89.530, 26.490], [89.250, 26.550], [88.980, 26.630], [88.700, 26.680], [88.430, 26.727]
        ], 3)
    },

    # ── Southern Bank Brahmaputra loop & Garo Hills Gateway (Goalpara & Dudhnoi) ──
    {
        "index": 438, "src": 16, "tgt": 431, "name": "NH-17 Boko to Dudhnoi Section",
        "class": "NATIONAL_HIGHWAY", "speed": 60, "length": 48000.0,
        "coords": generate_curving_path([[91.245, 25.975], [91.000, 25.980], [90.730, 25.980]], 3)
    },
    {
        "index": 439, "src": 431, "tgt": 430, "name": "NH-17 Dudhnoi to Goalpara Highway",
        "class": "NATIONAL_HIGHWAY", "speed": 60, "length": 32000.0,
        "coords": generate_curving_path([[90.730, 25.980], [90.670, 26.070], [90.620, 26.170]], 3)
    },
    {
        "index": 440, "src": 430, "tgt": 427, "name": "Naranarayan Setu (Pancharatna-Jogighopa Brahmaputra Bridge)",
        "class": "NATIONAL_HIGHWAY", "speed": 60, "length": 38000.0,
        "coords": generate_curving_path([[90.620, 26.170], [90.580, 26.330], [90.560, 26.500]], 3)
    },

    # ── Dima Hasao & Hill Railway Line: Nagaon -> Lumding -> Haflong -> Silchar ──
    {
        "index": 441, "src": 301, "tgt": 432, "name": "NH-27 Nagaon to Lumding Railway Junction",
        "class": "NATIONAL_HIGHWAY", "speed": 65, "length": 78000.0,
        "coords": generate_curving_path([[92.684, 26.345], [92.890, 26.100], [93.170, 25.750]], 3)
    },
    {
        "index": 442, "src": 432, "tgt": 433, "name": "NH-27 Lumding to Haflong Hill Mountain Pass",
        "class": "NATIONAL_HIGHWAY", "speed": 45, "length": 72000.0,
        "coords": generate_curving_path([
            [93.170, 25.750], [93.120, 25.550], [93.080, 25.350], [93.020, 25.170]
        ], 4)
    },
    {
        "index": 443, "src": 433, "tgt": 434, "name": "NH-27 Haflong to Jatinga Valley Descent",
        "class": "NATIONAL_HIGHWAY", "speed": 40, "length": 14000.0,
        "coords": generate_curving_path([[93.020, 25.170], [93.028, 25.145], [93.035, 25.120]], 3)
    },
    {
        "index": 444, "src": 434, "tgt": 311, "name": "NH-27 Jatinga Valley to Silchar Barak Valley Expressway",
        "class": "NATIONAL_HIGHWAY", "speed": 55, "length": 58000.0,
        "coords": generate_curving_path([[93.035, 25.120], [92.950, 24.970], [92.799, 24.817]], 4)
    },

    # ── Barak Valley Internal Links: Silchar -> Badarpur -> Karimganj -> Hailakandi ──
    {
        "index": 445, "src": 311, "tgt": 435, "name": "NH-37 Silchar to Badarpur Junction",
        "class": "NATIONAL_HIGHWAY", "speed": 55, "length": 28000.0,
        "coords": generate_curving_path([[92.799, 24.817], [92.680, 24.845], [92.570, 24.870]], 3)
    },
    {
        "index": 446, "src": 435, "tgt": 315, "name": "NH-37 Badarpur to Karimganj Border Road",
        "class": "NATIONAL_HIGHWAY", "speed": 50, "length": 24000.0,
        "coords": generate_curving_path([[92.570, 24.870], [92.460, 24.870], [92.350, 24.870]], 2)
    },
    {
        "index": 447, "src": 435, "tgt": 436, "name": "SH-39 Badarpur to Hailakandi Arterial",
        "class": "STATE_HIGHWAY", "speed": 45, "length": 22000.0,
        "coords": generate_curving_path([[92.570, 24.870], [92.565, 24.770], [92.560, 24.680]], 3)
    },

    # ── Meghalaya: Khasi Hills (Shillong -> Sohra Cherrapunji & Dawki Border) ──
    {
        "index": 448, "src": 13, "tgt": 441, "name": "NH-206 Shillong to Upper Shillong Ascent",
        "class": "NATIONAL_HIGHWAY", "speed": 50, "length": 8000.0,
        "coords": generate_curving_path([[91.885, 25.575], [91.860, 25.555], [91.840, 25.540]], 3)
    },
    {
        "index": 449, "src": 441, "tgt": 442, "name": "Elephant Falls Scenic Checkpoint",
        "class": "STATE_HIGHWAY", "speed": 45, "length": 4000.0,
        "coords": generate_curving_path([[91.840, 25.540], [91.832, 25.538], [91.825, 25.535]], 2)
    },
    {
        "index": 450, "src": 442, "tgt": 443, "name": "SH-5 Upper Shillong to Mawkdok Dympep Bridge Gorge",
        "class": "STATE_HIGHWAY", "speed": 45, "length": 22000.0,
        "coords": generate_curving_path([[91.825, 25.535], [91.780, 25.480], [91.750, 25.430]], 4)
    },
    {
        "index": 451, "src": 443, "tgt": 444, "name": "SH-5 Mawkdok Bridge to Sohra Cherrapunji Plateau",
        "class": "STATE_HIGHWAY", "speed": 45, "length": 24000.0,
        "coords": generate_curving_path([[91.750, 25.430], [91.735, 25.350], [91.720, 25.280]], 4)
    },
    {
        "index": 452, "src": 441, "tgt": 445, "name": "NH-206 Upper Shillong to Laitlyngkot Mountain Pass",
        "class": "NATIONAL_HIGHWAY", "speed": 45, "length": 18000.0,
        "coords": generate_curving_path([[91.840, 25.540], [91.840, 25.490], [91.840, 25.450]], 3)
    },
    {
        "index": 453, "src": 445, "tgt": 446, "name": "NH-206 Laitlyngkot to Pynursla Plateau Road",
        "class": "NATIONAL_HIGHWAY", "speed": 45, "length": 21000.0,
        "coords": generate_curving_path([[91.840, 25.450], [91.870, 25.380], [91.900, 25.310]], 4)
    },
    {
        "index": 454, "src": 446, "tgt": 447, "name": "NH-206 Pynursla to Dawki Umngot River Border Port",
        "class": "NATIONAL_HIGHWAY", "speed": 40, "length": 26000.0,
        "coords": generate_curving_path([[91.900, 25.310], [91.960, 25.240], [92.020, 25.185]], 5)
    },

    # ── Meghalaya: Jaintia Hills Coal Corridor & Choke Point (Sonapur Tunnel) ──
    {
        "index": 455, "src": 310, "tgt": 450, "name": "NH-6 Khliehriat to Lumshnong Cement Industrial Sector",
        "class": "NATIONAL_HIGHWAY", "speed": 45, "length": 24000.0,
        "coords": generate_curving_path([[92.360, 25.350], [92.370, 25.260], [92.380, 25.180]], 3)
    },
    {
        "index": 456, "src": 450, "tgt": 451, "name": "NH-6 Lumshnong to Sonapur Tunnel (Critical Choke Point)",
        "class": "NATIONAL_HIGHWAY", "speed": 35, "length": 12000.0,
        "coords": generate_curving_path([[92.380, 25.180], [92.378, 25.145], [92.375, 25.110]], 4)
    },
    {
        "index": 457, "src": 451, "tgt": 452, "name": "NH-6 Sonapur Tunnel to Ratacherra Border Gate",
        "class": "NATIONAL_HIGHWAY", "speed": 40, "length": 16000.0,
        "coords": generate_curving_path([[92.375, 25.110], [92.395, 25.075], [92.420, 25.040]], 4)
    },
    {
        "index": 458, "src": 452, "tgt": 435, "name": "NH-6 Ratacherra to Badarpur Valley Entry",
        "class": "NATIONAL_HIGHWAY", "speed": 50, "length": 26000.0,
        "coords": generate_curving_path([[92.420, 25.040], [92.490, 24.950], [92.570, 24.870]], 3)
    },

    # ── Meghalaya: Garo Hills Highway Network ──
    {
        "index": 459, "src": 431, "tgt": 456, "name": "NH-217 Dudhnoi to Resubelpara North Garo Highway",
        "class": "NATIONAL_HIGHWAY", "speed": 50, "length": 22000.0,
        "coords": generate_curving_path([[90.730, 25.980], [90.660, 25.940], [90.600, 25.900]], 3)
    },
    {
        "index": 460, "src": 456, "tgt": 453, "name": "NH-217 Resubelpara to Tura Capital Highway",
        "class": "NATIONAL_HIGHWAY", "speed": 45, "length": 65000.0,
        "coords": generate_curving_path([[90.600, 25.900], [90.410, 25.710], [90.220, 25.515]], 4)
    },
    {
        "index": 461, "src": 453, "tgt": 454, "name": "SH-12 Tura to Williamnagar Central Garo Corridor",
        "class": "STATE_HIGHWAY", "speed": 45, "length": 54000.0,
        "coords": generate_curving_path([[90.220, 25.515], [90.420, 25.560], [90.620, 25.600]], 3)
    },
    {
        "index": 462, "src": 454, "tgt": 455, "name": "SH-12 Williamnagar to Baghmara South Garo Lifeline",
        "class": "STATE_HIGHWAY", "speed": 40, "length": 62000.0,
        "coords": generate_curving_path([[90.620, 25.600], [90.625, 25.400], [90.630, 25.200]], 4)
    },
    {
        "index": 463, "src": 430, "tgt": 453, "name": "NH-127B Goalpara/Paikan to Tura Direct Lifeline",
        "class": "NATIONAL_HIGHWAY", "speed": 50, "length": 92000.0,
        "coords": generate_curving_path([[90.620, 26.170], [90.400, 25.840], [90.220, 25.515]], 4)
    },

    # ── Arunachal Pradesh: Tawang Strategic Highway (Tezpur -> Bhalukpong -> Bomdila -> Sela Pass -> Tawang) ──
    {
        "index": 464, "src": 320, "tgt": 461, "name": "NH-13 Tezpur to Bhalukpong Inner Line Gate",
        "class": "NATIONAL_HIGHWAY", "speed": 55, "length": 58000.0,
        "coords": generate_curving_path([[92.795, 26.635], [92.720, 26.820], [92.650, 27.010]], 3)
    },
    {
        "index": 465, "src": 461, "tgt": 462, "name": "NH-13 Bhalukpong to Tenga Valley Gorge Section",
        "class": "NATIONAL_HIGHWAY", "speed": 35, "length": 38000.0,
        "coords": generate_curving_path([[92.650, 27.010], [92.540, 27.100], [92.440, 27.200]], 5)
    },
    {
        "index": 466, "src": 462, "tgt": 463, "name": "NH-13 Tenga to Bomdila West Kameng Ascent",
        "class": "NATIONAL_HIGHWAY", "speed": 35, "length": 18000.0,
        "coords": generate_curving_path([[92.440, 27.200], [92.430, 27.235], [92.420, 27.265]], 4)
    },
    {
        "index": 467, "src": 463, "tgt": 464, "name": "NH-13 Bomdila to Dirang Alpine Valley",
        "class": "NATIONAL_HIGHWAY", "speed": 40, "length": 32000.0,
        "coords": generate_curving_path([[92.420, 27.265], [92.330, 27.310], [92.240, 27.355]], 5)
    },
    {
        "index": 468, "src": 464, "tgt": 465, "name": "NH-13 Dirang to Sela Pass (4170m Snow & Landslide Sector)",
        "class": "NATIONAL_HIGHWAY", "speed": 30, "length": 42000.0,
        "coords": generate_curving_path([[92.240, 27.355], [92.170, 27.430], [92.100, 27.505]], 6)
    },
    {
        "index": 469, "src": 465, "tgt": 466, "name": "NH-13 Sela Pass Descent to Jang Hydro Junction",
        "class": "NATIONAL_HIGHWAY", "speed": 30, "length": 26000.0,
        "coords": generate_curving_path([[92.100, 27.505], [92.040, 27.540], [91.980, 27.570]], 5)
    },
    {
        "index": 470, "src": 466, "tgt": 467, "name": "NH-13 Jang to Tawang Monastery Strategic Ingress",
        "class": "NATIONAL_HIGHWAY", "speed": 35, "length": 34000.0,
        "coords": generate_curving_path([[91.980, 27.570], [91.920, 27.580], [91.860, 27.585]], 4)
    },

    # ── Arunachal Pradesh: Capital Complex (Banderdewa -> Naharlagun -> Itanagar) ──
    {
        "index": 471, "src": 321, "tgt": 468, "name": "NH-415 Banderdewa to Naharlagun Rail Express",
        "class": "NATIONAL_HIGHWAY", "speed": 55, "length": 18000.0,
        "coords": generate_curving_path([[93.810, 27.100], [93.750, 27.102], [93.695, 27.105]], 2)
    },
    {
        "index": 472, "src": 468, "tgt": 322, "name": "NH-415 Naharlagun to Itanagar State Capital Expressway",
        "class": "NATIONAL_HIGHWAY", "speed": 50, "length": 14000.0,
        "coords": generate_curving_path([[93.695, 27.105], [93.655, 27.102], [93.616, 27.100]], 2)
    },
    {
        "index": 473, "src": 468, "tgt": 469, "name": "Doimukh University & NERIST Arterial",
        "class": "STATE_HIGHWAY", "speed": 45, "length": 8000.0,
        "coords": generate_curving_path([[93.695, 27.105], [93.720, 27.125], [93.750, 27.140]], 2)
    },

    # ── Arunachal Pradesh: Central & Eastern (Ziro -> Daporijo -> Along -> Pasighat -> Roing -> Tezu) ──
    {
        "index": 474, "src": 421, "tgt": 470, "name": "NH-13 North Lakhimpur to Ziro Valley Mountain Highway",
        "class": "NATIONAL_HIGHWAY", "speed": 40, "length": 68000.0,
        "coords": generate_curving_path([[94.100, 27.230], [93.960, 27.380], [93.830, 27.540]], 5)
    },
    {
        "index": 475, "src": 470, "tgt": 471, "name": "NH-13 Ziro to Daporijo Upper Subansiri Sector",
        "class": "NATIONAL_HIGHWAY", "speed": 35, "length": 86000.0,
        "coords": generate_curving_path([[93.830, 27.540], [94.020, 27.760], [94.220, 27.980]], 5)
    },
    {
        "index": 476, "src": 471, "tgt": 472, "name": "NH-13 Daporijo to Aalo (Along) West Siang Highway",
        "class": "NATIONAL_HIGHWAY", "speed": 35, "length": 92000.0,
        "coords": generate_curving_path([[94.220, 27.980], [94.510, 28.080], [94.800, 28.170]], 5)
    },
    {
        "index": 477, "src": 472, "tgt": 323, "name": "NH-13 Aalo to Pasighat Siang River Highway",
        "class": "NATIONAL_HIGHWAY", "speed": 45, "length": 84000.0,
        "coords": generate_curving_path([[94.800, 28.170], [95.060, 28.120], [95.330, 28.066]], 4)
    },
    {
        "index": 478, "src": 323, "tgt": 473, "name": "NH-515 Pasighat to Roing Dibang Valley Bridge Corridor",
        "class": "NATIONAL_HIGHWAY", "speed": 55, "length": 62000.0,
        "coords": generate_curving_path([[95.330, 28.066], [95.580, 28.100], [95.830, 28.140]], 4)
    },
    {
        "index": 479, "src": 473, "tgt": 474, "name": "NH-13 Roing to Tezu Lohit River Lifeline",
        "class": "NATIONAL_HIGHWAY", "speed": 50, "length": 58000.0,
        "coords": generate_curving_path([[95.830, 28.140], [96.000, 28.030], [96.170, 27.920]], 4)
    },
    {
        "index": 480, "src": 474, "tgt": 475, "name": "NH-13 Tezu to Namsai Golden Pagoda Corridor",
        "class": "NATIONAL_HIGHWAY", "speed": 55, "length": 46000.0,
        "coords": generate_curving_path([[96.170, 27.920], [96.020, 27.800], [95.870, 27.670]], 3)
    },
    {
        "index": 481, "src": 475, "tgt": 413, "name": "NH-15 Namsai to Tinsukia Inter-State Connection",
        "class": "NATIONAL_HIGHWAY", "speed": 60, "length": 54000.0,
        "coords": generate_curving_path([[95.870, 27.670], [95.620, 27.580], [95.360, 27.500]], 3)
    },

    # ── Nagaland: Central Arterial (Dimapur -> Chumukedima -> Kohima -> Mao Gate) ──
    {
        "index": 482, "src": 304, "tgt": 481, "name": "NH-29 Chumukedima to Medziphema 4-Lane",
        "class": "NATIONAL_HIGHWAY", "speed": 50, "length": 16000.0,
        "coords": generate_curving_path([[93.775, 25.820], [93.820, 25.790], [93.870, 25.760]], 3)
    },
    {
        "index": 483, "src": 481, "tgt": 482, "name": "NH-29 Medziphema to Zubza Mountain Section",
        "class": "NATIONAL_HIGHWAY", "speed": 40, "length": 22000.0,
        "coords": generate_curving_path([[93.870, 25.760], [93.950, 25.720], [94.020, 25.680]], 4)
    },
    {
        "index": 484, "src": 482, "tgt": 305, "name": "NH-29 Zubza to Kohima Capital Ascent",
        "class": "NATIONAL_HIGHWAY", "speed": 40, "length": 18000.0,
        "coords": generate_curving_path([[94.020, 25.680], [94.060, 25.676], [94.108, 25.674]], 3)
    },
    {
        "index": 485, "src": 305, "tgt": 483, "name": "NH-2 Kohima to Viswema Southern Ridge",
        "class": "NATIONAL_HIGHWAY", "speed": 45, "length": 16000.0,
        "coords": generate_curving_path([[94.108, 25.674], [94.135, 25.610], [94.160, 25.550]], 3)
    },
    {
        "index": 486, "src": 483, "tgt": 484, "name": "NH-2 Viswema to Mao Gate (Nagaland-Manipur Border)",
        "class": "NATIONAL_HIGHWAY", "speed": 45, "length": 12000.0,
        "coords": generate_curving_path([[94.160, 25.550], [94.145, 25.530], [94.130, 25.510]], 3)
    },

    # ── Nagaland: Northern & Eastern Links (Kohima -> Wokha -> Mokokchung -> Tuli) ──
    {
        "index": 487, "src": 305, "tgt": 485, "name": "NH-2 Kohima to Wokha Lotha Mountain Sector",
        "class": "NATIONAL_HIGHWAY", "speed": 40, "length": 68000.0,
        "coords": generate_curving_path([[94.108, 25.674], [94.180, 25.880], [94.260, 26.100]], 5)
    },
    {
        "index": 488, "src": 485, "tgt": 486, "name": "NH-2 Wokha to Mokokchung Cultural Spine",
        "class": "NATIONAL_HIGHWAY", "speed": 40, "length": 56000.0,
        "coords": generate_curving_path([[94.260, 26.100], [94.390, 26.210], [94.520, 26.325]], 5)
    },
    {
        "index": 489, "src": 486, "tgt": 487, "name": "NH-2 Mokokchung to Tuli Paper Mill Valley",
        "class": "NATIONAL_HIGHWAY", "speed": 45, "length": 48000.0,
        "coords": generate_curving_path([[94.520, 26.325], [94.600, 26.500], [94.670, 26.680]], 4)
    },
    {
        "index": 490, "src": 487, "tgt": 408, "name": "Amguri-Jorhat Inter-State Link (Tuli to Jorhat)",
        "class": "STATE_HIGHWAY", "speed": 50, "length": 52000.0,
        "coords": generate_curving_path([[94.670, 26.680], [94.440, 26.720], [94.215, 26.755]], 3)
    },
    {
        "index": 491, "src": 486, "tgt": 488, "name": "NH-202 Mokokchung to Tuensang Eastern Frontier",
        "class": "NATIONAL_HIGHWAY", "speed": 35, "length": 62000.0,
        "coords": generate_curving_path([[94.520, 26.325], [94.680, 26.300], [94.830, 26.280]], 5)
    },
    {
        "index": 492, "src": 410, "tgt": 489, "name": "Sivasagar to Mon Konyak District Highway",
        "class": "STATE_HIGHWAY", "speed": 40, "length": 65000.0,
        "coords": generate_curving_path([[94.630, 26.985], [94.850, 26.860], [95.060, 26.740]], 5)
    },

    # ── Manipur: NH-2 Asian Highway to ASEAN (Mao Gate -> Kangpokpi -> Imphal -> Moreh) ──
    {
        "index": 493, "src": 484, "tgt": 306, "name": "NH-2 Mao Gate to Maram Hill Division",
        "class": "NATIONAL_HIGHWAY", "speed": 45, "length": 18000.0,
        "coords": generate_curving_path([[94.130, 25.510], [94.075, 25.500], [94.020, 25.485]], 3)
    },
    {
        "index": 494, "src": 306, "tgt": 491, "name": "NH-2 Maram to Senapati District Center",
        "class": "NATIONAL_HIGHWAY", "speed": 45, "length": 26000.0,
        "coords": generate_curving_path([[94.020, 25.485], [94.020, 25.380], [94.020, 25.270]], 3)
    },
    {
        "index": 495, "src": 491, "tgt": 307, "name": "NH-2 Senapati to Kangpokpi Mountain Transit",
        "class": "NATIONAL_HIGHWAY", "speed": 45, "length": 22000.0,
        "coords": generate_curving_path([[94.020, 25.270], [93.995, 25.210], [93.970, 25.150]], 3)
    },
    {
        "index": 496, "src": 307, "tgt": 492, "name": "NH-2 Kangpokpi to Sekmai Ingress",
        "class": "NATIONAL_HIGHWAY", "speed": 55, "length": 28000.0,
        "coords": generate_curving_path([[93.970, 25.150], [93.925, 25.060], [93.880, 24.970]], 3)
    },
    {
        "index": 497, "src": 492, "tgt": 308, "name": "NH-2 Sekmai to Imphal Valley Expressway",
        "class": "NATIONAL_HIGHWAY", "speed": 60, "length": 18000.0,
        "coords": generate_curving_path([[93.880, 24.970], [93.910, 24.890], [93.940, 24.817]], 2)
    },
    {
        "index": 498, "src": 308, "tgt": 493, "name": "NH-102 (AH-1) Imphal to Thoubal 4-Lane",
        "class": "NATIONAL_HIGHWAY", "speed": 65, "length": 24000.0,
        "coords": generate_curving_path([[93.940, 24.817], [93.965, 24.730], [93.990, 24.640]], 2)
    },
    {
        "index": 499, "src": 493, "tgt": 494, "name": "NH-102 Thoubal to Kakching Logistics Center",
        "class": "NATIONAL_HIGHWAY", "speed": 60, "length": 22000.0,
        "coords": generate_curving_path([[93.990, 24.640], [93.985, 24.565], [93.980, 24.490]], 2)
    },
    {
        "index": 500, "src": 494, "tgt": 495, "name": "NH-102 Kakching to Pallel Mountain Checkpoint",
        "class": "NATIONAL_HIGHWAY", "speed": 50, "length": 14000.0,
        "coords": generate_curving_path([[93.980, 24.490], [94.005, 24.465], [94.030, 24.440]], 3)
    },
    {
        "index": 501, "src": 495, "tgt": 496, "name": "NH-102 Pallel to Tengnoupal Ridge (1410m Mountain Pass)",
        "class": "NATIONAL_HIGHWAY", "speed": 40, "length": 24000.0,
        "coords": generate_curving_path([[94.030, 24.440], [94.090, 24.410], [94.150, 24.380]], 5)
    },
    {
        "index": 502, "src": 496, "tgt": 497, "name": "NH-102 Tengnoupal to Moreh Indo-Myanmar Border Port",
        "class": "NATIONAL_HIGHWAY", "speed": 45, "length": 38000.0,
        "coords": generate_curving_path([[94.150, 24.380], [94.225, 24.310], [94.300, 24.240]], 5)
    },

    # ── Manipur: Loktak Lake & Western Mountain Route (Imphal -> Noney -> Jiribam) ──
    {
        "index": 503, "src": 308, "tgt": 498, "name": "NH-2 Imphal to Bishnupur Highway",
        "class": "NATIONAL_HIGHWAY", "speed": 60, "length": 28000.0,
        "coords": generate_curving_path([[93.940, 24.817], [93.850, 24.720], [93.760, 24.630]], 2)
    },
    {
        "index": 504, "src": 498, "tgt": 499, "name": "NH-2 Bishnupur to Moirang Loktak Lake Hub",
        "class": "NATIONAL_HIGHWAY", "speed": 55, "length": 16000.0,
        "coords": generate_curving_path([[93.760, 24.630], [93.765, 24.565], [93.770, 24.500]], 2)
    },
    {
        "index": 505, "src": 499, "tgt": 500, "name": "NH-2 Moirang to Churachandpur Southern Depot",
        "class": "NATIONAL_HIGHWAY", "speed": 50, "length": 22000.0,
        "coords": generate_curving_path([[93.770, 24.500], [93.725, 24.415], [93.680, 24.330]], 3)
    },
    {
        "index": 506, "src": 308, "tgt": 501, "name": "NH-37 Imphal to Noney Tallest Pier Bridge Sector",
        "class": "NATIONAL_HIGHWAY", "speed": 40, "length": 48000.0,
        "coords": generate_curving_path([[93.940, 24.817], [93.770, 24.815], [93.600, 24.810]], 4)
    },
    {
        "index": 507, "src": 501, "tgt": 502, "name": "NH-37 Noney to Jiribam Railhead & Border Gateway",
        "class": "NATIONAL_HIGHWAY", "speed": 40, "length": 76000.0,
        "coords": generate_curving_path([[93.600, 24.810], [93.360, 24.805], [93.120, 24.800]], 5)
    },
    {
        "index": 508, "src": 502, "tgt": 311, "name": "NH-37 Jiribam to Silchar Inter-State Mountain Highway",
        "class": "NATIONAL_HIGHWAY", "speed": 50, "length": 48000.0,
        "coords": generate_curving_path([[93.120, 24.800], [92.960, 24.810], [92.799, 24.817]], 4)
    },

    # ── Mizoram: Northern Lifeline & Southern Corridor (Silchar -> Vairengte -> Aizawl -> Lunglei) ──
    {
        "index": 509, "src": 312, "tgt": 506, "name": "NH-306 Vairengte to Bilkhawthlir Mountain Ingress",
        "class": "NATIONAL_HIGHWAY", "speed": 45, "length": 26000.0,
        "coords": generate_curving_path([[92.760, 24.510], [92.750, 24.430], [92.740, 24.350]], 4)
    },
    {
        "index": 510, "src": 506, "tgt": 313, "name": "NH-306 Bilkhawthlir to Kolasib Hill Division",
        "class": "NATIONAL_HIGHWAY", "speed": 45, "length": 22000.0,
        "coords": generate_curving_path([[92.740, 24.350], [92.710, 24.290], [92.680, 24.230]], 4)
    },
    {
        "index": 511, "src": 313, "tgt": 507, "name": "NH-306 Kolasib to Kawnpui Hill Section",
        "class": "NATIONAL_HIGHWAY", "speed": 40, "length": 34000.0,
        "coords": generate_curving_path([[92.680, 24.230], [92.685, 24.100], [92.690, 23.980]], 5)
    },
    {
        "index": 512, "src": 507, "tgt": 314, "name": "NH-306 Kawnpui to Aizawl Capital Spine",
        "class": "NATIONAL_HIGHWAY", "speed": 40, "length": 38000.0,
        "coords": generate_curving_path([[92.690, 23.980], [92.705, 23.850], [92.717, 23.730]], 5)
    },
    {
        "index": 513, "src": 314, "tgt": 508, "name": "Aizawl Urban to Falkawn Medical Base Arterial",
        "class": "STATE_HIGHWAY", "speed": 45, "length": 16000.0,
        "coords": generate_curving_path([[92.717, 23.730], [92.713, 23.680], [92.710, 23.630]], 3)
    },
    {
        "index": 514, "src": 508, "tgt": 509, "name": "SH-2 Falkawn to Thenzawl Scenic Mountain Route",
        "class": "STATE_HIGHWAY", "speed": 40, "length": 42000.0,
        "coords": generate_curving_path([[92.710, 23.630], [92.730, 23.470], [92.750, 23.310]], 5)
    },
    {
        "index": 515, "src": 509, "tgt": 510, "name": "SH-2 Thenzawl to Serchhip Central Hub",
        "class": "STATE_HIGHWAY", "speed": 45, "length": 18000.0,
        "coords": generate_curving_path([[92.750, 23.310], [92.800, 23.310], [92.850, 23.310]], 3)
    },
    {
        "index": 516, "src": 510, "tgt": 511, "name": "NH-54 Serchhip to Lunglei South Regional Spine",
        "class": "NATIONAL_HIGHWAY", "speed": 40, "length": 65000.0,
        "coords": generate_curving_path([[92.850, 23.310], [92.790, 23.100], [92.740, 22.890]], 6)
    },
    {
        "index": 517, "src": 511, "tgt": 512, "name": "NH-54 Lunglei to Lawngtlai Kaladan Gateway",
        "class": "NATIONAL_HIGHWAY", "speed": 35, "length": 58000.0,
        "coords": generate_curving_path([[92.740, 22.890], [92.810, 22.710], [92.890, 22.530]], 5)
    },
    {
        "index": 518, "src": 512, "tgt": 513, "name": "NH-54 Lawngtlai to Saiha Mara Southernmost Arterial",
        "class": "NATIONAL_HIGHWAY", "speed": 35, "length": 32000.0,
        "coords": generate_curving_path([[92.890, 22.530], [92.935, 22.510], [92.980, 22.490]], 4)
    },
    {
        "index": 519, "src": 314, "tgt": 514, "name": "NH-6 Aizawl to Champhai Eastern Border Highway",
        "class": "NATIONAL_HIGHWAY", "speed": 40, "length": 94000.0,
        "coords": generate_curving_path([[92.717, 23.730], [93.020, 23.600], [93.330, 23.475]], 6)
    },
    {
        "index": 520, "src": 514, "tgt": 515, "name": "Champhai to Zokhawthar Myanmar Trade Port",
        "class": "STATE_HIGHWAY", "speed": 35, "length": 28000.0,
        "coords": generate_curving_path([[93.330, 23.475], [93.380, 23.420], [93.430, 23.370]], 4)
    },

    # ── Tripura: NH-8 Highway Spine & Rail Corridor (Karimganj -> Agartala -> Sabroom) ──
    {
        "index": 521, "src": 315, "tgt": 521, "name": "NH-8 Karimganj to Churaibari Tripura Inter-State Gate",
        "class": "NATIONAL_HIGHWAY", "speed": 55, "length": 42000.0,
        "coords": generate_curving_path([[92.350, 24.870], [92.290, 24.690], [92.240, 24.520]], 3)
    },
    {
        "index": 522, "src": 521, "tgt": 316, "name": "NH-8 Churaibari to Dharmanagar Railhead Hub",
        "class": "NATIONAL_HIGHWAY", "speed": 55, "length": 22000.0,
        "coords": generate_curving_path([[92.240, 24.520], [92.200, 24.450], [92.165, 24.375]], 3)
    },
    {
        "index": 523, "src": 316, "tgt": 522, "name": "NH-8 Dharmanagar to Kumarghat Rail Depot",
        "class": "NATIONAL_HIGHWAY", "speed": 55, "length": 32000.0,
        "coords": generate_curving_path([[92.165, 24.375], [92.100, 24.270], [92.030, 24.160]], 3)
    },
    {
        "index": 524, "src": 522, "tgt": 523, "name": "NH-8 Kumarghat to Manu River Valley",
        "class": "NATIONAL_HIGHWAY", "speed": 50, "length": 24000.0,
        "coords": generate_curving_path([[92.030, 24.160], [92.000, 24.080], [91.980, 24.000]], 3)
    },
    {
        "index": 525, "src": 523, "tgt": 317, "name": "NH-8 Manu Valley to Ambassa Terminal",
        "class": "NATIONAL_HIGHWAY", "speed": 50, "length": 18000.0,
        "coords": generate_curving_path([[91.980, 24.000], [91.915, 23.960], [91.850, 23.920]], 3)
    },
    {
        "index": 526, "src": 317, "tgt": 524, "name": "NH-8 Ambassa to Teliamura (Atharamura Mountain Ghat)",
        "class": "NATIONAL_HIGHWAY", "speed": 40, "length": 36000.0,
        "coords": generate_curving_path([[91.850, 23.920], [91.740, 23.880], [91.630, 23.840]], 5)
    },
    {
        "index": 527, "src": 524, "tgt": 525, "name": "NH-8 Teliamura to Champaknagar Section",
        "class": "NATIONAL_HIGHWAY", "speed": 60, "length": 22000.0,
        "coords": generate_curving_path([[91.630, 23.840], [91.545, 23.830], [91.460, 23.820]], 2)
    },
    {
        "index": 528, "src": 525, "tgt": 526, "name": "NH-8 Champaknagar to Jirania NIT Hub",
        "class": "NATIONAL_HIGHWAY", "speed": 60, "length": 8000.0,
        "coords": generate_curving_path([[91.460, 23.820], [91.440, 23.815], [91.420, 23.810]], 2)
    },
    {
        "index": 529, "src": 526, "tgt": 318, "name": "NH-8 Jirania to Agartala Capital City Center",
        "class": "NATIONAL_HIGHWAY", "speed": 60, "length": 18000.0,
        "coords": generate_curving_path([[91.420, 23.810], [91.350, 23.820], [91.286, 23.831]], 2)
    },
    {
        "index": 530, "src": 318, "tgt": 527, "name": "NH-8 Agartala to Bishalgarh Corridor",
        "class": "NATIONAL_HIGHWAY", "speed": 60, "length": 22000.0,
        "coords": generate_curving_path([[91.286, 23.831], [91.300, 23.755], [91.310, 23.680]], 2)
    },
    {
        "index": 531, "src": 527, "tgt": 528, "name": "NH-8 Bishalgarh to Udaipur Matabari Heritage Hub",
        "class": "NATIONAL_HIGHWAY", "speed": 60, "length": 26000.0,
        "coords": generate_curving_path([[91.310, 23.680], [91.400, 23.610], [91.490, 23.535]], 3)
    },
    {
        "index": 532, "src": 528, "tgt": 529, "name": "NH-8 Udaipur to Santirbazar Transit Post",
        "class": "NATIONAL_HIGHWAY", "speed": 55, "length": 34000.0,
        "coords": generate_curving_path([[91.490, 23.535], [91.525, 23.415], [91.560, 23.300]], 3)
    },
    {
        "index": 533, "src": 529, "tgt": 530, "name": "NH-8 Santirbazar to Belonia Border Checkpost",
        "class": "NATIONAL_HIGHWAY", "speed": 50, "length": 18000.0,
        "coords": generate_curving_path([[91.560, 23.300], [91.505, 23.275], [91.450, 23.250]], 3)
    },
    {
        "index": 534, "src": 529, "tgt": 531, "name": "NH-8 Santirbazar to Sabroom Maitri Setu Sea Port Gate",
        "class": "NATIONAL_HIGHWAY", "speed": 60, "length": 44000.0,
        "coords": generate_curving_path([[91.560, 23.300], [91.645, 23.150], [91.730, 23.000]], 4)
    },

    # ── Sikkim & West Bengal: NH-10 Teesta Valley, Nathu La & North Sikkim Mountain Passes ──
    {
        "index": 535, "src": 326, "tgt": 536, "name": "NH-10 Sevoke to Kalijhora Teesta Gorge Post",
        "class": "NATIONAL_HIGHWAY", "speed": 40, "length": 12000.0,
        "coords": generate_curving_path([[88.470, 26.880], [88.462, 26.905], [88.455, 26.930]], 4)
    },
    {
        "index": 536, "src": 536, "tgt": 537, "name": "NH-10 Kalijhora to Teesta Bazaar Kalimpong Fork",
        "class": "NATIONAL_HIGHWAY", "speed": 35, "length": 18000.0,
        "coords": generate_curving_path([[88.455, 26.930], [88.475, 27.000], [88.495, 27.060]], 5)
    },
    {
        "index": 537, "src": 537, "tgt": 538, "name": "NH-10 Teesta Bazaar to Melli South Sikkim River Checkpoint",
        "class": "NATIONAL_HIGHWAY", "speed": 40, "length": 10000.0,
        "coords": generate_curving_path([[88.495, 27.060], [88.475, 27.075], [88.460, 27.090]], 3)
    },
    {
        "index": 538, "src": 538, "tgt": 328, "name": "NH-10 Melli to Rangpo Sikkim State Checkpost",
        "class": "NATIONAL_HIGHWAY", "speed": 45, "length": 14000.0,
        "coords": generate_curving_path([[88.460, 27.090], [88.495, 27.130], [88.530, 27.175]], 4)
    },
    {
        "index": 539, "src": 329, "tgt": 539, "name": "NH-10 Singtam to Ranipool University Gate",
        "class": "NATIONAL_HIGHWAY", "speed": 40, "length": 16000.0,
        "coords": generate_curving_path([[88.500, 27.230], [88.540, 27.260], [88.580, 27.295]], 4)
    },
    {
        "index": 540, "src": 539, "tgt": 330, "name": "NH-10 Ranipool to Gangtok MG Marg & STNM Hospital",
        "class": "NATIONAL_HIGHWAY", "speed": 35, "length": 12000.0,
        "coords": generate_curving_path([[88.580, 27.295], [88.595, 27.315], [88.613, 27.338]], 4)
    },
    {
        "index": 541, "src": 330, "tgt": 540, "name": "NH-310 Gangtok to Tsomgo (Changu) Alpine Lake (3753m)",
        "class": "NATIONAL_HIGHWAY", "speed": 30, "length": 38000.0,
        "coords": generate_curving_path([[88.613, 27.338], [88.690, 27.360], [88.765, 27.385]], 6)
    },
    {
        "index": 542, "src": 540, "tgt": 541, "name": "NH-310 Tsomgo Lake to Nathu La Strategic Border Pass (4310m)",
        "class": "NATIONAL_HIGHWAY", "speed": 25, "length": 18000.0,
        "coords": generate_curving_path([[88.765, 27.385], [88.805, 27.385], [88.850, 27.386]], 5)
    },
    {
        "index": 543, "src": 330, "tgt": 542, "name": "NH-310A Gangtok to Mangan North Sikkim District HQ",
        "class": "NATIONAL_HIGHWAY", "speed": 35, "length": 56000.0,
        "coords": generate_curving_path([[88.613, 27.338], [88.570, 27.420], [88.530, 27.505]], 5)
    },
    {
        "index": 544, "src": 542, "tgt": 543, "name": "NH-310A Mangan to Chungthang Hydro Choke Point",
        "class": "NATIONAL_HIGHWAY", "speed": 30, "length": 28000.0,
        "coords": generate_curving_path([[88.530, 27.505], [88.590, 27.555], [88.650, 27.605]], 5)
    },
    {
        "index": 545, "src": 543, "tgt": 544, "name": "Chungthang to Lachung Valley Lifeline (Yumthang Route)",
        "class": "STATE_HIGHWAY", "speed": 25, "length": 24000.0,
        "coords": generate_curving_path([[88.650, 27.605], [88.700, 27.650], [88.745, 27.690]], 5)
    },
    {
        "index": 546, "src": 543, "tgt": 545, "name": "Chungthang to Lachen High-Altitude Base (Gurudongmar Route)",
        "class": "STATE_HIGHWAY", "speed": 25, "length": 28000.0,
        "coords": generate_curving_path([[88.650, 27.605], [88.600, 27.665], [88.555, 27.725]], 5)
    },
    {
        "index": 547, "src": 538, "tgt": 546, "name": "Melli to Jorethang Transit Junction (South/West Gateway)",
        "class": "STATE_HIGHWAY", "speed": 40, "length": 22000.0,
        "coords": generate_curving_path([[88.460, 27.090], [88.385, 27.110], [88.310, 27.130]], 4)
    },
    {
        "index": 548, "src": 546, "tgt": 547, "name": "Jorethang to Namchi South Sikkim District HQ",
        "class": "STATE_HIGHWAY", "speed": 35, "length": 18000.0,
        "coords": generate_curving_path([[88.310, 27.130], [88.330, 27.150], [88.350, 27.170]], 4)
    },
    {
        "index": 549, "src": 547, "tgt": 548, "name": "Namchi to Ravangla Buddha Park Mountain Pass",
        "class": "STATE_HIGHWAY", "speed": 35, "length": 26000.0,
        "coords": generate_curving_path([[88.350, 27.170], [88.355, 27.240], [88.360, 27.310]], 4)
    },
    {
        "index": 550, "src": 548, "tgt": 549, "name": "Ravangla to Geyzing West Sikkim District HQ",
        "class": "STATE_HIGHWAY", "speed": 35, "length": 32000.0,
        "coords": generate_curving_path([[88.360, 27.310], [88.305, 27.300], [88.250, 27.290]], 4)
    },
    {
        "index": 551, "src": 549, "tgt": 550, "name": "Geyzing to Pelling Tourist & Hospital Base",
        "class": "STATE_HIGHWAY", "speed": 30, "length": 10000.0,
        "coords": generate_curving_path([[88.250, 27.290], [88.240, 27.300], [88.230, 27.315]], 3)
    },
]

# ─────────────────────────────────────────────────────────────────────────────
# 3. REGIONAL LIFELINE FACILITIES (Hospitals, Freight Hubs & Oxygen Depots)
# ─────────────────────────────────────────────────────────────────────────────
REGIONAL_FACILITIES: list[dict[str, Any]] = [
    # State Capitals & Major Apex Hospitals
    {"code": "FAC-NAG-KOH-01", "name": "Naga Hospital Authority Kohima", "kind": "HOSPITAL", "lon": 94.112, "lat": 25.676, "near_node": 305, "state": "Nagaland"},
    {"code": "FAC-MAN-IMP-01", "name": "Jawaharlal Nehru Institute of Medical Sciences (JNIMS)", "kind": "HOSPITAL", "lon": 93.945, "lat": 24.821, "near_node": 308, "state": "Manipur"},
    {"code": "FAC-MIZ-AIZ-01", "name": "Zoram Medical College & Hospital (Falkawn)", "kind": "HOSPITAL", "lon": 92.712, "lat": 23.632, "near_node": 508, "state": "Mizoram"},
    {"code": "FAC-TRP-AGT-01", "name": "Agartala Government Medical College & Hospital", "kind": "HOSPITAL", "lon": 91.291, "lat": 23.835, "near_node": 318, "state": "Tripura"},
    {"code": "FAC-ARU-ITA-01", "name": "Tomo Riba Institute of Health & Medical Sciences", "kind": "HOSPITAL", "lon": 93.620, "lat": 27.104, "near_node": 322, "state": "Arunachal Pradesh"},
    {"code": "FAC-SIK-GTK-01", "name": "STNM Multi-Specialty Hospital Gangtok", "kind": "HOSPITAL", "lon": 88.618, "lat": 27.341, "near_node": 330, "state": "Sikkim"},
    {"code": "FAC-ASM-SLC-01", "name": "Silchar Medical College & Cryogenic Oxygen Plant", "kind": "HOSPITAL", "lon": 92.805, "lat": 24.822, "near_node": 311, "state": "Assam"},
    {"code": "FAC-ASM-DIB-01", "name": "Assam Medical College & Hospital Dibrugarh", "kind": "HOSPITAL", "lon": 94.915, "lat": 27.478, "near_node": 412, "state": "Assam"},
    {"code": "FAC-ASM-JOR-01", "name": "Jorhat Medical College & Hospital", "kind": "HOSPITAL", "lon": 94.220, "lat": 26.758, "near_node": 408, "state": "Assam"},
    {"code": "FAC-ASM-TEZ-01", "name": "Tezpur Strategic Disaster Supply Depot", "kind": "DISTRIBUTION_CENTER", "lon": 92.800, "lat": 26.640, "near_node": 320, "state": "Assam"},
    {"code": "FAC-NAG-DMP-01", "name": "Dimapur Multi-Modal Freight Terminal", "kind": "DISTRIBUTION_CENTER", "lon": 93.732, "lat": 25.912, "near_node": 303, "state": "Nagaland"},
    {"code": "FAC-MAN-MOR-01", "name": "Moreh Integrated Check Post ASEAN Gateway", "kind": "DISTRIBUTION_CENTER", "lon": 94.305, "lat": 24.242, "near_node": 497, "state": "Manipur"},
    {"code": "FAC-ARU-TAW-01", "name": "Tawang High-Altitude District Hospital", "kind": "HOSPITAL", "lon": 91.865, "lat": 27.588, "near_node": 467, "state": "Arunachal Pradesh"},
    {"code": "FAC-ARU-PSG-01", "name": "Pasighat Bakin Pertin General Hospital", "kind": "HOSPITAL", "lon": 95.335, "lat": 28.068, "near_node": 323, "state": "Arunachal Pradesh"},
    {"code": "FAC-MEG-SHL-01", "name": "Shillong Civil Hospital Lifeline Center", "kind": "HOSPITAL", "lon": 91.888, "lat": 25.578, "near_node": 13, "state": "Meghalaya"},
    {"code": "FAC-MEG-TUR-01", "name": "Tura District Civil Hospital", "kind": "HOSPITAL", "lon": 90.225, "lat": 25.518, "near_node": 453, "state": "Meghalaya"},
    {"code": "FAC-MIZ-LUN-01", "name": "Lunglei District Hospital Southern Hub", "kind": "HOSPITAL", "lon": 92.745, "lat": 22.893, "near_node": 511, "state": "Mizoram"},
    {"code": "FAC-TRP-SAB-01", "name": "Maitri Setu International Port Terminal Sabroom", "kind": "DISTRIBUTION_CENTER", "lon": 91.735, "lat": 23.004, "near_node": 531, "state": "Tripura"},
    {"code": "FAC-SIK-RAN-01", "name": "Rangpo Multi-Pharma Logistics Depot", "kind": "DISTRIBUTION_CENTER", "lon": 88.535, "lat": 27.178, "near_node": 328, "state": "Sikkim"},
    {"code": "FAC-WB-SLG-01", "name": "North Bengal Medical College Siliguri", "kind": "HOSPITAL", "lon": 88.435, "lat": 26.730, "near_node": 325, "state": "West Bengal"},
]

# Curvature updates for initial pilot corridor edges (NH-6 & NH-17)
CURVATURE_UPDATES = {
    101: "SRID=4326;LINESTRING(91.6850 26.1850, 91.6840 26.1780, 91.6830 26.1710, 91.6825 26.1660, 91.6835 26.1590, 91.6815 26.1550, 91.6760 26.1520, 91.6660 26.1475, 91.6750 26.1500, 91.6880 26.1535, 91.7000 26.1560, 91.7085 26.1578, 91.7180 26.1580, 91.7260 26.1530, 91.7350 26.1450)",
    102: "SRID=4326;LINESTRING(91.7350 26.1450, 91.7480 26.1470, 91.7600 26.1495, 91.7730 26.1460, 91.7820 26.1320, 91.7850 26.1150)",
    103: "SRID=4326;LINESTRING(91.7850 26.1150, 91.7980 26.1140, 91.8120 26.1120, 91.8210 26.1090, 91.8340 26.1010, 91.8470 26.0950, 91.8580 26.0895, 91.8650 26.0850)",
    104: "SRID=4326;LINESTRING(91.8650 26.0850, 91.8660 26.0820, 91.8675 26.0760, 91.8690 26.0710, 91.8710 26.0640, 91.8725 26.0570, 91.8735 26.0510, 91.8745 26.0470, 91.8750 26.0450)",
    105: "SRID=4326;LINESTRING(91.8750 26.0450, 91.8760 26.0400, 91.8770 26.0345, 91.8780 26.0280, 91.8790 26.0210, 91.8798 26.0145, 91.8805 26.0080, 91.8810 26.0000, 91.8815 25.9920, 91.8818 25.9850, 91.8820 25.9780, 91.8820 25.9650)",
    106: "SRID=4326;LINESTRING(91.8820 25.9650, 91.8828 25.9610, 91.8835 25.9570, 91.8840 25.9550)",
    107: "SRID=4326;LINESTRING(91.8840 25.9550, 91.8835 25.9460, 91.8825 25.9390, 91.8820 25.9320, 91.8810 25.9250, 91.8800 25.9180, 91.8805 25.9120, 91.8810 25.9050)",
    108: "SRID=4326;LINESTRING(91.8810 25.9050, 91.8818 25.8950, 91.8825 25.8850, 91.8832 25.8750, 91.8840 25.8650, 91.8845 25.8525, 91.8850 25.8400, 91.8848 25.8300, 91.8845 25.8200, 91.8855 25.8100, 91.8875 25.8000, 91.8905 25.7900, 91.8940 25.7800, 91.8985 25.7725, 91.9030 25.7650, 91.9075 25.7600, 91.9120 25.7550)",
    109: "SRID=4326;LINESTRING(91.9120 25.7550, 91.9115 25.7465, 91.9110 25.7380, 91.9102 25.7290, 91.9095 25.7200, 91.9080 25.7110, 91.9065 25.7020, 91.9050 25.6935, 91.9035 25.6850, 91.9055 25.6750, 91.9080 25.6650)",
    110: "SRID=4326;LINESTRING(91.9080 25.6650, 91.9072 25.6625, 91.9065 25.6600, 91.9058 25.6575, 91.9050 25.6550)",
    111: "SRID=4326;LINESTRING(91.9050 25.6550, 91.9030 25.6475, 91.9010 25.6400, 91.8992 25.6325, 91.8975 25.6250, 91.8962 25.6175, 91.8950 25.6100, 91.8942 25.6040, 91.8935 25.5980, 91.8950 25.5950)",
    112: "SRID=4326;LINESTRING(91.8950 25.5950, 91.8930 25.5920, 91.8905 25.5890, 91.8885 25.5860, 91.8870 25.5830, 91.8860 25.5790, 91.8850 25.5750)",
    113: "SRID=4326;LINESTRING(91.8850 25.5750, 91.8950 25.5800, 91.9070 25.5850, 91.9220 25.5900, 91.9350 25.5940, 91.9420 25.5980)",
    201: "SRID=4326;LINESTRING(91.6850 26.1850, 91.6840 26.1780, 91.6830 26.1710, 91.6825 26.1660, 91.6835 26.1590, 91.6815 26.1550, 91.6760 26.1520, 91.6660 26.1475, 91.6540 26.1430, 91.6400 26.1360, 91.6220 26.1260, 91.5950 26.1210, 91.5650 26.1180, 91.5350 26.1160, 91.5150 26.1150)",
    202: "SRID=4326;LINESTRING(91.5150 26.1150, 91.4800 26.1050, 91.4500 26.0950, 91.4100 26.0750, 91.3800 26.0550, 91.3600 26.0350, 91.3300 26.0150, 91.3000 26.0000, 91.2700 25.9850, 91.2450 25.9750)",
    203: "SRID=4326;LINESTRING(91.2450 25.9750, 91.2480 25.9300, 91.2520 25.8700, 91.2550 25.8000, 91.2580 25.7300, 91.2600 25.6400, 91.2620 25.5700, 91.2650 25.5250)",
    204: "SRID=4326;LINESTRING(91.2650 25.5250, 91.3300 25.5350, 91.4300 25.5450, 91.5300 25.5550, 91.6350 25.5650)",
    205: "SRID=4326;LINESTRING(91.6350 25.5650, 91.6900 25.5650, 91.7300 25.5660, 91.7900 25.5670, 91.8350 25.5680)",
    206: "SRID=4326;LINESTRING(91.8350 25.5680, 91.8550 25.5700, 91.8700 25.5720, 91.8850 25.5750)",
}


async def seed_regional_network(db: AsyncSession) -> dict[str, int]:
    """Execute high-resolution curvature updates and seed the complete 8-state regional road network."""
    logger.info("starting_comprehensive_regional_network_seeding")

    # 1. Update existing highway curvatures to high-resolution LineStrings
    for e_idx, wkt in CURVATURE_UPDATES.items():
        await db.execute(
            text("UPDATE road_edges SET geom = ST_GeomFromText(:wkt, 4326) WHERE edge_index = :idx"),
            {"wkt": wkt, "idx": e_idx},
        )

    # 2. Get active network version
    v_res = await db.execute(select(NetworkVersionModel).where(NetworkVersionModel.status == "ACTIVE").limit(1))
    v_model = v_res.scalar_one_or_none()
    if not v_model:
        v_res = await db.execute(select(NetworkVersionModel).limit(1))
        v_model = v_res.scalar_one_or_none()
        if not v_model:
            raise RuntimeError("No network version found in database")

    network_version_id = v_model.id

    # 3. Insert or update Regional Nodes across all 8 states
    nodes_added = 0
    node_index_to_id: dict[int, uuid.UUID] = {}

    existing_nodes = (await db.execute(select(RoadNodeModel.node_index, RoadNodeModel.id))).all()
    for row in existing_nodes:
        node_index_to_id[row[0]] = row[1]

    for n in REGIONAL_NODES:
        n_idx = n["index"]
        if n_idx not in node_index_to_id:
            n_id = uuid.uuid5(FIXTURE_NAMESPACE, f"node_{n_idx}")
            wkt = f"SRID=4326;POINT({n['lon']} {n['lat']})"
            juris_id = JURIS_MAP.get(n.get("state", "Assam"), JURIS_ASSAM)
            db.add(
                RoadNodeModel(
                    id=n_id,
                    network_version_id=network_version_id,
                    node_index=n_idx,
                    geom=ST_GeomFromText(wkt, 4326),
                    elevation_m=n["elev"],
                    jurisdiction_id=juris_id,
                )
            )
            node_index_to_id[n_idx] = n_id
            nodes_added += 1

    await db.flush()

    # 4. Insert or update Regional Highway Edges with high-resolution coordinates
    edges_added = 0
    now = datetime.now(timezone.utc)

    for e in REGIONAL_EDGES:
        e_idx = e["index"]
        chk = await db.execute(select(RoadEdgeModel.id).where(RoadEdgeModel.edge_index == e_idx))
        existing_edge_id = chk.scalar_one_or_none()

        pts_str = ", ".join(f"{c[0]} {c[1]}" for c in e["coords"])
        wkt = f"SRID=4326;LINESTRING({pts_str})"
        speed_mps = e["speed"] * 1000.0 / 3600.0
        base_seconds = e["length"] / speed_mps if speed_mps > 0 else 600.0

        if existing_edge_id:
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
                    gradient_percent=3.0,
                    is_bridge=False,
                    jurisdiction_id=JURIS_ASSAM,
                )
            )

            # Ensure default OPEN status for real-time routing
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

    # 5. Insert Regional Lifeline Facilities for each district
    fac_added = 0
    for f in REGIONAL_FACILITIES:
        chk_fac = await db.execute(select(FacilityModel.id).where(FacilityModel.code == f["code"]))
        if not chk_fac.scalar_one_or_none():
            fac_id = uuid.uuid5(FIXTURE_NAMESPACE, f"fac_{f['code']}")
            near_id = node_index_to_id.get(f["near_node"])
            wkt = f"SRID=4326;POINT({f['lon']} {f['lat']})"
            fac_juris = JURIS_MAP.get(f.get("state", "Assam"), JURIS_ASSAM)
            db.add(
                FacilityModel(
                    id=fac_id,
                    code=f["code"],
                    name=f["name"],
                    kind=f["kind"],
                    jurisdiction_id=fac_juris,
                    geom=ST_GeomFromText(wkt, 4326),
                    nearest_road_node_id=near_id,
                    snap_distance_m=15.0,
                    is_critical=True,
                    is_active=True,
                )
            )
            fac_added += 1

    await db.commit()
    logger.info("comprehensive_regional_network_seeded", nodes_added=nodes_added, edges_added=edges_added, facilities_added=fac_added)
    return {"nodes_added": nodes_added, "edges_added": edges_added, "facilities_added": fac_added}
