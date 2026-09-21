"use client";

import { useQueries } from "@tanstack/react-query";
import { api, unwrap } from "@/shared/api";
import type { Commitment, Facility, FacilityImpact, Trip, TripImpact } from "@/shared/api";
import { useSession } from "@/shared/auth";
import { useCommitments, useTrips } from "@/features/fleet";
import { useFacilities } from "@/features/network";

const MAX_FACILITIES = 80;
const ACTIVE_TRIP_STATUSES = ["PLANNED", "DISPATCHED", "IN_TRANSIT", "HELD_FOR_INSPECTION", "DIVERTED"];

export interface ImpactData {
  facilities: Facility[];
  facilityImpacts: Array<{ impact: FacilityImpact; facility: Facility }>;
  tripImpacts: Array<{ impact: TripImpact; trip: Trip; commitments: Commitment[] }>;
  loading: boolean;
  errors: unknown[];
  /** True when there are more facilities than were queried, so the board is a partial view. */
  facilitiesTruncated: boolean;
  fleetVisible: boolean;
}

/**
 * Assemble real impact records: one request per facility and per active trip.
 * The backend has no aggregate endpoint yet, so this is bounded and says so when truncated.
 */
export function useImpactData(): ImpactData {
  const { scope, can } = useSession();
  const fleetVisible = can("VIEW_FLEET");
  const facilitiesQ = useFacilities();
  const tripsQ = useTrips(undefined, fleetVisible);
  const commitmentsQ = useCommitments(undefined, fleetVisible);

  const facilities = (facilitiesQ.data ?? []).slice().sort((a, b) => Number(b.is_critical) - Number(a.is_critical)).slice(0, MAX_FACILITIES);
  const activeTrips = (tripsQ.data ?? []).filter((t) => ACTIVE_TRIP_STATUSES.includes(t.status));

  const facilityResults = useQueries({
    queries: facilities.map((f) => ({
      queryKey: [...scope, "facility-impacts", f.id],
      queryFn: () => unwrap(() => api.GET("/api/v1/facilities/{facility_id}/impacts", { params: { path: { facility_id: f.id } } })),
    })),
  });
  const tripResults = useQueries({
    queries: activeTrips.map((t) => ({
      queryKey: [...scope, "trip-impacts", t.id, true],
      queryFn: () => unwrap(() => api.GET("/api/v1/trips/{trip_id}/impacts", { params: { path: { trip_id: t.id }, query: { active_only: true } } })),
    })),
  });

  const facilityImpacts = facilityResults.flatMap((r, i) => {
    const facility = facilities[i];
    return facility ? (r.data ?? []).map((impact) => ({ impact, facility })) : [];
  });
  const tripImpacts = tripResults.flatMap((r, i) => {
    const trip = activeTrips[i];
    if (!trip) return [];
    const commitments = (commitmentsQ.data ?? []).filter((c) => trip.commitment_ids.includes(c.id));
    return (r.data ?? []).filter((x) => x.is_active).map((impact) => ({ impact, trip, commitments }));
  });

  const errors = [facilitiesQ.error, tripsQ.error, commitmentsQ.error, ...facilityResults.map((r) => r.error), ...tripResults.map((r) => r.error)].filter(Boolean);
  const loading = facilitiesQ.isPending || (fleetVisible && (tripsQ.isPending || commitmentsQ.isPending)) || facilityResults.some((r) => r.isPending) || tripResults.some((r) => r.isPending);

  return { facilities, facilityImpacts, tripImpacts, loading, errors, facilitiesTruncated: (facilitiesQ.data?.length ?? 0) > MAX_FACILITIES, fleetVisible };
}
