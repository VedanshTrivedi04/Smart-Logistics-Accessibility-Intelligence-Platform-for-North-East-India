"use client";

import { formatAge, formatDateTime } from "@/shared/lib/time";
import { useNow } from "@/shared/lib/useNow";
import { Banner } from "@/shared/ui";

/** Shown when a screen is using the copy saved on the device because the server could not be reached. */
export function StaleDataBanner({ asOf }: { asOf: Date }) {
  const now = useNow(30_000);
  return (
    <Banner tone="warn" title="Offline: showing saved data">
      <p className="small">
        These reports and road statuses were last updated {formatAge(asOf, now)} ({formatDateTime(asOf)}). Conditions may have changed since; they refresh when the connection returns.
      </p>
    </Banner>
  );
}
