"use client";

import { useMemo, useState } from "react";
import { useSession } from "./session";

export interface DistrictCircle {
  id: string;
  name: string;
  headquarters: string;
  roadKm: number;
}

export interface ScopeFilterResult {
  isStateAuthority: boolean;
  isDistrictOfficer: boolean;
  assignedState: string; // e.g. "Assam"
  assignedDistrict: string; // e.g. "Kamrup Metropolitan"
  activeState: string; // "Assam" or "ALL"
  activeDistrict: string; // "Kamrup Metropolitan" or "ALL"
  activeCircle: string; // "all" or specific circle
  setActiveState: (state: string) => void;
  setActiveDistrict: (district: string) => void;
  setActiveCircle: (circle: string) => void;
  stateBBox: [number, number, number, number] | null;
  districtBBox: [number, number, number, number] | null;
  activeBBox: [number, number, number, number] | null;
  districtCircles: DistrictCircle[];
  officerTitle: string;
  officerRole: string;
  officerBadge: string;
  isWithinAssignedScope: (lon?: number | null, lat?: number | null) => boolean;
}

const DISTRICT_STATE_MAP: Record<string, string> = {
  "Kamrup Metropolitan": "Assam",
  "East Khasi Hills": "Meghalaya",
  "Imphal West": "Manipur",
  "Papum Pare": "Arunachal Pradesh",
  "Kohima": "Nagaland",
  "Aizawl": "Mizoram",
  "West Tripura": "Tripura",
  "East Sikkim": "Sikkim",
};

const DISTRICT_BBOXES: Record<string, [number, number, number, number]> = {
  "Kamrup Metropolitan": [91.50, 25.95, 91.98, 26.35],
  "East Khasi Hills": [91.60, 25.10, 92.15, 25.75],
  "Imphal West": [93.80, 24.65, 94.05, 25.00],
  "Papum Pare": [93.20, 26.90, 94.00, 27.40],
  "Kohima": [93.90, 25.40, 94.35, 25.90],
  "Aizawl": [92.55, 23.50, 93.00, 24.00],
  "West Tripura": [91.15, 23.65, 91.55, 24.05],
  "East Sikkim": [88.40, 27.15, 88.85, 27.50],
};

const KAMRUP_METRO_CIRCLES: DistrictCircle[] = [
  { id: "all", name: "All Circles", headquarters: "District HQ Guwahati", roadKm: 412 },
  { id: "guwahati_urban", name: "Guwahati Urban Circle", headquarters: "Panbazar / Paltan Bazar", roadKm: 86 },
  { id: "dispur_capital", name: "Dispur Capital Circle", headquarters: "Secretariat / Khanapara", roadKm: 78 },
  { id: "azara_airport", name: "Azara Airport & West Circle", headquarters: "Azara / Borjhar", roadKm: 94 },
  { id: "sonapur_frontier", name: "Sonapur Inter-State Corridor", headquarters: "Sonapur / Jorabat Gate", roadKm: 68 },
  { id: "north_guwahati", name: "North Guwahati Saraighat Circle", headquarters: "Amingaon / IIT Ghy", roadKm: 52 },
  { id: "chandrapur", name: "Chandrapur Riverine Circle", headquarters: "Chandrapur Ghat", roadKm: 34 },
];

