"use client";

import { useEffect, useState } from "react";

export interface Preferences {
  locale: string;
  lowBandwidth: boolean;
}

const STORAGE_KEY = "ner_preferences_v1";

const DEFAULT_PREFERENCES: Preferences = {
  locale: "en",
  lowBandwidth: false,
};

function readStoredPreferences(): Preferences {
  if (typeof window === "undefined") return DEFAULT_PREFERENCES;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<Preferences>;
    return {
      locale: typeof parsed.locale === "string" ? parsed.locale : DEFAULT_PREFERENCES.locale,
      lowBandwidth: typeof parsed.lowBandwidth === "boolean" ? parsed.lowBandwidth : DEFAULT_PREFERENCES.lowBandwidth,
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

/**
 * Hook to read and update user display preferences, synchronizing across components via window events.
 */
export function usePreferences(): [Preferences, (patch: Partial<Preferences>) => void] {
  const [preferences, setPreferencesState] = useState<Preferences>(() => readStoredPreferences());

  useEffect(() => {
    const handleSync = () => {
      setPreferencesState(readStoredPreferences());
    };

    window.addEventListener("storage", handleSync);
    window.addEventListener("ner:preferences", handleSync);
    return () => {
      window.removeEventListener("storage", handleSync);
      window.removeEventListener("ner:preferences", handleSync);
    };
  }, []);

  const updatePreferences = (patch: Partial<Preferences>) => {
    setPreferencesState((prev) => {
      const next: Preferences = { ...prev, ...patch };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        window.dispatchEvent(new Event("ner:preferences"));
      } catch {
        // Ignore localStorage quota or private-browsing errors
      }
      return next;
    });
  };

  return [preferences, updatePreferences];
}

/**
 * Synchronizes preference attributes (e.g. data-low-bandwidth, lang) on document root.
 */
export function usePreferencesEffect(): void {
  const [prefs] = usePreferences();

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.lang = prefs.locale || "en";
    if (prefs.lowBandwidth) {
      document.documentElement.setAttribute("data-low-bandwidth", "true");
    } else {
      document.documentElement.removeAttribute("data-low-bandwidth");
    }
  }, [prefs]);
}
