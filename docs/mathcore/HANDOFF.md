# Math Core — handoff for a new session

Read this first. It replaces re-reading the earlier conversation. Paste the prompt at the end into a new session.

## Where things are

- Repository `mae-academy/mae-academy-v3`, branch **`automation/setup`** (never push to `main`, no PR unless the owner asks).
- Plan of record: `docs/mathcore/STEPS.md` (§5 Graph IR, §6 types, §7 budgets, §8 course criteria, §9 domain rules,
  §10 tests, §11 phases). Owner decisions: `docs/mathcore/reports/owner-decisions-2026-10-30.md`,
  `docs/mathcore/reports/decisions-log.md` (append-only).
- Phase reports (what was built, review rounds, measured budgets, known limits):
  `docs/mathcore/reports/phase-1-2.md`, `phase-3.md`, `phase-4.md`, `phase-5.md`.
- **Scope:** Phases 0–5 are done. The owner lifted D3 (3D) for Phase 5 only. **Stop after Phase 5**: Phase 6 (ODEs) and
  later are a separate scope. Headless ODE code (`shared/mathcore/ode/`) exists without UI; do not build on it unasked.

## Code map

| Area | Path |
|---|---|
| Headless engine (no DOM/React) | `shared/mathcore/` — `parse/`, `normalize/`, `infer/` (types, `linear.ts`), `compile/` (closure compiler, no eval), `engine/graphEngine.ts` (DAG, sliders, runtimes), `sample/`, `implicit/` (`marching.ts` contour + shading, `strips.ts`, `source.ts`), `calculus/integrate.ts` (Simpson + tanh-sinh with endpoint tails), `linalg/` (exact det, eigen2, QR eigen3, Gauss-Jordan, `analyze.ts` LaTeX reports, `transform2.ts`), `render3d/` (CPU rasterizer, `scene.ts`, `frame.ts`), `ir/` (types, schema, codec), `constants.ts` (every tolerance and limit) |
| Page | `client/src/features/mathcore/ui/` (`MathcorePage.tsx`, `GraphCanvas.tsx`, `LinalgPanel.tsx` lazy KaTeX, `camera.ts`), `render/renderer.ts` (Canvas 2D, token colors only), `i18n/{en,ar,es}.json` |
| Workers | `workers/mathcore-parse-worker.ts` (Compute Engine, 200 ms per line), `mathcore-engine-worker.ts` (evaluation, sampling, 3D frame), `mathcore-strip-worker.ts` + `stripPool.ts` (parallel implicit strips), `engineClient.ts` (5 s watchdog), `parseClient.ts` |
| Tests | unit tests beside the code; golden `shared/mathcore/__golden__/` (human-owned, read-only); browser `tests/mathcore/e2e/mathcore.spec.ts` |

## How to check

```bash
timeout 580 bash scripts/mathcore/gate.sh origin/automation/setup   # typecheck, lint, theme lint, tests, golden, build, audits
npx vitest run shared/mathcore client/src/features/mathcore         # mathcore unit tests only
pnpm run build && MATHCORE_CHROMIUM=/opt/pw-browsers/chromium pnpm run e2e:mathcore
pnpm exec tsx scripts/mathcore/bench.ts                            # §7.2 budgets (Node, one thread)
```

Rules learned the hard way:
- Commit only after the gate passes (chain with `&&`). Full `vitest` runs rewrite
  `api/_lib/circuit/engine/mnaValidationSuite.report.md`: restore it with `git checkout --` before committing.
- Theme lint forbids hex, `rgb(`-like calls, font families and `px` in mathcore paths; colors come from
  `client/src/index.css` tokens. tsconfig target is old: no BigInt literals, no Set/Map spreading.
- Tests that fail on the base branch too (SimulationPageHeader, server ai*, remoteCppEngine) are not mathcore's.
- Never print secrets (`AGENTPHONE_API_KEY`, `VERCEL_AUTOMATION_BYPASS_SECRET`); do not curl the Vercel preview with
  the bypass secret.
- Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and the session line.

## Open items for the owner

- Visual snapshot tests (§10) need new human-owned baselines in `docs/mathcore/baselines/`: owner approval needed.
- D1 reference-device measurements (Phase 0 item 5) are still open; all budgets were measured on the cloud machine.
- Known limits are listed at the end of each phase report.

## Prompt for a new session

> You are continuing the Math Core engine in `mae-academy/mae-academy-v3` on branch `automation/setup`. Read
> `docs/mathcore/HANDOFF.md` first, then only the phase report and STEPS.md sections your task needs. Phases 0–5 are
> complete and reviewed; do not start Phase 6 or later unless the owner asks. Run the gate before every commit, keep
> all tolerances in `shared/mathcore/constants.ts`, colors from design tokens only, and record any owner decision in
> `docs/mathcore/reports/decisions-log.md`. Task: <write the task here>.
