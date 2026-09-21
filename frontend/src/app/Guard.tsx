"use client";

import type { ReactNode } from "react";
import type { Capability } from "@/shared/api";
import { type Surface, useSession } from "@/shared/auth";
import { ForbiddenView } from "@/features/session";

/**
 * Page-level convenience guard. Renders the "not permitted" screen when the signed-in user's
 * surface or capabilities do not fit. The server still refuses the underlying data on its own.
 */
export function Guard({ surface, requires, children }: { surface?: Surface; requires?: readonly Capability[]; children: ReactNode }) {
  const session = useSession();
  if (session.status !== "authenticated") return null;
  if (surface && session.surface !== surface) return <ForbiddenView />;
  if (requires && !session.canAny(requires)) return <ForbiddenView />;
  return <>{children}</>;
}
