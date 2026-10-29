# MAE Math Core pipeline: prerequisites check

- Run 2, 2026-10-29. This follows the revised setup spec.
- Target repository: `mae-academy/mae-academy-v3`
- Base commit: `8594cba848712b2b0578e1974f1e1765b4959e6e`. Local `main`, `origin/main`, and `mae-academy-v3` `main` all point to it.
- Result: **STOPPED at P5**. Nothing has been pushed.

| Check | Result | Evidence |
|---|---|---|
| P1: plan committed to main | Prepared locally, not pushed | The plan was not on `main`, so branch `docs/plan-3.1` (commit `8cd2f86`) adds `MAEngine-Plan.md`. It is byte-identical to the owner's working copy (`cmp`). SHA-256: `bbe5a34c…dcc6`. No PR yet: the branch is not pushed and `gh` is unavailable. |
| P2: `DECISIONS.md` | Prepared locally, not pushed | Branch `docs/decisions` (commit `95bd366`) records D0 to D4 as owner-approved on 2026-10-29. D1 specs are pending owner input. |
| P3: `BUDGET.json` | Prepared locally, not pushed | It is on the same branch. `weekly_percent_used` and `estimate_percent_per_prompt` are null, so only calibration runs are allowed. |
| P4: default branch of v3 is `main` | PASS | `git ls-remote --symref https://github.com/mae-academy/mae-academy-v3.git HEAD` returns `ref: refs/heads/main`. |
| P5: Vercel production branch is `main` | **CANNOT VERIFY: STOP** | The Vercel CLI is not installed, there is no `.vercel/project.json`, and `vercel.json` has no `git` block. The Vercel dashboard needs a login. The GitHub API cannot be reached from this sandbox. Under Section 4, the pipeline stops and asks the owner. |
| P6: test branch gives a reachable `*.vercel.app` preview | NOT RUN | This needs a push. Pushing is held until P5 is confirmed, because if the production branch were not `main`, any pushed branch could deploy to production. |
| P7: `package.json` scripts | PASS with one fix pending | `check` = `tsc --noEmit`, `build`, and `audit:dist` are present. `test` = `vitest`, which runs in watch mode, so the gate will call `vitest run`. Whether to change the `test` script is part of the tooling proposal. `dev` and `preview` are recorded for reference only. Missing: lint, e2e (see Section 5.1). |

## Notes

- **Remote:** the local `origin` is `github.com/mae-academy/mae-academy`. Its branches and `main` match `mae-academy-v3` exactly, so the repository was most likely renamed. Before any push, the remote is re-pointed to `mae-academy-v3` and verified.
- **GitHub CLI:** `gh` is not installed and was not installed. PR creation stays disabled. Each PR is reported as a GitHub compare URL that the owner opens by hand.

## Owner action needed to continue

Confirm the Vercel production branch is `main`. Do one of these:

- sign in to Vercel in the Claude browser pane, so the pipeline can read Project → Settings → Git (read only), or
- confirm it in writing.
