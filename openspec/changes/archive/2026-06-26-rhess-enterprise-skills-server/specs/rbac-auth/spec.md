## ADDED Requirements

### Requirement: Unauthenticated read access

All GET endpoints (skill listing, skill detail, search, `.well-known/` discovery, health/readiness probes) SHALL be unauthenticated. No token, session, or login SHALL be required to browse, search, or retrieve skills. This ensures compatibility with the `npx skills` CLI and provides a frictionless developer experience.

#### Scenario: Unauthenticated GET request

- **WHEN** any client sends a GET request to `/api/v1/skills`, `/api/v1/skills/:source/:slug`, `/api/v1/skills/search`, or `/.well-known/agent-skills/index.json`
- **THEN** the server returns the requested data without checking for an `Authorization` header
- **THEN** no 401 or 403 response is returned for missing credentials on read paths

#### Scenario: npx skills CLI compatibility

- **WHEN** the `npx skills` CLI fetches `/.well-known/agent-skills/index.json` without any credentials
- **THEN** the server responds with a valid discovery index

### Requirement: Admin token for write operations

All write operations — `POST /api/v1/sources`, `DELETE /api/v1/sources/:id`, `POST /api/v1/sources/:id/sync` — SHALL require a valid admin token. The admin token SHALL be configured via the `RHESS_ADMIN_TOKEN` environment variable. The server SHALL accept the token in the `Authorization: Bearer <token>` HTTP header.

#### Scenario: Valid admin token

- **WHEN** a request to a write endpoint includes `Authorization: Bearer <valid-token>`
- **THEN** the server processes the request

#### Scenario: Missing token on write endpoint

- **WHEN** a request to a write endpoint is sent without an `Authorization` header
- **THEN** the server returns HTTP 401 with `{error: {code: "UNAUTHORIZED", message: "Admin token required"}}`

#### Scenario: Invalid token on write endpoint

- **WHEN** a request to a write endpoint includes an `Authorization` header with an incorrect token value
- **THEN** the server returns HTTP 403 with `{error: {code: "FORBIDDEN", message: "Invalid admin token"}}`

### Requirement: Admin token configuration via environment variable

The admin token SHALL be configured via the `RHESS_ADMIN_TOKEN` environment variable. The server SHALL refuse to start if `RHESS_ADMIN_TOKEN` is not set or is an empty string. The token value SHALL never appear in server logs or error responses.

#### Scenario: Server start without token configured

- **WHEN** the server starts and `RHESS_ADMIN_TOKEN` is not set
- **THEN** the server exits with a non-zero exit code and a human-readable error message
- **THEN** the error message does not include the token value

#### Scenario: Token never logged

- **WHEN** any request processing occurs
- **THEN** the raw token value is not written to logs, stdout, or stderr at any log level

### Requirement: Network-level security as access boundary

The server SHALL assume that network-level controls (corporate firewall, VPN, OpenShift Route restrictions) enforce who can reach the server. The server SHALL NOT implement IP allowlisting, rate limiting, or TLS termination as built-in features — these are the responsibility of the surrounding infrastructure. This SHALL be documented in the deployment guide.

#### Scenario: No built-in IP restriction

- **WHEN** the server receives a GET request from any network address
- **THEN** the server processes it without performing IP-based access checks

### Requirement: Future SSO/OIDC extensibility

The authentication middleware SHALL be designed so that the admin token validation layer can be replaced with an OIDC/SSO validation layer in a future release without requiring changes to the API contract or route handlers.

#### Scenario: Middleware isolation

- **WHEN** a future release replaces the token-check middleware with OIDC token validation
- **THEN** no changes to route handler code are required
- **THEN** the `Authorization: Bearer` header convention is preserved