export function useScopeFilter(): ScopeFilterResult {
  const { principal } = useSession();

  // Detect if current session is District Officer (e.g. Chitralekha Devi)
  const isDistOfficer = useMemo(() => {
    if (!principal) return false;
    const role = principal.role?.toUpperCase();
    const name = principal.display_name?.toLowerCase() ?? "";
    const email = principal.email?.toLowerCase() ?? "";
    const org = principal.org_name?.toLowerCase() ?? "";

    return (
      role === "DISTRICT_VERIFIER" ||
      name.includes("chitra") ||
      email.includes("kamrup") ||
      email.includes("verifier") ||
      org.includes("district") ||
      org.includes("kamrup")
    );
  }, [principal]);

  // Detect if current session is State Authority (e.g. Bhaskar Singh)
  const isStateAuth = useMemo(() => {
    if (!principal || isDistOfficer) return false;
    const role = principal.role?.toUpperCase();
    const name = principal.display_name?.toLowerCase() ?? "";
    const email = principal.email?.toLowerCase() ?? "";
    const org = principal.org_name?.toLowerCase() ?? "";

    return (
      role === "STATE_AUTHORITY" ||
      name.includes("bhaskar") ||
      email.includes("assam-gov") ||
      org.includes("assam state") ||
      org.includes("state authority")
    );
  }, [principal, isDistOfficer]);

  // Determine assigned district
  const assignedDistrict = useMemo(() => {
    if (!principal) return "Kamrup Metropolitan";
    const email = principal.email?.toLowerCase() ?? "";
    const org = principal.org_name?.toLowerCase() ?? "";
    const name = principal.display_name?.toLowerCase() ?? "";

    if (email.includes("kamrup") || org.includes("kamrup") || name.includes("chitra")) return "Kamrup Metropolitan";
    if (email.includes("khasi") || org.includes("khasi") || email.includes("shillong")) return "East Khasi Hills";
    if (email.includes("imphal") || org.includes("imphal")) return "Imphal West";
    if (email.includes("papum") || org.includes("papum") || email.includes("itanagar")) return "Papum Pare";
    if (email.includes("kohima") || org.includes("kohima")) return "Kohima";
    if (email.includes("aizawl") || org.includes("aizawl")) return "Aizawl";
    if (email.includes("tripura") || org.includes("agartala")) return "West Tripura";
    if (email.includes("gangtok") || org.includes("sikkim")) return "East Sikkim";
    return "Kamrup Metropolitan";
  }, [principal]);

  // Determine assigned state
  const assignedState = useMemo(() => {
    if (isDistOfficer) {
      return DISTRICT_STATE_MAP[assignedDistrict] ?? "Assam";
    }
    if (!principal) return "Assam";
    const email = principal.email?.toLowerCase() ?? "";
    const org = principal.org_name?.toLowerCase() ?? "";

    if (email.includes("meghalaya") || org.includes("meghalaya")) return "Meghalaya";
    if (email.includes("manipur") || org.includes("manipur")) return "Manipur";
    if (email.includes("arunachal") || org.includes("arunachal")) return "Arunachal Pradesh";
    if (email.includes("nagaland") || org.includes("nagaland")) return "Nagaland";
    if (email.includes("mizoram") || org.includes("mizoram")) return "Mizoram";
    if (email.includes("tripura") || org.includes("tripura")) return "Tripura";
    if (email.includes("sikkim") || org.includes("sikkim")) return "Sikkim";
    return "Assam";
  }, [principal, isDistOfficer, assignedDistrict]);

  // Active state filter: defaults to assigned state if State Authority or District Officer, else "ALL"
  const [activeState, setActiveState] = useState<string>(
    isDistOfficer || isStateAuth ? assignedState : "ALL"
  );

  // Active district filter
  const [activeDistrict, setActiveDistrict] = useState<string>(
    isDistOfficer ? assignedDistrict : "ALL"
  );

  // Active circle filter
  const [activeCircle, setActiveCircle] = useState<string>("all");

  // State bounding box for map zoom
  const stateBBox = useMemo<[number, number, number, number] | null>(() => {
    const s = isDistOfficer || isStateAuth ? assignedState : activeState;
    if (s === "Assam") return [89.7, 24.1, 96.0, 28.2];
    if (s === "Meghalaya") return [89.8, 25.0, 92.8, 26.1];
    if (s === "Manipur") return [93.0, 23.8, 94.8, 25.7];
    if (s === "Arunachal Pradesh") return [91.6, 26.6, 97.4, 29.5];
    if (s === "Nagaland") return [93.3, 25.2, 95.3, 27.0];
    if (s === "Mizoram") return [92.2, 21.9, 93.5, 24.5];
    if (s === "Tripura") return [91.1, 22.9, 92.4, 24.6];
    if (s === "Sikkim") return [88.0, 27.0, 88.95, 28.15];
    return null;
  }, [isDistOfficer, isStateAuth, assignedState, activeState]);

  // District bounding box
  const districtBBox = useMemo<[number, number, number, number] | null>(() => {
    if (!isDistOfficer) return null;
    return DISTRICT_BBOXES[assignedDistrict] ?? [91.50, 25.95, 91.98, 26.35];
  }, [isDistOfficer, assignedDistrict]);

  // Active bounding box for map auto-zoom: District bbox takes precedence for District Officer
  const activeBBox = useMemo<[number, number, number, number] | null>(() => {
    if (isDistOfficer) return districtBBox;
    if (isStateAuth) return stateBBox;
    return null;
  }, [isDistOfficer, districtBBox, isStateAuth, stateBBox]);

  // District circles
  const districtCircles = useMemo<DistrictCircle[]>(() => {
    if (assignedDistrict === "Kamrup Metropolitan") {
      return KAMRUP_METRO_CIRCLES;
    }
    return [
      { id: "all", name: "All Circles / Blocks", headquarters: "District HQ", roadKm: 320 },
      { id: "urban", name: "Headquarters Urban Circle", headquarters: "City Center", roadKm: 120 },
      { id: "north", name: "Northern Sub-division", headquarters: "North Outpost", roadKm: 100 },
      { id: "south", name: "Southern Frontier Sector", headquarters: "South Outpost", roadKm: 100 },
    ];
  }, [assignedDistrict]);

  // Scope check helper
  const isWithinAssignedScope = useMemo(() => {
    return (lon?: number | null, lat?: number | null): boolean => {
      if (lon == null || lat == null) return true;
      if (isDistOfficer && districtBBox) {
        return (
          lon >= districtBBox[0] &&
          lon <= districtBBox[2] &&
          lat >= districtBBox[1] &&
          lat <= districtBBox[3]
        );
      }
      if (isStateAuth && stateBBox) {
        return (
          lon >= stateBBox[0] &&
          lon <= stateBBox[2] &&
          lat >= stateBBox[1] &&
          lat <= stateBBox[3]
        );
      }
      return true;
    };
  }, [isDistOfficer, districtBBox, isStateAuth, stateBBox]);

  return {
    isStateAuthority: isStateAuth,
    isDistrictOfficer: isDistOfficer,
    assignedState,
    assignedDistrict,
    activeState: isDistOfficer || isStateAuth ? assignedState : activeState,
    activeDistrict: isDistOfficer ? assignedDistrict : activeDistrict,
    activeCircle,
    setActiveState,
    setActiveDistrict,
    setActiveCircle,
    stateBBox,
    districtBBox,
    activeBBox,
    districtCircles,
    officerTitle: isDistOfficer
      ? `District Incident Verifier · ${assignedDistrict} (${assignedState})`
      : isStateAuth
      ? `State Authority · ${assignedState}`
      : "MDoNER Regional Commander",
    officerRole: isDistOfficer
      ? "DISTRICT_VERIFIER"
      : isStateAuth
      ? "STATE_AUTHORITY"
      : "REGIONAL_AUTHORITY",
    officerBadge: isDistOfficer ? "District" : isStateAuth ? "State" : "Regional",
    isWithinAssignedScope,
  };
}
