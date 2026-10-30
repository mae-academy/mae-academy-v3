# Phases 1–2 report (2026-10-30)

Built in the cloud session on `automation/setup` under the owner's approval of 2026-10-30. Every number below was
measured by running code; D1-device numbers remain open (Phase 0 item 5).

## Phase 1 — Explicit core

| Deliverable | Where | Evidence |
|---|---|---|
| `inferType` | `shared/mathcore/infer/inferType.ts` | `inferType.test.ts` (§6.2 order, Scalar, Explicit x/y/r rules, Implicit, matrices, total) |
| Closure compiler with cache | `shared/mathcore/compile/compile.ts` | no `eval`/`new Function` (lint rule); hash cache test; golden + fuzz |
| Explicit, polar, parametric | `shared/mathcore/sample/adaptive.ts` | asymptote vs steep-curve tests, tan/floor/1/x, precision warning > 10⁸ |
| Tangents | `shared/mathcore/calculus/derivative.ts`, page trace | f′ within 10⁻⁷ (§8.1); secant → tangent; browser: slope at x = 1 of sin x = 0.54030234 |
| Sliders | `client/src/features/mathcore/ui/SliderRow.tsx` | auto-created for undefined symbols; keyboard (range input); animation (period, loop) |
| Canvas renderer | `client/src/features/mathcore/render/renderer.ts` | `Renderer` interface (ADR-10), Canvas 2D only (ADR-4/7), token colors |
| Route and lazy loading | `/mathcore` in `client/src/App.tsx` (1 import, 1 route) | browser: `/` requests 0 mathcore files |

Exit criterion:
- Golden evaluation passes: **yes** (300 expressions, max rel. error < 10⁻¹³; fuzz subset 0 failures; offline 10,000: 0 failures).
- 2 ms per drag frame with 3 curves: **0.42 ms** median on the cloud machine (Node); D1 laptop: not measured.
- No mathcore bytes on other routes: **yes** (`audit:chunks` PASS; browser check on `/`).

## Phase 2 — State and dependencies

| Deliverable | Where | Evidence |
|---|---|---|
| Expression list | `ui/ExpressionRow.tsx`, `ui/MathcorePage.tsx` | MathLive fields through the app's loader; errors shown with the failing fragment |
| DAG | `shared/mathcore/graph/dag.ts` | `dag.test.ts` |
| Cycle detection | Tarjan SCC in `dag.ts` | error names the items: "Circular definition: c1 → c2 → c1" (test and browser) |
| Graph IR in links | `shared/mathcore/ir/codec.ts` | lz-string `?g=`, round trip, > 8 KB refused with message, corrupt/invalid rejected |
| Export PNG, SVG, JSON | page toolbar, `shared/mathcore/export/svg.ts` | SVG has title/description; JSON import validates |
| Text descriptions | `shared/mathcore/describe/describe.ts`, `ui/describeText.ts` | domain, zeros, extrema (parabolic vertex), localized en/ar/es |

Exit criterion — only dependents are updated, evaluation count measured: **yes**. `GraphEngine.evaluations` counts
item evaluations; `graphEngine.test.ts` changes `a` in a 5-item document and measures exactly 3 evaluations (the
two items using `a` and one through `k = 2a`); the page shows the count after every update.

## Bundle (production build)

| Chunk | gzip | Rule |
|---|---|---|
| `mathcore-engine-worker-*.js` (engine, no Compute Engine) | 13.8 KB | ≤ 80 KB: PASS |
| `mathcore-compute-*.js` (Compute Engine 0.58.0) | 291.8 KB | reported, not capped |
| `mathcore-ui-*.js` (page) | 14.3 KB | route chunk |

## Gate

`scripts/mathcore/gate.sh HEAD`: typecheck, lint, theme lint, 121 unit tests, golden read-only, build, leak audit,
chunk audit: **PASS** (no skipped steps). The repository-wide suite has 11 failing files that fail identically on the
base commit `5e270ec` (network-dependent C++ runner, server AI tests, SimulationPageHeader); none are in mathcore paths.

## Outside the mathcore paths

Two minimal edits, both needed for the route: `client/src/App.tsx` (lazy route `/mathcore`) and `vite.config.ts`
(`chunkFileNames` renames chunks that are purely mathcore; the Worker build names the Compute Engine chunk). No other
page's chunk content changes; the leak and chunk audits pass.

## Known limits and follow-ups

- Engine error messages (parse errors, cycles) are English in every locale; UI strings are localized. Follow-up:
  error codes from the engine, messages from i18n.
- Implicit, matrix, ODE, Riemann and distribution items are parsed and typed but drawn from their phases (3, 4, 6, 9, 10);
  the row says so.
- Browser tests are scripted with Playwright from the session (not yet a committed `e2e` script).
