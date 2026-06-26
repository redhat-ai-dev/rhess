## ADDED Requirements

### Requirement: Shallow clone of registered Git sources

The server SHALL perform a shallow clone (`--depth 1`) of the registered Git repository URL when ingesting a source. Both HTTPS and SSH URLs SHALL be supported. Authentication for private repos SHALL use the container's native git configuration (SSH keys and `.gitconfig` mounted via Kubernetes Secrets). The server SHALL NOT store Git credentials in the database.

#### Scenario: HTTPS public repository

- **WHEN** a source is registered with an HTTPS URL pointing to a public repository
- **THEN** the server clones the repository without credentials and proceeds to indexing

#### Scenario: SSH private repository

- **WHEN** a source is registered with an SSH URL and the container has a mounted SSH key
- **THEN** the server clones the repository using the native git SSH agent

#### Scenario: Authentication failure

- **WHEN** the container does not have credentials for a private repository
- **THEN** the clone fails and the server returns a `CLONE_FAILED` error
- **THEN** no source record or skills are written to the database

### Requirement: Agent Skills spec discovery paths

The server SHALL walk the standard Agent Skills specification discovery directories when scanning a cloned repository. The discovery paths SHALL include at minimum: `skills/`, `.claude/skills/`, `.cursor/skills/`, `.github/copilot/skills/`, `.windsurf/skills/`, `.gemini/skills/`. All files named `SKILL.md` (case-insensitive) found under these paths SHALL be candidates for ingestion.

#### Scenario: Standard discovery paths

- **WHEN** a repository contains SKILL.md files under `skills/` and `.claude/skills/`
- **THEN** the server discovers and indexes all of them

#### Scenario: File outside discovery paths

- **WHEN** a repository contains a `SKILL.md` at the root or outside a discovery directory
- **THEN** the server does NOT index it (not a valid discovery path per the spec)

### Requirement: YAML frontmatter parsing and validation

Each discovered SKILL.md SHALL be parsed for YAML frontmatter. A skill is valid if frontmatter is present and contains at minimum: `name` (string) and `description` (string). The parsed frontmatter fields (`name`, `description`, `allowed-tools`) SHALL be stored as indexed metadata. Frontmatter is parsed at ingestion time; the raw SKILL.md content is stored verbatim.

#### Scenario: Valid frontmatter

- **WHEN** a SKILL.md contains valid YAML frontmatter with `name` and `description`
- **THEN** the skill is indexed with those fields as searchable metadata

#### Scenario: Missing required fields

- **WHEN** a SKILL.md is missing `name` or `description` in frontmatter
- **THEN** the skill is skipped and recorded in the sync report as a per-skill failure
- **THEN** other valid skills in the same repository continue to be indexed

#### Scenario: No frontmatter

- **WHEN** a SKILL.md contains no YAML frontmatter delimiter
- **THEN** the skill is skipped and recorded as a per-skill failure

### Requirement: Best-effort ingestion with sync report

The server SHALL use best-effort ingestion — a malformed or invalid SKILL.md SHALL NOT block ingestion of the remaining skills in the repository. The sync response SHALL include a report listing: total discovered, total indexed, and per-skill failures with path and reason.

#### Scenario: Mixed valid/invalid files

- **WHEN** a repository contains 5 SKILL.md files and 2 have invalid frontmatter
- **THEN** the server indexes the 3 valid skills
- **THEN** the sync report lists the 2 failures with their paths and failure reasons

### Requirement: Atomic swap on re-sync

When re-syncing an existing source, the server SHALL ingest the updated repository into a staging area, then in a single database transaction delete the old source skills and insert the new ones. The catalog SHALL never be in a partial state during re-sync.

#### Scenario: Re-sync replaces all skills atomically

- **WHEN** a source is re-synced and the upstream repository has changed (skills added, removed, or modified)
- **THEN** the catalog reflects exactly the new state of the repository after the transaction commits
- **THEN** no window exists where the catalog contains a mix of old and new skills

#### Scenario: Re-sync failure mid-ingestion

- **WHEN** an error occurs during re-sync before the transaction commits
- **THEN** the existing skills from the previous sync remain in the catalog unchanged

### Requirement: Artifact type classification

Skills with only a SKILL.md file SHALL be classified as `skill-md` type. Skills with a SKILL.md and additional supporting files SHALL be classified as `archive` type and bundled as a tar.gz archive at sync time. The SHA256 digest of the artifact SHALL be computed and stored for use in the `.well-known/` discovery index.

#### Scenario: Single-file skill

- **WHEN** a discovery path contains only a SKILL.md with no sibling files
- **THEN** the skill is stored as `type: skill-md`
- **THEN** the artifact URL in the `.well-known/` index points to the raw SKILL.md

#### Scenario: Multi-file skill

- **WHEN** a discovery path contains a SKILL.md and one or more supporting files
- **THEN** the server bundles all files in that directory into a tar.gz archive at sync time
- **THEN** the skill is stored as `type: archive` with a `sha256:` digest of the archive

### Requirement: Bundled example skills for first-run experience

The server SHALL ship with 3–5 example skills embedded in the container image. These SHALL be loaded into the catalog on first boot if no sources have been registered, so the catalog is populated immediately after deployment without requiring admin action.

#### Scenario: First-run catalog population

- **WHEN** the server starts with an empty database and no sources registered
- **THEN** the bundled example skills are loaded into the catalog
- **THEN** the web directory and API return the example skills

#### Scenario: Existing catalog unchanged

- **WHEN** the server starts and the database already contains indexed skills
- **THEN** bundled examples are NOT re-loaded (no duplication)
