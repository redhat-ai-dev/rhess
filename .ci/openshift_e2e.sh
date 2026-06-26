#!/usr/bin/env bash
set -euo pipefail

NAMESPACE="rhess-e2e"
ADMIN_TOKEN="$(openssl rand -hex 16)"
RESULTS=()
FAILURES=0

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

info()  { echo "==> $*"; }
error() { echo "ERROR: $*" >&2; }

cleanup() {
  info "Cleaning up namespace ${NAMESPACE}"
  oc delete namespace "${NAMESPACE}" --ignore-not-found --wait=false || true
}
trap cleanup EXIT

record_result() {
  local name="$1" status="$2"
  RESULTS+=("${status}  ${name}")
  if [[ "${status}" == "FAIL" ]]; then
    FAILURES=$((FAILURES + 1))
  fi
}

assert_http_code() {
  local label="$1" expected_code="$2" actual_code="$3"
  if [[ "${actual_code}" == "${expected_code}" ]]; then
    info "PASS: ${label} (HTTP ${actual_code})"
    record_result "${label}" "PASS"
  else
    error "FAIL: ${label} — expected HTTP ${expected_code}, got ${actual_code}"
    record_result "${label}" "FAIL"
  fi
}

assert_json_field() {
  local label="$1" json="$2" field="$3"
  if echo "${json}" | jq -e "${field}" > /dev/null 2>&1; then
    info "PASS: ${label}"
    record_result "${label}" "PASS"
  else
    error "FAIL: ${label} — field '${field}' missing or invalid"
    record_result "${label}" "FAIL"
  fi
}

report_results() {
  echo ""
  echo "========================================"
  echo "  E2E Test Results"
  echo "========================================"
  for result in "${RESULTS[@]}"; do
    echo "  ${result}"
  done
  echo "========================================"
  echo "  Total: ${#RESULTS[@]}  Passed: $(( ${#RESULTS[@]} - FAILURES ))  Failed: ${FAILURES}"
  echo "========================================"
  echo ""
  if [[ ${FAILURES} -gt 0 ]]; then
    error "${FAILURES} assertion(s) failed"
    return 1
  fi
  info "All assertions passed"
  return 0
}

wait_for_route() {
  local retries=30
  local route_host=""
  for (( i=1; i<=retries; i++ )); do
    route_host="$(oc get route rhess -n "${NAMESPACE}" -o jsonpath='{.spec.host}' 2>/dev/null || true)"
    if [[ -n "${route_host}" ]]; then
      echo "${route_host}"
      return 0
    fi
    info "Waiting for Route to be admitted (${i}/${retries})..."
    sleep 5
  done
  error "Route was not admitted within timeout"
  return 1
}

wait_for_url() {
  local url="$1"
  local retries=24
  for (( i=1; i<=retries; i++ )); do
    local code
    code="$(curl -sk -o /dev/null -w '%{http_code}' --max-time 10 "${url}" 2>/dev/null || echo "000")"
    if [[ "${code}" != "000" ]]; then
      return 0
    fi
    info "Waiting for ${url} to become reachable (${i}/${retries})..."
    sleep 5
  done
  error "URL ${url} did not become reachable within timeout"
  return 1
}

# ---------------------------------------------------------------------------
# Pre-flight
# ---------------------------------------------------------------------------

if [[ -z "${RHESS_IMAGE:-}" ]]; then
  error "RHESS_IMAGE environment variable is not set. This script must be run inside ci-operator."
  exit 1
fi

info "RHESS_IMAGE=${RHESS_IMAGE}"
info "NAMESPACE=${NAMESPACE}"

# ---------------------------------------------------------------------------
# Gate: Setup — namespace, secret, deploy, image substitution
# ---------------------------------------------------------------------------

info "Creating namespace ${NAMESPACE}"
oc create namespace "${NAMESPACE}"

info "Creating admin token secret"
oc create secret generic rhess-secret \
  --from-literal=admin-token="${ADMIN_TOKEN}" \
  -n "${NAMESPACE}"

info "Applying deploy/ manifests"
oc apply -k deploy/ -n "${NAMESPACE}"

info "Substituting RHESS_IMAGE in deployment"
oc set image deployment/rhess rhess="${RHESS_IMAGE}" -n "${NAMESPACE}"

