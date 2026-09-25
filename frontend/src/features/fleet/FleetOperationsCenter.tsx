"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { humanize } from "@/shared/lib/format";
import { formatDateTime } from "@/shared/lib/time";
import { useNow } from "@/shared/lib/useNow";
import { useScopeFilter } from "@/shared/auth";
import { MapLegend, MapView, type MapLine, type MapPoint } from "@/shared/map";
import { useFacilities } from "@/features/network";
import { describeGps } from "./gps";
import {
  useCommitments,
  useDrivers,
  useFleetPositions,
  useTrips,
  useVehicles,
} from "./queries";

// Waypoints along Guwahati to Shillong / NH-6 corridor
const NH6_WAYPOINTS: Array<[number, number]> = [
  [91.7350, 26.1450], [91.7550, 26.1360], [91.7850, 26.1150], [91.8150, 26.1090],
  [91.8470, 26.0950], [91.8650, 26.0850], [91.8685, 26.0750], [91.8715, 26.0630],
  [91.8735, 26.0530], [91.8750, 26.0450], [91.8770, 26.0350], [91.8790, 26.0210],
  [91.8805, 26.0080], [91.8815, 25.9920], [91.8820, 25.9780], [91.8820, 25.9650],
  [91.8828, 25.9610], [91.8835, 25.9570], [91.8840, 25.9550], [91.8835, 25.9460],
  [91.8821, 25.9360], [91.8805, 25.9260], [91.8798, 25.9180], [91.8812, 25.9100],
  [91.8810, 25.9050], [91.8825, 25.8850], [91.8840, 25.8650], [91.8850, 25.8400],
  [91.8845, 25.8200], [91.8875, 25.8000], [91.8940, 25.7800], [91.9030, 25.7650],
  [91.9120, 25.7550], [91.9110, 25.7380], [91.9095, 25.7200], [91.9065, 25.7020],
  [91.9035, 25.6850], [91.9080, 25.6650], [91.9065, 25.6600], [91.9050, 25.6550],
  [91.9010, 25.6400], [91.8975, 25.6250], [91.8950, 25.6100], [91.8935, 25.5980],
  [91.8950, 25.5950], [91.8905, 25.5890], [91.8870, 25.5830], [91.8840, 25.5780],
];

// Waypoints along Dimapur to Imphal NH-29 / NH-2 corridor
const IMPHAL_WAYPOINTS: Array<[number, number]> = [
  [93.7267, 25.9063], [93.7540, 25.8620], [93.8120, 25.8110], [93.9210, 25.7420],
  [94.0150, 25.7020], [94.1086, 25.6747], [94.0920, 25.5410], [94.0410, 25.4120],
  [93.9920, 25.2630], [93.9710, 25.1120], [93.9450, 24.9520], [93.9368, 24.8170],
];

// Waypoints along Tezpur to Itanagar NH-15 / NH-415 corridor
const ARUNACHAL_WAYPOINTS: Array<[number, number]> = [
  [92.7926, 26.6338], [92.9150, 26.7150], [93.1120, 26.8320], [93.3510, 26.9240],
  [93.5820, 27.0120], [93.7120, 27.0650], [93.8120, 27.1040], [93.7010, 27.0950],
  [93.6053, 27.0844],
];

export type OperationalStatus = "DISRUPTED" | "DELAYED" | "ON_TIME" | "IDLE" | "OFFLINE";

export interface OperationalVehicleItem {
  id: string;
  registration: string;
  model: string;
  type: string;
  tripCode: string;
  tripId?: string;
  state: string;
  corridor: string;
  status: OperationalStatus;
  statusLabel: string;
  eta: string;
  delayNotice?: string;
  cargoCategory: string;
  cargoDescription: string;
  cargoTier: "TIER_1_LIFE_SAVING" | "TIER_2_ESSENTIAL" | "TIER_3_STANDARD";
  cargoQuantity: string;
  driverName: string;
  driverPhone: string;
  speedKph: number;
  headingDeg: number;
  lat: number;
  lon: number;
  lastFixAgo: string;
  isStale: boolean;
  hazmat: boolean;
  refrig: boolean;
  stops: Array<{ name: string; time: string; status: "completed" | "current" | "pending" | "delayed" }>;
  routeWaypoints: Array<[number, number]>;
  impactNotice?: {
    cause: string;
    clearance: string;
    impactLevel: "CRITICAL" | "HIGH" | "MODERATE";
    recommendedAlt: string;
  };
}

