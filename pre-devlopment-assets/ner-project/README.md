# NER logistics project implementation pack

## Status and purpose

This is a researched implementation blueprint, not a completed application or a certified emergency routing system. It analyses the full 1,943-line project-context document supplied by the user. Its description of the challenge is treated as the provided requirement baseline; the original government challenge publication was not independently verified.

Research reviewed: 12 September 2026. Public documentation was read, but no provider credentials, data-sharing agreements, live GPS devices, deployed services, or model training datasets were available. No external integration or predictive accuracy has been demonstrated.

## Decisions

Keep FastAPI, REST, Pydantic, Alembic, Next.js and PostgreSQL. Add PostGIS, SQLAlchemy, a background worker, object storage, and a bounded offline field-data queue. Use a modular monolith, not microservices. Start with one approved operating corridor and its alternate paths, not all NER roads. Treat this as decision support requiring local operational validation.

Assume a small team with backend, frontend and part-time GIS/domain/QA capacity. The 12-week schedule is a planning estimate for a pilot MVP, not a guarantee or full regional rollout. A solo implementation needs a smaller scope or a longer schedule.

## Reading order

1. projecteresearch.mnd: evidence, missing capabilities, prioritized innovation, research uncertainties.
2. systemdesign.md: requirements, permissions, schema, API contracts, workflows, safety semantics.
3. systemarchitecture.md: components, boundaries, deployment, security, observability, capacity assumptions.
4. tasks.md: dependency-ordered work, ownership, acceptance gates, release plan.
5. backend handover.md and frontendhandoever.md: separate engineering handovers.
6. agents.md, skill.md and superpowe.md: coding-agent rules, working methods and cross-functional review gates.

Requested spellings are preserved, including projecteresearch.mnd, superpowe.md, frontendhandoever.md and boundries.py. The .mnd file contains standard Markdown. Rename or add tool-specific entrypoints only when your coding environment requires them; these filenames do not automatically enable any proprietary agent system.

## Python deliverables

backend/boundries.py and frontend/boundries.py are development-time architecture checkers. backend/workflow.py and frontend/workflow.py run local engineering checks. They are not FastAPI endpoints, a running workflow engine, or browser code. Next.js still runs TypeScript/React. The frontend Python files are an explicit interpretation of the request for separate Python files on both sides.

The checkers implement a narrow import-policy check, not a security boundary. The backend checker parses Python AST; the frontend checker recognizes common static import syntax, conservatively blocks nonliteral dynamic imports, and requires manual review for unusual syntax. Pair it with an ESLint import-boundary configuration when building the application.

These scripts assume the future repository paths described in systemarchitecture.md. They fail on missing application/config/test inputs rather than reporting an empty project as passing. Run their built-in self-tests locally before adding them to CI:

~~~sh
python backend/boundries.py --self-test
python frontend/boundries.py --self-test
python backend/workflow.py --root . --dry-run
python frontend/workflow.py --root . --dry-run
~~~

Python, dependency installation and application execution were not available during preparation. File inventory and archive contents were checked; Python self-tests and proposed application tests have not been executed here. No application implementation, actual migrations, trained model, UI screens, production infrastructure, or live integration is included.

## Decisions required before pilot

The product owner must approve the pilot area, responsible road-status authority, GPS provider, map/boundary data provenance, supported local language, privacy/retention policy and official weather access. Use synthetic fixtures clearly labelled DEMO until these are settled. Do not present generated reports as actual emergency intelligence.
