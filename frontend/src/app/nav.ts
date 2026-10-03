import { AlertTriangle, Landmark, BarChart3, Bell, Camera, ClipboardCheck, ClipboardList, History, LayoutDashboard, LocateFixed, Map, Navigation, Network, Package, PackageCheck, Radar, Route, Send, ShieldAlert, Truck, User, Wrench } from "lucide-react";
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
    { href: "/logistics", label: "Home", icon: LayoutDashboard, exact: true },
    { href: "/logistics/deliveries", label: "Deliveries", icon: Package, requires: ["VIEW_FLEET"] },
    { href: "/logistics/trips", label: "Trips", icon: Route, requires: ["VIEW_FLEET"] },
    { href: "/logistics/assignments", label: "Assignments", icon: PackageCheck, requires: ["DISPATCH_ROUTE"] },
    { href: "/logistics/vehicles", label: "Vehicles", icon: Truck, requires: ["VIEW_FLEET"] },
    { href: "/logistics/drivers", label: "Drivers", icon: User, requires: ["VIEW_FLEET"] },
    { href: "/logistics/fleet", label: "Live Fleet", icon: LocateFixed, requires: ["VIEW_FLEET"] },
    { href: "/logistics/disruptions", label: "Disruptions", icon: AlertTriangle, requires: ["VIEW_IMPACT"] },
    { href: "/logistics/alerts", label: "Alerts", icon: Bell, requires: ["VIEW_FLEET"] },
    { href: "/logistics/activity", label: "Activity", icon: History, requires: ["VIEW_FLEET"] },
    { href: "/logistics/profile", label: "Profile", icon: User },
  ],
  inspector: [
    { href: "/inspector", label: "Dashboard", icon: LayoutDashboard, exact: true },
    { href: "/inspector/inspections", label: "My Inspections", icon: ClipboardCheck },
    { href: "/inspector/reports", label: "Field Reports", icon: ClipboardList, requires: ["VIEW_REPORT_SUMMARY"] },
    { href: "/inspector/road-assessment", label: "Road Assessment", icon: Wrench, requires: ["VIEW_ROAD_STATUS"] },
    { href: "/inspector/queue", label: "Sync Queue", icon: Send },
    { href: "/inspector/nearby", label: "Nearby Hazards", icon: Radar },
    { href: "/inspector/profile", label: "Inspector Scope", icon: User },
  ],
};
