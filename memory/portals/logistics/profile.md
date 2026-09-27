# Logistics / Fleet Operations Profile

- **Route:** /logistics/profile
- **Source:** frontend/src/app/(protected)/logistics/profile/page.tsx
- **Roles / capabilities:** Accessible to all authenticated logistics roles (`FLEET_MANAGER`, `DELIVERY_COORDINATOR`, `TRANSPORT_OPERATOR`).
- **Status:** done
- **Last updated:** 2026-09-27

## Purpose
Operator identity dossier, role mandates, active security capabilities, and logistics operational scope.

## Key components / features
- `features/fleet/FleetProfileView.tsx` – Operator identity card, role mandate descriptions (Hema = Fleet Manager, Indraneil = Delivery Coordinator, Jayashree = Transport Operator), capability badges, and direct links to the Driver Cockpit and System Account.

## Data & API
- Session context via `useSession()`.

## Behaviour notes
Displays customized role mandate explanations and provides Transport Operators with quick 1-click access to their cockpit (`/logistics/operator`).

## Tests
- TypeScript type-check and layout tests.
