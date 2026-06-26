<!-- After each completed task, commit the changes. -->

## 1. E2E Test Script (rhess repo)

- [x] 1.1 Create `.ci/openshift_e2e.sh` with executable permissions: script skeleton with `set -euo pipefail`, `NAMESPACE=rhess-e2e`, `ADMIN_TOKEN=$(openssl rand -hex 16)`, and a `trap cleanup EXIT` function that deletes the namespace
- [x] 1.2 Implement the setup phase: create namespace, create `rhess-secret` Secret with the generated admin token, apply `deploy/` manifests via `kubectl apply -k deploy/ -n $NAMESPACE`
- [x] 1.3 Implement image substitution: `oc set image deployment/rhess rhess=$RHESS_IMAGE -n $NAMESPACE` using the ci-operator-injected `$RHESS_IMAGE` env var, then `oc rollout status deployment/rhess -n $NAMESPACE --timeout=5m`
- [x] 1.4 Implement Route URL extraction: `ROUTE_URL=https://$(oc get route rhess -n $NAMESPACE -o jsonpath='{.spec.host}')`, with a retry loop waiting for the Route to be admitted
- [x] 1.5 Implement gate checks (abort on failure): `GET /healthz` → HTTP 200 with `{"status":"ok"}`, `GET /readyz` → HTTP 200. Use `curl -sk --max-time 30` against `$ROUTE_URL`
- [x] 1.6 Implement assertion helper function: `assert_*` functions that record pass/fail results to a summary array instead of exiting, and a `report_results` function that prints the summary and exits non-zero if any assertion failed
- [x] 1.7 Implement bundled examples assertion: `GET /api/v1/skills` returns non-empty `items` array
- [x] 1.8 Implement `.well-known/` discovery assertion: `GET /.well-known/agent-skills/index.json` returns `skills` array where entries have `name`, `type`, `description`, `url`, `digest` fields
- [x] 1.9 Implement auth enforcement assertions: `POST /api/v1/sources` without token → 401, with wrong token → 403
- [x] 1.10 Implement source registration assertion: `POST /api/v1/sources` with valid token and `{"slug":"rhess-self","url":"https://github.com/redhat-ai-dev/rhess"}` → 201. Use `curl --max-time 120` for this call
- [x] 1.11 Implement post-sync assertions: `GET /api/v1/skills` total count > pre-registration baseline; `GET /api/v1/skills/search?q=openspec` returns at least one result
- [x] 1.12 Implement skill detail assertion: dynamically pick a skill slug from the list response for source `rhess-self`, then `GET /api/v1/skills/rhess-self/<slug>` → 200 with `name`, `description`, `content` fields
- [x] 1.13 Implement `report_results` at end of script: print pass/fail summary, exit non-zero if any assertion failed

## 2. OpenShift CI Configuration (openshift/release repo)

- [ ] 2.1 Create directory `ci-operator/config/redhat-ai-dev/rhess/` in the `openshift/release` repo (`~/git/release`)
- [ ] 2.2 Create `ci-operator/config/redhat-ai-dev/rhess/redhat-ai-dev-rhess-main.yaml`: `build_root` image stream tag, `images` building `rhess` from root `Dockerfile`, `releases` with OCP 4.18 `initial`/`latest` (with `include_built_images: true`), `resources`, and `tests` entry for `rhess-e2e` using `cluster_profile: aws-devfile`, `BASE_DOMAIN: devfile-ci.com`, `workflow: ipi-aws`, `from: src`, dependency `RHESS_IMAGE` → `rhess`, `optional: true`, commands invoking `.ci/openshift_e2e.sh`
- [ ] 2.3 Create `ci-operator/config/redhat-ai-dev/rhess/OWNERS` with `johnmcollier` as sole approver and reviewer
- [ ] 2.4 Run `make update` in the release repo to generate Prow job YAMLs under `ci-operator/jobs/redhat-ai-dev/rhess/`, verify generated files exist

## 3. Verification

- [ ] 3.1 Verify `.ci/openshift_e2e.sh` passes `shellcheck` with no errors
- [ ] 3.2 Verify the ci-operator config is valid by running `ci-operator-prowgen` or `make ci-operator-config` against the new config file (if tooling is available locally), or manually review against the devfile/registry config for structural correctness
- [ ] 3.3 Dry-run the test script locally (outside a cluster) to confirm it fails gracefully with a clear error about missing `$RHESS_IMAGE` or unreachable cluster, rather than silently succeeding
