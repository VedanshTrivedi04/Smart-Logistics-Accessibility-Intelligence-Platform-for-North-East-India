"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, unwrap, sessionEvents, SESSION_EXPIRED_EVENT, clearCsrfToken, isApiError, type ApiError } from "@/shared/api";
import type { Capability, Principal } from "@/shared/api/types";
import { clearCachedPrincipal, readCachedPrincipal, saveCachedPrincipal } from "@/shared/offline/identity-cache";
import { clearSnapshots } from "@/shared/offline/snapshots";
import { hasAny, surfaceForRole, type Surface } from "./roles";

export type SessionStatus = "loading" | "authenticated" | "unauthenticated" | "service_error";

interface SessionSnapshot {
  principal: Principal;
  /** True when /me could not be reached and the last confirmed identity is being used offline. */
  offlineCached: boolean;
}

export interface SessionValue {
  status: SessionStatus;
  principal: Principal | null;
  offlineCached: boolean;
  /** True once a request returned 401 while a session was believed active. */
  expired: boolean;
  error: ApiError | null;
  surface: Surface | null;
  can: (capability: Capability) => boolean;
  canAny: (capabilities: readonly Capability[] | undefined) => boolean;
  /** Cache-key prefix: identity + organization + scope. Changing any of them changes every key. */
  scope: readonly string[];
  refresh: () => void;
  applyPrincipal: (principal: Principal) => void;
  logout: (allSessions?: boolean) => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);
const SESSION_KEY = ["session", "me"] as const;

async function loadSession(): Promise<SessionSnapshot> {
  try {
    const principal = await unwrap(() => api.GET("/api/v1/me"));
    void saveCachedPrincipal(principal).catch(() => undefined);
    return { principal, offlineCached: false };
  } catch (error) {
    if (isApiError(error) && error.kind === "network") {
      const cached = await readCachedPrincipal();
      if (cached) return { principal: cached, offlineCached: true };
    }
    throw error;
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [expired, setExpired] = useState(false);

  const query = useQuery({
    queryKey: SESSION_KEY,
    queryFn: loadSession,
    retry: false,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    refetchInterval: (q) => (q.state.data?.offlineCached ? 15_000 : false),
  });

  const purgeProtectedCache = useCallback(() => {
    queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== "session" });
  }, [queryClient]);

  useEffect(() => {
    const onExpired = () => {
      setExpired(true);
      clearCsrfToken();
      purgeProtectedCache();
      queryClient.setQueryData(SESSION_KEY, undefined);
      void queryClient.invalidateQueries({ queryKey: SESSION_KEY });
    };
    sessionEvents.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => sessionEvents.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, [purgeProtectedCache, queryClient]);

  const principal = query.data?.principal ?? null;

  // A different identity, organization or scope must never see the previous one's cached data.
  const identityKey = principal ? `${principal.user_id}|${principal.org_id}|${(principal.jurisdiction_ids ?? []).join(",")}` : null;
  const lastIdentity = useRef<string | null>(null);
  useEffect(() => {
    if (lastIdentity.current !== null && lastIdentity.current !== identityKey) purgeProtectedCache();
    lastIdentity.current = identityKey;
    if (identityKey) setExpired(false);
  }, [identityKey, purgeProtectedCache]);

  const applyPrincipal = useCallback(
    (next: Principal) => {
      purgeProtectedCache();
      queryClient.setQueryData<SessionSnapshot>(SESSION_KEY, { principal: next, offlineCached: false });
      void saveCachedPrincipal(next).catch(() => undefined);
      setExpired(false);
    },
    [purgeProtectedCache, queryClient],
  );

  const logout = useCallback(
    async (allSessions = false) => {
      try {
        await unwrap(() => (allSessions ? api.POST("/api/v1/auth/session/logout-all") : api.POST("/api/v1/auth/session/logout")));
      } catch {
        /* Even if the server is unreachable, drop local identity so the next person cannot resume it. */
      }
      clearCsrfToken();
      await clearCachedPrincipal();
      // Saved server data (nearby reports, road status) must not outlive the sign-out on a shared device.
      await clearSnapshots();
      queryClient.clear();
      setExpired(false);
      window.location.assign("/login");
    },
    [queryClient],
  );

  const error = query.error && isApiError(query.error) ? query.error : null;
  let status: SessionStatus;
  if (principal) status = "authenticated";
  else if (query.isPending) status = "loading";
  else if (error && error.kind !== "unauthenticated") status = "service_error";
  else status = "unauthenticated";

  const capabilities = principal?.capabilities;
  const value = useMemo<SessionValue>(() => {
    const caps = capabilities ?? [];
    return {
      status,
      principal,
      offlineCached: query.data?.offlineCached ?? false,
      expired,
      error,
      surface: principal ? surfaceForRole(principal.role) : null,
      can: (c) => caps.includes(c),
      canAny: (list) => hasAny(caps, list),
      scope: principal ? [principal.user_id, principal.org_id, (principal.jurisdiction_ids ?? []).join(",")] : ["anonymous"],
      refresh: () => void query.refetch(),
      applyPrincipal,
      logout,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, principal, query.data?.offlineCached, expired, error, capabilities, applyPrincipal, logout]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside SessionProvider");
  return ctx;
}

/** Authenticated principal or throw; use only below the protected layout gate. */
export function usePrincipal(): Principal {
  const { principal } = useSession();
  if (!principal) throw new Error("usePrincipal called without an authenticated session");
  return principal;
}
