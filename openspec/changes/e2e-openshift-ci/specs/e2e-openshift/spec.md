## ADDED Requirements

### Requirement: OpenShift CI config exists for redhat-ai-dev/rhess

The `openshift/release` repository SHALL contain a ci-operator configuration file at
`ci-operator/config/redhat-ai-dev/rhess/redhat-ai-dev-rhess-main.yaml` that builds the
RHESS container image from the root `Dockerfile` and runs the e2e test step using the
`aws-devfile` cluster profile.

#### Scenario: CI config builds the RHESS image

- **WHEN** ci-operator processes the config
- **THEN** it builds an image named `rhess` from `dockerfile_path: Dockerfile` at the repo root

#### Scenario: CI config runs the e2e test on an AWS cluster

- **WHEN** the `rhess-e2e` test job is triggered
- **THEN** it provisions an OCP cluster using the `aws-devfile` cluster profile, sets `BASE_DOMAIN: devfile-ci.com`, and executes `.ci/openshift_e2e.sh` from the `src` image

#### Scenario: Built image is available to the test step

- **WHEN** the test step executes
- **THEN** the `RHESS_IMAGE` environment variable contains the fully-resolved pullspec of the image built in the same pipeline run

---

### Requirement: OWNERS file exists in the release repo config directory

An `OWNERS` file SHALL exist at `ci-operator/config/redhat-ai-dev/rhess/OWNERS` in the
`openshift/release` repository listing the RHESS project maintainers as approvers and reviewers.

#### Scenario: OWNERS file is present

- **WHEN** a pull request modifies the RHESS CI config
- **THEN** the OWNERS file is present and lists at least one approver

---

### Requirement: E2e test script exists in the rhess repo

The rhess repository SHALL contain an executable shell script at `.ci/openshift_e2e.sh`
that implements the full end-to-end test flow against a live OpenShift cluster.

#### Scenario: Script is executable

- **WHEN** the file is present in the repository
- **THEN** it has executable permissions (`chmod +x`)

---

### Requirement: E2e test deploys RHESS to the cluster

The test script SHALL create a dedicated namespace, apply all resources from `deploy/`
with the `RHESS_IMAGE` substituted, and wait for the pod to reach `Ready` state before
proceeding to assertions.

#### Scenario: Pod reaches Ready state

- **WHEN** the deployment manifests are applied with the built image
- **THEN** the script waits until `oc wait --for=condition=Ready pod -l app=rhess` succeeds within a timeout of 5 minutes

#### Scenario: Namespace is isolated

- **WHEN** the test starts
- **THEN** all resources are created in a dedicated namespace (e.g., `rhess-e2e`) that is deleted on exit

#### Scenario: Admin token is generated for the test run

- **WHEN** the namespace is set up
- **THEN** a random admin token is generated and stored in a `rhess-secret` Kubernetes Secret

---

### Requirement: E2e test validates server startup

The test script SHALL assert that `/healthz` and `/readyz` return HTTP 200 after the pod
is Ready.

#### Scenario: Health probe passes

- **WHEN** the pod is Ready and the script calls `GET /healthz` via the Route URL
- **THEN** the response is HTTP 200 with body `{"status":"ok"}`

#### Scenario: Readiness probe passes

- **WHEN** the pod is Ready and the script calls `GET /readyz` via the Route URL
- **THEN** the response is HTTP 200

---

### Requirement: E2e test validates bundled example skills on first boot

The test script SHALL assert that the skills catalog is non-empty immediately after first
boot, with no sources registered, because bundled example skills are loaded automatically.

#### Scenario: Bundled examples present in catalog

- **WHEN** `GET /api/v1/skills` is called with no sources registered
- **THEN** the response contains a non-empty `items` array

---

### Requirement: E2e test validates the .well-known discovery endpoint

The test script SHALL assert that `GET /.well-known/agent-skills/index.json` returns a
v0.2.0-compatible response.

#### Scenario: Discovery index returns correct schema

- **WHEN** the script calls `GET /.well-known/agent-skills/index.json`
- **THEN** the response is HTTP 200 and contains a `skills` array where each entry has `name`, `type`, `description`, `url`, and `digest` fields

---

### Requirement: E2e test validates admin auth enforcement

The test script SHALL assert that write endpoints reject requests with missing or invalid
tokens.

#### Scenario: Missing token is rejected

- **WHEN** `POST /api/v1/sources` is called without an `Authorization` header
- **THEN** the response is HTTP 401

#### Scenario: Wrong token is rejected

- **WHEN** `POST /api/v1/sources` is called with `Authorization: Bearer wrong-token`
- **THEN** the response is HTTP 403

---

### Requirement: E2e test validates source registration and skill ingestion

The test script SHALL register the `redhat-ai-dev/rhess` repository itself as a skill
source and assert that skills from that source appear in the catalog after sync.

#### Scenario: Source is registered successfully

- **WHEN** `POST /api/v1/sources` is called with valid admin token and `{"slug":"rhess-self","url":"https://github.com/redhat-ai-dev/rhess"}`
- **THEN** the response is HTTP 201

#### Scenario: Skills appear after sync

- **WHEN** the sync triggered by registration completes
- **THEN** `GET /api/v1/skills` returns a higher total count than the pre-registration baseline

#### Scenario: Search returns results

- **WHEN** `GET /api/v1/skills/search?q=openspec` is called after the source is synced
- **THEN** the response contains at least one result

---

### Requirement: E2e test validates skill detail retrieval

The test script SHALL assert that a known skill can be fetched by source and slug and
returns the expected fields.

#### Scenario: Skill detail is retrievable

- **WHEN** `GET /api/v1/skills/rhess-self/<slug>` is called for a skill known to exist in the rhess repo
- **THEN** the response is HTTP 200 and contains `name`, `description`, and `content` fields

---

### Requirement: E2e test cleans up after itself

The test script SHALL delete the test namespace on exit, whether the tests pass or fail,
so that cluster resources are not leaked between runs.

#### Scenario: Namespace deleted on success

- **WHEN** all assertions pass
- **THEN** the test namespace is deleted before the script exits 0

#### Scenario: Namespace deleted on failure

- **WHEN** any assertion fails
- **THEN** the test namespace is still deleted before the script exits non-zero (via `trap` or equivalent)
