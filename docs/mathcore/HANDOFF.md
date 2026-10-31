# Math Core — handoff for a new session (state after the second follow-up round of 2026-10-31)

Read this first. It replaces re-reading the earlier conversation. Paste the prompt at the end into a new session.

## Where things are

- Repository `mae-academy/mae-academy-v3`, branch **`automation/setup`** (never push to `main`, no PR unless the owner asks).
- Plan of record: `docs/mathcore/STEPS.md` (§5 Graph IR, §6 types, §7 budgets, §8 course criteria, §9 domain rules,
  §10 tests, §11 phases). Owner decisions: `docs/mathcore/reports/owner-decisions-2026-10-30.md`,
  `docs/mathcore/reports/decisions-log.md` (append-only).
- Phase reports (what was built, review rounds, measured budgets, known limits):
  `docs/mathcore/reports/phase-1-2.md`, `phase-3.md`, `phase-4.md`, `phase-5.md`.
- **Scope:** Phases 0–5 are done and went through independent review rounds (Phase 3: four, Phase 4: two, Phase 5:
  one), then two follow-up rounds on 2026-10-31 (`docs/mathcore/reports/follow-up-2026-10-31.md`, B10–B12 in
  `phase-3.md`, and `follow-up-2026-10-31-b.md`: 2-core performance, per-value eigenvalues, device scripts, the flake hunt). Every finding is fixed or listed as a known limit in its report. The owner lifted D3 (3D) for Phase 5 only.
  **Stop after Phase 5**: Phase 6 (ODEs) and later are a separate scope. Headless ODE code (`shared/mathcore/ode/`)
  exists without UI; do not build on it unasked.
- State at handoff: gate green with no skipped steps; mathcore unit tests and browser tests pass (counts in the final
  report of the round). Measured budgets are in each report. Key facts, all on the shared cloud machine:
  - Implicit fields, Chromium on a **real two-core CPU** (`taskset -c 0,1`; `MATHCORE_CORES=2` alone is misleading), 1 s
    after load: dense sin(x²+y²) < 0 drag 12.5–13.0 ms, release 122–128 ms (met). Right after load (cold JIT) dense drag is
    23 ms and release 154 ms (**not met**). The reference field x²+y²+sin3x·cos2y < 9: drag 18.6–20.3 ms (**not met**),
    release 137–169 ms (**not reliably met**). Baseline before this round: 32 / 208 / 34 / 195 ms.
  - 3D under two cores (Node, `taskset`): every case within 25 ms (zoomed release frame 20.0 ms); not measured in a browser.
  - 3×3 eigenvalues are per-value exact (error 0 on 23 exact adversarial matrices; `linalg/exactRoots.ts`).
  - Not measured anywhere: the owner's MacBook and the D1 reference device (item 3: scripts ready, pending owner hardware).

## Code map

| Area | Path |
|---|---|
| Headless engine (no DOM/React) | `shared/mathcore/` — `parse/`, `normalize/`, `infer/` (types, `linear.ts`), `compile/` (closure compiler, no eval), `engine/graphEngine.ts` (DAG, sliders, runtimes), `errors.ts` (error catalog keys), `sample/`, `implicit/` (`marching.ts` contour + shading, `strips.ts`, `source.ts`), `calculus/integrate.ts` (Simpson + tanh-sinh with endpoint tails), `linalg/` (exact det, eigen2, `exactRoots.ts` 512-bit root refinement for 3×3, QR, Gauss-Jordan, `analyze.ts` LaTeX reports, `transform2.ts`), `render3d/` (CPU rasterizer, `scene.ts`, `frame.ts`), `ir/` (types, schema, codec), `constants.ts` (every tolerance and limit) |
| Page | `client/src/features/mathcore/ui/` (`MathcorePage.tsx`, `GraphCanvas.tsx`, `LinalgPanel.tsx` lazy KaTeX, `camera.ts`), `render/renderer.ts` (Canvas 2D, token colors only), `i18n/{en,ar,es}.json` |
| Workers | `workers/mathcore-parse-worker.ts` (Compute Engine, 200 ms per line), `mathcore-engine-worker.ts` (evaluation, sampling, 3D frame), `mathcore-strip-worker.ts` + `stripPool.ts` (parallel implicit strips; `stripWorkerCount`), `warmup.ts` (idle warm-up plan), `engineClient.ts` (5 s watchdog), `parseClient.ts` |
| Tests | unit tests beside the code; golden `shared/mathcore/__golden__/` (human-owned, read-only); browser `tests/mathcore/e2e/mathcore.spec.ts` |

