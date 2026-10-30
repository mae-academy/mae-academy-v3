# Phase 3 report: implicit curves and inequalities (2026-10-30)

Built on `automation/setup` under the owner's approval of 2026-10-30. Numbers were measured by running code on the
cloud machine (Node 22), not on the D1 devices.

## Deliverables (STEPS.md §11, Phase 3)

| Deliverable | Where | Evidence |
|---|---|---|
| Sign field | `shared/mathcore/implicit/marching.ts` `regionMask` | area of `x²+y²<9` within 1% of 9π; row 0 at the top (ImageData order) |
| Marching Squares | `contour` | circle is one closed curve on the circle to 2×10⁻³; `xy=1` is two pieces; saddle `x²−y²=0` resolved |
| Incremental refinement (§7.1 technique 3) | coarse lattice, finer lattice only in cells the curve crosses | evaluations < ¼ of a full fine grid |
| Shading | `render/renderer.ts` field layer; `<`, `<=`, `>`, `>=` | strict inequalities draw a dashed boundary |
| Workers / parse Worker | engine Worker samples `Implicit` items; parsing already runs there | no heavy work on the main thread |
| Domain rules (§9) | undefined cells draw nothing; pole filter | `y = tan x` as `F = y − tan x` has no vertical lines at poles; `y = √x` has no curve for x < 0 |
| Text description | `describeExtent` (en/ar/es) | implicit, polar, parametric and `x = g(y)` curves report their pieces and the box they span |

## Completion round (after the Phase 3 review)

| Review finding | Fix | Evidence |
|---|---|---|
| Closed curves broke at their caps (7–24% of circles) | near-zero refinement with the slope seen from neighbouring coarse points; curve following into the neighbour of a cell where a curve ends; stitching of small gaps (never at the view border) | 900 random circles (radius 0.1–2.5): 0 broken; thin ellipse and heart: one closed loop |
| Pole filter cut smooth curves (sin 10x: 23 pieces) | each sign change is bisected 12 times: a real root's bracket shrinks, a pole's grows | sin 10x, sin 20x, sin 2x²: one piece; tan x, tan 3x: no pole lines; crossings within 1e-4 of the circle |
| Full-resolution path 193 ms with the engine's compiled F (benchmark used a JS lambda) | benchmark now times the compiled closure; adaptive shading (blocks away from the boundary are filled without evaluation); allocation-free hot loops | 1600×1000 release: 70 ms (budget 150); 400×250 drag: 2.6–3.0 ms (budget 16) |
| Cold-load timeout cut to 5 s by a later request | every request to a Worker that has not answered yet gets the long limit; an error reply does not count as started | `engineClient.test.ts` |
| Retyped literal outside the range made an invalid graph | the page widens the range to include the value | `mergeParams.test.ts` (validateGraph passes) |
| Slider settings lost while typing | nothing is pruned while a line has a parse error; only names whose use was removed are pruned | `graphEngine.test.ts` |
| Failed Compute Engine download cached forever | the parse Worker drops a rejected download and retries on the next request | `mathcore-parse-worker.ts` |
| Inequality description wrong or missing | describes the shaded share first ("fills the whole view" only when exact), then the boundary | `describeText.test.ts` |
| ∫₋₁¹ 1/√(1−x²) dx gave NaN | tanh-sinh accepts its rounding-noise floor (divergent integrals still rejected) | π to 7 digits (the tail inside the last double is ~1.5e-8 per end) |
| Shading rebuilt on every redraw | tinted layer cached per mask | `renderer.ts` |
| Constants duplicated across Worker, renderer, SVG, benchmark | moved to `constants.ts` | — |
| Theory text did not cover implicit curves | fifth principle in en/ar/es | docs tests pass |

Added in this round:

- **Parse Worker** (STEPS.md §7.1 technique 5, §9): Compute Engine now runs only in `mathcore-parse-worker`; each line is
  parsed on its own with a **200 ms** limit (the Worker is replaced when a parse exceeds it), results are cached by
  LaTeX string, and the engine Worker receives the parsed lines with each document. `parseClient.test.ts`.
- **Progressive display**: with implicit items, a quarter-resolution frame is posted before the full one.
- **Request queue**: one request per task, then yield, so superseded requests are skipped (`requestQueue.test.ts`).
- **Browser tests** committed: `tests/mathcore/e2e/mathcore.spec.ts` (`pnpm run e2e:mathcore`): card → route, zero
  mathcore bytes on `/`, sliders and dependent-only updates, errors and cycles, retyped literal, shading inside vs
  outside, tangent slope, corrupt link, Arabic RTL, strip Workers.

## Re-review round (Phase 3 re-review of 4ebf055)

