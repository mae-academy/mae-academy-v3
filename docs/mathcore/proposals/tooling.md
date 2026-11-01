# Tooling proposal: lint, e2e, chunk-size audit

Status: **approved**. Lint (ESLint 10.13.0 and plugins) and the chunk-size audit are installed on `automation/setup`. `e2e` and the `test: vitest run` change are not installed yet.

> **ESLint upgraded to 10 (owner-approved, before Phase 1).** ESLint 9.39.5 was installed first and is end-of-life upstream; `eslint` moved to 10.13.0 and `@eslint/js` to 10.0.1. `typescript-eslint` 8.72.1 (peer `eslint ^8.57.0 || ^9.0.0 || ^10.0.0`) and `eslint-plugin-react-hooks` 7.1.1 (peer includes `^10.0.0`) are unchanged and verified against ESLint 10.

## Packages

| Package | Version (exact pin) | Why |
|---|---|---|
| `eslint` | 10.13.0 (installed) | Gate step 2: lint restricted to mathcore paths. No linter exists in the repo today. |
| `@eslint/js` | 10.0.1 (installed) | Recommended JS rules for the flat config. |
| `typescript-eslint` | 8.72.1 (installed) | Type-aware rules for `.ts`/`.tsx`. |
| `eslint-plugin-react-hooks` | 7.1.1 (installed) | Hook rules for `client/src/features/mathcore/ui/`. |
| `@playwright/test` | 1.62.1 (already installed) | Section 7 browser tests against the preview URL. Installed but unused: no config or script. Needs only `pnpm exec playwright install chromium` in the cloud environment. |

"To confirm": the npm registry could not be reached from the setup sandbox, so these versions could not be checked against the registry. At install time the pipeline pins the newest patch of the major version shown (ESLint 9, typescript-eslint 8, react-hooks 7) and writes the resolved version here before committing. If the newest version is a new major, it stops and asks.

The chunk-size audit needs no new package. It uses Node's built-in `zlib`.

## Scripts added to `package.json`

```json
"lint": "eslint --no-error-on-unmatched-pattern",
"e2e": "playwright test --config e2e/mathcore/playwright.config.ts",
"audit:chunks": "node scripts/mathcore/audit-chunks.mjs",
"test": "vitest run"
```

- `lint` takes paths, and the gate calls `pnpm run lint shared/mathcore client/src/features/mathcore`. A repo-wide lint is out of scope. `--no-error-on-unmatched-pattern` lets the step pass before Phase 1 creates those directories.
- `test` changes from `vitest` (watch mode) to `vitest run` (spec 5.2). Developers keep watch mode with `pnpm exec vitest`.

## Config files created

| File | Content |
|---|---|
| `eslint.config.js` | Flat config scoped to `shared/mathcore/**` and `client/src/features/mathcore/**`. Rules: `no-eval`, `no-new-func`, `no-restricted-imports` for `three`, `react` and `react-dom` inside `shared/mathcore/`, and react-hooks rules in `ui/`. Every other path is ignored, so existing code is not affected. |
| `e2e/mathcore/playwright.config.ts` | `baseURL` from `PLAYWRIGHT_BASE_URL`. Adds the header `x-vercel-protection-bypass` from `VERCEL_AUTOMATION_BYPASS_SECRET` through `extraHTTPHeaders`. Chromium only, screenshot comparison threshold 0.5% of pixels (PLAN.md §9), snapshots read from `docs/mathcore/baselines/`, `updateSnapshots: "none"` so the pipeline never writes baselines. |
| `e2e/mathcore/golden-ui.spec.ts` | Reads `shared/mathcore/__golden__/` entries marked `"ui"`, enters each expression, reads the displayed result, and compares it using the PLAN.md §9 tolerance. Reports "no baseline" when a screenshot baseline is missing. |
| `scripts/mathcore/audit-chunks.mjs` | After `build`, gzips each chunk in `dist/public/assets/`. Fails if the mathcore engine chunk is over 80 KB gzip (PLAN.md §6.2) or if any chunk loaded by a non-mathcore route contains mathcore code. Reports the Compute Engine chunk size without capping it. Until Phase 1 adds the route, it reports "no mathcore chunk" and passes. |

## Not proposed

- No Prettier changes. `format` already exists.
- No `gh` CLI (spec 5.3).
- AgentPhone is a separate step, after this approval (spec 10.1).
