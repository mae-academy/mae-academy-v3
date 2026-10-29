# MAE Math Core pipeline: prerequisites check

- Checked: 2026-10-29
- Base commit (main = origin/main): `8594cba848712b2b0578e1974f1e1765b4959e6e`
- Result: **FAILED**. The pipeline stopped. Task 0 (setup) was not started.

## Results

| Check | Result | Evidence |
|---|---|---|
| P1: plan on main, committed, version 3.1 or later | **FAIL** | `MAEngine-Plan.md` is in the local working tree, but it is untracked and not in `main` (`git cat-file -e main:MAEngine-Plan.md` fails). The version in the file is 3.1, but its header says "pending decisions D0 to D4". |
| P2: `docs/mathcore/DECISIONS.md`, D0 to D4 decided | **FAIL** | `docs/mathcore/` does not exist on `main`. The plan header says D0 to D4 are still pending. |
| P3: `docs/mathcore/BUDGET.json` with numeric `weekly_limit` > 0 | **FAIL** | The file does not exist. |
| P4: default branch is `main` | PASS | `git ls-remote --symref origin HEAD` returns `ref: refs/heads/main`. Remote: `github.com/mae-academy/mae-academy`. This is not `mae-academy-v3`, the repository the pipeline spec names. |
| P5: Vercel production branch is `main` | **UNVERIFIED** | The repository has no `.vercel/project.json`, and `vercel.json` has no `git` settings. The production branch is set in the Vercel dashboard, which this check cannot read. |
| P6: test branch gives a reachable `*.vercel.app` preview | **NOT RUN** | This needs a pushed test branch. The check stopped earlier, at P1 to P3, so nothing was pushed. |
| P7: `package.json` scripts | **FAIL** (partial) | See the mapping below. Scripts for `lint` and `e2e` are missing. |

## P7: scripts found in `package.json`

`dev`, `dev:server`, `build`, `start`, `preview`, `check`, `audit:dist`, `format`, `test`

| Category (Section 6) | Script | Status |
|---|---|---|
| typecheck | `check` (`tsc --noEmit`) | found |
| lint | none | **missing**. ESLint is not installed and there is no lint config. |
| test (unit) | `test` (`vitest`) | found. It starts in watch mode by default, so the gate needs `vitest run`. |
| build | `build` | found |
| audit (chunk sizes) | `audit:dist` | found |
| e2e (Playwright) | none | **missing**. `@playwright/test@^1.62.1` is installed, but there is no script and no `playwright.config.*`. |

Theme lint (gate step 3) has no script and no tokens-file path to check against. The golden corpus check (gate step 5) has no script either, and `shared/mathcore/` does not exist.

## Required human actions before a re-run

1. Commit `MAEngine-Plan.md` to `main`.
2. Decide D0 to D4 and commit `docs/mathcore/DECISIONS.md`.
3. Commit `docs/mathcore/BUDGET.json` with a real `weekly_limit`.
4. Confirm the target repository: `mae-academy/mae-academy` or `mae-academy-v3`.
5. Confirm in Vercel → Project Settings → Git that the production branch is `main`.
6. Add `lint` and `e2e` scripts, or approve names for them. The pipeline does not invent script names.
7. Name the design tokens file the theme lint should use.
