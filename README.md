# Red Hat Enterprise Skills Server (RHESS)

> **Developer Preview** — not yet ready for production use.

A self-hosted, OCI-containerized skills directory and server that lets enterprise teams curate, discover, and distribute [AI agent skills](https://agentskills.io) internally — behind corporate firewalls — without relying on the public [skills.sh](https://skills.sh) registry.

RHESS is fully compatible with the `npx skills` CLI and the [Agent Skills specification](https://agentskills.io), so skills authored for RHESS work across 40+ supported AI coding agents (Claude Code, Cursor, GitHub Copilot, Codex, Windsurf, and more) without modification.

## Overview

- **REST API** — paginated skill listing, detail retrieval, and fuzzy search (unauthenticated)
- **Web directory** — React + PatternFly UI for browsing, searching, and viewing skill details
- **Git-based ingestion** — register any Git repository as a skill source; RHESS automatically clones, discovers, and indexes all `SKILL.md` files
- **Admin token auth** — write operations (source registration, sync, deletion) require a single admin token; all reads are open
- **Agent Skills spec compliant** — serves `/.well-known/agent-skills/index.json` for `npx skills` CLI discovery (v0.2.0)
- **OCI container** — runs on OpenShift, Kubernetes, or locally via Podman/Docker

## Development Setup

```bash
npm install   # install dependencies
npm run dev   # start API server + UI in watch mode
npm test      # run tests
npm run lint  # lint
```

## Quickstart (local)

```bash
podman run \
  -e RHESS_ADMIN_TOKEN=your-secret-token \
  -e DATABASE_PATH=/data/rhess.db \
  -p 3000:3000 \
  ghcr.io/redhat-ai-dev/rhess:latest
```

Then open [http://localhost:3000](http://localhost:3000) to browse the skills directory.

## Quickstart (Kubernetes / OpenShift)

```bash
kubectl apply -k deploy/
```

See [docs/developer-preview.md](docs/developer-preview.md) for known limitations and single-replica constraints.

## Configuration

| Environment Variable | Required | Description |
|---|---|---|
| `RHESS_ADMIN_TOKEN` | Yes | Bearer token for write operations. Server exits on startup if missing or empty. |
| `DATABASE_PATH` | No | Path to SQLite database file (default: `./rhess.db`). Must be on a writable PVC in Kubernetes. |
| `PORT` | No | HTTP port (default: `3000`). |

## Architecture

Single-process Node.js/TypeScript server using Fastify, serving both the REST API and the React/PatternFly web UI. SQLite via `better-sqlite3` for the Developer Preview (PostgreSQL planned post-DP). Skills are ingested from registered Git repositories using `simple-git` with shallow clones.

See [openspec/changes/rhess-enterprise-skills-server/design.md](openspec/changes/rhess-enterprise-skills-server/design.md) for full architectural decisions.

## Tech Stack

- **Backend**: Node.js, TypeScript, Fastify, SQLite (`better-sqlite3`), `simple-git`, Fuse.js
- **Frontend**: React, PatternFly, Vite, `react-markdown`
- **Container**: UBI9/nodejs-24, OpenShift Route / Kubernetes manifests

## Contributing

This project is in Developer Preview. Contributions are welcome via pull requests against `main`.

```bash
# Fork and clone
git clone https://github.com/YOUR_USERNAME/rhess.git
cd rhess
git remote add upstream https://github.com/redhat-ai-dev/rhess.git

# Install dependencies
npm install

# Start dev server
npm run dev
```

## License

Apache License 2.0 — see [LICENSE](LICENSE).
