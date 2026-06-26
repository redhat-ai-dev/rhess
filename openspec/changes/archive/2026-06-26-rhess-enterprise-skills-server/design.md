## Canonical Touchpoints

No canonical document updates. This is a greenfield project with no existing PRDs, ADRs, or long-lived specs affected.

## Context

The Agent Skills ecosystem (agentskills.io) defines an open standard for portable AI coding agent skills. The public skills.sh registry serves as a discovery hub, but enterprises need private, self-hosted instances that operate behind corporate firewalls with access control. RHESS fills this gap as a standalone server — not a Backstage plugin — that aligns with the RHDH ecosystem's TypeScript/React stack.

The server must support the `.well-known/agent-skills/` discovery protocol so that the `npx skills` CLI can discover and install skills from an enterprise instance.

### CLI Contract (researched from vercel-labs/skills source)

The `npx skills` CLI uses the v0.2.0 discovery protocol:
- Fetches `/.well-known/agent-skills/index.json` from the server
- Index schema: `{$schema, skills: [{name, type, description, url, digest}]}`
- Two artifact types: `skill-md` (single SKILL.md file) and `archive` (tar.gz/zip bundle)
- SHA256 digest verification on all artifacts
- **No authentication support** — the CLI cannot pass tokens or credentials

Skill identity follows the skills.sh model: `(source, slug)` composite key. Duplicate skill names across different sources are allowed and expected.

## Goals / Non-Goals

**Goals:**
- Single-process server serving both API and web UI
- Git-based skill ingestion following Agent Skills spec discovery paths
- Admin token authentication for write operations; all reads are unauthenticated
- OCI container image on UBI9 for OpenShift/Kubernetes deployment
- `.well-known/agent-skills/` discovery endpoint compatible with `npx skills` CLI

**Non-Goals:**
- Plugin architecture — monolithic server for simplicity
- Real-time sync or webhooks — manual trigger only
- Multi-process or worker-based architecture
- v0.1.0 legacy discovery protocol support

## Decisions

### 1. Fastify over Express

**Decision**: Use Fastify as the HTTP framework.
**Rationale**: Fastify provides schema-based validation, built-in OpenAPI support, and superior performance. It aligns with modern Node.js patterns and the RHDH ecosystem direction.
**Alternatives considered**: Express (more common but less structured), Hono (newer, less ecosystem support for server-rendered React).

### 2. Storage behind repository interface

**Decision**: Abstract storage behind `SkillRepository` and `SourceRepository` interfaces. SQLite for Developer Preview — confirmed by PM. Database file stored on a Kubernetes PVC. PostgreSQL migration planned post-DP.
**Rationale**: The repository abstraction allows swapping storage backends without touching business logic. Same pattern as Backstage's catalog. The single-replica SQLite constraint must be documented in DP release notes.

### 3. simple-git for repository cloning

**Decision**: Use `simple-git` for shallow-cloning skill source repositories.
**Rationale**: Well-maintained Node.js wrapper around git CLI. Shallow clone (`--depth 1`) keeps disk and network usage minimal. Supports both HTTPS and SSH authentication via the container's native git config.
**Alternatives considered**: isomorphic-git (pure JS but incomplete SSH support), raw child_process (lower-level, more error-prone).

### 4. Monorepo single-package structure

**Decision**: Single package with `src/server/` and `src/ui/` directories. Vite builds the React UI into static assets served by Fastify.
**Rationale**: Simplest deployment model — one container, one process. No inter-service communication. The UI is a thin read-only layer over the API.
**Alternatives considered**: Separate frontend/backend packages (adds build complexity without benefit at MVP scale).

### 5. Admin token for write operations; reads are unauthenticated

**Decision**: All GET endpoints and the web UI are unauthenticated. Only write operations (POST/DELETE on sources, POST sync) require an admin token, configured via `RHESS_ADMIN_TOKEN` environment variable. No reader tokens.
**Rationale**: The `npx skills` CLI has no auth support; unauthenticated reads eliminate the CLI compatibility gap entirely. Network-level security (firewall, VPN, OpenShift Route restrictions) is the access control boundary. This also provides the best developer experience — no tokens needed to browse or install. The admin token layer can be swapped for OIDC in a future release with no API contract changes.
**Alternatives considered**: Reader tokens (adds friction for CLI users; rejected by PM), dual-mode (unnecessary given full read openness).

### 6. Unauthenticated `.well-known/agent-skills/` discovery endpoint