info "Waiting for deployment rollout (timeout: 5m)"
oc rollout status deployment/rhess -n "${NAMESPACE}" --timeout=5m

info "Waiting for pod to be Ready"
oc wait --for=condition=Ready pod -l app=rhess -n "${NAMESPACE}" --timeout=5m

# ---------------------------------------------------------------------------
# Gate: Route + connectivity
# ---------------------------------------------------------------------------

info "Extracting Route URL"
ROUTE_HOST="$(wait_for_route)"
ROUTE_URL="https://${ROUTE_HOST}"
info "Route URL: ${ROUTE_URL}"

info "Waiting for Route to become reachable"
wait_for_url "${ROUTE_URL}/healthz"

# ---------------------------------------------------------------------------
# Gate: Health probes
# ---------------------------------------------------------------------------

info "Checking /healthz"
HEALTH_BODY="$(curl -sk --max-time 30 "${ROUTE_URL}/healthz")"
HEALTH_CODE="$(curl -sk -o /dev/null -w '%{http_code}' --max-time 30 "${ROUTE_URL}/healthz")"

if [[ "${HEALTH_CODE}" != "200" ]]; then
  error "GATE FAILED: /healthz returned HTTP ${HEALTH_CODE}, expected 200"
  exit 1
fi
if ! echo "${HEALTH_BODY}" | jq -e '.status == "ok"' > /dev/null 2>&1; then
  error "GATE FAILED: /healthz body did not contain {\"status\":\"ok\"}"
  echo "Body: ${HEALTH_BODY}"
  exit 1
fi
info "GATE PASS: /healthz — HTTP 200, status=ok"

READY_CODE="$(curl -sk -o /dev/null -w '%{http_code}' --max-time 30 "${ROUTE_URL}/readyz")"
if [[ "${READY_CODE}" != "200" ]]; then
  error "GATE FAILED: /readyz returned HTTP ${READY_CODE}, expected 200"
  exit 1
fi
info "GATE PASS: /readyz — HTTP 200"

# ---------------------------------------------------------------------------
# Assertions (collect and report)
# ---------------------------------------------------------------------------

# --- Bundled examples on first boot ---
info "Checking bundled example skills"
SKILLS_BODY="$(curl -sk --max-time 30 "${ROUTE_URL}/api/v1/skills")"
SKILLS_COUNT="$(echo "${SKILLS_BODY}" | jq -r '.data | length' 2>/dev/null || echo "0")"
if [[ "${SKILLS_COUNT}" -gt 0 ]]; then
  info "PASS: Bundled examples present (${SKILLS_COUNT} skills)"
  record_result "bundled-examples" "PASS"
else
  error "FAIL: Bundled examples — expected non-empty data array"
  record_result "bundled-examples" "FAIL"
fi

BASELINE_TOTAL="$(echo "${SKILLS_BODY}" | jq -r '.meta.total' 2>/dev/null || echo "0")"

# --- .well-known discovery endpoint ---
info "Checking /.well-known/agent-skills/index.json"
WELLKNOWN_BODY="$(curl -sk --max-time 30 "${ROUTE_URL}/.well-known/agent-skills/index.json")"
WELLKNOWN_CODE="$(curl -sk -o /dev/null -w '%{http_code}' --max-time 30 "${ROUTE_URL}/.well-known/agent-skills/index.json")"
assert_http_code "well-known-http-200" "200" "${WELLKNOWN_CODE}"

WELLKNOWN_VALID="true"
for field in name type description url digest; do
  if ! echo "${WELLKNOWN_BODY}" | jq -e ".skills[0].${field}" > /dev/null 2>&1; then
    WELLKNOWN_VALID="false"
    break
  fi
done
if [[ "${WELLKNOWN_VALID}" == "true" ]]; then
  info "PASS: .well-known schema has all required fields"
  record_result "well-known-schema" "PASS"
else
  error "FAIL: .well-known schema — missing one or more of: name, type, description, url, digest"
  record_result "well-known-schema" "FAIL"
fi

# --- Auth enforcement ---
info "Checking auth enforcement"
AUTH_NO_TOKEN="$(curl -sk -o /dev/null -w '%{http_code}' --max-time 30 \
  -X POST -H 'Content-Type: application/json' \
  -d '{"slug":"auth-test","url":"https://example.com/repo.git"}' \
  "${ROUTE_URL}/api/v1/sources")"
