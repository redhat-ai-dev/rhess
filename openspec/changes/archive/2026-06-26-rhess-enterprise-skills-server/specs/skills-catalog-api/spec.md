## ADDED Requirements

### Requirement: Paginated skill listing

The server SHALL expose `GET /api/v1/skills` returning a paginated list of all indexed skills. The response SHALL include for each skill: `id`, `name`, `description`, `source`, `slug`. The endpoint SHALL support `page` (1-based integer, default 1), `per_page` (integer 1–100, default 20), and `sort` (`name` or `updated_at`, default `name`) query parameters. The endpoint SHALL be unauthenticated.

#### Scenario: Default listing

- **WHEN** a client sends `GET /api/v1/skills` with no query parameters
- **THEN** the server returns HTTP 200 with a JSON body containing `{data: [...], meta: {page, per_page, total}}`
- **THEN** `data` contains at most 20 skills sorted by name ascending
- **THEN** no authentication token is required

#### Scenario: Paginated request

- **WHEN** a client sends `GET /api/v1/skills?page=2&per_page=5`
- **THEN** the server returns the second page of 5 skills
- **THEN** `meta.total` reflects the total count across all pages

#### Scenario: Invalid pagination parameters

- **WHEN** a client sends `GET /api/v1/skills?per_page=0` or `?per_page=999`
- **THEN** the server returns HTTP 400 with `{error: {code: "INVALID_PARAMS", message: "..."}}`

### Requirement: Skill detail retrieval

The server SHALL expose `GET /api/v1/skills/:source/:slug` returning full skill detail. The response SHALL include: `id`, `source`, `slug`, `name`, `description`, `files` (array of `{path, contents}`). The `files` array SHALL contain the SKILL.md and all supporting files discovered at ingestion time. The endpoint SHALL be unauthenticated.

#### Scenario: Existing skill

- **WHEN** a client requests `GET /api/v1/skills/team-a/react-patterns`
- **THEN** the server returns HTTP 200 with skill metadata and the complete `files` array
- **THEN** the response includes at minimum a `files` entry with `path: "SKILL.md"` and the raw markdown content

#### Scenario: Unknown skill

- **WHEN** a client requests a `(source, slug)` pair that does not exist
- **THEN** the server returns HTTP 404 with `{error: {code: "SKILL_NOT_FOUND", message: "..."}}`

### Requirement: Fuzzy skill search

The server SHALL expose `GET /api/v1/skills/search?q=<query>` returning ranked results from a fuzzy search over skill names, descriptions, and source identifiers. Results SHALL be ordered by relevance score descending. The endpoint SHALL be unauthenticated.

#### Scenario: Matching query

- **WHEN** a client sends `GET /api/v1/skills/search?q=react`
- **THEN** the server returns HTTP 200 with a `{data: [...]}` array of skills sorted by relevance
- **THEN** each result includes at minimum `id`, `source`, `slug`, `name`, `description`, and a `score` field

#### Scenario: Query with typo

- **WHEN** a client sends `GET /api/v1/skills/search?q=reakt`
- **THEN** the server returns results including skills whose names are close matches (typo-tolerant)

#### Scenario: Empty query

- **WHEN** a client sends `GET /api/v1/skills/search` with no `q` parameter
- **THEN** the server returns HTTP 400 with `{error: {code: "MISSING_QUERY", message: "..."}}`

#### Scenario: No matches

- **WHEN** a client sends a query that matches no indexed skills
- **THEN** the server returns HTTP 200 with `{data: []}`

### Requirement: Structured JSON error responses

The server SHALL return all error responses in the format `{error: {code, message}}`. `code` SHALL be a machine-readable uppercase string constant. `message` SHALL be a human-readable description. The server SHALL never return unstructured error text or HTML error pages.

#### Scenario: Any error condition

- **WHEN** any API request results in an error (4xx or 5xx)
- **THEN** the response body is `{error: {code: "<CODE>", message: "<human text>"}}`
- **THEN** the `Content-Type` header is `application/json`

### Requirement: Health and readiness probes

The server SHALL expose `GET /healthz` (liveness) and `GET /readyz` (readiness) endpoints. Both SHALL return HTTP 200 with `{status: "ok"}` when the server is operational. `GET /readyz` SHALL return HTTP 503 if the database is unreachable. Both SHALL be unauthenticated.

#### Scenario: Healthy server

- **WHEN** the server is running and the database is reachable
- **THEN** `GET /healthz` and `GET /readyz` both return HTTP 200 `{status: "ok"}`

#### Scenario: Database unreachable

- **WHEN** the SQLite database file is missing or locked
- **THEN** `GET /readyz` returns HTTP 503 `{status: "unavailable"}`
- **THEN** `GET /healthz` still returns HTTP 200 (process is alive)

### Requirement: `.well-known/agent-skills/` discovery index

The server SHALL expose `GET /.well-known/agent-skills/index.json` conforming to the Agent Skills v0.2.0 discovery schema: `{$schema, skills: [{name, type, description, url, digest}]}`. Skill `type` SHALL be `skill-md` for single-file skills or `archive` for multi-file bundles. The `digest` field SHALL be a `sha256:` prefixed hex string. The endpoint SHALL be unauthenticated.

#### Scenario: CLI discovery

- **WHEN** the `npx skills` CLI fetches `/.well-known/agent-skills/index.json`
- **THEN** the server returns a valid v0.2.0 index listing all indexed skills
- **THEN** each entry's `url` points to a downloadable artifact (SKILL.md or tar.gz)
- **THEN** each entry's `digest` is the SHA256 of the artifact at that URL

#### Scenario: Duplicate skill names across sources

- **WHEN** two sources each contain a skill with the same name
- **THEN** both appear in the index with distinct `url` values
- **THEN** no prefixing or name mangling is applied

#### Scenario: Skills.sh API contract compatibility

- **WHEN** a consumer fetches `GET /api/v1/skills/:source/:slug`
- **THEN** the response shape matches the skills.sh `/api/v1/skills/:source/:skill` contract
