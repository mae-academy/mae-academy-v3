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

## Third round (verification of 7ec1db3)

| Finding | Fix | Evidence |
|---|---|---|
| The spread-based pole test dropped real zeros of steep finite F (tanh(10⁵g), atan(10⁶g), logistic) and weak zeros (\|d\|^0.2) | when the spread has not shrunk after 8 halvings, bisection continues up to 40 and the test is repeated against the spread at step 8: steep and weak zeros then shrink, poles and jumps do not | tanh/atan/logistic circles and parabola: one curve; tanh(10⁴(y − sin x)): one curve; \|x\|^0.2 + \|y\|^0.2 = 1 reaches y = 0.996; y = x^(1/9) spans the view |
| Aliasing at half-block periods on other canvas sizes (43%) | probes at deterministic jittered positions in every shading block and every coarse contour cell, so no period lines up with them | sin 40x · sin 40y on 800×500, 1200×700 and 1600×1000 at several zooms: < 2% vs per-pixel at full quality |
| Strip mask rows misaligned when height is not a multiple of the stride | strips are planned in mask rows | 1600×997, stride 4: same rows as one run |
| Strip border not bit-identical | the last lattice row and column are the view border itself | test on the lattice points |
| Stitch quadratic when ends crowd one cell (30.9 s) | each end proposes its 2 nearest partners | 3000 crowded fragments < 1.5 s; exact joins leave no duplicate vertex |
| Failed strip pool rebuilt every frame; no strip timeout | a failed or stalled pool (3 s, 20 s for the first run) is closed for good and this Worker computes fields | `stripPool.test.ts` |
| Edit undone while still parsing was lost | the engine key is set when a round starts | `MathcorePage.tsx` |
| New slider value lost when a view request followed the load | the full answer to the latest load is always delivered | `engineClient.test.ts` |
| Import could lose its fresh flag to an older round | fresh documents are recognised by their items | `MathcorePage.tsx` |
| No retry after a transient parse failure; unbounded timeout map | transient entries are marked and the page parses again after 2 s, doubling to 30 s; the map is bounded | `parseClient.test.ts` |
| Interior singularity integrated to 8 digits (1/√\|x − 0.3\|) | a Simpson result with a sample far above the mean is treated as singular; the singular point is located by ternary search and split first; the endpoint tail starts where the last node's share ends (half a step past it) | 1/√\|x − 0.3\|, 1/√\|x − 1/3\|: < 1e-9; 1/√(1 − x²): 1.6e-11; ln\|x − 0.4\|: 2e-16 |
| Seam corner on smoothed loops | closed loops start at the midpoint of their first edge | `renderer.ts` |
| Pipeline e2e step never ran | it checks `e2e:mathcore` | `run-prompt.sh` |
| Hardcoded values | probe counts, jitter margin, strip limits, retry delays, fallback canvas size and tanh-sinh levels are in `constants.ts` | — |

## Fourth round (verification of 7aeaa25)

| Finding | Fix | Evidence |
|---|---|---|
| Zero-mean jump integrands sent to tanh-sinh (wrong or NaN) | the singularity test compares the peak with the median \|f\| on a uniform grid, not with ∫f | seven jump integrands to < 1e-9 (`integrate.test.ts`) |
| ∫₀¹⁰ (x − ⌊x⌋ − ½) dx = −½ and a narrow Gaussian = 0, both "converged" (older) | Simpson starts on 7 panels with irregular borders and a minimum depth of 3 | 6.6e-15 and 8e-15 |
| Parse retry never stopped for a line that hangs the parser | at most 5 retries; a start-up timeout counts against the line once the parser has started in this visit | `parseClient.test.ts` |
| A late load answer reverted a slider dragged after it | sliders moved after the answered request keep their page values | `mergeParams.test.ts` |
| An intermediate answer could still make an undone edit look sent | the engine key is taken only from answers that hold the latest load | `MathcorePage.tsx` |
| Fresh flag lost when editing right after an import | fresh = the first round started after the import | `MathcorePage.tsx` |
| Unknown lines (a system mid-edit) pruned sliders | such lines count as being typed | `graphEngine.test.ts` |
| Stitch candidate cap left ends unjoined | unmatched ends propose again among unmatched ones (up to 4 rounds) | `marching.test.ts` |
| A heavy field on strips was failed, then recomputed serially past the watchdog | a stalled run reports "the field took too long" on its line; only a crashed strip Worker disables strips; the pool is warm only when every Worker has answered | `stripPool.test.ts` |
| Chromium numbers had no script | `scripts/mathcore/bench-browser.cjs` | below |