**Decision**: Serve `/.well-known/agent-skills/index.json` without authentication. This naturally follows from the simplified auth model (all reads unauthenticated) — no special dual-mode handling needed.
**Rationale**: The `npx skills` CLI has no auth support (vercel-labs/skills#1176). Because all reads are unauthenticated, the CLI works against the standard REST API and the discovery endpoint alike. This matches and simplifies the approach the Backstage community is taking (backstage/backstage#34336).

### 7. Agent Skills spec discovery paths

**Decision**: When ingesting a repo, walk the standard discovery directories defined by the Agent Skills spec: `skills/`, `.claude/skills/`, `.cursor/skills/`, `.github/copilot/skills/`, and all other documented paths.
**Rationale**: Spec compliance is a hard requirement. Using the canonical discovery paths ensures skills authored for any supported agent are found.

### 8. Skill identity: (source, slug) composite key

**Decision**: Skills are uniquely identified by `(source, slug)`. Duplicate skill names across different sources are allowed. In the `.well-known/` index, duplicates coexist with unique `url` fields.
**Rationale**: Matches the skills.sh model where identity is `owner/repo + skill-name`. No prefixing or name mangling needed.

### 9. Fuse.js behind SearchProvider interface

**Decision**: Use Fuse.js for fuzzy search in MVP, abstracted behind a `SearchProvider` interface. Swap to PostgreSQL `pg_trgm` when moving to Postgres.
**Rationale**: The Jira ticket requires fuzzy search with ranked results. Fuse.js handles typo-tolerant matching well for small catalogs. The interface abstraction (`search(query: string): RankedResult[]`) enables clean migration.
**Alternatives considered**: SQLite FTS5 (no true fuzzy matching), raw substring (no ranking).

### 10. Best-effort ingestion with sync report

**Decision**: Sync indexes valid skills and reports failures per-skill. One broken SKILL.md does not block the rest of the repository.
**Rationale**: All-or-nothing would mean one malformed file prevents the entire repo from being useful. The sync response includes per-skill success/failure details for the admin.

### 11. Atomic swap on re-sync

**Decision**: Re-sync ingests into staging, then deletes old source skills and inserts new ones in a single transaction.
**Rationale**: The catalog is never in a partial state during re-sync. Logic is simple — full replace with transactional safety.

### 12. Git credentials via container-native config

**Decision**: Git authentication for private repos is handled by the container's native git config. SSH keys and `.gitconfig` are mounted via Kubernetes Secrets/volumes.
**Rationale**: Standard OpenShift pattern. No custom credential management code, no secrets in the database. Works with any git hosting.

### 13. Node.js 24 on ubi9/nodejs-24, multi-stage build

**Decision**: Use `ubi9/nodejs-24` base image with a multi-stage Docker build. Build stage compiles TypeScript and Vite assets; runtime stage copies production output only.
**Rationale**: Latest Node.js available on UBI9. Multi-stage keeps the image small.

### 14. Structured JSON error responses

**Decision**: All API errors return `{error: {code, message}}`. Machine-parseable `code` for programmatic consumers, human-readable `message` for debugging.
**Rationale**: The API is consumed by agents and CI/CD pipelines — structured errors are essential. Fastify's custom error handler makes this straightforward.

### 15. Source-level deletion only

**Decision**: `DELETE /api/v1/sources/:id` removes the source repository and all its associated skills from the catalog. The source is removed from the sync list — re-import does not happen on future syncs. To restore, the admin re-registers the source. Per-skill deletion is out of scope for DP.
**Rationale**: Source-level deletion is simpler than a per-skill blocklist and matches the mental model cleanly — a source is a unit of trust. If you don't want any skills from a repo, remove the repo. Per-skill suppression adds state complexity (blocklist) with low PM-confirmed value for DP.

### 16. v0.2.0 discovery only

**Decision**: Serve `.well-known/agent-skills/index.json` (v0.2.0 schema) only. No v0.1.0 legacy support.
**Rationale**: v0.2.0 is the current spec with digest verification and archive support. No need to maintain two index formats.

### 17. Both skill-md and archive artifact types

**Decision**: Skills with only a SKILL.md are served as `type: skill-md`. Skills with supporting files are bundled as `type: archive` (tar.gz) with SHA256 digest. Bundles are generated at sync time.
**Rationale**: Covers the full range of skills without limiting what source repos can contain.

### 18. PatternFly for web UI

**Decision**: Use PatternFly (Red Hat's design system) with React and Vite.
**Rationale**: Visual consistency with RHDH, OpenShift console, and the broader Red Hat product family. Ships table, toolbar, search, and form components that map directly to the UI requirements.

### 19. Client-side SKILL.md rendering

**Decision**: The API returns raw SKILL.md content and parsed frontmatter metadata. The React UI renders markdown client-side with `react-markdown`.
**Rationale**: Keeps the API simple (just serves content). The UI controls presentation. Frontmatter is parsed at ingestion time and stored as metadata.

### 20. Admin-provided source slug

**Decision**: When registering a source via `POST /api/v1/sources`, the admin provides a kebab-case slug (e.g., `team-a-skills`). Validated with the same rules as skill names (lowercase, hyphens, 1-64 chars).
**Rationale**: Human-readable in URLs (`/api/v1/skills/team-a-skills/react-best-practices`). The source slug is internal to the RHESS API and does not affect `.well-known/` or CLI compatibility.

### 21. Repository home

**Decision**: `github.com/redhat-ai-dev/rhess` — confirmed by PM. Apache-2.0 license.

### 22. Bundled example skills for first-run experience

**Decision**: The server ships with 3–5 example SKILL.md files embedded in the container image. These populate the catalog on first boot without requiring any Git source registration.
**Rationale**: An empty catalog on first deployment is a poor experience — operators see nothing to understand the product's value. Bundled examples make the server immediately demonstrable. Examples can be superseded by real sources at any time.

## Risks / Trade-offs

- **[Git binary dependency]** → The container image must include `git` in the UBI9 layer. Mitigated by using a UBI Node.js image which includes git, or adding it via `dnf install`.
- **[Shallow clone limitations]** → Shallow clones don't support git history. Acceptable since we only need the latest file tree. If versioning is added later, full clones would be needed.
- **[Token leakage]** → Admin token in environment variable could appear in logs or process listings. Mitigated by never logging token values and using Kubernetes Secrets for deployment.
- **[Disk usage from cloned repos]** → Each source sync clones to a temp directory and deletes after indexing. Repos are not kept on disk long-term.
- **[Fuse.js scaling]** → In-memory fuzzy search won't scale beyond thousands of skills or work with multi-replica. Mitigated by `SearchProvider` interface — swap to `pg_trgm` with PostgreSQL.
- **[Open read access]** → All read endpoints are unauthenticated; network-level controls (VPN, OpenShift Route) are the security boundary. Operators must understand this trade-off — RHESS is not appropriate for public internet exposure without network controls.
