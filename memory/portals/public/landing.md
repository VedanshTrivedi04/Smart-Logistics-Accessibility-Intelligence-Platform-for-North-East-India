# Public / Landing page (/)

- **Route:** /
- **Source:** frontend/src/app/page.tsx
- **Roles / capabilities:** Anyone (no login). Signed-in users are offered their surface home via `SURFACE_HOME`.
- **Status:** done
- **Last updated:** 2026-09-28

## Purpose
High-aesthetic, interactive spatial intelligence showcase for the NER logistics platform (PRAVAHA / PARVA), styled with 3D isometric topographic relief models, hardware tablet showcases, route solvers, and predictive hazard radars inspired by modern AI spatial apps.

## Key components / features
- **Modern Hero:** Stylized coral geometric logo mark, high-contrast display typography (*"Smarter Logistics. Connected North East."*), and dual action CTAs (*"Explore Portals →"*, *"Learn More →"*). The right column features the main 3D relief map (`/main map up.png`).
- **AI-Powered Route Intelligence Showcase:** Live delay reduction (18%) and route predictability (96%) sparkline cards; sleek hardware tablet mockup with interactive map canvas (`/ner-topo-tablet.jpg`), route ribbon, waypoint pins, and HUD metrics.
- **Predictive Threat Radar:** Interactive mode switch inside the tablet mockup with dynamic hazard popups (⚠️ *Flood Risk Detected* along Brahmaputra NH-715 and ⚠️ *Landslide Probability: 84%* along NH-6 Barapani) with direct action triggers.
- **Hydrology & Terrain Pillars:** Brahmaputra Flood Hydrology, Slope Saturation & Landslides, Dynamic Dijkstra Dispatch.
- **Four Operational Portals:** Direct access cards to Government Command (`/gov`), Logistics Fleet Command (`/logistics`), Field Operations PWA (`/field`), and Citizen Route Checker (`/public`).
- **8 North Eastern States Strip:** Coverage badges with live accessibility indices for Assam, Meghalaya, Arunachal Pradesh, Nagaland, Manipur, Mizoram, Tripura, and Sikkim.
- **Floating Quick Assistant Widget:** Floating circular button with speech bubble icon at bottom-right linking directly to the corridor checker.

## Data & API
- Client-side static rendering + `useSession` for session detection; zero backend schema or endpoint changes.

## Behaviour notes
- Optimized image rendering with `unoptimized` flag to support static serving without server-side native sharp dependency.
- Responsive layout collapsing navigation and tablet viewport smoothly for tablet and mobile screens.

## Tests
- Visual and interaction verification via browser subagent recording (`inspiration_home_verify`).

## Known issues / TODO
- (Resolved) Static images (`ner-3d-relief.jpg`, `ner-topo-tablet.jpg`) were redirecting to `/login` because they weren't explicitly allowed in `PUBLIC_FILES` inside `middleware.ts`. This was fixed.
