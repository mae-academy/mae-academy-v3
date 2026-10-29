#!/usr/bin/env bash
# Mathcore orchestrator: runs one prompt end to end and stops before any merge.
#   usage: scripts/mathcore/run-prompt.sh <id>      (ids a-1 .. l-3, or zz-test for the V1 dry run)
#
# Exit codes: 0 branch pushed and report written, 1 safety or setup error, 2 deferred (budget or prompt status),
#             3 blocked after two gate failures, 4 preview unreachable.
#
# Safety: works in its own temporary worktree cut from origin/main, pushes only mathcore/<id> to mae-academy-v3,
# never touches main, never merges, never deletes branches, never calls Vercel. Secrets come only from the
# environment (VERCEL_AUTOMATION_BYPASS_SECRET, GH_TOKEN, AGENTPHONE_API_KEY) and are never written or echoed.
#
# Optional environment:
#   MATHCORE_EXECUTOR      command that reads the executor prompt on stdin (default: claude -p, edits only)
#   MATHCORE_REVIEWER      command that reads the reviewer input on stdin (default: claude -p, no edit tools)
#   MATHCORE_NODE_MODULES  path to an existing node_modules to symlink instead of running pnpm install
#   MATHCORE_PIN_DNS=1     resolve the preview host with dig and pin it in curl (local machines with DNS filtering)
set -uo pipefail

ID="${1:?usage: run-prompt.sh <id>}"
EXPECTED_REMOTE="https://github.com/mae-academy/mae-academy-v3.git"
PREVIEW_HOST_SUFFIX="-mae-academy.vercel.app"
BRANCH="mathcore/$ID"
SRC_ROOT="$(git rev-parse --show-toplevel)"
STAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

die() { echo "run-prompt: STOP: $*" >&2; exit "${2:-1}"; }

