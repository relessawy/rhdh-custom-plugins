#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
PLUGIN=${1:?Usage: scripts/build.sh jenkins-stage-progress}
case "$PLUGIN" in jenkins-stage-progress) ;; *) echo 'Unknown plugin' >&2; exit 2;; esac
P="$ROOT/plugins/$PLUGIN"
node --test "$P/backend/test/"*.test.cjs
cd "$P/frontend"
npm ci --legacy-peer-deps --ignore-scripts --no-fund --no-audit
npm run export
node "$ROOT/scripts/package.mjs" "$PLUGIN"