Cost of the third round's robustness (measured by the reviewer against 523b7a8, single thread): about +16% on the
drag path and +25% on release (jittered probes add 36–56% evaluations on plain curves; edges that look like poles
or jumps bisect up to 40 times instead of 8).

## Exit criterion: implicit field budget at quarter resolution

Reference F = x² + y² + sin 3x · cos 2y < 9 (the engine's compiled closure), view ±5, canvas 1600×1000. Measured after
the third round on the cloud machine (4 cores, load ≈ 1.2–1.5); ranges are over repeated runs.

| Case (STEPS.md §7.2) | Target | Node, one thread | Chromium, engine Worker + 3 strip Workers (`bench-browser.cjs`) |
|---|---|---|---|
| Field 400×250 during drag (drag lattice + quarter mask) | ≤ 16 ms | 13.2–13.5 ms | 9.9–12.5 ms |
| Field 1600×1000 on release (quarter frame, then full frame) | ≤ 150 ms | 102–105 ms | 96–102 ms |
| Dense sin(x² + y²) < 0, drag | ≤ 16 ms | 21–23 ms (fails) | 10.2–14.0 ms |
| Dense sin(x² + y²) < 0, release | ≤ 150 ms | 128–165 ms (fails at times) | 83–87 ms |

Chromium figures are round trips measured from a page (message passing and copies included). On a machine with fewer
than three cores no strip Workers start and the single-thread column applies, where the dense drag case misses the
budget. D1 laptop numbers are still open (Phase 0 item 5).

## Follow-up (2026-10-31): thin features, error text (B10–B12)

Measured on the cloud machine with the code at `787871c`; tests named below pin the numbers (`marching.test.ts`,
"B11/B12"). Rendering is unchanged by this round.

| Feature at full quality (1600×1000, view ±5, cell 6 px, refine 4) | Measured | Test |
|---|---|---|
| Circle of diameter 1 px, 400 fixed centres | found at 138 (34.5 %); missed at 262 | "of 400 centres…" |
| Circle of diameter 2 px, same centres | found at 396 (99 %); missed at 4 | same |
| Circle of diameter 1.25 / 1.5 / 1.75 px (random probe, 400 centres each) | found at 55 % / 77 % / 94 % | probe only, not a test |
| Shaded band of width 0.25 px or 0.5 px, 10 placements inside a cell | blank in 6 of 10 | "a shaded band 0.25 px wide…" |
| Shaded band of width 0.75 px | blank in 2 of 10 | probe only |
| Shaded band of width 1 px | blank in 0 of 10 | same test |
| Circle of diameter 1 px missed at one centre, drawn after a 4× zoom | found after zoom | "a loop 1 px across that is missed…" |

**Correction to the earlier premise.** The known limit "a loop smaller than one grid cell (6 px) can be missed until zoom"
is not what the code does. Loops of 2 px and above were found at 99 % of centres or better in the measurement, and
nothing at 6 px is missed in the tests. The real miss zone is loops below about 2 px (one fine lattice cell is 1.5 px),
and shaded bands below about 1 px. No rendering change was made.

**B10 (error text).** Errors from parse, normalize, inference, compile, the graph engine and QR now carry a catalog
key and params (`shared/mathcore/errors.ts`, 75 keys). The page translates them into ar and es through the existing
mathcore dictionaries (`errors.<key>` in `i18n/{en,ar,es}.json`). Tests: `i18n/errors.test.ts` (every key in all three
languages with the same placeholders, and no unused keys), `errors.test.ts` (keys and params on engine errors), and the
e2e "engine errors are shown in the reader's language" for ar and es. Still English: Compute Engine's own parser messages
(for example "Limit" in `\lim`) and developer-invariant throws in `linalg/` (except QR's non-convergence).

**Implicit-field timings with the Phase 3 budgets.** Chromium, engine Worker round trips, 1600×1000 (`bench-browser.cjs`).
Real two cores means `taskset -c 0,1` (see `follow-up-2026-10-31-b.md` for the method and what changed). Before the
second follow-up round (commit 856420e):

| Case | Target | Chromium, 4 cores (3 runs) | Chromium, real 2 cores (median of 5) |
|---|---|---|---|
| Reference field, drag 400×250 | ≤ 16 ms | 12.7–15.8 ms | 34.2 ms (fails) |
| Reference field, release 1600×1000 | ≤ 150 ms | 83.7–116.4 ms | 195.0 ms (fails) |
| Dense sin(x²+y²) < 0, drag | ≤ 16 ms | 12.5–13.5 ms | 32.3 ms (fails) |
| Dense sin(x²+y²) < 0, release | ≤ 150 ms | 80.7–87.0 ms | 207.6 ms (fails) |

After it (two real cores, 1 s idle after load, two sessions; the first frame right after load is cold and slower):

| Case | Target | Session A | Session B | Cold (no idle) |
|---|---|---|---|---|
| Reference field, drag | ≤ 16 ms | 18.6 ms | 20.3 ms | 24.4 ms |
| Reference field, release | ≤ 150 ms | 136.6 ms | 169.3 ms | 159.4 ms |
| Dense, drag | ≤ 16 ms | 12.5 ms | 13.0 ms | 23.4 ms |
| Dense, release | ≤ 150 ms | 121.8 ms | 128.4 ms | 154.4 ms |

Dense field: met in the warm protocol; not met cold. Reference field: not met (drag), not reliably met (release).
Node, one thread restricted to two CPUs (`bench.ts`): reference drag 13.2 ms, release 123.4 ms; dense drag 15.4 ms, release
109.2 ms (all within budget; Node has no message round trip and no cold Worker).

## Known limits

- F that touches zero without changing sign (x² + y² = 0, (x − y)² = 0) is not drawn by any sign-based method.
- Thin features can be missed at full quality (measured in the section above): circles below about 2 px across
  (138 of 400 found at 1 px, 396 of 400 at 2 px) and shaded bands below about 1 px (blank in 6 of 10 placements at
  0.25 px). Both are gone after zooming in. Example: the 1.6 px sliver y < √(0.0004 − x²) on an 800×500 canvas at ±10.
  Cells with an undefined corner draw no boundary.
- Curve following does not cross strip borders: a feature narrower than a coarse cell that crosses a border can be
  cut there.
- At drag quality (shading stride 4) patterns finer than two mask pixels alias, as any sampling at that resolution
  does; the full frame that follows is per-pixel accurate where it matters.
- Very steep zeros beyond about tanh(10¹³·g) and weak zeros sign(x)\|x\|^p with p below about 0.03 are not drawn (the
  extended bisection stops at 40 halvings).
- Full-quality shading differs from per-pixel evaluation by up to about 1.5% for patterns repeating at the block size.
- Integrals with two interior singularities are not split twice (NaN).
- Integrals: tail exponents within 10⁻³ of 1 (x^(−0.999)), slowly divergent-looking tails (1/(x ln²x)), endpoint
  singularities far from 0 relative to the interval length ([10⁶, 10⁶ + 1]) and right-end singularities stronger than
  (1 − x)^(−0.5) are reported as not converged (NaN). `estimatedError` is computed but not shown on the page yet.
- SVG export contains curves only; shading is in PNG export (ADR-7: no SVG for fields).
- Full-quality responses copy the shading mask of every inequality (about 1.6 MB per item at 1600×1000).
- Chained inequalities (`0 < x < 1`) are rejected with an explanation (English and translated, see B10); restrictions `{0<x<1}` work on explicit curves.
- Inequality fill color is the item color at 20% opacity; `style.fill` is not used yet.
- Visual snapshot tests (§10, ≤ 0.5% pixels) are not added: their baseline images would be new human-owned
  baselines (`docs/mathcore/baselines/`), which need the owner's approval. The e2e tests check pixels at chosen points.