| # | Finding | Fix | Evidence |
|---|---|---|---|
| 1 | Undoing an edit before its answer arrived left the old curve | the page records the document it *sent* as the engine's document, then each answer's | `MathcorePage.tsx` (`sendDocument`, `engineKey`) |
| 2 | A failed parse stayed cached (offline, slow start, crash) | parse client caches only parses, syntax errors and a timeout seen twice on a running parser; an "unavailable" reply does not mark the parser started; the engine drops cached failures on each load; the page sends exactly the items it parsed; a restarted Worker gets a fresh parse | `parseClient.test.ts` (offline, crash, start-up and repeated timeouts), `graphEngine.test.ts` |
| 3 | `a=5 → a= → a=7` left the slider at 5 | a literal is remembered while its slider exists | `graphEngine.test.ts` |
| 4 | A lattice point next to a pole let the asymptote through | the pole test compares the bracket spread early and late in the bisection (shrinks at a zero, grows at a pole, stays at a jump), never the corner values | `y = 1/(x − 0.5)` on the reviewer's views and three more, `1/(x−1)³`, `tan x`, `floor` |
| 5 | Stitching was ~cubic (6.3 s for `tan x tan y = 1` at ±60) | ends bucketed in a grid, pairs matched closest first, chains walked once | 4000 shuffled fragments in < 300 ms; the ±60 case contours in < 1 s, every vertex on cos(x + y) = 0 |
| 6 | The full frame after a progressive frame had no watchdog | the quarter frame is marked `partial`; the client keeps the timer for the full frame | `engineClient.test.ts` |
| 7 | Shading aliased with patterns at the block spacing (47% wrong) | each block not refined by its corners is probed at its centre (and edge midpoints for blocks ≥ 4 mask pixels) | `sin 40x · sin 40y` at ±20, ±21, ±22 and stripes of 1 and 2 blocks: < 2% vs per-pixel |
| 8 | Blocks with all corners undefined were skipped | the same probes (mask) and a centre probe (contour) find defined slivers | `y < √(0.0004 − x²)`: same shaded count as per-pixel, curve drawn |
| 9 | Unused sliders kept or removed wrongly | empty lines are not "typing"; names seen while typing are remembered; an import or a restarted Worker is a fresh document | `graphEngine.test.ts` |
| 10 | `param`/`view` before any document got no answer | the Worker answers `skipped`, which stops the watchdog | `engineClient.test.ts` |
| 11 | tanh-sinh reported convergence on a 7-digit answer | the stretch next to an endpoint that no double reaches is added analytically (f ≈ C·d^(−α), α < 1); a side ends at the first node whose abscissa no longer represents its distance; `estimatedError` bounds the error when the noise floor is used | ∫₋₁¹ 1/√(1−x²): error 1.8e-10 (was 2.2e-8); nine integrable and seven divergent cases in `integrate.test.ts` |
| 12 | Shading stretched over the current view while panning | the mask carries its viewport and is drawn there | `renderer.ts` |
| 13 | Unbounded engine parse cache | only the current document's lines are kept | `graphEngine.test.ts` |
| §7.1-4 | Parallel strips not built | the engine Worker splits each field into cell- and block-aligned strips over up to four strip Workers (one per spare core), stitches curves across strip borders and concatenates mask rows; a failed strip Worker falls back to this Worker | `strips.test.ts`, `stripPool.test.ts`, e2e "strip Workers" |
| §7.3 | Contours not smoothed | implicit curves are drawn with quadratic curves through segment midpoints | `renderer.ts` |
| — | Benchmark did not time what the Worker runs | the drag case is the Worker's drag path on a 1600×1000 canvas; release is the drag frame plus the full frame; a dense field was added | `benchmarks.ts` |
| — | Loose constants | timeouts, cache sizes, link debounce, default width, parameter turn, sampling limits and the new tolerances are in `constants.ts`; the e2e script is `e2e:mathcore` | — |

Other changes: 8 bisections per crossing instead of 12 (crossings still placed to 2⁻⁸ of a fine cell, then interpolated);
saddles decided by F at the cell centre; lattice slopes computed once per lattice point.

## Exit criterion: implicit field budget at quarter resolution

Reference F = x² + y² + sin 3x · cos 2y < 9 (the engine's compiled closure), view ±5, canvas 1600×1000.

| Case (STEPS.md §7.2) | Target | Node, one thread | Chromium, engine Worker + 3 strip Workers (4 cores) |
|---|---|---|---|
| Field 400×250 during drag (drag lattice + quarter mask) | ≤ 16 ms | 10–12 ms | 7.7 ms |
| Field 1600×1000 on release (quarter frame, then full frame) | ≤ 150 ms | 94 ms | 75.7 ms |
| Dense sin(x² + y²) < 0, drag | ≤ 16 ms | 20–30 ms (fails) | 10.1 ms |
| Dense sin(x² + y²) < 0, release | ≤ 150 ms | 122–154 ms | 84.6 ms |

Chromium figures are round trips measured from the page (message passing and copies included). They are reference
figures from the cloud machine; D1 laptop numbers are still open (Phase 0 item 5). On a machine with fewer than three
cores no strip Workers are started and the single-thread column applies.

## Known limits

- F that touches zero without changing sign (x² + y² = 0, (x − y)² = 0) is not drawn by any sign-based method.
- Features narrower than about one fine lattice cell (1.5 px at full quality) may be missed; patterns finer than half
  a shading block can still alias (the probes catch periods of one and two blocks).
- An endpoint singularity at the right end of an interval stronger than (1 − x)^(−0.5) (for example (1 − x)^(−0.75)) is
  reported as not converged: doubles near 1 are too sparse for the tail fit. At a left end at 0 it converges.
- SVG export contains curves only; shading is in PNG export (ADR-7: no SVG for fields).
- Full-quality responses copy the shading mask of every inequality (about 1.6 MB per item at 1600×1000).
- Chained inequalities (`0 < x < 1`) are rejected with an explanation; restrictions `{0<x<1}` work on explicit curves.
- Inequality fill color is the item color at 20% opacity; `style.fill` is not used yet.
- Visual snapshot tests (§10, ≤ 0.5% pixels) are not added: their baseline images would be new human-owned
  baselines (`docs/mathcore/baselines/`), which need the owner's approval. The e2e tests check pixels at chosen points.