# --- guards -------------------------------------------------------------------------------------------------------
[[ "$ID" =~ ^([a-l]-[1-4]|zz-test)$ ]] || die "invalid id '$ID'"
DRY_RUN=false; [ "$ID" = zz-test ] && DRY_RUN=true
remote="$(git -C "$SRC_ROOT" remote get-url --push origin)"
[ "$remote" = "$EXPECTED_REMOTE" ] || die "origin push URL is '$remote', expected $EXPECTED_REMOTE"
case "$BRANCH" in mathcore/*) ;; *) die "refusing to work on branch $BRANCH" ;; esac

# Pipeline files are copied out first so the run uses this checkout's scripts and prompts, whatever main contains.
PIPE="$(mktemp -d)"
cp -R "$SRC_ROOT/scripts/mathcore/." "$PIPE/"
PROMPT_SRC="$SRC_ROOT/docs/mathcore/prompts/$ID.md"
if ! $DRY_RUN; then
  [ -f "$PROMPT_SRC" ] || die "prompt file $PROMPT_SRC not found"
  cp "$PROMPT_SRC" "$PIPE/prompt.md"
  grep -q '^- Status: deferred' "$PIPE/prompt.md" && die "prompt $ID is marked deferred (DECISIONS.md D2/D3)" 2
fi

git -C "$SRC_ROOT" fetch --quiet origin main || die "cannot fetch origin/main"
git -C "$SRC_ROOT" show-ref --quiet "refs/heads/$BRANCH" && die "local branch $BRANCH already exists; a human must resolve it"
git -C "$SRC_ROOT" ls-remote --exit-code --heads origin "$BRANCH" >/dev/null && die "remote branch $BRANCH already exists (PR may be open: waiting for human review)"

WT="$(mktemp -d)/mathcore-$ID"
git -C "$SRC_ROOT" worktree add --quiet -b "$BRANCH" "$WT" origin/main || die "cannot create worktree"
cd "$WT" || die "cannot enter worktree"
BASE_SHA="$(git rev-parse origin/main)"
mkdir -p docs/mathcore/reports
LOG=docs/mathcore/reports/decisions-log.md
REPORT=docs/mathcore/reports/$ID.md
[ -f "$LOG" ] || printf '# Mathcore decisions log\n\n| Timestamp (UTC) | Prompt | Decision | Reason |\n|---|---|---|---|\n' > "$LOG"

decide() { printf '| %s | %s | %s | %s |\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$ID" "$1" "$2" >> "$LOG"; echo "decision: $1 ($2)"; }

budget_file() { [ -f docs/mathcore/BUDGET.json ] && echo docs/mathcore/BUDGET.json || echo "$SRC_ROOT/docs/mathcore/BUDGET.json"; }

notify() {
  # Template names only (docs/mathcore/templates/notify.md). Sending is not wired until AgentPhone is approved
  # and notifications_enabled is true; until then every event is logged and nothing is sent.
  local template="$1" enabled
  enabled="$(node -e "try{console.log(require('$(budget_file)').notifications_enabled===true)}catch{console.log(false)}")"
  if [ "$enabled" != true ] || [ -z "${AGENTPHONE_API_KEY:-}" ]; then
    decide "notification $template not sent" "notifications disabled or AGENTPHONE_API_KEY missing"
  else
    decide "notification $template not sent" "sender not installed (Section 10.1 pending)"
  fi
}

if [ -n "${MATHCORE_NODE_MODULES:-}" ]; then
  ln -s "$MATHCORE_NODE_MODULES" node_modules
else
  pnpm install --frozen-lockfile >/dev/null || die "pnpm install failed"
fi

# --- 1. budget guard ----------------------------------------------------------------------------------------------
BUDGET_JSON="$(MATHCORE_BUDGET="$(budget_file)" pnpm exec tsx "$PIPE/budget-guard.ts" check "$ID")"
BUDGET_EXIT=$?
echo "budget: $BUDGET_JSON"
if [ $BUDGET_EXIT -ne 0 ]; then
  if $DRY_RUN; then
    decide "budget guard verdict ignored" "dry run zz-test does not consume budget; verdict was $BUDGET_JSON"
  else
    decide "deferred" "$BUDGET_JSON"
    notify budget_deferred
    die "budget guard deferred $ID" 2
  fi
fi

# --- 2/3. executor ------------------------------------------------------------------------------------------------
run_executor() {
  local extra="${1:-}"
  {
    echo "You are the executor for mathcore prompt $ID. Work only in this repository, on the current branch."
    echo "Do not commit, push, merge, deploy, or install dependencies. Edit only the files the prompt allows."
    echo "If anything is ambiguous, write your question to docs/mathcore/reports/$ID-questions.md and stop."
    echo
    cat "$PIPE/prompt.md"
    [ -n "$extra" ] && printf '\n\n## Repair round\n\nThe gate failed. Fix only what this output shows:\n\n```\n%s\n```\n' "$extra"
  } | if [ -n "${MATHCORE_EXECUTOR:-}" ]; then bash -c "$MATHCORE_EXECUTOR"; else
    claude -p --permission-mode acceptEdits --disallowedTools "Bash(git push:*)" "Bash(git commit:*)" "Bash(vercel:*)" "Bash(pnpm add:*)" "Bash(npm install:*)"
  fi
}

if $DRY_RUN; then
  printf 'zz-test dry run created at %s from %s\n' "$STAMP" "$BASE_SHA" > docs/mathcore/reports/zz-test.txt
  decide "executor replaced by dry run" "V1 creates exactly one file"
else
  run_executor || decide "executor exited non-zero" "continuing to the gate, which decides"
fi

# --- 4. gate, one repair round ------------------------------------------------------------------------------------
GATE_RESULT=""
for attempt in 1 2; do
  bash "$PIPE/gate.sh" origin/main > "$PIPE/gate-$attempt.log" 2>&1
  GATE_RC=$?
  GATE_RESULT="$(grep 'GATE RESULT' "$PIPE/gate-$attempt.log" | tail -1)"
  echo "gate attempt $attempt: $GATE_RESULT"
  [ $GATE_RC -eq 0 ] && break
  decide "gate failed (attempt $attempt of 2)" "$GATE_RESULT"
  notify prompt_failed
  if [ "$attempt" -eq 1 ] && ! $DRY_RUN; then
    run_executor "$(tail -60 "$PIPE/gate-$attempt.log")"
  else
    break
  fi
done

STATUS=passed
if [ $GATE_RC -ne 0 ]; then
  STATUS=blocked
  # Report-only branch: keep the failed work as a patch, drop it from the tree.
  git add -A && git diff --cached "$BASE_SHA" -- . ':!docs/mathcore/reports' > "docs/mathcore/reports/$ID-failed.patch"
  git reset --quiet && git checkout --quiet -- . && git clean -fdq -e docs/mathcore/reports
  decide "blocked" "two gate failures; schedule stops until a human unblocks $ID"
  notify prompt_blocked
fi

# --- 5. reviewer --------------------------------------------------------------------------------------------------
REVIEW="Not run."
if $DRY_RUN; then
  REVIEW="Not run: zz-test dry run has no spec."
elif [ "$STATUS" = passed ]; then
  git add -A
  REVIEW="$({
    cat "$PIPE/review-prompt.md"; echo
    node "$PIPE/spec-sections.mjs" "$PIPE/prompt.md" docs/mathcore/PLAN.md; echo
    echo "## DIFF"; echo; git diff --cached "$BASE_SHA"
  } | if [ -n "${MATHCORE_REVIEWER:-}" ]; then bash -c "$MATHCORE_REVIEWER"; else
    claude -p --disallowedTools Edit Write NotebookEdit Bash
  fi)" || REVIEW="Reviewer failed to run."
fi

# --- 8 (first push). The preview only exists once the branch is pushed -------------------------------------------
git add -A
git commit --quiet -m "mathcore($ID): ${STATUS} run ${STAMP}" || die "nothing to commit"
[ "$(git rev-parse --abbrev-ref HEAD)" = "$BRANCH" ] || die "HEAD is not $BRANCH"
git push --quiet origin "refs/heads/$BRANCH:refs/heads/$BRANCH" || die "push of $BRANCH failed"
decide "pushed $BRANCH before browser tests" "a Vercel preview exists only after a push"

# --- 6. preview URL and browser tests ----------------------------------------------------------------------------
SLUG="$(printf '%s' "$BRANCH" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g')"
PREVIEW_URL="https://mae-academy-v3-git-${SLUG}${PREVIEW_HOST_SUFFIX}"
case "$PREVIEW_URL" in *maeacademy.org*) die "preview URL points at production domain" ;; esac
PREVIEW_STATUS="unreachable"
if [ -z "${VERCEL_AUTOMATION_BYPASS_SECRET:-}" ]; then
  PREVIEW_STATUS="unreachable: VERCEL_AUTOMATION_BYPASS_SECRET not set"
else
  PREVIEW_HOST="${PREVIEW_URL#https://}"
  for _ in $(seq 1 40); do
    # MATHCORE_PIN_DNS=1: for machines whose system resolver blocks *.vercel.app; pins the IP from dig.
    pin=(); [ "${MATHCORE_PIN_DNS:-}" = 1 ] && ip="$(dig +short "$PREVIEW_HOST" | grep -E '^[0-9.]+$' | head -1)" && [ -n "$ip" ] && pin=(--resolve "$PREVIEW_HOST:443:$ip")
    code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 ${pin[@]+"${pin[@]}"} -H "x-vercel-protection-bypass: $VERCEL_AUTOMATION_BYPASS_SECRET" "$PREVIEW_URL/")"
    [ "$code" = 200 ] && PREVIEW_STATUS="reachable (HTTP 200)" && break
    sleep 15
  done
fi

BROWSER="Not run."
if [[ "$PREVIEW_STATUS" == reachable* ]]; then
  if node -e "process.exit(require('./package.json').scripts?.e2e ? 0 : 1)"; then
    PLAYWRIGHT_BASE_URL="$PREVIEW_URL" pnpm run e2e > "$PIPE/e2e.log" 2>&1 && BROWSER="Passed." || BROWSER="Failed. See e2e output below."
  else
    BROWSER="Not run: no e2e script (Playwright awaiting tooling approval)."
  fi
  ls docs/mathcore/baselines/*.png >/dev/null 2>&1 || BROWSER="$BROWSER Screenshots: no baseline."
fi

# --- 7. report ----------------------------------------------------------------------------------------------------
{
  echo "# Mathcore run: $ID"; echo
  echo "- Started: $STAMP"
  echo "- Base: \`$BASE_SHA\` (origin/main)"
  echo "- Status: **$STATUS**"
  echo "- Preview URL: $PREVIEW_URL ($PREVIEW_STATUS)"
  echo "- Budget guard: \`$BUDGET_JSON\`"
  echo "- Usage: the owner enters weekly_percent_after in docs/mathcore/usage.json; the pipeline never estimates it."
  echo; echo "## Gate"; echo; echo "$GATE_RESULT"; echo
  for f in "$PIPE"/gate-*.log; do echo '```'; tail -40 "$f"; echo '```'; done
  echo; echo "## Review"; echo; echo "$REVIEW"
  echo; echo "## Browser tests"; echo; echo "$BROWSER"
  [ -f "$PIPE/e2e.log" ] && { echo '```'; tail -40 "$PIPE/e2e.log"; echo '```'; }
  echo; echo "## Open questions"; echo
  if [ -f "docs/mathcore/reports/$ID-questions.md" ]; then cat "docs/mathcore/reports/$ID-questions.md"; else echo "None."; fi
} > "$REPORT"

$DRY_RUN || MATHCORE_BUDGET="$(budget_file)" pnpm exec tsx "$PIPE/budget-guard.ts" record "$ID" "$STATUS" >/dev/null

# --- 9 (decision). Pull requests stay disabled until gh is authorized (Section 5.3) -------------------------------
COMPARE="https://github.com/mae-academy/mae-academy-v3/compare/main...$BRANCH?expand=1"
OPEN_PR=false
if [[ "$PREVIEW_STATUS" != reachable* ]]; then
  decide "no PR" "preview $PREVIEW_STATUS"
elif $DRY_RUN; then
  decide "no PR" "zz-test dry run"
elif command -v gh >/dev/null && [ -n "${GH_TOKEN:-}" ]; then
  OPEN_PR=true
else
  decide "PR step disabled" "gh not installed or GH_TOKEN not set; compare URL: $COMPARE"
fi
[ "$STATUS" = passed ] && ! $DRY_RUN && notify prompt_passed

# --- 8. commit and push the report and log ------------------------------------------------------------------------
git add -A
git commit --quiet -m "mathcore($ID): report" && git push --quiet origin "refs/heads/$BRANCH:refs/heads/$BRANCH" || die "report push failed"

if $OPEN_PR; then
  gh pr create --repo mae-academy/mae-academy-v3 --base main --head "$BRANCH" --label needs-human-review \
    --title "mathcore($ID): $STATUS" --body "Preview: $PREVIEW_URL"$'\n\n'"Report: $REPORT" || echo "run-prompt: PR creation failed" >&2
fi

cd "$SRC_ROOT" && git worktree remove --force "$WT"
echo "branch: $BRANCH  status: $STATUS  preview: $PREVIEW_URL ($PREVIEW_STATUS)  compare: $COMPARE"
[[ "$PREVIEW_STATUS" != reachable* ]] && exit 4
[ "$STATUS" = blocked ] && exit 3
exit 0
