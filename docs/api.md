# RHESS API Reference

Red Hat Enterprise Skills Server — REST API.

Interactive docs are available at **`/documentation`** when the server is running (Swagger UI, backed by the OpenAPI spec at `/documentation/json`).

---

## Authentication

The following endpoints require an `Authorization: Bearer <RHESS_ADMIN_TOKEN>` header:

| Endpoint | Purpose |
|----------|---------|
| `POST /api/v1/sources` | Register a new skill source |
| `PUT /api/v1/sources/:id` | Update a source's label or URL |
| `DELETE /api/v1/sources/:id` | Remove a source and its skills |
| `POST /api/v1/sources/:id/sync` | Re-sync a source |
| `DELETE /api/v1/skills/:source/:slug` | Delete a single skill |
| `POST /api/v1/skills/:source/:slug/sync` | Re-sync a single skill's source |
| `POST /api/sync` | Re-sync all sources |

All read and discovery endpoints are unauthenticated.

---

## Skills Catalog

### `GET /api/v1/skills`

List all indexed skills (paginated).

**Query parameters**

| Parameter  | Type    | Default     | Description              |
|------------|---------|-------------|--------------------------|
| `page`     | integer | `1`         | Page number (1-based)    |
| `per_page` | integer | `20`        | Results per page (1–100) |
| `sort`     | string  | `name`      | `name` or `updated_at`   |

**Response `200`**

```json
{
  "data": [
    {
      "id": 1,
      "source": "rhdh-skills",
      "sourceLabel": "RHDH Skills",
      "sourceUrl": "https://github.com/redhat-developer/rhdh-skill",
      "slug": "agent-ready",
      "name": "agent-ready",
      "description": "Assesses a git repository's readiness for use by AI coding agents.",
      "artifactType": "skill-md",
      "digest": "sha256:abc123…",
      "category": null,
      "allowedTools": [],
      "skillPath": "skills/agent-ready/SKILL.md",
      "frontmatter": {},
      "installCommand": "npx skills add http://localhost:3000/api/v1/skills/rhdh-skills/agent-ready/artifact",
      "lastModified": "2026-06-19T14:32:00Z"
    }
  ],
  "meta": {
    "total": 42,
    "page": 1,
    "per_page": 20,
    "total_pages": 3,
    "sort": "name"
  }
}
```

---

### `GET /api/v1/skills/search?q=<query>`

Fuzzy full-text search over skill names, descriptions, and source identifiers.

**Query parameters**

| Parameter | Type   | Required | Description                  |
|-----------|--------|----------|------------------------------|
| `q`       | string | yes      | Search query (typo-tolerant) |

**Response `200`**

```json
{
  "data": [
    {
      "id": 1,
      "source": "rhdh-skills",
      "slug": "agent-ready",
      "name": "agent-ready",
      "description": "…"
    }
  ],
  "total": 1,
  "query": "agent ready"
}
```

**Response `400`** — `q` parameter missing or empty.

---

### `GET /api/v1/skills/:source/:slug`

Full skill detail including all files.

**Path parameters**

| Parameter | Description  |
|-----------|--------------|
| `source`  | Source slug  |
| `slug`    | Skill slug   |

**Response `200`**

```json
{
  "id": 1,
  "source": "rhdh-skills",
  "sourceLabel": "RHDH Skills",
  "sourceUrl": "https://github.com/redhat-developer/rhdh-skill",
  "slug": "agent-ready",
  "name": "agent-ready",
  "description": "Assesses a git repository's readiness for use by AI coding agents.",
  "artifactType": "skill-md",
  "digest": "sha256:abc123…",
  "category": null,
  "allowedTools": [],
  "skillPath": "skills/agent-ready/SKILL.md",
  "frontmatter": { "version": "1.0" },
  "installCommand": "npx skills add http://localhost:3000/api/v1/skills/rhdh-skills/agent-ready/artifact",
  "lastModified": "2026-06-19T14:32:00Z",
  "content": "---\nname: agent-ready\n…",
  "files": [
    { "path": "SKILL.md", "contents": "---\nname: agent-ready\n…" }
  ]
}
```

For `skill-md` type, `files` contains a single `SKILL.md` entry. For `archive` type, all files from the tar.gz are listed with `SKILL.md` sorted first.

**Response `404`** — skill not found.

---

### `GET /api/v1/skills/:source/:slug/artifact`

Download the raw skill artifact.

- Returns `text/markdown` for `skill-md` type.
- Returns `application/gzip` (tar.gz) for `archive` type.

This is the URL referenced in the Agent Skills discovery index and used in `installCommand`.

**Response `404`** — skill not found.

---

### `DELETE /api/v1/skills/:source/:slug` 🔒

Remove a single skill from the catalog without touching the source or other skills.

**Response `200`**

```json
{ "ok": true }
```

**Response `404`** — skill not found.

---

### `POST /api/v1/skills/:source/:slug/sync` 🔒

Re-sync the parent source of a skill, refreshing all its skills including this one.

**Response `200`**

```json
{
  "synced": true,
  "skillId": "rhdh-skills/agent-ready",
  "lastSynced": "2026-06-25T17:30:00Z"
}
```

**Error codes**

| Status | Code               | Meaning                                   |
|--------|--------------------|-------------------------------------------|
| 404    | `SKILL_NOT_FOUND`  | Skill not found                           |
| 404    | `SOURCE_NOT_FOUND` | Parent source not found                   |
| 409    | `SYNC_IN_PROGRESS` | Sync already running for this source      |
| 422    | `SYNC_FAILED`      | Re-clone or ingestion failed              |

---

## Sources

### `GET /api/v1/sources`

List all registered skill sources with their skill counts and sync status.

**Response `200`**

