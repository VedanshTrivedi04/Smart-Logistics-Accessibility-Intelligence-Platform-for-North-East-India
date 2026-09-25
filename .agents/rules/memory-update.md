---
trigger: always_on
description: Keep the memory/ folder (portal-wise, page-wise) and memory.md in sync with every code change.
---

# Memory Update Rules

Memory is how the next session (human or agent) learns what exists and why. Update it **in the same task** as the code change, before you report completion. Never defer it.

## Layout

```
memory.md                      # global project log (overview, decisions, state, interaction history)
memory/
  README.md                    # index: every portal + page file, one line each
  portals/
    public/<page>.md           # /public, /login, /offline, /auth/callback
    field/<page>.md            # frontend/src/app/(protected)/field/**
    gov/<page>.md              # frontend/src/app/(protected)/gov/**
    logistics/<page>.md        # frontend/src/app/(protected)/logistics/**
    shared/<topic>.md          # cross-portal: account, status, forbidden, nav, auth, offline-sync, api, map, backend modules
```

- **One file per page** (`page.tsx` route). Filename = route path after the portal, dashes for slashes, `[id]` -> `id`. Examples: `gov/incidents.md`, `gov/incidents-id.md`, `gov/fleet-trips-id.md`, `logistics/operator.md`. Portal root page = `home.md`.
- Backend modules (`backend/app/modules/<name>`) go in `shared/backend-<name>.md`. Features used by several pages (`frontend/src/features/*`, `shared/*`) go in `shared/<feature>.md`; the page files link to them.

## When to update

Update memory whenever you do ANY of:
- Add, remove, rename, or move a page/route -> create/delete/rename its page file and fix `memory/README.md`.
- Change a page's UI, data fetching, API endpoints used, role/capability gating, permissions, or offline behaviour -> edit that page's file.
- Change a shared feature, component, API client, map, nav, or auth -> edit the `shared/` file AND every page file that consumes it.
- Change a backend endpoint, schema, migration, or role capability -> edit `shared/backend-<module>.md` AND the pages calling it.
- Fix a bug, hit a known issue, or leave work unfinished -> record it in the affected page file(s).
- Do NOT update for pure formatting, comment-only, or lockfile changes.

## Page file template

Keep it terse and factual. Do not paste code; reference paths.

```markdown
# <Portal> / <Page title>

- **Route:** /gov/incidents
- **Source:** frontend/src/app/(protected)/gov/incidents/page.tsx
- **Roles / capabilities:** who may access (from role_capabilities)
- **Status:** done | in-progress | stub
- **Last updated:** YYYY-MM-DD

## Purpose
One or two sentences.

## Key components / features
- `features/incidents/IncidentDetail.tsx` – what it does

## Data & API
- GET /api/... (query key, refresh behaviour)

## Behaviour notes
Offline handling, map layers, empty/error states, non-obvious decisions and why.

## Tests
Unit / e2e files covering it.

## Known issues / TODO
- ...
```

## Procedure (every task)

1. Before editing: read `memory/README.md` and the page/shared files for the area you will touch.
2. After editing: update the affected page files (created if missing) and set **Last updated** to today's date.
3. Update `memory/README.md` index if any file was added, removed, or renamed. Format: `- [gov/incidents](portals/gov/incidents.md) – one-line summary`.
4. Append an entry to the `## Interaction History` in `memory.md`: timestamp, user request, work done, files changed (including memory files touched). Update its **Current State**, **Known Issues**, **Pending Work** sections if they changed.
5. In the final reply, list which memory files were updated.

## Constraints

- Memory must match the code. If you find a memory file that contradicts the code, fix the memory file.
- Never store secrets, tokens, cookies, `.env` values, or personal data in memory files.
- Do not create duplicate files for the same page; edit the existing one.
- Keep each page file under ~80 lines; move long history to `memory.md`.
