import { AlertTriangle, Landmark, BarChart3, Bell, Camera, ClipboardCheck, ClipboardList, History, LayoutDashboard, LocateFixed, Map, Navigation, Network, PackageCheck, Radar, Route, Send, ShieldAlert, Truck, User, Wrench } from "lucide-react";
import type { Surface } from "@/shared/auth";
import type { NavItem } from "@/shared/ui";

/** Navigation adapts to capabilities for convenience. It is never the authorization boundary. */
export const NAV: Record<Surface, NavItem[]> = {
  government: [
    { href: "/gov", label: "Overview", icon: LayoutDashboard, exact: true },
    { href: "/gov/regions", label: "States", icon: Landmark, requires: ["VIEW_REGION", "VIEW_IMPACT"] },
    { href: "/gov/map", label: "Regional map", icon: Map, requires: ["VIEW_ROAD_STATUS"] },
    { href: "/gov/incidents", label: "Incidents", icon: AlertTriangle },
    { href: "/gov/reports", label: "Field reports", icon: ClipboardCheck, requires: ["VIEW_REPORT_SUMMARY"] },
    { href: "/gov/impact", label: "Impact", icon: Network, requires: ["VIEW_IMPACT", "VIEW_FLEET", "VIEW_ROAD_STATUS"] },
    { href: "/gov/fleet", label: "Vehicles and deliveries", icon: Truck, requires: ["VIEW_FLEET"] },
    { href: "/gov/routes", label: "Route intelligence", icon: Route, requires: ["COMPUTE_ROUTE"] },
    { href: "/gov/alerts", label: "Alerts", icon: Bell },
    { href: "/gov/emergency", label: "Emergency operations", icon: ShieldAlert, requires: ["RESPOND_EMERGENCY"] },
    { href: "/gov/analytics", label: "Analytics and reports", icon: BarChart3, requires: ["VIEW_REPORT_SUMMARY", "VIEW_FLEET"] },
  ],
  field: [
    { href: "/field", label: "Home", icon: LayoutDashboard, exact: true },
    { href: "/field/report/new", label: "Report incident", icon: Camera, requires: ["SUBMIT_REPORT"] },
    { href: "/field/road-update", label: "Road update", icon: Wrench, requires: ["VIEW_ROAD_STATUS"] },
    { href: "/field/reports", label: "My reports", icon: ClipboardList, requires: ["VIEW_REPORT_SUMMARY"] },
    { href: "/field/queue", label: "Send queue", icon: Send },
    { href: "/field/nearby", label: "Nearby and alerts", icon: Radar },
    { href: "/field/profile", label: "Profile", icon: User },
  ],
  logistics: [
    { href: "/logistics", label: "Overview", icon: LayoutDashboard, exact: true },
    { href: "/logistics/operator", label: "Driver cockpit", icon: Navigation, requires: ["VIEW_FLEET"] },
    { href: "/logistics/fleet", label: "Live fleet map", icon: LocateFixed, requires: ["VIEW_FLEET"] },
    { href: "/logistics/trips", label: "Trips", icon: Truck, requires: ["VIEW_FLEET"] },
    { href: "/logistics/deliveries", label: "Deliveries", icon: PackageCheck, requires: ["VIEW_FLEET"] },
    { href: "/logistics/routes", label: "Route alternatives", icon: Route, requires: ["COMPUTE_ROUTE"] },
    { href: "/logistics/alerts", label: "Alerts", icon: Bell, requires: ["VIEW_FLEET"] },
    { href: "/logistics/history", label: "History and performance", icon: History, requires: ["VIEW_FLEET"] },
    { href: "/logistics/manage", label: "Fleet management", icon: Wrench, requires: ["VIEW_FLEET"] },
  ],
};
