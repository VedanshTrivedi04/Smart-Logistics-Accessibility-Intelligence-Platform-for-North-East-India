"""
app/modules/public — The anonymous public-citizen surface.

Every route registered from here is reachable without a session. It exists because
the road network graph, hazard zones and route-evaluation engine are shared regional
data (organization_id on a route plan is attribution, not a data-scoping boundary —
see app/modules/routing/application/evaluate_route.py), so the same real data and
real routing citizens need for road safety can be served without requiring the
government/logistics/field login that the rest of the API requires.

See app/core/rate_limit.py for how abuse is bounded without a session to hold
accountable, and app/modules/public/application/list_public_incidents.py for how
incidents are redacted before they reach this surface.
"""