```json
{
  "sources": [
    {
      "id": "rhdh-skills",
      "path": "https://github.com/redhat-developer/rhdh-skill",
      "label": "RHDH Skills",
      "url": "https://github.com/redhat-developer/rhdh-skill",
      "lastSynced": "2026-06-25T17:30:00Z",
      "skillCount": 3,
      "status": "idle"
    }
  ]
}
```

`id` is the source slug and is used as the `:id` path parameter in all source operations. `status` is one of `idle`, `syncing`, or `error`.

---

### `POST /api/v1/sources` 🔒

Register a new skill source. Clones the repository, discovers all `SKILL.md` files, and indexes them atomically. No source record is persisted if the clone or ingestion fails.

**Request body**

```json
{
  "path": "https://github.com/redhat-developer/rhdh-skill",
  "label": "RHDH Skills"
}
```

| Field   | Type   | Required | Description                                                   |
|---------|--------|----------|---------------------------------------------------------------|
| `path`  | string | **yes**  | HTTPS or SSH git URL                                          |
| `label` | string | no       | Display name; derived from URL if omitted                     |
| `url`   | string | no       | Legacy alias for `path`                                       |
| `slug`  | string | no       | Explicit kebab-case slug; derived from `label`/`path` if omitted |

**Response `201`**

```json
{
  "source": {
    "id": "rhdh-skill",
    "path": "https://github.com/redhat-developer/rhdh-skill",
    "label": "Rhdh Skill",
    "url": "https://github.com/redhat-developer/rhdh-skill",
    "lastSynced": "2026-06-25T17:30:00Z",
    "skillCount": 3,
    "status": "idle"
  },
  "syncReport": {
    "discovered": 3,
    "indexed": 3,
    "failed": 0,
    "failures": []
  }
}
```

**Error codes**

| Status | Code            | Meaning                                          |
|--------|-----------------|--------------------------------------------------|
| 400    | `INVALID_SLUG`  | Derived or explicit slug fails kebab-case rules  |
| 400    | `INVALID_URL`   | `path` is missing or empty                       |
| 409    | `SLUG_CONFLICT` | Slug already registered                          |
| 422    | `CLONE_FAILED`  | Git clone failed                                 |
| 422    | `INGEST_FAILED` | Clone succeeded, ingestion failed                |

---

### `PUT /api/v1/sources/:id` 🔒

Update a source's display label and/or git URL. Does not re-sync.

**Path parameters**

| Parameter | Description  |
|-----------|--------------|
| `id`      | Source slug  |

**Request body** (all fields optional; omitted fields are unchanged)

```json
{
  "label": "My Renamed Source",
  "path": "https://github.com/org/new-repo"
}
```

**Response `200`**

```json
{
  "source": { "id": "rhdh-skills", "label": "My Renamed Source", "…": "…" }
}
```

**Error codes**

| Status | Code             | Meaning                   |
|--------|------------------|---------------------------|
| 400    | `INVALID_URL`    | `path` provided but empty |
| 400    | `INVALID_LABEL`  | `label` provided but empty |
| 404    | `SOURCE_NOT_FOUND` | Source not found         |

---

### `DELETE /api/v1/sources/:id` 🔒

Remove a source and all its associated skills from the index.

**Response `200`**

```json
{ "ok": true, "skillsRemoved": 3 }
```

**Response `404`** — source not found.

---

### `POST /api/v1/sources/:id/sync` 🔒

Re-clone and re-index a source. Rejects with `409` if a sync is already in progress (safe for concurrent requests).

**Response `200`**

```json
{
  "synced": true,
  "count": 3,
  "lastSynced": "2026-06-25T17:30:00Z"
}
```

**Error codes**

| Status | Code               | Meaning                       |
|--------|--------------------|-------------------------------|
| 404    | `SOURCE_NOT_FOUND` | Source not found              |
| 409    | `SYNC_IN_PROGRESS` | Another sync is still running |
| 422    | `CLONE_FAILED`     | Re-clone failed               |

---

### `POST /api/sync` 🔒

Re-sync **all** registered sources sequentially. Sources already being synced are skipped. Rebuilds the search index when complete.

**Response `200`**

```json
{ "synced": 2, "count": 42 }
```

`synced` is the number of sources successfully re-synced; `count` is the total number of indexed skills after the operation.

---

## Discovery

### `GET /.well-known/agent-skills/index.json`

Agent Skills CLI discovery manifest ([spec](https://agentskills.io/spec/)). Lists all indexed skills with their artifact URLs and SHA-256 content digests.

**Response `200`**

```json
{
  "$schema": "https://agentskills.io/schema/v0.2.0/index.json",
  "skills": [
    {
      "name": "agent-ready",
      "type": "skill-md",
      "description": "Assesses a git repository's readiness for use by AI coding agents.",
      "url": "http://localhost:3000/api/v1/skills/rhdh-skills/agent-ready/artifact",
      "digest": "sha256:abc123…"
    }
  ]
}
```

> Set `PUBLIC_BASE_URL` to ensure artifact URLs use the correct public hostname when running behind a reverse proxy.

---

## Ops

### `GET /healthz`

Liveness probe. Always returns `200` while the process is running.

```json
{ "status": "ok" }
```

### `GET /readyz`

Readiness probe. Returns `200` when SQLite is reachable, `503` when the database is unavailable.

**Response `200`**

```json
{ "status": "ok" }
```

**Response `503`**

```json
{ "status": "error", "message": "database unavailable" }
```

---

## Error envelope

All error responses use a consistent envelope:

```json
{
  "error": {
    "code": "SOURCE_NOT_FOUND",
    "message": "Source 'my-skills' not found"
  }
}
```

🔒 = requires `Authorization: Bearer <RHESS_ADMIN_TOKEN>`
