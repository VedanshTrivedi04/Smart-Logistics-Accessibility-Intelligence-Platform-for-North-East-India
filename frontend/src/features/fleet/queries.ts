"use client";

import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, isApiError, unwrap } from "@/shared/api";
import type { CargoCategory, DeliveryStatus, PriorityTier, StopType, TripStatus, Vehicle, VehiclePosition, VehicleType } from "@/shared/api";
import { useSession } from "@/shared/auth";

export function useVehicles(enabled = true) {
  const { scope } = useSession();
  return useQuery({
    queryKey: [...scope, "vehicles"],
    enabled,
    queryFn: () => unwrap(() => api.GET("/api/v1/logistics/vehicles", { params: { query: {} } })),
  });
}

export function useDrivers(enabled = true) {
  const { scope } = useSession();
  return useQuery({
    queryKey: [...scope, "drivers"],
    enabled,
    queryFn: () => unwrap(() => api.GET("/api/v1/logistics/drivers", { params: { query: {} } })),
  });
}

export function useCommitments(status?: DeliveryStatus, enabled = true) {
  const { scope } = useSession();
  return useQuery({
    queryKey: [...scope, "commitments", status ?? "all"],
    enabled,
    queryFn: () => unwrap(() => api.GET("/api/v1/logistics/commitments", { params: { query: status ? { status } : {} } })),
  });
}

export function useTrips(status?: TripStatus, enabled = true) {
  const { scope } = useSession();
  return useQuery({
    queryKey: [...scope, "trips", status ?? "all"],
    enabled,
    queryFn: () => unwrap(() => api.GET("/api/v1/logistics/trips", { params: { query: status ? { status } : {} } })),
  });
}

export function useTrip(tripId: string | null) {
  const { scope } = useSession();
  return useQuery({
    queryKey: [...scope, "trip", tripId],
    enabled: tripId !== null,
    queryFn: () => unwrap(() => api.GET("/api/v1/logistics/trips/{trip_id}", { params: { path: { trip_id: tripId as string } } })),
  });
}

export function useTripImpacts(tripId: string | null, activeOnly = true) {
  const { scope } = useSession();
  return useQuery({
    queryKey: [...scope, "trip-impacts", tripId, activeOnly],
    enabled: tripId !== null,
    queryFn: () => unwrap(() => api.GET("/api/v1/trips/{trip_id}/impacts", { params: { path: { trip_id: tripId as string }, query: { active_only: activeOnly } } })),
  });
}

export interface VehiclePositionState {
  vehicle: Vehicle;
  /** undefined while loading; null when the platform has never received a fix. */
  position: VehiclePosition | null | undefined;
  error: unknown;
}

async function fetchPosition(vehicleId: string): Promise<VehiclePosition | null> {
  try {
    return await unwrap(() => api.GET("/api/v1/telemetry/vehicles/{vehicle_id}/position", { params: { path: { vehicle_id: vehicleId } } }));
  } catch (e) {
    // "Never reported" is a real, distinct state — not an error and not a stale position.
    if (isApiError(e) && e.kind === "not_found") return null;
    throw e;
  }
}

export function useVehiclePosition(vehicleId: string | null) {
  const { scope } = useSession();
  return useQuery({
    queryKey: [...scope, "position", vehicleId],
    enabled: vehicleId !== null,
    refetchInterval: 30_000,
    queryFn: () => fetchPosition(vehicleId as string),
  });
}

/** One request per vehicle, refreshed on an interval. Positions are observations, never extrapolated. */
export function useFleetPositions(vehicles: readonly Vehicle[] | undefined): VehiclePositionState[] {
  const { scope } = useSession();
  const results = useQueries({
    queries: (vehicles ?? []).map((v) => ({
      queryKey: [...scope, "position", v.id],
      refetchInterval: 30_000,
      queryFn: () => fetchPosition(v.id),
    })),
  });
  return (vehicles ?? []).map((vehicle, i) => ({ vehicle, position: results[i]?.data, error: results[i]?.error }));
}

export function useBreadcrumbs(vehicleId: string | null, hours: number) {
  const { scope } = useSession();
  return useQuery({
    queryKey: [...scope, "breadcrumbs", vehicleId, hours],
    enabled: vehicleId !== null,
    queryFn: () => {
      const end = new Date();
      const start = new Date(end.getTime() - hours * 3_600_000);
      return unwrap(() =>
        api.GET("/api/v1/telemetry/vehicles/{vehicle_id}/breadcrumbs", {
          params: { path: { vehicle_id: vehicleId as string }, query: { start_time: start.toISOString(), end_time: end.toISOString() } },
        }),
      );
    },
  });
}

function invalidateFleet(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ predicate: (q) => ["vehicles", "drivers", "commitments", "trips", "trip"].some((k) => q.queryKey.includes(k)) });
}

export interface VehicleInput {
  registration_number: string;
  vehicle_type: VehicleType;
  make_model: string;
  max_weight_kg: number;
  empty_weight_kg: number;
  height_m: number;
  width_m: number;
  length_m: number;
  axle_count: number;
  is_hazmat_capable: boolean;
  is_refrigerated: boolean;
}

export function useCreateVehicle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: VehicleInput) => unwrap(() => api.POST("/api/v1/logistics/vehicles", { body })),
    onSuccess: () => invalidateFleet(qc),
  });
}

export function useCreateDriver() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { full_name: string; phone_e164: string; license_number: string; license_classes: string[] }) => unwrap(() => api.POST("/api/v1/logistics/drivers", { body })),
    onSuccess: () => invalidateFleet(qc),
  });
}

export interface CommitmentInput {
  consignment_reference: string;
  cargo_category: CargoCategory;
  priority_tier: PriorityTier;
  consigned_weight_kg: number;
  consigned_quantity_units: number;
  origin_facility_id: string;
  destination_facility_id: string;
  required_before: string;
}

export function useCreateCommitment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CommitmentInput) => unwrap(() => api.POST("/api/v1/logistics/commitments", { body })),
    onSuccess: () => invalidateFleet(qc),
  });
}

export interface TripInput {
  vehicle_id: string;
  driver_id: string;
  trip_code: string;
  scheduled_departure: string;
  commitment_ids: string[];
  stops: Array<{ stop_type: StopType; facility_id: string | null; lat: number; lon: number; planned_arrival: string; planned_departure: string }>;
}

export function useDispatchTrip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: TripInput) => unwrap(() => api.POST("/api/v1/logistics/trips", { body })),
    onSuccess: () => invalidateFleet(qc),
  });
}

/** Trip status changes take effect on screen only after the server confirms the new status. */
export function useTripTransition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (i: { tripId: string; target: TripStatus }) =>
      unwrap(() => api.POST("/api/v1/logistics/trips/{trip_id}/transition", { params: { path: { trip_id: i.tripId } }, body: { target_status: i.target } })),
    onSuccess: () => invalidateFleet(qc),
  });
}
