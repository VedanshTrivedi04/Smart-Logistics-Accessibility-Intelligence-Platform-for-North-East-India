"use client";
import { useCallback, useSyncExternalStore } from "react";

const KEY = "ner.emergency-mode";
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return window.sessionStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}
function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/**
 * Emergency mode changes presentation and prioritization only. It grants no
 * permission and changes no data; the server does not know about it.
 */
export function useEmergencyMode(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(subscribe, read, () => false);
  const set = useCallback((next: boolean) => {
    try {
      window.sessionStorage.setItem(KEY, next ? "1" : "0");
    } catch {
      /* per-tab convenience only */
    }
    listeners.forEach((l) => l());
  }, []);
  return [on, set];
}