assert_http_code "auth-missing-token-401" "401" "${AUTH_NO_TOKEN}"

AUTH_WRONG_TOKEN="$(curl -sk -o /dev/null -w '%{http_code}' --max-time 30 \
  -X POST -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer wrong-token' \
  -d '{"slug":"auth-test","url":"https://example.com/repo.git"}' \
  "${ROUTE_URL}/api/v1/sources")"
assert_http_code "auth-wrong-token-403" "403" "${AUTH_WRONG_TOKEN}"

# --- Source registration + sync ---
info "Registering rhess-self source (this may take a while — cloning + ingesting)"
REG_RESPONSE="$(curl -sk --max-time 120 -w '\n%{http_code}' \
  -X POST -H 'Content-Type: application/json' \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -d '{"slug":"rhess-self","url":"https://github.com/redhat-ai-dev/rhess"}' \
  "${ROUTE_URL}/api/v1/sources")"
REG_CODE="$(echo "${REG_RESPONSE}" | tail -1)"
assert_http_code "source-registration-201" "201" "${REG_CODE}"

# --- Post-sync: skills count increased ---
info "Checking skills count after sync"
POST_SYNC_BODY="$(curl -sk --max-time 30 "${ROUTE_URL}/api/v1/skills")"
POST_SYNC_TOTAL="$(echo "${POST_SYNC_BODY}" | jq -r '.meta.total' 2>/dev/null || echo "0")"
if [[ "${POST_SYNC_TOTAL}" -gt "${BASELINE_TOTAL}" ]]; then
  info "PASS: Skills count increased (${BASELINE_TOTAL} → ${POST_SYNC_TOTAL})"
  record_result "skills-count-increased" "PASS"
else
  error "FAIL: Skills count did not increase (baseline=${BASELINE_TOTAL}, current=${POST_SYNC_TOTAL})"
  record_result "skills-count-increased" "FAIL"
fi

# --- Search ---
info "Checking search"
SEARCH_BODY="$(curl -sk --max-time 30 "${ROUTE_URL}/api/v1/skills/search?q=openspec")"
SEARCH_COUNT="$(echo "${SEARCH_BODY}" | jq -r '.data | length' 2>/dev/null || echo "0")"
if [[ "${SEARCH_COUNT}" -gt 0 ]]; then
  info "PASS: Search returned ${SEARCH_COUNT} result(s)"
  record_result "search-results" "PASS"
else
  error "FAIL: Search for 'openspec' returned no results"
  record_result "search-results" "FAIL"
fi

# --- Skill detail (dynamic slug) ---
info "Checking skill detail retrieval"
SKILL_SLUG="$(echo "${POST_SYNC_BODY}" | jq -r '[.data[] | select(.source == "rhess-self")][0].slug' 2>/dev/null || echo "")"
if [[ -z "${SKILL_SLUG}" ]]; then
  error "FAIL: Could not find any skill with source 'rhess-self' to test detail endpoint"
  record_result "skill-detail" "FAIL"
else
  DETAIL_RESPONSE="$(curl -sk --max-time 30 -w '\n%{http_code}' \
    "${ROUTE_URL}/api/v1/skills/rhess-self/${SKILL_SLUG}")"
  DETAIL_CODE="$(echo "${DETAIL_RESPONSE}" | tail -1)"
  DETAIL_BODY="$(echo "${DETAIL_RESPONSE}" | sed '$d')"
  assert_http_code "skill-detail-200" "200" "${DETAIL_CODE}"

  DETAIL_VALID="true"
  for field in name description content; do
    if ! echo "${DETAIL_BODY}" | jq -e ".${field}" > /dev/null 2>&1; then
      DETAIL_VALID="false"
      break
    fi
  done
  if [[ "${DETAIL_VALID}" == "true" ]]; then
    info "PASS: Skill detail has name, description, content"
    record_result "skill-detail-fields" "PASS"
  else
    error "FAIL: Skill detail missing one or more of: name, description, content"
    record_result "skill-detail-fields" "FAIL"
  fi
fi

# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------

report_results
