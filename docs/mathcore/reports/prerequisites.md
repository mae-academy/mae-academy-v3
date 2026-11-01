# MAE Math Core pipeline: prerequisites check

- Run 3, 2026-10-29. This follows the revised setup spec.
- Target repository: `mae-academy/mae-academy-v3`. Local `origin` now points to it, and the remote was checked before any push.
- Base commit: `8594cba848712b2b0578e1974f1e1765b4959e6e`. It is unchanged on remote `main` after the pushes.
- Result: **STOPPED at P6**. Preview deployments need a Vercel login.

| Check | Result | Evidence |
|---|---|---|
| P1: plan committed to main | Branch pushed; PR awaits owner | `docs/plan-3.1` (commit `8cd2f86`) adds `MAEngine-Plan.md`, byte-identical to the owner's copy (`cmp`). PR not opened (`gh` unavailable). Compare URL: https://github.com/mae-academy/mae-academy-v3/compare/main...docs/plan-3.1?expand=1 |
| P2: `DECISIONS.md` | Branch pushed; PR awaits owner | `docs/decisions` (commit `95bd366`). D1 specs are pending owner input. Compare URL: https://github.com/mae-academy/mae-academy-v3/compare/main...docs/decisions?expand=1 |
| P3: `BUDGET.json` | Branch pushed | It is on `docs/decisions`. Both percentages are null, so only the two calibration runs are allowed. |
| P4: default branch is `main` | PASS | `git ls-remote --symref origin HEAD` returns `ref: refs/heads/main`. |
| P5: Vercel production branch is `main` | PASS | Vercel → mae-academy-v3 → Settings → Environments → Production → Branch Tracking says "Every commit pushed to the main branch will create a Production Deployment". Settings → Git shows the connected repository `mae-academy/mae-academy-v3`. Read only; nothing was changed. |
| P6: reachable `*.vercel.app` preview | **FAIL: not publicly reachable** | Pushing `docs/decisions` produced a deployment with Environment = Preview, Status = Ready, and "Assigning Custom Domains: Skipped". URLs: `mae-academy-v3-git-docs-decisions-mae-academy.vercel.app` and `mae-academy-v3-u6bio3999-mae-academy.vercel.app`. But Settings → Deployment Protection has **Vercel Authentication on ("Require Log In", Standard Protection)**, so anonymous requests (Playwright, `curl`) get a login wall. `docs/plan-3.1` was still building at check time. |
| P7: `package.json` scripts | PASS with caveats | `check` = `tsc --noEmit`, `test` = `vitest` (watch mode, so the gate passes `--run` and the tooling proposal changes it to `vitest run`), `build`, `audit:dist`. Information only: `dev`, `preview`. **Caveat:** `audit:dist` (`scripts/audit-dist.mjs`) is a leak scan for source maps, engine signatures, and secrets. It does not audit chunk sizes, so the plan's 80 KB engine-chunk budget (§6.2) has no check yet. |

## Owner decisions needed

1. **Preview access (P6).** Choose one; the pipeline must not change Vercel settings:
   - a. Recommended: in Deployment Protection → *Protection Bypass for Automation*, add a secret and provide it to the pipeline as the environment variable `VERCEL_AUTOMATION_BYPASS_SECRET`. Previews stay private, and browser tests send the `x-vercel-protection-bypass` header.
   - b. Turn off Vercel Authentication for previews. Previews become public.
2. **Prompt ids.** The spec asks for ids `a-1` to `s-3`, one per weekly step of PLAN.md §10. §10 has 12 phases (0 to 11) totalling 36 weeks. One letter per phase with one number per week ends at `l-3`, not `s-3`, and no grouping found in the plan yields 19 letters (`a` to `s`). The owner needs to give the mapping.
3. **Deferred phases.** D2 defers Phase 8 and D3 defers Phase 5 and the 3D parts of Phase 9. Should prompt files exist for them, either marked deferred or skipped by the scheduler, or be left out?
4. **Design tokens file** for the theme lint. There is no dedicated tokens file. Candidate: `client/src/index.css` (`@theme inline`, `:root`, `.dark` variables). Needs confirmation.
5. **Chunk-size audit.** Approve adding a chunk-size check to the tooling proposal, since `audit:dist` does not cover it.
