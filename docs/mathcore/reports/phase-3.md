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
- **Browser tests** committed: `tests/mathcore/e2e/mathcore.spec.ts` (`pnpm run e2e`, 9 tests): card → route, zero
  mathcore bytes on `/`, sliders and dependent-only updates, errors and cycles, retyped literal, shading inside vs
  outside, tangent slope, corrupt link, Arabic RTL.

## Exit criterion: implicit field budget at quarter resolution

| Case (STEPS.md §7.2) | Target | Measured here |
|---|---|---|
| Implicit field 400×250 during drag | ≤ 16 ms | 2.6–3.0 ms |
| Implicit field 1600×1000 on release | ≤ 150 ms | 70 ms (curve + full-resolution shading) |

Both use the engine's compiled closure for x² + y² + sin 3x · cos 2y < 9 and include the curve and the shading.
They are reference figures from the cloud machine; D1 laptop numbers are still open (Phase 0 item 5). Parallel
strips (§7.1 technique 4) are not needed for the budget and are not built.

## Known limits

- F that touches zero without changing sign (x² + y² = 0, (x − y)² = 0) is not drawn by any sign-based method.
- Features narrower than one fine lattice cell (1.5 px at full quality; two lines 0.8 px apart) are not resolved.
- A step discontinuity of a bounded F (floor) is drawn as a vertical segment, as a sign change that does not grow.
- SVG export contains curves only; shading is in PNG export (ADR-7: no SVG for fields).
- Full-quality responses copy the shading mask of every inequality (about 1.6 MB per item at 1600×1000).
- Chained inequalities (`0 < x < 1`) are rejected with an explanation; restrictions `{0<x<1}` work on explicit curves.
- Inequality fill color is the item color at 20% opacity; `style.fill` is not used yet.
