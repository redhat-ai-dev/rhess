## ADDED Requirements

### Requirement: OCI container image on UBI9

The server SHALL ship as an OCI-compliant container image built on `ubi9/nodejs-24`. The image SHALL use a multi-stage Docker build: a build stage compiles TypeScript and produces Vite static assets; a runtime stage copies only the production output. The image SHALL be published at `github.com/redhat-ai-dev/rhess` under the Apache-2.0 license.

#### Scenario: Image build

- **WHEN** the container image is built
- **THEN** it produces a runnable image based on `ubi9/nodejs-24`
- **THEN** the build stage artifacts (source, node_modules, TypeScript source) are not present in the runtime layer

#### Scenario: Git binary available

- **WHEN** the runtime container starts
- **THEN** the `git` binary is available (installed via `dnf install` in the UBI layer or present in the base image)
- **THEN** `simple-git` can execute git commands successfully

### Requirement: Kubernetes Deployment manifests

The repository SHALL include Kubernetes manifests for: Deployment, Service, PersistentVolumeClaim (for SQLite), and Route (OpenShift). The manifests SHALL reference the published container image, define resource requests/limits, and declare all required environment variables as references to a Kubernetes Secret.

#### Scenario: Kubernetes deployment

- **WHEN** an operator applies the provided manifests to an OpenShift/Kubernetes cluster
- **THEN** the server starts, connects to the PVC-backed SQLite database, and serves requests

#### Scenario: SQLite on PVC

- **WHEN** the Deployment mounts the PVC at the configured database path
- **THEN** the SQLite database file persists across pod restarts

### Requirement: Environment variable configuration

All server configuration SHALL be provided via environment variables. Required variables: `RHESS_ADMIN_TOKEN` (admin write token). Optional variables: `PORT` (default 3000), `DATABASE_PATH` (default `/data/rhess.db`), `ALLOWED_ORIGINS` (CORS origins, default `*`). Git credentials for private repos SHALL be provided via mounted Kubernetes Secret files (SSH key or `.gitconfig`), not environment variables.

#### Scenario: Server starts with required variables

- **WHEN** `RHESS_ADMIN_TOKEN` is set and the server starts
- **THEN** the server binds to `PORT` (or 3000) and is ready to serve requests

#### Scenario: Server fails without required variables

- **WHEN** `RHESS_ADMIN_TOKEN` is not set
- **THEN** the server exits immediately with a non-zero exit code and a clear error message

#### Scenario: Custom database path

- **WHEN** `DATABASE_PATH` is set to a custom path
- **THEN** the server creates or opens the SQLite database at that path

### Requirement: Local development and evaluation

The server SHALL be runnable locally without Kubernetes via `podman run` or `npm run dev`. The README SHALL include a quickstart command for local evaluation.

#### Scenario: Local Podman run

- **WHEN** an operator runs `podman run -e RHESS_ADMIN_TOKEN=<token> -p 3000:3000 <image>`
- **THEN** the server starts and is accessible at `http://localhost:3000`

#### Scenario: Development mode

- **WHEN** a developer runs `npm run dev` in the repository
- **THEN** the server starts in development mode with hot-reload for the UI

### Requirement: Health and readiness probes for Kubernetes

The server SHALL expose `GET /healthz` (liveness) and `GET /readyz` (readiness) at the paths expected by Kubernetes probes. The provided Deployment manifest SHALL configure these probes with appropriate `initialDelaySeconds` and `periodSeconds` values.

#### Scenario: Probe configuration in manifest

- **WHEN** the Deployment manifest is applied
- **THEN** the liveness probe targets `GET /healthz` and the readiness probe targets `GET /readyz`

### Requirement: Open source publication

The server SHALL be published under the Apache-2.0 license. The repository SHALL include a README with: quickstart instructions, architecture overview, environment variable reference, and contribution guidelines.

#### Scenario: License file present

- **WHEN** the repository is inspected
- **THEN** an `LICENSE` file with Apache-2.0 text is present at the repository root

#### Scenario: README quickstart

- **WHEN** a new user reads the README
- **THEN** they can deploy the server locally in under 5 minutes following the quickstart section
