# RHESS API Reference

Red Hat Enterprise Skills Server — REST API.

Interactive docs are available at **`/documentation`** when the server is running (served by Swagger UI, backed by the OpenAPI spec at `/documentation/json`).

---

## Authentication

Write endpoints (`POST /api/v1/sources`, `DELETE /api/v1/sources/:id`, `POST /api/v1/sources/:id/sync`) require:

```
Authorization: Bearer <RHESS_ADMIN_TOKEN>
```

All read and discovery endpoints are unauthenticated.

---

## Skills Catalog

### `GET /api/v1/skills`

List all indexed skills (paginated).

**Query parameters**

| Parameter  | Type    | Default | Description              |
|------------|---------|---------|--------------------------|
| `page`     | integer | `1`     | Page number (1-based)    |
| `per_page` | integer | `20`    | Results per page (1–100) |
| `sort`     | string  | `name`  | `name` or `updated_at`   |

**Response `200`**

```json
{
  "data": [
    {
      "id": 1,
      "name": "update-base-image",
      "description": "Analyze and update Red Hat UBI base images…",
      "source": "rhdh-skills",
      "slug": "update-base-image",
      "artifactType": "archive",
      "digest": "sha256:abc123…"
    }
  ],
  "meta": { "page": 1, "per_page": 20, "total": 42 }
}
```

---

### `GET /api/v1/skills/search?q=<query>`

Fuzzy full-text search over skill names, descriptions, and source identifiers.

**Query parameters**

| Parameter | Type   | Required | Description             |
|-----------|--------|----------|-------------------------|
| `q`       | string | yes      | Search query (typo-tolerant) |

**Response `200`**

```json
{
  "data": [
    {
      "id": 1,
      "source": "rhdh-skills",
      "slug": "update-base-image",
      "name": "update-base-image",
      "description": "…",
      "score": 0.001
    }
  ]
}
```

`score` is the Fuse.js distance — `0` is an exact match, higher values are weaker matches.

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
  "slug": "update-base-image",
  "name": "update-base-image",
  "description": "…",
  "artifactType": "archive",
  "digest": "sha256:abc123…",
  "files": [
    { "path": "SKILL.md", "contents": "---\nname: …" },
    { "path": "scripts/run.sh", "contents": "#!/bin/bash …" }
  ]
}
```

For `skill-md` type, `files` contains a single entry. For `archive` type, all files from the tar.gz are extracted.

**Response `404`** — skill not found.

---

### `GET /api/v1/skills/:source/:slug/artifact`

Download the raw skill artifact.

- Returns `text/markdown` for `skill-md` type.
- Returns `application/gzip` (tar.gz) for `archive` type.

This URL is the same one referenced in the Agent Skills discovery index.

---

## Sources

### `POST /api/v1/sources`

Register a new skill source. Clones the repository, discovers all `SKILL.md` files, and indexes them atomically. No source record is created if the clone fails.

**Request body**

```json
{
  "slug": "my-skills",
  "url": "https://github.com/org/my-skills-repo"
}
```

| Field  | Type   | Description                                              |
|--------|--------|----------------------------------------------------------|
| `slug` | string | Kebab-case identifier, 1–64 chars, no leading/trailing hyphens |
| `url`  | string | HTTPS or SSH git URL                                     |

**Response `201`**

```json
{
  "id": 2,
  "slug": "my-skills",
  "url": "https://github.com/org/my-skills-repo",
  "created_at": "2026-06-19T14:32:00.000Z",
  "syncReport": { "indexed": 12, "skipped": 0, "errors": 0 }
}
```

**Error codes**

| Status | Code            | Meaning                        |
|--------|-----------------|--------------------------------|
| 400    | `INVALID_SLUG`  | Slug format violation          |
| 400    | `INVALID_URL`   | URL missing or empty           |
| 409    | `SLUG_CONFLICT` | Slug already registered        |
| 422    | `CLONE_FAILED`  | Git clone failed               |
| 422    | `INGEST_FAILED` | Clone succeeded, ingestion failed |

---

### `DELETE /api/v1/sources/:id`

Remove a source and all its associated skills from the index.

**Response `200`**

```json
{ "message": "Source deleted" }
```

**Response `404`** — source not found.

---

### `POST /api/v1/sources/:id/sync`

Re-clone and re-index a source. Rejects with `409` if a sync is already in progress for the same source (atomic guard — safe for concurrent requests).

**Response `200`**

```json
{ "indexed": 12, "skipped": 0, "errors": 0 }
```

**Error codes**

| Status | Code               | Meaning                       |
|--------|--------------------|-------------------------------|
| 409    | `SYNC_IN_PROGRESS` | Another sync is still running |
| 422    | `CLONE_FAILED`     | Re-clone failed               |

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
      "name": "update-base-image",
      "type": "archive",
      "description": "Analyze and update Red Hat UBI base images…",
      "url": "http://localhost:3000/api/v1/skills/rhdh-skills/update-base-image/artifact",
      "digest": "sha256:202703d18d473fcf735181213159f3f7efc4430ae4d0f1686dc40b2a5b62b783"
    }
  ]
}
```

> Set the `PUBLIC_BASE_URL` environment variable when running behind a reverse proxy to ensure artifact URLs use the correct public hostname and port.

---

## Ops

### `GET /healthz`

Liveness probe. Always returns `200` while the process is running.

```json
{ "status": "ok" }
```

### `GET /readyz`

Readiness probe. Returns `200` when SQLite is reachable, `503` otherwise.

```json
{ "status": "ok" }
```

---

## Error envelope

All error responses use a consistent envelope:

```json
{
  "error": {
    "code": "SOURCE_NOT_FOUND",
    "message": "Source with id 99 not found"
  }
}
```