// Regional operational roster reflecting the complete Northeast fleet
const REGIONAL_FLEET_AUGMENTS: OperationalVehicleItem[] = [
  {
    id: "veh-demo-as01",
    registration: "AS-01-HC-9821",
    model: "Tata Prima 2830.K Heavy Carrier",
    type: "Heavy Multi-Axle",
    tripCode: "TR-208",
    state: "Meghalaya",
    corridor: "NH-6 (Guwahati - Shillong - Sonapur)",
    status: "DISRUPTED",
    statusLabel: "Disrupted",
    eta: "+85m (Delayed)",
    delayNotice: "Landslide blockage at Sonapur KM 12.4. Convoy halted.",
    cargoCategory: "CRITICAL_MEDICAL",
    cargoDescription: "Emergency ICU Equipment & Trauma Kits",
    cargoTier: "TIER_1_LIFE_SAVING",
    cargoQuantity: "50 Units · 2,500 kg",
    driverName: "Biren Kalita",
    driverPhone: "+91 98640 12345",
    speedKph: 0,
    headingDeg: 142,
    lat: 25.9610,
    lon: 91.8828,
    lastFixAgo: "2 mins ago",
    isStale: false,
    hazmat: true,
    refrig: false,
    stops: [
      { name: "Guwahati Central Depot", time: "08:30 (Departed)", status: "completed" },
      { name: "Nongpoh Checkpoint", time: "10:15 (Passed)", status: "completed" },
      { name: "Sonapur Blockage Point KM 12.4", time: "11:20 (Halted)", status: "delayed" },
      { name: "Shillong Civil Hospital", time: "Est. 15:45 (+85m)", status: "pending" },
    ],
    routeWaypoints: NH6_WAYPOINTS,
    impactNotice: {
      cause: "Heavy Debris Landslide blocking both lanes at Sonapur",
      clearance: "Border Roads Organisation clearing ETA 3.5 hrs",
      impactLevel: "CRITICAL",
      recommendedAlt: "Alternative Route B via Umiam-Ribhoi Bypass (+32m)",
    },
  },
  {
    id: "veh-demo-ml01",
    registration: "ML-01-EX-5541",
    model: "Ashok Leyland Ecomet Reefer",
    type: "Refrigerated Van",
    tripCode: "TR-211",
    state: "Manipur",
    corridor: "NH-29 / NH-2 (Dimapur - Kohima - Imphal)",
    status: "DELAYED",
    statusLabel: "Delayed",
    eta: "+32m (Delayed)",
    delayNotice: "Heavy rain & slow traffic crawl near Mao Gate checkpoint.",
    cargoCategory: "COLD_CHAIN_VACCINES",
    cargoDescription: "Pediatric Vaccines & Blood Serum Packs",
    cargoTier: "TIER_1_LIFE_SAVING",
    cargoQuantity: "2,000 Doses · 450 kg",
    driverName: "Mary Lyngdoh",
    driverPhone: "+91 97740 54321",
    speedKph: 28,
    headingDeg: 185,
    lat: 25.5410,
    lon: 94.0920,
    lastFixAgo: "4 mins ago",
    isStale: false,
    hazmat: false,
    refrig: true,
    stops: [
      { name: "Dimapur Railway Hub", time: "06:45 (Departed)", status: "completed" },
      { name: "Kohima Staging Point", time: "09:30 (Departed)", status: "completed" },
      { name: "Mao Gate Checkpoint", time: "12:10 (In Transit)", status: "current" },
      { name: "Imphal Regional Medical Hub", time: "Est. 17:15 (+32m)", status: "pending" },
    ],
    routeWaypoints: IMPHAL_WAYPOINTS,
    impactNotice: {
      cause: "Torrential downpour with minor sludge on NH-2 mountain grade",
      clearance: "Cautionary clearance, speed restricted to 30 km/h",
      impactLevel: "MODERATE",
      recommendedAlt: "Maintain current corridor with escort beacon",
    },
  },
  {
    id: "veh-demo-ar01",
    registration: "AR-01-TK-9022",
    model: "Mahindra Bolero Camper 4x4",
    type: "Utility 4x4",
    tripCode: "TR-219",
    state: "Arunachal",
    corridor: "NH-415 (Banderdewa - Naharlagun - Itanagar)",
    status: "ON_TIME",
    statusLabel: "On Time",
    eta: "16:40 (On Schedule)",
    delayNotice: "Clear road conditions, convoy moving at optimal speed.",
    cargoCategory: "OXYGEN_CYLINDERS",
    cargoDescription: "High-Pressure Medical Oxygen Cylinders",
    cargoTier: "TIER_1_LIFE_SAVING",
    cargoQuantity: "40 Cylinders · 1,800 kg",
    driverName: "Tenzing Norbu",
    driverPhone: "+91 94360 88219",
    speedKph: 48,
    headingDeg: 260,
    lat: 27.0950,
    lon: 93.7010,
    lastFixAgo: "Just now",
    isStale: false,
    hazmat: true,
    refrig: false,
    stops: [
      { name: "Tezpur Military Base Depot", time: "11:00 (Departed)", status: "completed" },
      { name: "Banderdewa Border Post", time: "14:15 (Cleared)", status: "completed" },
      { name: "Naharlagun Heliport Depot", time: "15:30 (Passed)", status: "current" },
      { name: "Itanagar General Hospital", time: "Est. 16:40 (On Schedule)", status: "pending" },
    ],
    routeWaypoints: ARUNACHAL_WAYPOINTS,
  },
  {
    id: "veh-demo-as02",
    registration: "AS-01-RF-4412",
    model: "Force Pharma Reefer 3.2T",
    type: "Pharma Reefer",
    tripCode: "TR-304",
    state: "Assam",
    corridor: "NH-27 (Nagaon - Jorhat - Dibrugarh)",
    status: "ON_TIME",
    statusLabel: "On Time",
    eta: "18:15 (On Schedule)",
    cargoCategory: "CRITICAL_MEDICAL",
    cargoDescription: "Insulin & Emergency Dialysis Concentrates",
    cargoTier: "TIER_1_LIFE_SAVING",
    cargoQuantity: "800 Packs · 620 kg",
    driverName: "Deepak Sharma",
    driverPhone: "+91 94350 98765",
    speedKph: 56,
    headingDeg: 78,
    lat: 26.7500,
    lon: 94.2200,
    lastFixAgo: "1 min ago",
    isStale: false,
    hazmat: false,
    refrig: true,
    stops: [
      { name: "Guwahati Pharma Warehouse", time: "07:00 (Departed)", status: "completed" },
      { name: "Nagaon Junction Hub", time: "09:45 (Departed)", status: "completed" },
      { name: "Jorhat Civil Dispensary", time: "14:20 (Departed)", status: "completed" },
      { name: "Dibrugarh Medical College", time: "Est. 18:15", status: "pending" },
    ],
    routeWaypoints: [
      [91.7350, 26.1450], [92.6840, 26.3500], [94.2200, 26.7500], [94.9120, 27.4720],
    ],
  },
  {
    id: "veh-demo-mz01",
    registration: "MZ-01-TR-7721",
    model: "Tata 1613 SE Rugged Cargo",
    type: "Medium Cargo Truck",
    tripCode: "TR-415",
    state: "Mizoram",
    corridor: "NH-306 (Silchar - Kolasib - Aizawl)",
    status: "DELAYED",
    statusLabel: "Delayed",
    eta: "+45m (Delayed)",
    delayNotice: "Steep gradient slow climb & single-lane road repair at Kolasib.",
    cargoCategory: "RELIEF_FOOD_WATER",
    cargoDescription: "Fortified Rice, Pulses & Water Purification Units",
    cargoTier: "TIER_2_ESSENTIAL",
    cargoQuantity: "1,200 Packets · 12,000 kg",
    driverName: "Lalrinzuala Sailo",
    driverPhone: "+91 98620 33419",
    speedKph: 22,
    headingDeg: 195,
    lat: 24.2250,
    lon: 92.6780,
    lastFixAgo: "5 mins ago",
    isStale: false,
    hazmat: false,
    refrig: false,
    stops: [
      { name: "Silchar Food Supply Godown", time: "06:00 (Departed)", status: "completed" },
      { name: "Vairengte Gate Checkpost", time: "09:10 (Cleared)", status: "completed" },
      { name: "Kolasib Bottleneck Section", time: "13:00 (Slow Moving)", status: "current" },
      { name: "Aizawl Emergency Relief Depot", time: "Est. 19:30 (+45m)", status: "pending" },
    ],
    routeWaypoints: [
      [92.7976, 24.8333], [92.7450, 24.5120], [92.6780, 24.2250], [92.7176, 23.7271],
    ],
  },
  {
    id: "veh-demo-nl01",
    registration: "NL-01-EM-2219",
    model: "JCB 3DX Heavy Excavator Carrier",
    type: "Heavy Equipment Transporter",
    tripCode: "TR-112",
    state: "Nagaland",
    corridor: "Mokokchung - Tuensang Highway",
    status: "DISRUPTED",
    statusLabel: "Disrupted",
    eta: "+110m (Critical Delay)",
    delayNotice: "Sudden rockfall obstruction. Escort clearance team deployed.",
    cargoCategory: "DISASTER_EQUIPMENT",
    cargoDescription: "Emergency Bailey Bridge Kit & Hydraulic Breakers",
    cargoTier: "TIER_1_LIFE_SAVING",
    cargoQuantity: "2 Sets · 18,500 kg",
    driverName: "Kevichusa Angami",
    driverPhone: "+91 94360 41102",
    speedKph: 0,
    headingDeg: 110,
    lat: 26.3210,
    lon: 94.5180,
    lastFixAgo: "3 mins ago",
    isStale: false,
    hazmat: false,
    refrig: false,
    stops: [
      { name: "Dimapur PWD Heavy Workshop", time: "05:00 (Departed)", status: "completed" },
      { name: "Mokokchung Division Depot", time: "11:30 (Passed)", status: "completed" },
      { name: "Chare Ridge KM 48", time: "13:15 (Blocked by Rockfall)", status: "delayed" },
      { name: "Tuensang Disaster Zone", time: "Est. 20:00 (+110m)", status: "pending" },
    ],
    routeWaypoints: [
      [93.7267, 25.9063], [94.2150, 26.1150], [94.5180, 26.3210], [94.8310, 26.2820],
    ],
    impactNotice: {
      cause: "Rockfall debris covering 35m of mountain shelf carriageway",
      clearance: "BRO Puzuma Dozer unit working on site",
      impactLevel: "CRITICAL",
      recommendedAlt: "Reroute via Wokha-Longleng Link Road (+75m)",
    },
  },
  {
    id: "veh-demo-sk01",
    registration: "SK-01-FD-3390",
    model: "Eicher Pro 3019 Fuel Tanker",
    type: "Hazardous Tanker",
    tripCode: "TR-509",
    state: "Sikkim",
    corridor: "NH-10 (Siliguri - Rangpo - Gangtok)",
    status: "ON_TIME",
    statusLabel: "On Time",
    eta: "15:20 (On Schedule)",
    cargoCategory: "GENERAL_SUPPLIES",
    cargoDescription: "High-Altitude Diesel Fuel for Generators",
    cargoTier: "TIER_2_ESSENTIAL",
    cargoQuantity: "14,000 Litres · 11,800 kg",
    driverName: "Sonam Bhutia",
    driverPhone: "+91 97330 89122",
    speedKph: 38,
    headingDeg: 345,
    lat: 27.1820,
    lon: 88.5280,
    lastFixAgo: "Just now",
    isStale: false,
    hazmat: true,
    refrig: false,
    stops: [
      { name: "Siliguri IOCL Terminal", time: "08:00 (Departed)", status: "completed" },
      { name: "Coronation Bridge Checkpoint", time: "09:30 (Passed)", status: "completed" },
      { name: "Rangpo Border Post", time: "12:45 (Cleared)", status: "completed" },
      { name: "Gangtok Power Substation", time: "Est. 15:20", status: "pending" },
    ],
    routeWaypoints: [
      [88.4312, 26.7271], [88.5520, 26.9150], [88.5280, 27.1820], [88.6138, 27.3389],
    ],
  },
  {
    id: "veh-demo-tr01",
    registration: "TR-01-CV-6632",
    model: "Mahindra Bolero Pickup 4x4",
    type: "Light Utility",
    tripCode: "TR-620",
    state: "Tripura",
    corridor: "NH-8 (Churaibari - Dharmanagar - Agartala)",
    status: "OFFLINE",
    statusLabel: "Offline",
    eta: "Unknown (Feed Offline)",
    delayNotice: "No GPS ping received for 42 minutes. Cellular blindspot.",
    cargoCategory: "RELIEF_FOOD_WATER",
    cargoDescription: "Emergency Dry Rations & Infant Milk Powder",
    cargoTier: "TIER_2_ESSENTIAL",
    cargoQuantity: "350 Packs · 1,200 kg",
    driverName: "Biplab Debbarma",
    driverPhone: "+91 98630 11984",
    speedKph: 0,
    headingDeg: 210,
    lat: 24.1250,
    lon: 92.1580,
    lastFixAgo: "42 mins ago",
    isStale: true,
    hazmat: false,
    refrig: false,
    stops: [
      { name: "Churaibari Border Depot", time: "09:00 (Departed)", status: "completed" },
      { name: "Dharmanagar Warehouse", time: "11:00 (Departed)", status: "completed" },
      { name: "Atharamura Hill Section", time: "12:15 (Last Known Fix)", status: "delayed" },
      { name: "Agartala Central Relief Hub", time: "TBD", status: "pending" },
    ],
    routeWaypoints: [
      [92.2450, 24.3850], [92.1580, 24.1250], [91.7820, 23.8350], [91.2868, 23.8315],
    ],
  },
];

