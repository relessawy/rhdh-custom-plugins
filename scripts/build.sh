#!/usr/bin/env bash
# Reproducible local package build; never installs into a running RHDH.
set -euo pipefail
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
usage() {
  cat <<'HELP'
Usage: bash scripts/build.sh <plugin|all>
Plugins: jenkins-stage-progress, snyk-security, splunk-logs, jira-work-items, application-health, vault-health, servicenow-infrastructure, portal-appearance
Requires Node 24, npm and tar; Snyk and Splunk producer tests also require Python 3.
Installs locked build dependencies, tests, type-checks, exports, bundles,
packages and checks each backend archive with the real dynamic loader.
Outputs: artifacts/<plugin>/<version>/. Does not deploy, publish or use credentials.
Run one build command at a time per checkout. See docs/BUILDING.md.
HELP
}
case "${1:-}" in -h|--help) usage; exit 0;; esac
if [[ $# -ne 1 ]]; then usage >&2; exit 2; fi
case "$1" in
  all) PLUGINS=(jenkins-stage-progress snyk-security splunk-logs jira-work-items application-health vault-health servicenow-infrastructure portal-appearance);;
  jenkins-stage-progress|snyk-security|splunk-logs|jira-work-items|application-health|vault-health|servicenow-infrastructure|portal-appearance) PLUGINS=("$1");;
  *) usage >&2; exit 2;;
esac
for tool in node npm tar; do command -v "$tool" >/dev/null || { echo "Required tool missing: $tool" >&2; exit 2; }; done
[[ $(node -p 'process.versions.node.split(".")[0]') == 24 ]] || { echo 'Use Node 24 for the locked build toolchain.' >&2; exit 2; }
for plugin in "${PLUGINS[@]}"; do
  if [[ "$plugin" == snyk-security || "$plugin" == splunk-logs ]]; then command -v python3 >/dev/null || { echo 'Python 3 is required for producer tests.' >&2; exit 2; }; fi
done
cd "$ROOT"
# Atomic directory lock prevents concurrent npm ci operations in one checkout.
mkdir .build-lock 2>/dev/null || { echo 'Another build holds .build-lock. See docs/BUILDING.md before removing a stale lock.' >&2; exit 2; }
trap 'rmdir "$ROOT/.build-lock"' EXIT
echo 'Installing locked shared build dependencies…'
npm ci --legacy-peer-deps --ignore-scripts --no-fund --no-audit
for PLUGIN in "${PLUGINS[@]}"; do
  P="$ROOT/plugins/$PLUGIN"
  cd "$ROOT"
  echo "Testing and bundling $PLUGIN backend…"
  if [[ -d "$P/backend" ]]; then
    node --test "$P/backend/test/"*.test.cjs
    node scripts/build-backend.mjs "$PLUGIN"
  fi
  if [[ "$PLUGIN" == snyk-security ]]; then python3 -m unittest discover -s "$P/pipeline/test"; fi
  if [[ "$PLUGIN" == splunk-logs ]]; then python3 -m unittest discover -s "$P/ingestion/test"; fi
  cd "$P/frontend"
  echo "Testing and exporting $PLUGIN frontend…"
  npm ci --legacy-peer-deps --ignore-scripts --no-fund --no-audit
  npm run test --if-present
  npx --no-install tsc --noEmit
  npm run export
  cd "$ROOT"
  node scripts/package.mjs "$PLUGIN"
  node scripts/test-package.cjs "$PLUGIN"
  echo "PASS: $PLUGIN build, tests, packaging and dynamic-loader check."
done