## How to check

```bash
timeout 580 bash scripts/mathcore/gate.sh origin/automation/setup   # typecheck, lint, theme lint, tests, golden, build, audits
npx vitest run shared/mathcore client/src/features/mathcore         # mathcore unit tests only
pnpm run build && MATHCORE_CHROMIUM=/opt/pw-browsers/chromium pnpm run e2e:mathcore
pnpm exec tsx scripts/mathcore/bench.ts > bench-node.json           # §7.2 budgets (Node, one thread): JSON on stdout, table on stderr
node scripts/mathcore/bench-browser.cjs > bench-browser.json       # implicit fields in Chromium (needs vite preview on 4173)
taskset -c 0,1 node scripts/mathcore/bench-browser.cjs             # a real two-core limit on Linux (MATHCORE_IDLE_MS=0 for a cold Worker)
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

Status after the second follow-up round. "Owner" items are questions; none was decided by the executor.

**Closed in the round (with evidence):**
- 3×3 eigenvalue accuracy: the per-value criterion of STEPS.md §8.2 is applied and tested (`linalgGolden.test.ts`,
  `eigenCases.ts`; 23 exact cases, error 0; before: 14 over 1e-9, worst 0.65). See `phase-4.md`.

**Open, performance (budgets unchanged):**
- Reference field on two real cores: drag 18.6–20.3 ms (budget 16) and release 137–169 ms (budget 150).
- Dense field right after load (cold JIT): drag 23 ms, release 154 ms. The warm numbers (1 s idle after load) pass.
- No measurement exists on the owner's MacBook or on the D1 reference device (below).

**Pending owner hardware:** item 3. `bench.ts` and `bench-browser.cjs` print one JSON document each;
`docs/mathcore/reports/device-results-template.md` has the commands and the fields. The item is closed only when the
owner has run them and committed the JSON.

**Owner questions:**
1. **Phase 9 3D parts.** Deferred by D3 (lifted only for Phase 5). Stay deferred, or lift for Phase 9 too?
2. **Visual snapshot baselines (§10).** Approve new human-owned baselines in `docs/mathcore/baselines/`, or keep the pixel
   checks at chosen points?
3. **Reference device (D1) and the MacBook benchmark.** Run the two scripts on the reference device, and on a 2-core
   machine, and commit the JSON (item 3 above).
4. **Q1–Q17.** `docs/mathcore/reports/owner-decisions-review.md` lists, per question, the answer applied, file and line,
   covering test and any conflict with the plan; the "owner confirmed" column is empty. Findings to look at: Q6's text is out
   of date (`3d` is accepted since D3 was lifted for Phase 5); Q4 stores `theta` where the plan writes `θ`; Q3 has no test
   for delimiters other than `bmatrix`.
5. **Vercel preview check for PR #3.** Check the preview deployment of PR #3 (no PR was created or changed here).
6. **Dense-field drag quality (B8).** Drag frames of dense fields trace coarse cells and sample refined blocks every
   second pixel; without it the dense drag is 20.3 ms on two real cores. Measured visual cost: 1.69 % of drag-mask
   pixels wrong, curve within 0.3 px. Keep, or revert (`MASK_REFINE_STEP_DRAG` = 1 and drop `coarseWhenDense`)?

## Prompt for a new session

> You are continuing the Math Core engine in `mae-academy/mae-academy-v3` on branch `automation/setup`. Read
> `docs/mathcore/HANDOFF.md` first, then only the phase report and STEPS.md sections your task needs. Phases 0–5 are
> complete and reviewed, and the follow-up round is recorded in `docs/mathcore/reports/follow-up-2026-10-31.md`; do not
> start Phase 6 or later unless the owner asks. Run the gate before every commit, keep
> all tolerances in `shared/mathcore/constants.ts`, colors from design tokens only, and record any owner decision in
> `docs/mathcore/reports/decisions-log.md`. Task: <write the task here>.
