## Why

Enterprise organizations need a way to curate, discover, and distribute AI agent skills internally — behind corporate firewalls — without relying on the public skills.sh registry. The open Agent Skills ecosystem (730K installs, 40+ supported agents) has proven the model; RHESS brings it in-house with RBAC, private Git repo support, and deployment on OpenShift/Kubernetes. This is the first step toward enterprise-grade AI agent skill management in the RHDH ecosystem.

## What Changes

- **New standalone server**: A Node.js/TypeScript Fastify server that hosts a REST API for skill catalog operations (list, detail, search, source management)
- **Web directory UI**: A React frontend served by the same process for browsing, searching, and viewing skill details with rendered SKILL.md content
- **Git-based skill ingestion**: Shallow-clones registered Git repositories, discovers SKILL.md files per the Agent Skills spec discovery paths, parses YAML frontmatter, and indexes into the catalog
- **Auth model**: Admin token gating write operations (source registration, sync, deletion); all read operations and web browsing are unauthenticated; designed for future SSO/OIDC extension
- **CLI compatibility**: API response shapes match the `npx skills` CLI contract so `npx skills add <enterprise-server-url>` works out of the box
- **OCI container image**: Built on UBI9 base, deployable via OpenShift/Kubernetes manifests or locally via Podman/Docker

## Non-goals

- SSO/OIDC/LDAP authentication (DP uses a single admin API token; readers are unauthenticated)
- Automatic periodic re-sync of skill sources (manual trigger only)
- Telemetry, install analytics, or leaderboard ranking
- Multi-tenancy with team/organization namespaces
- Skill authoring, editing, or publishing via the web UI
- Air-gapped deployment support
- Skill versioning or changelog tracking
- Helm charts or Operators (manual install only)

## Capabilities

### New Capabilities

- `skills-catalog-api`: REST API for skill listing, detail retrieval, and fuzzy search (GET endpoints)
- `skill-source-management`: Admin endpoints for registering, syncing, and removing Git-based skill sources
- `skill-ingestion`: Git repository cloning, SKILL.md discovery, frontmatter parsing, and catalog indexing
- `rbac-auth`: Admin token authentication gating write operations; read operations are unauthenticated
- `web-directory`: React-based browsable skill directory with search, detail views, and admin controls
- `container-deployment`: OCI container image on UBI9 with OpenShift/Kubernetes manifests

### Modified Capabilities

None — this is a new standalone project.

## Canonical Touchpoints

None — no existing PRDs, ADRs, or long-lived specs are affected. This is a greenfield project.

Change type: **product**

## Impact

- **New repository/project**: Standalone codebase (not a Backstage plugin) — Node.js/TypeScript with Fastify + React
- **APIs**: Six new REST endpoints under `/api/v1/` plus health/readiness probes
- **Dependencies**: Fastify, React, a Git client library (e.g., simple-git), YAML frontmatter parser, SQLite or similar for catalog storage
- **Infrastructure**: OCI container image, Kubernetes Deployment/Service/Route manifests
- **Ecosystem integration**: Must conform to the Agent Skills specification (agentskills.io) and be compatible with the `npx skills` CLI
