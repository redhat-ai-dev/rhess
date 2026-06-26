## Canonical Touchpoints

`openspec/specs/container-deployment` — the e2e tests exercise the existing deployment manifests. No requirement changes to that spec; it is an informational dependency only.

No canonical document updates to any other spec.

## Context

RHESS is a single-process Node.js/Fastify server with a React UI, deployed as an OCI container on OpenShift. It exposes a REST API for skill catalog operations and an admin API for source management. The existing test suite covers unit (server logic) and integration (in-process API) levels. There are no tests that build the real container image, deploy it to a cluster, and exercise the full stack — container build → image pull → pod startup → HTTP traffic → skill ingestion from a live Git repo.

OpenShift CI (Prow / ci-operator) is the standard Red Hat CI infrastructure. The `aws-devfile` cluster profile provisions an ephemeral full OpenShift cluster on AWS for each run; it is already used by the devfile/registry and devfile/registry-operator repos, which share both the tooling pattern (`.ci/openshift_e2e.sh` executed from `src`) and the `aws-devfile` cluster profile.

The `openshift/release` config repository holds ci-operator YAML configs and generated Prow job YAMLs. Adding RHESS requires a new config directory `ci-operator/config/redhat-ai-dev/rhess/` and running `make update` to generate the Prow jobs.

## Goals / Non-Goals

**Goals:**
- Onboard `redhat-ai-dev/rhess` to OpenShift CI with a single variant (OCP 4.18) running on the `aws-devfile` cluster profile
- Build the RHESS container image from the root `Dockerfile` inside ci-operator
- Deploy the container to the ephemeral cluster using the existing `deploy/` Kubernetes manifests
- Validate the complete operational flow: startup → health probes → bundled examples → source registration → sync → catalog query → artifact download
- Verify admin auth enforcement (unauthenticated writes must be rejected)

**Non-Goals:**
- Multi-OCP-version matrix at initial onboarding — add variants later once the base job is stable
- UI/browser-based testing — HTTP API assertions are sufficient for the e2e gate
- Performance or load testing
- Prow rehearsal testing — manual `prow rehearse` is sufficient pre-merge

## Decisions

### 1. Root `Dockerfile`, not `.ci/Dockerfile`

**Decision**: Reference `dockerfile_path: Dockerfile` (repo root) in the ci-operator image config, not a separate `.ci/Dockerfile`.

**Rationale**: RHESS already has a production-quality multi-stage Dockerfile that builds TypeScript, compiles Vite assets, and produces a minimal UBI9 runtime image. Creating a parallel `.ci/Dockerfile` would duplicate the build definition. Using the root file means the CI image is identical to what gets shipped, which is what we want to validate.

**Alternatives considered**: Separate `.ci/Dockerfile` (used by devfile/registry) — unnecessary here because the root Dockerfile is already CI-friendly.

### 2. `from: src` for the test executor

**Decision**: Run the test step with `from: src`, which gives the test container access to the full repository source tree.

**Rationale**: The test script needs access to `deploy/` manifests to deploy RHESS and to `.ci/openshift_e2e.sh` itself. `src` is the standard ci-operator image representing the repository checkout. The `oc` binary is downloaded in-script (same pattern as devfile/registry), so no custom test image is needed.

**Alternatives considered**: A dedicated test image — overkill; `curl` and `oc` are the only test-time dependencies.

### 3. Image injected via `dependencies`

**Decision**: Declare the built RHESS image as a ci-operator `dependency` with `env: RHESS_IMAGE`. The test script reads `$RHESS_IMAGE` to patch the `Deployment` image reference before applying manifests.

**Rationale**: This is the standard ci-operator pattern for passing a just-built image into a test step. The env var contains the fully-resolved pullspec (registry + digest) of the image built in the same pipeline run.

**Implementation**: The test script patches the image using `oc set image deployment/rhess rhess=$RHESS_IMAGE -n $NAMESPACE` after the initial apply, or via `sed` before apply. Both work; `oc set image` is more idiomatic OpenShift.

### 4. `aws-devfile` cluster profile + `devfile-ci.com` base domain

**Decision**: Use `cluster_profile: aws-devfile` and `BASE_DOMAIN: devfile-ci.com`.

**Rationale**: The `aws-devfile` profile is already in use by the devfile org and is the natural fit for RHESS given its connection to the devfile/RHDH ecosystem. The base domain is preconfigured for this profile; Routes in the test cluster will resolve under `*.devfile-ci.com`.

**Alternatives considered**: `aws` profile (generic) — `aws-devfile` is preferred due to existing relationship and shorter queue times.

