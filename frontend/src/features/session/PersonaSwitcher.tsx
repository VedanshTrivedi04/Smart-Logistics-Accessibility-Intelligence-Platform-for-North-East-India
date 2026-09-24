"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, setCsrfToken, unwrap, type Principal } from "@/shared/api";
import { SURFACE_HOME, surfaceForRole, useSession } from "@/shared/auth";
import { DEMO_PERSONAS } from "./LoginView";

interface SessionResponse {
  csrf_token?: string;
  principal?: Principal;
}

export function PersonaSwitcher() {
  const session = useSession();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const currentUserId = session.principal?.user_id;

  const handleChange = async (newUserId: string) => {
    if (!newUserId || newUserId === currentUserId) return;
    const persona = DEMO_PERSONAS.find((p) => p.userId === newUserId);
    if (!persona) return;

    setBusy(true);
    try {
      const res = await unwrap(() =>
        api.POST("/api/v1/auth/dev-session", {
          body: {
            user_id: persona.userId,
            org_id: persona.orgId,
            role: persona.role,
          },
        }),
      );
      const result = res as SessionResponse;
      if (result.csrf_token) setCsrfToken(result.csrf_token);
      if (result.principal) {
        session.applyPrincipal(result.principal);
        const surface = surfaceForRole(result.principal.role);
        router.push(surface ? SURFACE_HOME[surface] : "/account");
      }
    } catch (e) {
      console.error("Failed to switch persona:", e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="row" style={{ gap: "0.35rem", alignItems: "center" }}>
      <label htmlFor="persona-switcher-select" className="sr-only">Switch Demo Role</label>
      <select
        id="persona-switcher-select"
        value={currentUserId ?? ""}
        disabled={busy}
        onChange={(e) => void handleChange(e.target.value)}
        style={{
          fontSize: "0.8rem",
          fontWeight: 600,
          padding: "0.3rem 0.6rem",
          borderRadius: "0.375rem",
          backgroundColor: "var(--color-surface, #f8fafc)",
          border: "1px solid var(--color-border, #cbd5e1)",
          color: "var(--color-text, #1e293b)",
          cursor: busy ? "wait" : "pointer",
        }}
        title="Quick Role Switcher for Evaluators"
      >
        <optgroup label="🏛️ Government Portal">
          {DEMO_PERSONAS.filter((p) => p.portal === "government").map((p) => (
            <option key={p.userId} value={p.userId}>
              {p.icon} {p.name} ({p.badge})
            </option>
          ))}
        </optgroup>
        <optgroup label="🚜 Field Operations">
          {DEMO_PERSONAS.filter((p) => p.portal === "field").map((p) => (
            <option key={p.userId} value={p.userId}>
              {p.icon} {p.name} ({p.badge})
            </option>
          ))}
        </optgroup>
        <optgroup label="🚚 Logistics & Fleet">
          {DEMO_PERSONAS.filter((p) => p.portal === "logistics").map((p) => (
            <option key={p.userId} value={p.userId}>
              {p.icon} {p.name} ({p.badge})
            </option>
          ))}
        </optgroup>
      </select>
    </div>
  );
}
