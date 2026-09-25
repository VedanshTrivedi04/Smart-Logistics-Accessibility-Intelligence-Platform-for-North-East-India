"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface GeoFix {
  latitude: number;
  longitude: number;
  accuracy_m: number;
  altitude_m: number | null;
  at: string;
  timestampMs: number;
}

export type BoundedGeoState =
  | { status: "idle" }
  | { status: "locating"; bestAccuracyM?: number }
  | { status: "ok"; fix: GeoFix }
  | { status: "denied" | "unavailable" | "timeout"; message: string };

const MESSAGES = {
  denied: "Location permission was denied. Use verified milestone fallback below or enter coordinates manually.",
  unavailable: "This device could not determine its position. Use verified milestone fallback below or enter coordinates manually.",
  timeout: "Acquiring satellite fix timed out. Move to open sky or use milestone fallback.",
} as const;

export interface UseBoundedGeolocationOptions {
  active?: boolean;
  targetAccuracyM?: number;
  maxWatchMs?: number;
}

export function useBoundedGeolocation({
  active = true,
  targetAccuracyM = 15,
  maxWatchMs = 15_000,
}: UseBoundedGeolocationOptions = {}) {
  const [state, setState] = useState<BoundedGeoState>({ status: "idle" });
  const [isWatching, setIsWatching] = useState(false);
  const bestFixRef = useRef<GeoFix | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cleanup = useCallback(() => {
    if (watchIdRef.current !== null && typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setIsWatching(false);
  }, []);

  const startWatch = useCallback(() => {
    cleanup();
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState({ status: "unavailable", message: MESSAGES.unavailable });
      return;
    }

    setState({ status: "locating" });
    setIsWatching(true);

    // Timeout fallback after maxWatchMs: settle on best fix so far or timeout
    timerRef.current = setTimeout(() => {
      cleanup();
      if (bestFixRef.current) {
        setState({ status: "ok", fix: bestFixRef.current });
      } else {
        setState({ status: "timeout", message: MESSAGES.timeout });
      }
    }, maxWatchMs);

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const accuracy = Math.max(1, Math.min(5000, Math.round(pos.coords.accuracy)));
        const fix: GeoFix = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy_m: accuracy,
          altitude_m: pos.coords.altitude,
          at: new Date(pos.timestamp).toISOString(),
          timestampMs: pos.timestamp,
        };

        if (!bestFixRef.current || accuracy < bestFixRef.current.accuracy_m) {
          bestFixRef.current = fix;
        }

        // If target accuracy (e.g. <= 15m) is achieved, lock fix immediately and stop watching to save battery
        if (accuracy <= targetAccuracyM) {
          cleanup();
          setState({ status: "ok", fix });
        } else {
          setState({ status: "locating", bestAccuracyM: bestFixRef.current.accuracy_m });
        }
      },
      (err) => {
        cleanup();
        if (bestFixRef.current) {
          // If we had a partial fix before error, settle on it
          setState({ status: "ok", fix: bestFixRef.current });
          return;
        }
        const status =
          err.code === err.PERMISSION_DENIED
            ? "denied"
            : err.code === err.TIMEOUT
            ? "timeout"
            : "unavailable";
        setState({ status, message: MESSAGES[status] });
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
    );
  }, [cleanup, maxWatchMs, targetAccuracyM]);

  useEffect(() => {
    if (active) {
      startWatch();
    } else {
      cleanup();
    }
    return cleanup;
  }, [active, startWatch, cleanup]);

  return {
    state,
    isWatching,
    bestFix: bestFixRef.current,
    restartWatch: startWatch,
    stopWatch: cleanup,
  };
}