### 5. Single OCP 4.18 variant to start

**Decision**: Create a single `redhat-ai-dev-rhess-main.yaml` config (no variant suffix required for the baseline; a variant suffix like `__v4.18` is used only if multiple OCP versions coexist).

**Rationale**: Starting with one config minimizes onboarding complexity. The devfile/registry has separate per-variant files (`...__v4.16.yaml`, `...__v4.17.yaml`) because it tests against specific OCP versions. For RHESS, the OCP version matters only for cluster provisioning; the application itself is version-agnostic. One baseline config is sufficient initially.

**Alternatives considered**: Multiple OCP versions — premature; add when there is evidence of OCP-version-specific failures.

### 6. E2E test flow

**Decision**: The test script executes the following phases in a dedicated namespace:

1. **Setup**: Create namespace `rhess-e2e-<random>`, create `rhess-secret` (generated random admin token), create PVC
2. **Deploy**: Apply `deploy/` manifests with `RHESS_IMAGE` substituted; wait for pod `Ready`
3. **Get Route URL**: Extract the hostname from the created Route
4. **Assert: startup smoke**
   - `GET /healthz` → `{"status":"ok"}` (HTTP 200)
   - `GET /readyz` → HTTP 200
5. **Assert: bundled examples**
   - `GET /api/v1/skills` → non-empty `data` array (bundled examples loaded on first boot)
   - `GET /.well-known/agent-skills/index.json` → response contains `skills` array with at least one entry, each having `name`, `type`, `description`, `url`, `digest` fields
6. **Assert: auth enforcement**
   - `POST /api/v1/sources` without token → HTTP 401
   - `POST /api/v1/sources` with wrong token → HTTP 403
7. **Assert: source registration and sync**
   - `POST /api/v1/sources` with valid admin token, registering a known public skills repo
   - Poll `GET /api/v1/sources` or check sync report until source status is synced (or use sync response directly)
   - `GET /api/v1/skills` → `meta.total` increased from pre-registration baseline
   - `GET /api/v1/skills/search?q=<known-term>` → at least one result
8. **Assert: skill detail and artifact**
   - `GET /api/v1/skills/:source/:slug` for a known skill → `name`, `description`, `content` fields present
9. **Cleanup**: Delete namespace

**Rationale**: This sequence exercises all critical paths — container startup, auth model, discovery protocol, ingestion from a live Git source, and search — without requiring a browser or UI testing framework.

### 7. Test skill source

**Decision**: Register `github.com/redhat-ai-dev/rhess` itself as the test source slug `rhess-self`. The repo contains SKILL.md files under `.claude/skills/` that the ingestion engine will discover.

**Rationale**: Using the repo under test eliminates the need for a separate test fixture repo. The `.claude/skills/` files are already maintained as part of the repo and their existence is stable. No external test-only fixture repo to maintain.

**Alternatives considered**: A dedicated minimal test fixture repo — adds a separate repo to maintain with no benefit.

## Risks / Trade-offs

- **[Cluster provisioning time]** → `ipi-aws` takes ~30–40 min to provision. Test suite runtime is dominated by cluster setup, not the test itself. Mitigated by being consistent with the devfile org's existing practice.
- **[Route DNS propagation]** → The `devfile-ci.com` domain is pre-delegated for the `aws-devfile` profile; Routes should resolve immediately within the cluster. The test script uses the Route's internal cluster address (`oc get route`) rather than external DNS to avoid propagation delays.
- **[Self-registration of rhess repo as test source]** → If the repo moves or SKILL.md files are renamed, the sync step may return zero skills. Mitigated by asserting `count > baseline` (not a fixed number) and adding a descriptive failure message.
- **[Git access from cluster]** → The RHESS pod clones from GitHub over HTTPS. The `ipi-aws` cluster has outbound internet access; no proxy config is needed for public GitHub.
- **[release repo merge latency]** → CI config PRs to `openshift/release` require review from OpenShift CI team. This is process overhead, not a technical risk. Mitigated by following the onboarding checklist precisely.

## Open Questions

- Should the test script use `oc wait --for=condition=Ready` or a polling curl loop for pod readiness? The `oc wait` approach is cleaner but requires the `oc` binary to be available in `$PATH`; the curl poll is more portable. Given that `oc` is downloaded in-script, `oc wait` is preferred.
- What OCP version to specify in `releases.initial/latest` in the ci-operator config? Given the app is OCP-version-agnostic, use `4.18` to match the most recent devfile examples. Revisit when 4.19+ is available in the profile.
