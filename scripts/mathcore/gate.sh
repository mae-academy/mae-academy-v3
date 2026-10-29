#!/usr/bin/env bash
# Mathcore gate. Runs in order and stops at the first failure.
# Script names are the ones found in package.json (prerequisite P7); none are invented.
# A step whose tooling is still awaiting owner approval is reported as SKIPPED, never as a pass.
#   usage: scripts/mathcore/gate.sh [base-ref]   (base-ref defaults to origin/main; used by the golden check)
set -uo pipefail

BASE="${1:-origin/main}"
PATHS=(shared/mathcore client/src/features/mathcore)
GOLDEN=shared/mathcore/__golden__

has_script() { node -e "process.exit(require('./package.json').scripts?.['$1'] ? 0 : 1)"; }

step() {
  local name="$1"; shift
  echo "== gate: $name"
  if "$@"; then echo "   PASS $name"; else echo "   FAIL $name"; echo "GATE RESULT: FAIL at $name"; exit 1; fi
}

SKIPPED=0
skip() { echo "== gate: $1"; echo "   SKIPPED $1 ($2)"; SKIPPED=$((SKIPPED + 1)); }

golden_unchanged() {
  # Read-only check: golden files must match the base branch and have no untracked additions.
  git diff --quiet "$BASE" -- "$GOLDEN" && [ -z "$(git status --porcelain -- "$GOLDEN")" ]
}

step "1 typecheck (check)" pnpm run check

if has_script lint; then
  step "2 lint (lint, mathcore paths)" pnpm run lint "${PATHS[@]}"
else
  skip "2 lint" "no lint script; awaiting tooling approval"
fi

step "3 theme lint" node "$(dirname "$0")/theme-lint.mjs"

# `test` is plain `vitest` (watch mode); --run forces a single run until the script is changed to `vitest run`.
step "4 unit tests (test)" pnpm run test --run --passWithNoTests "${PATHS[@]}"

step "5 golden corpus (read-only)" golden_unchanged

step "6a build (build)" pnpm run build
step "6b leak audit (audit:dist)" pnpm run audit:dist
if has_script audit:chunks; then
  step "6c chunk-size audit (audit:chunks)" pnpm run audit:chunks
else
  skip "6c chunk-size audit" "no audit:chunks script; awaiting tooling approval"
fi

if [ "$SKIPPED" -gt 0 ]; then echo "GATE RESULT: PASS WITH $SKIPPED SKIPPED STEP(S)"; else echo "GATE RESULT: PASS"; fi
