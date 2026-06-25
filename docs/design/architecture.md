# Architecture & Design Intent

Full architectural decisions and rationale are in the Openspec design document:
[openspec/changes/rhess-enterprise-skills-server/design.md](../../openspec/changes/rhess-enterprise-skills-server/design.md)

## Key Invariants

- **Read endpoints are always unauthenticated.** The `npx skills` CLI has no auth support; network-level controls (VPN, OpenShift Route) are the security boundary. Do not add auth to GET endpoints.
- **Skill identity is `(source, slug)`.** Duplicate skill names across sources are intentionally allowed — never deduplicate or mangle names.
- **Catalog is never partially updated.** Re-sync uses an atomic swap: ingest to staging, then delete old + insert new in a single SQLite transaction.
- **Database migrations are out of scope until post-Developer Preview.** Pin to the v1 schema; do not introduce migration tooling.
- **Discovery endpoint (`/.well-known/`) must remain v0.2.0-only.** No v0.1.0 legacy support.

## Key Preconditions

- `RHESS_ADMIN_TOKEN` must be set and non-empty before the server starts; it exits on startup if missing.
- A writable SQLite file (or `:memory:` for testing) must be accessible at `DATABASE_PATH`.
- The container/host must have `git` installed and accessible on `PATH` for source ingestion.
- Sources are ingested via shallow clone (`--depth 1`); git history is not preserved and should not be relied upon.

## Boundary Rules

- `src/server/` is the API layer — it must not import from `src/ui/`.
- `src/ui/` is the React frontend — it must not import from `src/server/`. All data access goes through the REST API.
