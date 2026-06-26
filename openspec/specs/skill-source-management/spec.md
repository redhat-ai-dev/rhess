## ADDED Requirements

### Requirement: Source registration

The server SHALL expose `POST /api/v1/sources` allowing an admin to register a new Git repository URL as a skill source. The request body SHALL include: `url` (HTTPS or SSH Git URL), `slug` (kebab-case, lowercase, hyphens only, 1–64 chars). The server SHALL perform an initial shallow clone and ingestion immediately upon registration. The endpoint SHALL require an admin token.

#### Scenario: Successful registration

- **WHEN** an admin sends `POST /api/v1/sources` with a valid `url` and unique `slug`
- **THEN** the server returns HTTP 201 with the created source object including `id`, `slug`, `url`, `created_at`, and ingestion summary
- **THEN** skills from the repository are indexed and available in the catalog

#### Scenario: Duplicate slug

- **WHEN** an admin sends `POST /api/v1/sources` with a `slug` already in use
- **THEN** the server returns HTTP 409 with `{error: {code: "SLUG_CONFLICT", message: "..."}}`

#### Scenario: Invalid slug format

- **WHEN** an admin sends `POST /api/v1/sources` with a slug containing uppercase letters, spaces, or exceeding 64 characters
- **THEN** the server returns HTTP 400 with `{error: {code: "INVALID_SLUG", message: "..."}}`

#### Scenario: Unreachable repository

- **WHEN** an admin registers a Git URL that cannot be cloned (bad URL, auth failure, network error)
- **THEN** the server returns HTTP 422 with `{error: {code: "CLONE_FAILED", message: "..."}}`
- **THEN** no source record is created

### Requirement: Source deletion

The server SHALL expose `DELETE /api/v1/sources/:id` removing a source and all of its associated skills from the catalog. The source SHALL also be removed from the sync list so future sync operations do not re-import it. To restore a deleted source, the admin must re-register it via `POST /api/v1/sources`. Per-skill deletion is not supported in Developer Preview. The endpoint SHALL require an admin token.

#### Scenario: Successful deletion

- **WHEN** an admin sends `DELETE /api/v1/sources/:id` for an existing source
- **THEN** the server returns HTTP 200 with confirmation
- **THEN** all skills associated with that source are removed from the catalog
- **THEN** subsequent syncs do not re-import the source

#### Scenario: Unknown source

- **WHEN** an admin sends `DELETE /api/v1/sources/:id` for a source ID that does not exist
- **THEN** the server returns HTTP 404 with `{error: {code: "SOURCE_NOT_FOUND", message: "..."}}`

### Requirement: Manual source re-sync

The server SHALL expose `POST /api/v1/sources/:id/sync` triggering a fresh shallow clone and re-ingestion of the source repository. The sync SHALL use an atomic swap — new skills replace old ones in a single transaction — so the catalog is never in a partial state. The endpoint SHALL require an admin token.

#### Scenario: Successful sync

- **WHEN** an admin sends `POST /api/v1/sources/:id/sync`
- **THEN** the server clones the latest commit, re-indexes all discovered skills, and returns HTTP 200 with a sync report
- **THEN** the sync report includes per-skill success/failure details

#### Scenario: Sync of unknown source

- **WHEN** an admin sends `POST /api/v1/sources/:id/sync` for an unknown source
- **THEN** the server returns HTTP 404 with `{error: {code: "SOURCE_NOT_FOUND", message: "..."}}`

#### Scenario: Concurrent sync rejected

- **WHEN** a sync is already in progress for a source and another sync is triggered
- **THEN** the server returns HTTP 409 with `{error: {code: "SYNC_IN_PROGRESS", message: "..."}}`

### Requirement: Admin-provided source slug as URL key

The admin-provided slug SHALL be used as the `source` component in all skill URLs (`/api/v1/skills/:source/:slug` and in the `.well-known/` index). The slug SHALL be immutable after creation — changing it requires deleting and re-registering the source.

#### Scenario: Skill URL construction

- **WHEN** a source is registered with `slug: "team-a-skills"` and contains a skill with slug `react-patterns`
- **THEN** the skill is accessible at `GET /api/v1/skills/team-a-skills/react-patterns`
- **THEN** the `.well-known/` index entry `url` path uses `team-a-skills` as the source segment
