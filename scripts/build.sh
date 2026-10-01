#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
PLUGIN=${1:?Usage: scripts/build.sh jenkins-stage-progress|snyk-security}
case "$PLUGIN" in jenkins-stage-progress|snyk-security) ;; *) echo 'Unknown plugin' >&2; exit 2;; esac
P="$ROOT/plugins/$PLUGIN"
cd "$ROOT"
npm ci --legacy-peer-deps --ignore-scripts --no-fund --no-audit
node --test "$P/backend/test/"*.test.cjs
if [[ "$PLUGIN" == snyk-security ]]; then python3 -m unittest discover -s "$P/pipeline/test"; fi
node scripts/build-backend.mjs "$PLUGIN"
cd "$P/frontend"
npm ci --legacy-peer-deps --ignore-scripts --no-fund --no-audit
npm run test --if-present
npx --no-install tsc --noEmit
npm run export
cd "$ROOT"
node scripts/package.mjs "$PLUGIN"
node scripts/test-package.cjs "$PLUGIN"
