"use client";

import { useEffect, useState } from "react";
import { clock } from "./time";

/**
 * Returns a reactive Date object refreshed at a steady interval (default 30 seconds).
 */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState<Date>(() => clock.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(clock.now());
    }, intervalMs);

    return () => clearInterval(timer);
  }, [intervalMs]);

  return now;
}
