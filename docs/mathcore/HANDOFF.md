# Math Core — handoff for a new session (state after the follow-up round of 2026-10-31)

Read this first. It replaces re-reading the earlier conversation. Paste the prompt at the end into a new session.

## Where things are

- Repository `mae-academy/mae-academy-v3`, branch **`automation/setup`** (never push to `main`, no PR unless the owner asks).
- Plan of record: `docs/mathcore/STEPS.md` (§5 Graph IR, §6 types, §7 budgets, §8 course criteria, §9 domain rules,
  §10 tests, §11 phases). Owner decisions: `docs/mathcore/reports/owner-decisions-2026-10-30.md`,
  `docs/mathcore/reports/decisions-log.md` (append-only).
- Phase reports (what was built, review rounds, measured budgets, known limits):
  `docs/mathcore/reports/phase-1-2.md`, `phase-3.md`, `phase-4.md`, `phase-5.md`.
- **Scope:** Phases 0–5 are done and went through independent review rounds (Phase 3: four, Phase 4: two, Phase 5:
  one), then a follow-up round on 2026-10-31 (`docs/mathcore/reports/follow-up-2026-10-31.md`, plus B10–B12 in
  `phase-3.md`). Every finding is fixed or listed as a known limit in its report. The owner lifted D3 (3D) for Phase 5 only.
  **Stop after Phase 5**: Phase 6 (ODEs) and later are a separate scope. Headless ODE code (`shared/mathcore/ode/`)
  exists without UI; do not build on it unasked.
- State at handoff (commit of the B10–B12 round, see the last section): gate green with no skipped steps, 459 mathcore
  unit tests and 25 browser tests pass. Measured budgets are in each report and in the "Follow-up" sections. Key facts:
  - Implicit fields, Chromium with 4 cores: drag 12.5–15.8 ms (dense and reference), release 81–116 ms.
  - Implicit fields, Chromium on a real 2-core CPU (`taskset`): drag 26–41 ms and release 171–190 ms. **This misses the
    16 ms and 150 ms budgets.** The earlier "12.6 ms on 2 cores" in the follow-up report came from a 4-core machine.
  - 3D: the Phase 5 zoomed release frame 21 ms (budget 25 ms); 5 items at full size 27 ms, 10 items 48 ms.

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
node scripts/mathcore/bench-browser.cjs                            # implicit fields in Chromium (needs vite preview on 4173)
```

Rules learned the hard way:
- Commit only after the gate passes (chain with `&&`). Full `vitest` runs rewrite
  `api/_lib/circuit/engine/mnaValidationSuite.report.md`: restore it with `git checkout --` before committing.
- Theme lint forbids hex, `rgb(`-like calls, font families and `px` in mathcore paths; colors come from
  `client/src/index.css` tokens. tsconfig target is old: no BigInt literals, no Set/Map spreading.
- The 11 test files that fail on the base commit `8594cba` (origin/main), with the reasons measured on 2026-10-31:
  - `server/ai*.test.ts` (9 files: aiDocuments, aiGuidance, aiOverloadFallback, aiPlot, aiRateLimit, aiSchematic,
    aiService, aiThinking, aiVisualEngines): the modules create the OpenAI client at import and no `OPENAI_API_KEY`
    is set in this environment ("Missing credentials"). Environmental; not fixed.
  - `src/components/SimulationPageHeader.test.tsx` (2 of 3 tests): no button named "Chat with MAE AI" is found. Cause
    not investigated.
  - `src/features/execution-engine/remoteCppEngine.test.ts` (4 of 4 tests): the tests call the live
    `https://wandbox.org/api/compile.json`, which is unreachable from this environment (HTTP 000); `success` is false.
- Never print secrets (`AGENTPHONE_API_KEY`, `VERCEL_AUTOMATION_BYPASS_SECRET`); do not curl the Vercel preview with
  the bypass secret.
- Commit trailer: the `Co-Authored-By:` line of the model that made the commit, and the session line.
- Error text: a new user-facing message needs a key in `shared/mathcore/errors.ts` and `errors.<key>` in en, ar and es
  (`i18n/errors.test.ts` fails otherwise).

## Open items and owner decisions (not decided here)

Each item below is a question for the owner. None was changed in the follow-up round.

1. **3×3 eigenvalue accuracy.** STEPS.md §8.2 asks for 10⁻⁹ per eigenvalue. The code and its test check 10⁻⁹ relative to
   the largest |λ|. Question: is the per-value criterion required, or is the largest-|λ| norm accepted?
2. **Phase 9 3D parts.** Deferred by D3 (lifted only for Phase 5). Question: stay deferred, or lift for Phase 9 too?
3. **Visual snapshot baselines (§10).** Question: approve new human-owned baselines in `docs/mathcore/baselines/`, or keep
   the pixel checks at chosen points?
4. **Reference device (D1) and the MacBook benchmark.** All budgets were measured on the cloud machine (4 shared cores).
   Question: run `pnpm exec tsx scripts/mathcore/bench.ts` and `node scripts/mathcore/bench-browser.cjs` on the reference
   device (and on a 2-core machine, since the browser misses the drag budget there)?
5. **Q1–Q17 confirmation.** Question: confirm the answers in `docs/mathcore/reports/owner-decisions-2026-10-30.md`.
6. **Vercel preview check for PR #3.** Question: check the preview deployment of PR #3 (no PR was created or changed here).
7. **Dense-field drag quality (B8, decisions-log 2026-10-31).** Drag frames of dense fields trace coarse cells and sample
   refined blocks every second pixel. Question: keep this trade-off, or revert it (set `MASK_REFINE_STEP_DRAG` to 1 and
   drop `coarseWhenDense`)?

## Prompt for a new session

> You are continuing the Math Core engine in `mae-academy/mae-academy-v3` on branch `automation/setup`. Read
> `docs/mathcore/HANDOFF.md` first, then only the phase report and STEPS.md sections your task needs. Phases 0–5 are
> complete and reviewed, and the follow-up round is recorded in `docs/mathcore/reports/follow-up-2026-10-31.md`; do not
> start Phase 6 or later unless the owner asks. Run the gate before every commit, keep
> all tolerances in `shared/mathcore/constants.ts`, colors from design tokens only, and record any owner decision in
> `docs/mathcore/reports/decisions-log.md`. Task: <write the task here>.