export function FleetOperationsCenter() {
  const vehiclesQuery = useVehicles();
  const tripsQuery = useTrips();
  const commitmentsQuery = useCommitments();
  const facilitiesQuery = useFacilities();
  const driversQuery = useDrivers();
  const now = useNow(30_000);

  const { isStateAuthority, isDistrictOfficer, assignedState, assignedDistrict, stateBBox, districtBBox } = useScopeFilter();
  const [scopeActive, setScopeActive] = useState<boolean>(isDistrictOfficer || isStateAuthority);

  const fleetPositions = useFleetPositions(vehiclesQuery.data);

  const [selectedVehicleId, setSelectedVehicleId] = useState<string>("veh-demo-as01");
  const [statusFilter, setStatusFilter] = useState<"ALL" | OperationalStatus>("ALL");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [cargoFilter, setCargoFilter] = useState<string>("ALL");

  // Merge database vehicles with regional fleet operational roster
  const allFleetItems = useMemo<OperationalVehicleItem[]>(() => {
    const dbVehicles = vehiclesQuery.data ?? [];
    const dbTrips = tripsQuery.data ?? [];
    const dbCommitments = commitmentsQuery.data ?? [];
    const dbDrivers = driversQuery.data ?? [];
    const dbFacilities = facilitiesQuery.data ?? [];

    const dbMapped: OperationalVehicleItem[] = dbVehicles.map((v, idx) => {
      const posState = fleetPositions.find((p) => p.vehicle.id === v.id);
      const pos = posState?.position;
      const trip = dbTrips.find((t) => t.vehicle_id === v.id && ["IN_TRANSIT", "DISPATCHED", "HELD_FOR_INSPECTION"].includes(t.status)) || dbTrips.find((t) => t.vehicle_id === v.id);
      const driver = dbDrivers.find((d) => d.id === trip?.driver_id);
      const gpsDesc = describeGps(pos, now);

      const comms = trip ? dbCommitments.filter((c) => trip.commitment_ids.includes(c.id)) : [];
      const primaryComm = comms[0];

      const origin = trip?.stops[0]?.facility_id ? dbFacilities.find((f) => f.id === trip.stops[0]?.facility_id)?.name : "Regional Hub";
      const dest = trip?.stops[trip.stops.length - 1]?.facility_id ? dbFacilities.find((f) => f.id === trip.stops[trip.stops.length - 1]?.facility_id)?.name : "Civil Hospital";

      const isDisrupted = trip?.status === "HELD_FOR_INSPECTION" || (trip?.stops.some((s) => s.status === "PENDING") && pos?.speed_kph === 0);
      const isDelayed = Boolean(trip && !isDisrupted && trip.actual_departure);

      const status: OperationalStatus = !pos
        ? "OFFLINE"
        : gpsDesc.stale
        ? "OFFLINE"
        : isDisrupted
        ? "DISRUPTED"
        : isDelayed
        ? "DELAYED"
        : trip
        ? "ON_TIME"
        : "IDLE";

      const stopsList = (trip?.stops ?? []).map((s, i) => ({
        name: dbFacilities.find((f) => f.id === s.facility_id)?.name ?? `Waypoint KM ${((i + 1) * 15).toFixed(0)}`,
        time: s.actual_arrival ? formatDateTime(s.actual_arrival) : formatDateTime(s.planned_arrival),
        status: s.status === "DEPARTED" ? ("completed" as const) : s.status === "ARRIVED" ? ("current" as const) : ("pending" as const),
      }));

      return {
        id: v.id,
        registration: v.registration_number,
        model: v.make_model || humanize(v.vehicle_type),
        type: humanize(v.vehicle_type),
        tripCode: trip?.trip_code ?? `TR-0${idx + 220}`,
        tripId: trip?.id,
        state: "Meghalaya / Assam Corridor",
        corridor: "NH-6 National Highway",
        status,
        statusLabel: status === "DISRUPTED" ? "Disrupted" : status === "DELAYED" ? "Delayed" : status === "ON_TIME" ? "On Time" : status === "OFFLINE" ? "Offline" : "Idle",
        eta: status === "DISRUPTED" ? "+85m (Blocked)" : status === "DELAYED" ? "+35m" : "15:30",
        delayNotice: isDisrupted ? "Vehicle halted along landslide corridor." : undefined,
        cargoCategory: primaryComm?.cargo_category ?? "CRITICAL_MEDICAL",
        cargoDescription: primaryComm ? `${humanize(primaryComm.cargo_category)} (${primaryComm.consigned_quantity_units} Units)` : "Emergency Medical Supplies & Kits",
        cargoTier: primaryComm?.priority_tier ?? "TIER_1_LIFE_SAVING",
        cargoQuantity: primaryComm ? `${primaryComm.consigned_weight_kg} kg · ${primaryComm.consigned_quantity_units} units` : "2,500 kg · 50 Units",
        driverName: driver?.full_name ?? "Deepak Sharma",
        driverPhone: driver?.phone_e164 ?? "+91 98640 12345",
        speedKph: pos?.speed_kph ?? 0,
        headingDeg: pos?.heading_deg ?? 142,
        lat: pos?.lat ?? 25.9610,
        lon: pos?.lon ?? 91.8828,
        lastFixAgo: gpsDesc.statement,
        isStale: gpsDesc.stale,
        hazmat: v.is_hazmat_capable,
        refrig: v.is_refrigerated,
        stops: stopsList.length ? stopsList : [
          { name: origin ?? "Guwahati Depot", time: "08:30 (Departed)", status: "completed" },
          { name: "Nongpoh Inspection Post", time: "10:15 (Passed)", status: "completed" },
          { name: dest ?? "Shillong Civil Hospital", time: "Est. 15:30", status: "pending" },
        ],
        routeWaypoints: NH6_WAYPOINTS,
      };
    });

    // Merge and deduplicate by registration number
    const combined = [...REGIONAL_FLEET_AUGMENTS];
    for (const dbv of dbMapped) {
      const existingIdx = combined.findIndex((c) => c.registration.toLowerCase() === dbv.registration.toLowerCase());
      if (existingIdx >= 0) {
        combined[existingIdx] = { ...combined[existingIdx]!, ...dbv };
      } else {
        combined.push(dbv);
      }
    }
    return combined;
  }, [vehiclesQuery.data, tripsQuery.data, commitmentsQuery.data, driversQuery.data, facilitiesQuery.data, fleetPositions, now]);

  // Scoped fleet items for District Officer or State Authority
  const scopedFleetItems = useMemo(() => {
    if (!scopeActive) return allFleetItems;
    return allFleetItems.filter((item) => {
      const reg = item.registration.toUpperCase();
      const st = item.state.toLowerCase();
      const cor = item.corridor.toLowerCase();
      const stopsStr = item.stops.map((s) => s.name.toLowerCase()).join(" ");
      if (isDistrictOfficer) {
        return (
          reg.startsWith("AS-01") ||
          reg.startsWith("AS01") ||
          cor.includes("guwahati") ||
          cor.includes("kamrup") ||
          cor.includes("sonapur") ||
          cor.includes("jalukbari") ||
          cor.includes("nh-27") ||
          cor.includes("nh-6") ||
          stopsStr.includes("guwahati") ||
          stopsStr.includes("jalukbari") ||
          stopsStr.includes("khanapara") ||
          stopsStr.includes("sonapur") ||
          stopsStr.includes("azara")
        );
      }
      return (
        reg.startsWith("AS-") ||
        st.includes("assam") ||
        cor.includes("guwahati") ||
        cor.includes("nagaon") ||
        cor.includes("sonapur") ||
        cor.includes("nh-27") ||
        cor.includes("nh-6") ||
        cor.includes("silchar") ||
        cor.includes("tezpur") ||
        cor.includes("jorhat") ||
        cor.includes("dibrugarh") ||
        stopsStr.includes("guwahati") ||
        stopsStr.includes("tezpur") ||
        stopsStr.includes("nagaon") ||
        stopsStr.includes("silchar")
      );
    });
  }, [allFleetItems, scopeActive, isDistrictOfficer]);

  // Selected vehicle object
  const selectedVehicle = useMemo(() => {
    return scopedFleetItems.find((v) => v.id === selectedVehicleId) ?? scopedFleetItems[0] ?? allFleetItems[0];
  }, [scopedFleetItems, allFleetItems, selectedVehicleId]);

  // Filtered rows for the operations table
  const filteredVehicles = useMemo(() => {
    return scopedFleetItems.filter((item) => {
      const matchStatus = statusFilter === "ALL" || item.status === statusFilter;
      const matchSearch =
        !searchTerm.trim() ||
        item.registration.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.tripCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.state.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.driverName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.cargoDescription.toLowerCase().includes(searchTerm.toLowerCase());
      return matchStatus && matchSearch;
    });
  }, [scopedFleetItems, statusFilter, searchTerm]);

  // Map markers
  const mapPoints = useMemo<MapPoint[]>(() => {
    return scopedFleetItems.map((v) => {
      const tone: MapPoint["tone"] =
        v.status === "DISRUPTED"
          ? "danger"
          : v.status === "DELAYED"
          ? "warn"
          : v.status === "ON_TIME"
          ? "ok"
          : "neutral";

      return {
        id: v.id,
        kind: "vehicle",
        lat: v.lat,
        lon: v.lon,
        tone,
        stale: v.isStale,
        label: `${v.registration} · ${v.tripCode} (${v.statusLabel})`,
      };
    });
  }, [scopedFleetItems]);

  // Map lines (Route Polyline of selected vehicle)
  const mapLines = useMemo<MapLine[]>(() => {
    if (!selectedVehicle || !selectedVehicle.routeWaypoints || selectedVehicle.routeWaypoints.length < 2) {
      return [];
    }
    return [
      {
        id: `route-${selectedVehicle.id}`,
        cls: selectedVehicle.status === "DISRUPTED" ? "route_primary" : "route_feasible_a",
        coordinates: selectedVehicle.routeWaypoints,
        label: `${selectedVehicle.corridor} · ${selectedVehicle.tripCode}`,
        roadName: selectedVehicle.corridor,
      },
    ];
  }, [selectedVehicle]);

  // Top metric counters (matching user request scale: 82/61/12/9/4 regional vs 34/26/5/4/1 Assam vs 14/11/2/1/0 Kamrup)
  const stats = useMemo(() => {
    if (scopeActive) {
      if (isDistrictOfficer) {
        return {
          activeVehicles: 14,
          inTransit: 11,
          delayed: 2,
          atRisk: 1,
          offline: 0,
        };
      }
      return {
        activeVehicles: 34,
        inTransit: 26,
        delayed: 5,
        atRisk: 4,
        offline: 1,
      };
    }
    return {
      activeVehicles: 82,
      inTransit: 61,
      delayed: 12,
      atRisk: 9,
      offline: 4,
    };
  }, [scopeActive, isDistrictOfficer]);

  // Critical deliveries counts
  const deliveryCategories = useMemo(() => {
    if (scopeActive) {
      if (isDistrictOfficer) {
        return [
          { id: "MEDICAL", title: "Medical Supplies", count: 3, sub: "ICU Kits, Dialysis Packs, Oxygen Cylinders", tone: "danger" as const, icon: "🩺" },
          { id: "FOOD", title: "Food & Potable Water", count: 2, sub: "Emergency Rations & Purifiers", tone: "warn" as const, icon: "🍞" },
          { id: "CONSTRUCTION", title: "Construction & Gear", count: 1, sub: "Berm Shoring, Hydraulic Pumps", tone: "info" as const, icon: "🏗️" },
          { id: "EMERGENCY", title: "Emergency Equipment", count: 1, sub: "SDRF Tactical Rescue Inflatables", tone: "caution" as const, icon: "🚨" },
        ];
      }
      return [
        { id: "MEDICAL", title: "Medical Supplies", count: 6, sub: "ICU Kits, Dialysis Packs, Oxygen Cylinders", tone: "danger" as const, icon: "🩺" },
        { id: "FOOD", title: "Food & Potable Water", count: 4, sub: "Emergency Rations & Purifiers", tone: "warn" as const, icon: "🍞" },
        { id: "CONSTRUCTION", title: "Construction & Gear", count: 3, sub: "Berm Shoring, Hydraulic Pumps", tone: "info" as const, icon: "🏗️" },
        { id: "EMERGENCY", title: "Emergency Equipment", count: 2, sub: "SDRF Tactical Rescue Inflatables", tone: "caution" as const, icon: "🚨" },
      ];
    }
    return [
      { id: "MEDICAL", title: "Medical Supplies", count: 12, sub: "ICU Kits, Vaccines, Blood, Oxygen", tone: "danger" as const, icon: "🩺" },
      { id: "FOOD", title: "Food & Potable Water", count: 8, sub: "Emergency Rations & Purifiers", tone: "warn" as const, icon: "🍞" },
      { id: "CONSTRUCTION", title: "Construction & Gear", count: 5, sub: "Bailey Bridges, Dozers, Hydraulic Tools", tone: "info" as const, icon: "🏗️" },
      { id: "EMERGENCY", title: "Emergency Equipment", count: 4, sub: "Rescue Inflatables, Gensets, Shelter Kits", tone: "caution" as const, icon: "🚨" },
    ];
  }, [scopeActive, isDistrictOfficer]);

  // Consignments list
  const criticalConsignments = useMemo(() => [
    { ref: "MED-SHG-2026-001", cat: "Medical", name: "Trauma ICU Sets & Syringes", tier: "Tier 1 Life-Saving", from: "Guwahati Depot", to: "Shillong Civil Hospital", status: "AT RISK", eta: "+85m (Blocked)", vehicleReg: "AS-01-HC-9821" },
    { ref: "VAC-NPH-2026-002", cat: "Medical", name: "Cold-Chain Hepatitis Vaccines", tier: "Tier 1 Life-Saving", from: "Dimapur Hub", to: "Imphal Hospital", status: "DELAYED", eta: "+32m", vehicleReg: "ML-01-EX-5541" },
    { ref: "OXY-ITA-2026-009", cat: "Medical", name: "Compressed Oxygen Cylinders", tier: "Tier 1 Life-Saving", from: "Tezpur Depot", to: "Itanagar General Hospital", status: "ON TIME", eta: "16:40", vehicleReg: "AR-01-TK-9022" },
    { ref: "REL-RSN-2026-003", cat: "Food", name: "Fortified Rice & Baby Formula", tier: "Tier 2 Essential", from: "Silchar Godown", to: "Aizawl Emergency Center", status: "DELAYED", eta: "+45m", vehicleReg: "MZ-01-TR-7721" },
    { ref: "BBR-TUE-2026-014", cat: "Construction", name: "Prefabricated Bailey Bridge Unit", tier: "Tier 1 Life-Saving", from: "Dimapur PWD", to: "Tuensang Disaster Zone", status: "DISRUPTED", eta: "+110m", vehicleReg: "NL-01-EM-2219" },
    { ref: "GEN-GNT-2026-088", cat: "Emergency", name: "High-Altitude 50kVA Power Gensets", tier: "Tier 2 Essential", from: "Siliguri Hub", to: "Gangtok Power Grid", status: "ON TIME", eta: "15:20", vehicleReg: "SK-01-FD-3390" },
  ], []);

  const filteredConsignments = useMemo(() => {
    let items = criticalConsignments;
    if (scopeActive) {
      if (isDistrictOfficer) {
        items = items.filter((c) =>
          c.vehicleReg.startsWith("AS-01") ||
          c.vehicleReg.startsWith("AS01") ||
          c.from.toLowerCase().includes("guwahati") ||
          c.to.toLowerCase().includes("guwahati")
        );
      } else {
        items = items.filter((c) =>
          c.vehicleReg.startsWith("AS-") ||
          c.from.toLowerCase().includes("guwahati") ||
          c.from.toLowerCase().includes("tezpur") ||
          c.from.toLowerCase().includes("silchar") ||
          c.to.toLowerCase().includes("guwahati") ||
          c.to.toLowerCase().includes("shillong") ||
          c.to.toLowerCase().includes("itanagar")
        );
      }
    }
    if (cargoFilter === "ALL") return items;
    return items.filter((c) => c.cat.toUpperCase() === cargoFilter.toUpperCase());
  }, [criticalConsignments, cargoFilter, scopeActive, isDistrictOfficer]);

  return (
    <div className="stack" style={{ gap: "1.75rem", paddingBottom: "3rem" }}>
      {/* District Officer Scope Banner */}
      {isDistrictOfficer && (
        <div
          style={{
            background: "linear-gradient(90deg, #064e3b 0%, #065f46 100%)",
            color: "#ffffff",
            padding: "0.85rem 1.25rem",
            borderRadius: "12px",
            border: "1px solid #10b981",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            boxShadow: "0 4px 15px rgba(16, 185, 129, 0.15)",
          }}
        >
          <div>
            <div style={{ fontWeight: 800, fontSize: "0.95rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span>📋 District Incident Verifier Active · {assignedDistrict} Transit Corridors</span>
              <span style={{ background: "#10b981", fontSize: "0.72rem", padding: "0.15rem 0.5rem", borderRadius: "10px", color: "#fff" }}>
                Kamrup Metro Corridors
              </span>
            </div>
            <div style={{ fontSize: "0.8rem", color: "#a7f3d0", marginTop: "0.2rem" }}>
              Tracking {stats.activeVehicles} active vehicles and {stats.inTransit} deliveries traversing {assignedDistrict}.
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <button
              type="button"
              onClick={() => setScopeActive(!scopeActive)}
              style={{
                background: scopeActive ? "#10b981" : "rgba(255,255,255,0.1)",
                border: "1px solid rgba(255,255,255,0.2)",
                color: "#fff",
                fontSize: "0.8rem",
                fontWeight: 600,
                padding: "0.35rem 0.75rem",
                borderRadius: "6px",
                cursor: "pointer",
              }}
            >
              {scopeActive ? `✓ Focused on ${assignedDistrict}` : "Show Full NER Region"}
            </button>
          </div>
        </div>
      )}

      {/* State Authority Scope Banner */}
      {isStateAuthority && !isDistrictOfficer && (
        <div
          style={{
            background: "linear-gradient(90deg, rgba(2, 132, 199, 0.15) 0%, rgba(15, 23, 42, 0.6) 100%)",
            padding: "0.85rem 1.25rem",
            borderRadius: "12px",
            border: "1px solid #0284c7",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            boxShadow: "0 4px 15px rgba(2, 132, 199, 0.15)",
          }}
        >
          <div>
            <div style={{ fontWeight: 800, fontSize: "0.95rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span>🏛️ State Authority Active · {assignedState} Fleet Operations Desk</span>
              <span style={{ background: "#0284c7", fontSize: "0.72rem", padding: "0.15rem 0.5rem", borderRadius: "10px", color: "#fff" }}>
                Assam Corridors
              </span>
            </div>
            <div style={{ fontSize: "0.8rem", color: "#94a3b8", marginTop: "0.2rem" }}>
              Tracking {stats.activeVehicles} active vehicles and {stats.inTransit} deliveries under {assignedState} jurisdiction.
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <button
              type="button"
              onClick={() => setScopeActive(!scopeActive)}
              style={{
                background: scopeActive ? "#0284c7" : "rgba(255,255,255,0.1)",
                border: "1px solid rgba(255,255,255,0.2)",
                color: "#fff",
                fontSize: "0.8rem",
                fontWeight: 600,
                padding: "0.35rem 0.75rem",
                borderRadius: "6px",
                cursor: "pointer",
              }}
            >
              {scopeActive ? `✓ Focused on ${assignedState}` : "Show Full NER Region"}
            </button>
          </div>
        </div>
      )}

      {/* Top Banner / Mission Statement */}
      <div
        style={{
          background: "linear-gradient(135deg, #091e3a 0%, #102a4e 50%, #0f172a 100%)",
          color: "#ffffff",
          padding: "1.5rem 1.75rem",
          borderRadius: "16px",
          boxShadow: "0 10px 30px -5px rgba(2, 132, 199, 0.2)",
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "1rem",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.35rem" }}>
            <span style={{ fontSize: "1.4rem" }}>🚚</span>
            <span
              style={{
                fontSize: "0.75rem",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                background: "rgba(56, 189, 248, 0.2)",
                color: "#38bdf8",
                padding: "0.2rem 0.6rem",
                borderRadius: "999px",
                border: "1px solid rgba(56, 189, 248, 0.3)",
              }}
            >
              {scopeActive
                ? (isDistrictOfficer ? `${assignedDistrict} Fleet Command` : `${assignedState} Fleet Command`)
                : "Unified Operations"}
            </span>
          </div>
          <h1 style={{ fontSize: "1.65rem", fontWeight: 800, margin: 0, letterSpacing: "-0.02em" }}>
            {scopeActive
              ? (isDistrictOfficer ? `${assignedDistrict} Fleet & Delivery Operations` : `${assignedState} Fleet & Delivery Operations`)
              : "Fleet Monitoring & Delivery Operations"}
          </h1>
          <p style={{ margin: "0.35rem 0 0", color: "#94a3b8", fontSize: "0.92rem", maxWidth: "680px" }}>
            {scopeActive
              ? (isDistrictOfficer
                  ? `Real-time tracking of visible fleet, ${assignedDistrict} transit corridor conditions, and critical life-saving consignments.`
                  : `Real-time tracking of visible fleet, ${assignedState} highway corridor conditions, and critical life-saving consignments.`)
              : "Real-time tracking of visible fleet, Northeast highway corridor conditions, and critical life-saving consignments."}
          </p>
        </div>

        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
          <div
            style={{
              background: "rgba(255, 255, 255, 0.08)",
              padding: "0.6rem 1rem",
              borderRadius: "10px",
              border: "1px solid rgba(255, 255, 255, 0.12)",
              textAlign: "right",
            }}
          >
            <div style={{ fontSize: "0.75rem", color: "#cbd5e1" }}>Operational Focus</div>
            <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "#38bdf8" }}>
              {scopeActive
                ? (isDistrictOfficer ? `${assignedDistrict} Corridors` : `${assignedState} Corridors`)
                : "Northeast Corridor Network"}
            </div>
          </div>
          {selectedVehicle?.status === "DISRUPTED" && (
            <Link
              href="/gov/impact"
              style={{
                background: "#ef4444",
                color: "#ffffff",
                fontWeight: 700,
                fontSize: "0.85rem",
                padding: "0.65rem 1.1rem",
                borderRadius: "10px",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
                boxShadow: "0 4px 15px rgba(239, 68, 68, 0.4)",
              }}
            >
              <span>🚨</span> View Impact ({selectedVehicle.tripCode})
            </Link>
          )}
        </div>
      </div>

      {/* Top 5 KPI Metrics Strip */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "1rem",
        }}
      >
        {/* Card 1: Active Vehicles */}
        <div
          onClick={() => setStatusFilter("ALL")}
          style={{
            background: "var(--surface)",
            border: statusFilter === "ALL" ? "2px solid #0284c7" : "1px solid var(--border)",
            borderRadius: "14px",
            padding: "1rem 1.25rem",
            cursor: "pointer",
            boxShadow: "var(--shadow-sm)",
            transition: "all 0.15s ease",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
              Active Vehicles
            </span>
            <span style={{ display: "inline-block", width: "10px", height: "10px", borderRadius: "50%", background: "#10b981", boxShadow: "0 0 8px #10b981" }} />
          </div>
          <div style={{ fontSize: "2rem", fontWeight: 800, color: "var(--text)", marginTop: "0.35rem" }}>
            {stats.activeVehicles}
          </div>
          <div style={{ fontSize: "0.75rem", color: "#10b981", fontWeight: 600, marginTop: "0.2rem" }}>
            ● Operational Fleet
          </div>
        </div>

        {/* Card 2: In Transit */}
        <div
          onClick={() => setStatusFilter("ON_TIME")}
          style={{
            background: "var(--surface)",
            border: statusFilter === "ON_TIME" ? "2px solid #0284c7" : "1px solid var(--border)",
            borderRadius: "14px",
            padding: "1rem 1.25rem",
            cursor: "pointer",
            boxShadow: "var(--shadow-sm)",
            transition: "all 0.15s ease",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
              In Transit
            </span>
            <span style={{ display: "inline-block", width: "10px", height: "10px", borderRadius: "50%", background: "#0284c7" }} />
          </div>
          <div style={{ fontSize: "2rem", fontWeight: 800, color: "var(--text)", marginTop: "0.35rem" }}>
            {stats.inTransit}
          </div>
          <div style={{ fontSize: "0.75rem", color: "#0284c7", fontWeight: 600, marginTop: "0.2rem" }}>
            ● Moving on Corridors
          </div>
        </div>

        {/* Card 3: Delayed */}
        <div
          onClick={() => setStatusFilter("DELAYED")}
          style={{
            background: "var(--surface)",
            border: statusFilter === "DELAYED" ? "2px solid #f59e0b" : "1px solid var(--border)",
            borderRadius: "14px",
            padding: "1rem 1.25rem",
            cursor: "pointer",
            boxShadow: "var(--shadow-sm)",
            transition: "all 0.15s ease",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
              Delayed
            </span>
            <span style={{ display: "inline-block", width: "10px", height: "10px", borderRadius: "50%", background: "#f59e0b", boxShadow: "0 0 8px #f59e0b" }} />
          </div>
          <div style={{ fontSize: "2rem", fontWeight: 800, color: "#d97706", marginTop: "0.35rem" }}>
            {stats.delayed}
          </div>
          <div style={{ fontSize: "0.75rem", color: "#d97706", fontWeight: 600, marginTop: "0.2rem" }}>
            ● ETA Slips (+30m+)
          </div>
        </div>

        {/* Card 4: At Risk / Disrupted */}
        <div
          onClick={() => setStatusFilter("DISRUPTED")}
          style={{
            background: "var(--surface)",
            border: statusFilter === "DISRUPTED" ? "2px solid #ef4444" : "1px solid var(--border)",
            borderRadius: "14px",
            padding: "1rem 1.25rem",
            cursor: "pointer",
            boxShadow: "var(--shadow-sm)",
            transition: "all 0.15s ease",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
              At Risk / Disrupted
            </span>
            <span style={{ display: "inline-block", width: "10px", height: "10px", borderRadius: "50%", background: "#ef4444", boxShadow: "0 0 8px #ef4444" }} />
          </div>
          <div style={{ fontSize: "2rem", fontWeight: 800, color: "#dc2626", marginTop: "0.35rem" }}>
            {stats.atRisk}
          </div>
          <div style={{ fontSize: "0.75rem", color: "#dc2626", fontWeight: 600, marginTop: "0.2rem" }}>
            ● Landslide / Blockage
          </div>
        </div>

        {/* Card 5: Offline / Stale */}
        <div
          onClick={() => setStatusFilter("OFFLINE")}
          style={{
            background: "var(--surface)",
            border: statusFilter === "OFFLINE" ? "2px solid #64748b" : "1px solid var(--border)",
            borderRadius: "14px",
            padding: "1rem 1.25rem",
            cursor: "pointer",
            boxShadow: "var(--shadow-sm)",
            transition: "all 0.15s ease",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
              Offline / Stale
            </span>
            <span style={{ display: "inline-block", width: "10px", height: "10px", borderRadius: "50%", background: "#94a3b8" }} />
          </div>
          <div style={{ fontSize: "2rem", fontWeight: 800, color: "var(--text)", marginTop: "0.35rem" }}>
            {stats.offline}
          </div>
          <div style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 600, marginTop: "0.2rem" }}>
            ● Feed Lost &gt; 30m
          </div>
        </div>
      </div>

      {/* Main Command Workspace: Interactive Map & Live Operations Split */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 390px", gap: "1.5rem", alignItems: "start" }}>
        {/* Left Column: Interactive Map + Fleet Table */}
        <div className="stack" style={{ gap: "1.5rem" }}>
          {/* Live Map Card */}
          <div
            style={{
              background: "var(--surface)",
              borderRadius: "16px",
              border: "1px solid var(--border)",
              boxShadow: "var(--shadow)",
              overflow: "hidden",
            }}
          >
            {/* Map Header Bar */}
            <div
              style={{
                padding: "0.9rem 1.25rem",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                background: "var(--surface-2)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                <span style={{ fontSize: "1.1rem" }}>🗺️</span>
                <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>Live Fleet Geospatial Tracking</span>
                <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                  ({mapPoints.length} vehicles mapped)
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                {selectedVehicle && (
                  <span
                    style={{
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      background: "rgba(2, 132, 199, 0.1)",
                      color: "#0284c7",
                      padding: "0.2rem 0.5rem",
                      borderRadius: "6px",
                    }}
                  >
                    Focused: {selectedVehicle.registration}
                  </span>
                )}
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Auto-refresh: 30s</span>
              </div>
            </div>

            {/* Map View */}
            <div style={{ position: "relative" }}>
              <MapView
                ariaLabel="Live fleet map"
                height={460}
                points={mapPoints}
                lines={mapLines}
                selectedId={selectedVehicleId}
                onSelectPoint={(id) => setSelectedVehicleId(id)}
                fitBounds={
                  scopeActive && isDistrictOfficer && districtBBox
                    ? districtBBox
                    : scopeActive && isStateAuthority && stateBBox
                    ? stateBBox
                    : selectedVehicle
                    ? [selectedVehicle.lon - 0.5, selectedVehicle.lat - 0.4, selectedVehicle.lon + 0.5, selectedVehicle.lat + 0.4]
                    : [89.5, 23.5, 96.0, 28.5]
                }
                fitKey={`${scopeActive ? (isDistrictOfficer ? assignedDistrict : assignedState) : "NER"}-${selectedVehicleId}-${mapLines.length}`}
              />

              {/* Floating Quick Info Card over Map (Image 1 style) */}
              {selectedVehicle && (
                <div
                  style={{
                    position: "absolute",
                    bottom: "1rem",
                    left: "1rem",
                    background: "rgba(255, 255, 255, 0.95)",
                    backdropFilter: "blur(8px)",
                    borderRadius: "12px",
                    border: "1px solid rgba(0, 0, 0, 0.12)",
                    padding: "0.75rem 1rem",
                    boxShadow: "0 8px 24px rgba(0, 0, 0, 0.15)",
                    zIndex: 10,
                    maxWidth: "340px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                      <span
                        style={{
                          display: "inline-block",
                          width: "8px",
                          height: "8px",
                          borderRadius: "50%",
                          background:
                            selectedVehicle.status === "DISRUPTED"
                              ? "#ef4444"
                              : selectedVehicle.status === "DELAYED"
                              ? "#f59e0b"
                              : "#10b981",
                        }}
                      />
                      <strong style={{ fontSize: "0.95rem" }}>{selectedVehicle.registration}</strong>
                    </div>
                    <span
                      style={{
                        fontSize: "0.7rem",
                        fontWeight: 700,
                        padding: "0.15rem 0.4rem",
                        borderRadius: "4px",
                        background:
                          selectedVehicle.status === "DISRUPTED"
                            ? "#fee2e2"
                            : selectedVehicle.status === "DELAYED"
                            ? "#fef3c7"
                            : "#dcfce7",
                        color:
                          selectedVehicle.status === "DISRUPTED"
                            ? "#991b1b"
                            : selectedVehicle.status === "DELAYED"
                            ? "#92400e"
                            : "#166534",
                      }}
                    >
                      {selectedVehicle.statusLabel}
                    </span>
                  </div>
                  <div style={{ fontSize: "0.8rem", color: "#475569", marginTop: "0.3rem" }}>
                    Trip: <strong>{selectedVehicle.tripCode}</strong> · ETA:{" "}
                    <strong style={{ color: selectedVehicle.status === "DISRUPTED" ? "#dc2626" : "inherit" }}>
                      {selectedVehicle.eta}
                    </strong>
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "0.2rem" }}>
                    Driver: {selectedVehicle.driverName} · Speed: {selectedVehicle.speedKph} km/h
                  </div>
                </div>
              )}
            </div>

            <div style={{ padding: "0.5rem 1rem", borderTop: "1px solid var(--border)", background: "var(--surface)" }}>
              <MapLegend points={mapPoints} />
            </div>
          </div>

          {/* Vehicle Table (Fleet Table as requested) */}
          <div
            style={{
              background: "var(--surface)",
              borderRadius: "16px",
              border: "1px solid var(--border)",
              boxShadow: "var(--shadow)",
              padding: "1.25rem",
            }}
          >
            {/* Table Controls / Filters Bar */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "0.75rem",
                marginBottom: "1rem",
              }}
            >
              <div>
                <h2 style={{ fontSize: "1.15rem", fontWeight: 700, margin: 0 }}>Fleet Operations Registry</h2>
                <p style={{ margin: "0.2rem 0 0", fontSize: "0.8rem", color: "var(--text-muted)" }}>
                  Showing {filteredVehicles.length} of {allFleetItems.length} operational units
                </p>
              </div>

              {/* Status Filter Tabs */}
              <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                {(["ALL", "ON_TIME", "DELAYED", "DISRUPTED", "OFFLINE"] as const).map((st) => (
                  <button
                    key={st}
                    onClick={() => setStatusFilter(st)}
                    style={{
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      padding: "0.35rem 0.65rem",
                      borderRadius: "8px",
                      border: statusFilter === st ? "1px solid #0284c7" : "1px solid var(--border)",
                      background: statusFilter === st ? "#0284c7" : "var(--surface-2)",
                      color: statusFilter === st ? "#ffffff" : "var(--text)",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                  >
                    {st === "ALL" ? "All" : st === "ON_TIME" ? "🟢 On Time" : st === "DELAYED" ? "🟡 Delayed" : st === "DISRUPTED" ? "🔴 Disrupted" : "⚪ Offline"}
                  </button>
                ))}
              </div>
            </div>

            {/* Search Bar */}
            <div style={{ marginBottom: "1rem" }}>
              <input
                type="text"
                placeholder="Search vehicle reg, trip code, state, driver, or cargo..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  width: "100%",
                  padding: "0.6rem 0.9rem",
                  borderRadius: "8px",
                  border: "1px solid var(--border)",
                  fontSize: "0.88rem",
                  background: "var(--bg)",
                }}
              />
            </div>

            {/* Table */}
            <div className="table-wrap">
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.88rem" }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid var(--border)", textAlign: "left" }}>
                    <th style={{ padding: "0.65rem 0.75rem" }}>Vehicle</th>
                    <th style={{ padding: "0.65rem 0.75rem" }}>Trip</th>
                    <th style={{ padding: "0.65rem 0.75rem" }}>State / Corridor</th>
                    <th style={{ padding: "0.65rem 0.75rem" }}>Status</th>
                    <th style={{ padding: "0.65rem 0.75rem" }}>ETA / Delay</th>
                    <th style={{ padding: "0.65rem 0.75rem" }}>Cargo Manifest</th>
                    <th style={{ padding: "0.65rem 0.75rem", textAlign: "right" }}>Inspect</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredVehicles.map((item) => {
                    const isSelected = selectedVehicleId === item.id;
                    return (
                      <tr
                        key={item.id}
                        onClick={() => setSelectedVehicleId(item.id)}
                        style={{
                          borderBottom: "1px solid var(--border)",
                          background: isSelected ? "rgba(2, 132, 199, 0.08)" : "transparent",
                          cursor: "pointer",
                          transition: "background 0.15s ease",
                        }}
                      >
                        {/* Vehicle Reg & Model */}
                        <td style={{ padding: "0.75rem" }}>
                          <div style={{ fontWeight: 700, color: "var(--text)" }}>{item.registration}</div>
                          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                            {item.model}
                            {item.refrig ? " · Reefer" : item.hazmat ? " · Hazmat" : ""}
                          </div>
                        </td>

                        {/* Trip Code */}
                        <td style={{ padding: "0.75rem" }}>
                          <span
                            style={{
                              fontFamily: "monospace",
                              fontWeight: 700,
                              background: "var(--surface-2)",
                              padding: "0.2rem 0.45rem",
                              borderRadius: "4px",
                              border: "1px solid var(--border)",
                            }}
                          >
                            {item.tripCode}
                          </span>
                        </td>

                        {/* State & Corridor */}
                        <td style={{ padding: "0.75rem" }}>
                          <div style={{ fontWeight: 600 }}>{item.state}</div>
                          <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>{item.corridor}</div>
                        </td>

                        {/* Status */}
                        <td style={{ padding: "0.75rem" }}>
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "0.3rem",
                              fontSize: "0.75rem",
                              fontWeight: 700,
                              padding: "0.25rem 0.55rem",
                              borderRadius: "999px",
                              background:
                                item.status === "DISRUPTED"
                                  ? "#fee2e2"
                                  : item.status === "DELAYED"
                                  ? "#fef3c7"
                                  : item.status === "ON_TIME"
                                  ? "#dcfce7"
                                  : "#f1f5f9",
                              color:
                                item.status === "DISRUPTED"
                                  ? "#991b1b"
                                  : item.status === "DELAYED"
                                  ? "#92400e"
                                  : item.status === "ON_TIME"
                                  ? "#166534"
                                  : "#475569",
                            }}
                          >
                            <span>
                              {item.status === "DISRUPTED"
                                ? "🔴"
                                : item.status === "DELAYED"
                                ? "🟡"
                                : item.status === "ON_TIME"
                                ? "🟢"
                                : "⚪"}
                            </span>
                            {item.statusLabel}
                          </span>
                        </td>

                        {/* ETA / Delay */}
                        <td style={{ padding: "0.75rem" }}>
                          <div
                            style={{
                              fontWeight: 700,
                              color:
                                item.status === "DISRUPTED"
                                  ? "#dc2626"
                                  : item.status === "DELAYED"
                                  ? "#d97706"
                                  : "var(--text)",
                            }}
                          >
                            {item.eta}
                          </div>
                          {item.delayNotice && (
                            <div style={{ fontSize: "0.7rem", color: "#dc2626", maxWidth: "160px" }}>
                              {item.delayNotice}
                            </div>
                          )}
                        </td>

                        {/* Cargo Preview */}
                        <td style={{ padding: "0.75rem" }}>
                          <div style={{ fontWeight: 600, fontSize: "0.82rem" }}>
                            {item.cargoDescription}
                          </div>
                          <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                            {item.cargoQuantity}
                          </div>
                        </td>

                        {/* Action */}
                        <td style={{ padding: "0.75rem", textAlign: "right" }}>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedVehicleId(item.id);
                            }}
                            style={{
                              background: isSelected ? "#0284c7" : "var(--surface-2)",
                              color: isSelected ? "#ffffff" : "var(--text)",
                              border: "1px solid var(--border)",
                              borderRadius: "6px",
                              padding: "0.3rem 0.6rem",
                              fontSize: "0.75rem",
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                          >
                            {isSelected ? "Active" : "Inspect →"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Column: 7-Layer Vehicle Inspection Dossier (Click Vehicle Flow) */}
        <div style={{ position: "sticky", top: "1rem" }}>
          {selectedVehicle ? (
            <div
              style={{
                background: "var(--surface)",
                borderRadius: "16px",
                border: "1px solid var(--border)",
                boxShadow: "var(--shadow-md)",
                overflow: "hidden",
              }}
            >
              {/* Dossier Header */}
              <div
                style={{
                  background:
                    selectedVehicle.status === "DISRUPTED"
                      ? "linear-gradient(135deg, #7f1d1d, #991b1b)"
                      : selectedVehicle.status === "DELAYED"
                      ? "linear-gradient(135deg, #78350f, #92400e)"
                      : "linear-gradient(135deg, #064e3b, #065f46)",
                  color: "#ffffff",
                  padding: "1.25rem",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <span
                      style={{
                        fontSize: "0.7rem",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        background: "rgba(255, 255, 255, 0.2)",
                        padding: "0.15rem 0.45rem",
                        borderRadius: "4px",
                        fontWeight: 700,
                      }}
                    >
                      {selectedVehicle.type}
                    </span>
                    <h3 style={{ fontSize: "1.35rem", fontWeight: 800, margin: "0.35rem 0 0" }}>
                      {selectedVehicle.registration}
                    </h3>
                    <div style={{ fontSize: "0.8rem", color: "rgba(255, 255, 255, 0.8)", marginTop: "0.2rem" }}>
                      {selectedVehicle.model}
                    </div>
                  </div>
                  <div
                    style={{
                      background: "rgba(255, 255, 255, 0.15)",
                      padding: "0.3rem 0.6rem",
                      borderRadius: "8px",
                      textAlign: "right",
                      fontSize: "0.75rem",
                      fontWeight: 700,
                    }}
                  >
                    <div>{selectedVehicle.statusLabel}</div>
                    <div style={{ fontSize: "0.7rem", opacity: 0.9 }}>{selectedVehicle.eta}</div>
                  </div>
                </div>
              </div>

              {/* Dossier Body (The 7 Layers) */}
              <div style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1.2rem" }}>
                {/* 1. Vehicle & Driver Profile */}
                <div>
                  <div style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "0.35rem" }}>
                    Driver & Vehicle Profile
                  </div>
                  <div style={{ background: "var(--surface-2)", padding: "0.75rem", borderRadius: "10px", border: "1px solid var(--border)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: "0.9rem" }}>{selectedVehicle.driverName}</div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Licensed Commercial Driver</div>
                      </div>
                      <a
                        href={`tel:${selectedVehicle.driverPhone}`}
                        style={{
                          background: "var(--surface)",
                          border: "1px solid var(--border)",
                          borderRadius: "6px",
                          padding: "0.3rem 0.6rem",
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          color: "#0284c7",
                          textDecoration: "none",
                        }}
                      >
                        📞 Call Driver
                      </a>
                    </div>
                    <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem", flexWrap: "wrap" }}>
                      {selectedVehicle.refrig && (
                        <span style={{ fontSize: "0.7rem", background: "#e0f2fe", color: "#0369a1", padding: "0.15rem 0.4rem", borderRadius: "4px", fontWeight: 600 }}>
                          ❄️ Cold-Chain Compliant
                        </span>
                      )}
                      {selectedVehicle.hazmat && (
                        <span style={{ fontSize: "0.7rem", background: "#fef3c7", color: "#92400e", padding: "0.15rem 0.4rem", borderRadius: "4px", fontWeight: 600 }}>
                          ⚠️ Hazmat Certified
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* 2. Current GPS & Telemetry */}
                <div>
                  <div style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "0.35rem" }}>
                    Current GPS Telemetry
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                    <div style={{ background: "var(--surface-2)", padding: "0.6rem", borderRadius: "8px", border: "1px solid var(--border)" }}>
                      <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>Coordinates</div>
                      <div style={{ fontWeight: 700, fontSize: "0.85rem", fontFamily: "monospace" }}>
                        {selectedVehicle.lat.toFixed(4)}°N, {selectedVehicle.lon.toFixed(4)}°E
                      </div>
                    </div>
                    <div style={{ background: "var(--surface-2)", padding: "0.6rem", borderRadius: "8px", border: "1px solid var(--border)" }}>
                      <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>Speed & Heading</div>
                      <div style={{ fontWeight: 700, fontSize: "0.85rem" }}>
                        {selectedVehicle.speedKph} km/h · {selectedVehicle.headingDeg}°
                      </div>
                    </div>
                  </div>
                  <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "0.3rem" }}>
                    Fix taken: <strong>{selectedVehicle.lastFixAgo}</strong> (Source: OBD Cellular Telemetry)
                  </div>
                </div>

                {/* 3. Current Trip & Origin-Destination Progress (Image 2 style) */}
                <div>
                  <div style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "0.35rem" }}>
                    Current Trip Progress
                  </div>
                  <div style={{ background: "var(--surface-2)", padding: "0.75rem", borderRadius: "10px", border: "1px solid var(--border)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                      <span style={{ fontWeight: 700, fontFamily: "monospace", fontSize: "0.88rem" }}>
                        Trip: {selectedVehicle.tripCode}
                      </span>
                      <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                        {selectedVehicle.stops[0]?.name.split(" ")[0]} ➔ {selectedVehicle.stops[selectedVehicle.stops.length - 1]?.name.split(" ")[0]}
                      </span>
                    </div>

                    {/* Progress Bar with Moving Truck */}
                    <div style={{ position: "relative", height: "8px", background: "var(--border)", borderRadius: "999px", margin: "1rem 0" }}>
                      <div
                        style={{
                          height: "100%",
                          width: selectedVehicle.status === "DISRUPTED" ? "55%" : selectedVehicle.status === "DELAYED" ? "65%" : "80%",
                          background:
                            selectedVehicle.status === "DISRUPTED"
                              ? "#ef4444"
                              : selectedVehicle.status === "DELAYED"
                              ? "#f59e0b"
                              : "#10b981",
                          borderRadius: "999px",
                        }}
                      />
                      <div
                        style={{
                          position: "absolute",
                          top: "-10px",
                          left: selectedVehicle.status === "DISRUPTED" ? "53%" : selectedVehicle.status === "DELAYED" ? "63%" : "78%",
                          fontSize: "1rem",
                        }}
                      >
                        🚚
                      </div>
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.7rem", color: "var(--text-muted)" }}>
                      <span>Start: {selectedVehicle.stops[0]?.name}</span>
                      <span>Target: {selectedVehicle.stops[selectedVehicle.stops.length - 1]?.name}</span>
                    </div>
                  </div>
                </div>

                {/* 4. Cargo Manifest */}
                <div>
                  <div style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "0.35rem" }}>
                    Cargo Manifest On Board
                  </div>
                  <div style={{ background: "var(--surface-2)", padding: "0.75rem", borderRadius: "10px", border: "1px solid var(--border)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: "0.88rem" }}>{selectedVehicle.cargoDescription}</div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.15rem" }}>
                          Weight: {selectedVehicle.cargoQuantity}
                        </div>
                      </div>
                      <span
                        style={{
                          fontSize: "0.7rem",
                          fontWeight: 700,
                          padding: "0.2rem 0.45rem",
                          borderRadius: "4px",
                          background: selectedVehicle.cargoTier === "TIER_1_LIFE_SAVING" ? "#fee2e2" : "#fef3c7",
                          color: selectedVehicle.cargoTier === "TIER_1_LIFE_SAVING" ? "#991b1b" : "#92400e",
                        }}
                      >
                        {humanize(selectedVehicle.cargoTier)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 5. Route Stops Timeline (Image 3 style) */}
                <div>
                  <div style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "0.35rem" }}>
                    Route Stops Timeline
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                    {selectedVehicle.stops.map((stop, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "0.6rem" }}>
                        <span
                          style={{
                            fontSize: "0.75rem",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: "20px",
                            height: "20px",
                            borderRadius: "50%",
                            background:
                              stop.status === "completed"
                                ? "#dcfce7"
                                : stop.status === "delayed"
                                ? "#fee2e2"
                                : stop.status === "current"
                                ? "#e0f2fe"
                                : "var(--surface-2)",
                            color:
                              stop.status === "completed"
                                ? "#166534"
                                : stop.status === "delayed"
                                ? "#991b1b"
                                : stop.status === "current"
                                ? "#0369a1"
                                : "var(--text-muted)",
                            fontWeight: 700,
                          }}
                        >
                          {i + 1}
                        </span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: "0.82rem", fontWeight: 600 }}>{stop.name}</div>
                          <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>{stop.time}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 6. Disruption Alert & Route Intelligence CTA */}
                {selectedVehicle.impactNotice && (
                  <div
                    style={{
                      background: "#fef2f2",
                      border: "1px solid #fecaca",
                      borderRadius: "10px",
                      padding: "0.85rem",
                      color: "#991b1b",
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                      <span>🔴</span> Hazard Disruption Detected
                    </div>
                    <p style={{ margin: "0.35rem 0", fontSize: "0.78rem", lineHeight: 1.4 }}>
                      {selectedVehicle.impactNotice.cause} · {selectedVehicle.impactNotice.clearance}
                    </p>
                    <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "#166534", background: "#f0fdf4", padding: "0.3rem 0.5rem", borderRadius: "6px", marginBottom: "0.6rem" }}>
                      💡 Recommended: {selectedVehicle.impactNotice.recommendedAlt}
                    </div>

                    <Link
                      href={`/gov/impact`}
                      style={{
                        display: "block",
                        textAlign: "center",
                        background: "#dc2626",
                        color: "#ffffff",
                        padding: "0.55rem",
                        borderRadius: "8px",
                        fontSize: "0.8rem",
                        fontWeight: 700,
                        textDecoration: "none",
                      }}
                    >
                      ⚡ Open Route Intelligence Command Center →
                    </Link>
                  </div>
                )}

                {/* Deep Links */}
                <div style={{ display: "flex", gap: "0.5rem", paddingTop: "0.2rem" }}>
                  <Link
                    href={`/gov/fleet/vehicles/${selectedVehicle.id}`}
                    style={{
                      flex: 1,
                      textAlign: "center",
                      background: "var(--surface-2)",
                      border: "1px solid var(--border)",
                      padding: "0.5rem",
                      borderRadius: "8px",
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      color: "var(--text)",
                      textDecoration: "none",
                    }}
                  >
                    Full Vehicle Dossier
                  </Link>
                  <Link
                    href={`/gov/routes?originLat=${selectedVehicle.lat}&originLon=${selectedVehicle.lon}`}
                    style={{
                      flex: 1,
                      textAlign: "center",
                      background: "var(--surface-2)",
                      border: "1px solid var(--border)",
                      padding: "0.5rem",
                      borderRadius: "8px",
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      color: "var(--text)",
                      textDecoration: "none",
                    }}
                  >
                    Reroute From Here
                  </Link>
                </div>
              </div>
            </div>
          ) : (
            <div
              style={{
                background: "var(--surface)",
                padding: "2rem",
                borderRadius: "16px",
                border: "1px solid var(--border)",
                textAlign: "center",
                color: "var(--text-muted)",
              }}
            >
              Select any vehicle from the table or map to view its complete operational dossier.
            </div>
          )}
        </div>
      </div>

      {/* Deliveries Section: "CRITICAL DELIVERIES" (As requested) */}
      <div
        style={{
          background: "var(--surface)",
          borderRadius: "16px",
          border: "1px solid var(--border)",
          boxShadow: "var(--shadow)",
          padding: "1.5rem",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem", marginBottom: "1.25rem" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span style={{ fontSize: "1.3rem" }}>📦</span>
              <h2 style={{ fontSize: "1.25rem", fontWeight: 800, margin: 0 }}>
                Critical Deliveries & Relief Consignments
              </h2>
            </div>
            <p style={{ margin: "0.25rem 0 0", fontSize: "0.85rem", color: "var(--text-muted)" }}>
              Categorized inventory of vital supplies currently navigating Northeast highway corridors.
            </p>
          </div>

          <Link
            href="/gov/fleet/deliveries"
            style={{
              fontSize: "0.82rem",
              fontWeight: 600,
              color: "#0284c7",
              textDecoration: "none",
              border: "1px solid var(--border)",
              padding: "0.4rem 0.8rem",
              borderRadius: "8px",
              background: "var(--surface-2)",
            }}
          >
            Manage All Consignments →
          </Link>
        </div>

        {/* 4 Category Cards (Medical 12, Food 8, Construction 5, Emergency 4) */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "1rem",
            marginBottom: "1.5rem",
          }}
        >
          {deliveryCategories.map((cat) => (
            <div
              key={cat.id}
              onClick={() => setCargoFilter(cargoFilter === cat.id ? "ALL" : cat.id)}
              style={{
                background: cargoFilter === cat.id ? "rgba(2, 132, 199, 0.08)" : "var(--surface-2)",
                border: cargoFilter === cat.id ? "2px solid #0284c7" : "1px solid var(--border)",
                borderRadius: "12px",
                padding: "1rem",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "1.5rem" }}>{cat.icon}</span>
                <span
                  style={{
                    fontSize: "1.6rem",
                    fontWeight: 800,
                    color:
                      cat.id === "MEDICAL"
                        ? "#dc2626"
                        : cat.id === "FOOD"
                        ? "#d97706"
                        : cat.id === "CONSTRUCTION"
                        ? "#0284c7"
                        : "#7c3aed",
                  }}
                >
                  {cat.count}
                </span>
              </div>
              <div style={{ fontWeight: 700, fontSize: "0.95rem", marginTop: "0.5rem" }}>{cat.title}</div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>{cat.sub}</div>
            </div>
          ))}
        </div>

        {/* SLA Health Bar */}
        <div style={{ background: "var(--surface-2)", padding: "0.85rem 1rem", borderRadius: "10px", marginBottom: "1.25rem", border: "1px solid var(--border)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", fontWeight: 600, marginBottom: "0.4rem" }}>
            <span>Consignment SLA Health Breakdown</span>
            <span>78% On-Time · 14% Delayed · 8% Disrupted</span>
          </div>
          <div style={{ display: "flex", height: "10px", borderRadius: "999px", overflow: "hidden" }}>
            <div style={{ width: "78%", background: "#10b981" }} title="On Time (78%)" />
            <div style={{ width: "14%", background: "#f59e0b" }} title="Delayed (14%)" />
            <div style={{ width: "8%", background: "#ef4444" }} title="At Risk (8%)" />
          </div>
        </div>

        {/* Consignments Table */}
        <div className="table-wrap">
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid var(--border)", textAlign: "left" }}>
                <th style={{ padding: "0.6rem 0.75rem" }}>Consignment Ref</th>
                <th style={{ padding: "0.6rem 0.75rem" }}>Cargo Item</th>
                <th style={{ padding: "0.6rem 0.75rem" }}>Priority Tier</th>
                <th style={{ padding: "0.6rem 0.75rem" }}>Assigned Vehicle</th>
                <th style={{ padding: "0.6rem 0.75rem" }}>Corridor Route</th>
                <th style={{ padding: "0.6rem 0.75rem" }}>SLA Status</th>
                <th style={{ padding: "0.6rem 0.75rem" }}>ETA</th>
              </tr>
            </thead>
            <tbody>
              {filteredConsignments.map((c) => (
                <tr key={c.ref} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "0.65rem 0.75rem", fontFamily: "monospace", fontWeight: 700 }}>
                    {c.ref}
                  </td>
                  <td style={{ padding: "0.65rem 0.75rem" }}>
                    <div style={{ fontWeight: 600 }}>{c.name}</div>
                    <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>Category: {c.cat}</div>
                  </td>
                  <td style={{ padding: "0.65rem 0.75rem" }}>
                    <span
                      style={{
                        fontSize: "0.72rem",
                        fontWeight: 700,
                        padding: "0.2rem 0.45rem",
                        borderRadius: "4px",
                        background: c.tier.includes("Life") ? "#fee2e2" : "#fef3c7",
                        color: c.tier.includes("Life") ? "#991b1b" : "#92400e",
                      }}
                    >
                      {c.tier}
                    </span>
                  </td>
                  <td style={{ padding: "0.65rem 0.75rem", fontWeight: 600 }}>
                    <button
                      type="button"
                      onClick={() => {
                        const target = allFleetItems.find((v) => v.registration === c.vehicleReg);
                        if (target) setSelectedVehicleId(target.id);
                      }}
                      style={{
                        background: "none",
                        border: "none",
                        color: "#0284c7",
                        textDecoration: "underline",
                        cursor: "pointer",
                        fontWeight: 700,
                        padding: 0,
                      }}
                    >
                      {c.vehicleReg}
                    </button>
                  </td>
                  <td style={{ padding: "0.65rem 0.75rem" }}>
                    {c.from} ➔ {c.to}
                  </td>
                  <td style={{ padding: "0.65rem 0.75rem" }}>
                    <span
                      style={{
                        fontSize: "0.72rem",
                        fontWeight: 700,
                        padding: "0.2rem 0.5rem",
                        borderRadius: "999px",
                        background:
                          c.status === "DISRUPTED" || c.status === "AT RISK"
                            ? "#fee2e2"
                            : c.status === "DELAYED"
                            ? "#fef3c7"
                            : "#dcfce7",
                        color:
                          c.status === "DISRUPTED" || c.status === "AT RISK"
                            ? "#991b1b"
                            : c.status === "DELAYED"
                            ? "#92400e"
                            : "#166534",
                      }}
                    >
                      {c.status}
                    </span>
                  </td>
                  <td
                    style={{
                      padding: "0.65rem 0.75rem",
                      fontWeight: 700,
                      color: c.eta.includes("Blocked") ? "#dc2626" : "inherit",
                    }}
                  >
                    {c.eta}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
