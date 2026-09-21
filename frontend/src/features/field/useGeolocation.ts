"use client";

import { useCallback, useEffect, useState } from "react";

export interface GeoFix {
  latitude: number;
  longitude: number;
  accuracy_m: number;
  altitude_m: number | null;
  at: string;
}

export type GeoState =
  | { status: "idle" }
  | { status: "locating" }
  | { status: "ok"; fix: GeoFix }
  | { status: "denied" | "unavailable" | "timeout"; message: string };

const MESSAGES = {
  denied: "Location permission was denied. You can still enter coordinates by hand or pick the spot on the map.",
  unavailable: "This device could not determine its position. Enter coordinates by hand or pick the spot on the map.",
  timeout: "Finding your position took too long. Try again, move to open sky, or enter coordinates by hand.",
} as const;

/**
 * One-shot position reads only. The app never watches position in the background:
 * a browser cannot do that reliably, and undisclosed tracking is not acceptable.
 * With `autoIfGranted` it reads once on load, but only if permission was already given.
 */
export function useGeolocation(autoIfGranted = false) {
  const [state, setState] = useState<GeoState>({ status: "idle" });

  const locate = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState({ status: "unavailable", message: MESSAGES.unavailable });
      return;
    }
    setState({ status: "locating" });
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        setState({
          status: "ok",
          fix: { latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy_m: Math.max(1, Math.min(5000, Math.round(pos.coords.accuracy))), altitude_m: pos.coords.altitude, at: new Date(pos.timestamp).toISOString() },
        }),
      (err) => {
        const status = err.code === err.PERMISSION_DENIED ? "denied" : err.code === err.TIMEOUT ? "timeout" : "unavailable";
        setState({ status, message: MESSAGES[status] });
      },
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 30_000 },
    );
  }, []);

  useEffect(() => {
    if (!autoIfGranted || !navigator.permissions?.query) return;
    void navigator.permissions.query({ name: "geolocation" }).then((p) => p.state === "granted" && locate()).catch(() => undefined);
  }, [autoIfGranted, locate]);

  return { state, locate };
}
