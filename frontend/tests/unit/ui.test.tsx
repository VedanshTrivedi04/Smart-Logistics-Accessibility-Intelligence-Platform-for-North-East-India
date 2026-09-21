import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { RoutePlan } from "@/shared/api";
import { statusLabel } from "@/shared/ui";
import { StatusBadge } from "@/shared/ui/StatusBadge";
import { ErrorNotice } from "@/shared/ui/DataState";
import { CoverageBanner } from "@/shared/ui/evidence";
import { RoutePlanView } from "@/features/routing/RoutePlanView";
import { ApiError } from "@/shared/api";

/** Labelled synthetic fixture matching the RoutePlanResponse schema. Not real routing output. */
const noPath: RoutePlan = {
  id: "00000000-0000-4000-8000-000000000001",
  organization_id: "00000000-0000-4000-8000-000000000002",
  trip_id: null,
  graph_version: "SYNTHETIC-FIXTURE",
  status_version: 4,
  policy_version: "CONSERVATIVE_CRITICAL_V1",
  result_status: "NO_FEASIBLE_PATH",
  total_distance_meters: 0,
  total_duration_seconds: 0,
  requires_human_review: true,
  excluded_edge_reasons: { a: ["BLOCKED"], b: ["BLOCKED"], c: ["BRIDGE_WEIGHT"] },
  primary_geometry: null,
  edges: [],
  alternatives: [],
  evaluated_at: "2026-03-10T11:50:00Z",
  expires_at: "2026-03-10T12:20:00Z",
};

const wrap = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

describe("status is text plus icon, never color alone", () => {
  it("renders the label as text and hides the icon from assistive tech", () => {
    const { container } = render(<StatusBadge kind="access" value="BLOCKED" />);
    expect(screen.getByText("Blocked")).toBeInTheDocument();
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("gives every accessibility status a distinct label", () => {
    const labels = ["OPEN", "RESTRICTED", "BLOCKED", "PROVISIONAL_CAUTION", "UNKNOWN"].map((s) => statusLabel("access", s));
    expect(new Set(labels).size).toBe(5);
    expect(statusLabel("access", "UNKNOWN")).toMatch(/verification required/i);
    expect(statusLabel("access", "PROVISIONAL_CAUTION")).toMatch(/unverified/i);
  });

  it("does not present a missing value as a real status", () => {
    render(<StatusBadge kind="review" value={null} />);
    expect(screen.getByText("Not available")).toBeInTheDocument();
  });

  it("distinguishes stale GPS in words", () => {
    expect(statusLabel("gps", "STALE_WARNING")).toBe("GPS stale");
    expect(statusLabel("gps", "FEED_OFFLINE")).toBe("GPS feed offline");
  });
});

describe("unknown, no path and service error look different", () => {
  it("shows NO_FEASIBLE_PATH with escalation guidance and no invented contact number", () => {
    wrap(<RoutePlanView plan={noPath} />);
    expect(screen.getAllByText(/no feasible path/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/No escalation instructions are configured/i)).toBeInTheDocument();
    expect(screen.getByText(/no detour is suggested/i)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\+?\d{2,}[\s-]?\d{5,}/); // no phone-number-looking text
    expect(screen.queryByText(/safe route/i)).toBeNull();
  });

  it("explains hard exclusions and the snapshot in the route explanation", () => {
    wrap(<RoutePlanView plan={noPath} />);
    expect(screen.getByText(/2 segments excluded/)).toBeInTheDocument();
    expect(screen.getByText(/CONSERVATIVE_CRITICAL_V1/)).toBeInTheDocument();
    expect(screen.getByText(/road-status version 4/)).toBeInTheDocument();
    expect(screen.getByText(/not a machine-learning prediction/i)).toBeInTheDocument();
  });

  it("renders INSUFFICIENT_DATA as unknown rather than as no path", () => {
    wrap(<RoutePlanView plan={{ ...noPath, result_status: "INSUFFICIENT_DATA" }} />);
    expect(screen.getByText(/road condition unknown; verification required/i)).toBeInTheDocument();
    expect(screen.queryByText(/every admissible route is closed/i)).toBeNull();
  });

  it("shows a connection problem as such, not as empty data", () => {
    render(<ErrorNotice error={new ApiError({ kind: "network", status: 0, code: "NETWORK_UNREACHABLE", message: "x" })} subject="incidents" />);
    expect(screen.getByText(/connection problem, not an empty result/i)).toBeInTheDocument();
  });

  it("shows a stale version conflict with a way to reload", () => {
    render(<ErrorNotice error={new ApiError({ kind: "stale_version", status: 412, code: "STALE_VERSION", message: "x" })} onRetry={() => undefined} />);
    expect(screen.getByText(/someone else changed this first/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("states coverage instead of implying that missing means open", () => {
    render(<CoverageBanner known={[{ label: "road segments", count: 12 }, { label: "facilities", count: 3 }]} truncated />);
    expect(screen.getByText(/12 road segments, 3 facilities/)).toBeInTheDocument();
    expect(screen.getByText(/absence does not mean they are open/i)).toBeInTheDocument();
    expect(screen.getByText(/partial view/i)).toBeInTheDocument();
  });
});
