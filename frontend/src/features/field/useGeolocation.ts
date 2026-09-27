"use client";

import { useCallback, useEffect, useState } from "react";

export interface GeoFix {
  latitude: number;
  longitude: number;
  accuracy_m: number;
  altitude_m: number | null;
  at: string;
  isTemporaryOverride?: boolean;
  label?: string;
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

export const OVERRIDE_STORAGE_KEY = "ner_manual_location_override";

export interface LocationPreset {
  name: string;
  latitude: number;
  longitude: number;
  corridor: string;
}

export const NORTH_EAST_LOCATION_PRESETS: readonly LocationPreset[] = [
  {
    name: "Jorabat Highway Junction (NH-6 / NH-27)",
    latitude: 26.0850,
    longitude: 91.8650,
    corridor: "NH-6 / NH-27 Kamrup Gateway",
  },
  {
    name: "NH-6 km 42 (Umtrew Heavy Bridge)",
    latitude: 25.9650,
    longitude: 91.8820,
    corridor: "NH-6 Ri-Bhoi Lifeline",
  },
  {
    name: "Shillong Bypass (NH-6 / Umiam)",
    latitude: 25.6800,
    longitude: 91.9500,
    corridor: "NH-6 Meghalaya Sector",
  },
  {
    name: "Jagiroad Expressway (NH-27)",
    latitude: 26.1700,
    longitude: 92.1600,
    corridor: "NH-27 East-West Lifeline",
  },
  {
    name: "Teesta Valley / Sevoke (NH-10)",
    latitude: 26.8900,
    longitude: 88.4700,
    corridor: "NH-10 Sikkim Lifeline",
  },
  {
    name: "Kohima Saddle (NH-2)",
    latitude: 25.6740,
    longitude: 94.1100,
    corridor: "NH-2 Nagaland-Manipur Corridor",
  },
] as const;

function readStoredOverride(): GeoFix | null {
  if (typeof window === "undefined" || !window.sessionStorage) return null;
  try {
    const raw = sessionStorage.getItem(OVERRIDE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.latitude === "number" && typeof parsed?.longitude === "number") {
      return {
        latitude: parsed.latitude,
        longitude: parsed.longitude,
        accuracy_m: parsed.accuracy_m ?? 8,
        altitude_m: parsed.altitude_m ?? 550,
        at: parsed.at ?? new Date().toISOString(),
        isTemporaryOverride: true,
        label: parsed.label ?? "Temporary Custom Location",
      };
    }
  } catch {
    // ignore corrupted data
  }
  return null;
}

/**
 * One-shot position reads with temporary/manual location override support.
 * The app never watches position in the background: a browser cannot do that reliably,
 * and undisclosed tracking is not acceptable.
 * With `autoIfGranted` it reads once on load if permission is already given or an override is active.
 */
export function useGeolocation(autoIfGranted = false) {
  const [state, setState] = useState<GeoState>(() => {
    const override = readStoredOverride();
    return override ? { status: "ok", fix: override } : { status: "idle" };
  });

  const locate = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState({ status: "unavailable", message: MESSAGES.unavailable });
      return;
    }
    setState({ status: "locating" });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        try {
          sessionStorage.removeItem(OVERRIDE_STORAGE_KEY);
        } catch {
          // ignore
        }
        setState({
          status: "ok",
          fix: {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy_m: Math.max(1, Math.min(5000, Math.round(pos.coords.accuracy))),
            altitude_m: pos.coords.altitude,
            at: new Date(pos.timestamp).toISOString(),
            isTemporaryOverride: false,
          },
        });
      },
      (err) => {
        const status = err.code === err.PERMISSION_DENIED ? "denied" : err.code === err.TIMEOUT ? "timeout" : "unavailable";
        setState({ status, message: MESSAGES[status] });
      },
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 30_000 },
    );
  }, []);

  const setTemporaryLocation = useCallback((latitude: number, longitude: number, label?: string) => {
    const fix: GeoFix = {
      latitude,
      longitude,
      accuracy_m: 8,
      altitude_m: 600,
      at: new Date().toISOString(),
      isTemporaryOverride: true,
      label: label ?? `Custom Point (${latitude.toFixed(4)}°N, ${longitude.toFixed(4)}°E)`,
    };
    try {
      sessionStorage.setItem(OVERRIDE_STORAGE_KEY, JSON.stringify(fix));
    } catch {
      // ignore
    }
    setState({ status: "ok", fix });
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("ner:location-override-changed"));
    }
  }, []);

  const clearTemporaryLocation = useCallback(() => {
    try {
      sessionStorage.removeItem(OVERRIDE_STORAGE_KEY);
    } catch {
      // ignore
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("ner:location-override-changed"));
    }
    locate();
  }, [locate]);

  useEffect(() => {
    const syncOverride = () => {
      const override = readStoredOverride();
      if (override) {
        setState({ status: "ok", fix: override });
      }
    };
    if (typeof window !== "undefined") {
      window.addEventListener("ner:location-override-changed", syncOverride);
      return () => window.removeEventListener("ner:location-override-changed", syncOverride);
    }
  }, []);

  useEffect(() => {
    const override = readStoredOverride();
    if (override) {
      setState({ status: "ok", fix: override });
      return;
    }
    if (!autoIfGranted) return;
    if (navigator.permissions?.query) {
      void navigator.permissions.query({ name: "geolocation" }).then((p) => p.state === "granted" && locate()).catch(() => undefined);
    } else {
      locate();
    }
  }, [autoIfGranted, locate]);

  return {
    state,
    locate,
    setTemporaryLocation,
    clearTemporaryLocation,
    isOverridden: state.status === "ok" && Boolean(state.fix.isTemporaryOverride),
  };
}
