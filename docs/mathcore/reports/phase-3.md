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

## Exit criterion: implicit field budget at quarter resolution

| Case (STEPS.md §7.2) | Target | Measured here |
|---|---|---|
| Implicit field 400×250 during drag | ≤ 16 ms | 2.0 ms |
| Implicit field 1600×1000 on release | ≤ 150 ms | 41.9 ms (curve + full-resolution shading) |

Both include the curve and the shading. They are reference figures from the cloud machine; D1 laptop numbers are
still open (Phase 0 item 5).

## Known limits

- A curve that lies entirely inside one coarse cell whose four corners share a sign is not found (a loop smaller
  than 6 px at full quality, 12 px while dragging). Raising the resolution (zoom in) reveals it.
- Pole filter trade-off: crossings in cells where F is not monotone between a corner and the crossing are dropped;
  at a cusp this can shorten the curve by about one cell.
- Chained inequalities (`0 < x < 1`) are rejected with an explanation; restrictions `{0<x<1}` work on explicit curves.
- Inequality fill color is the item color at 20% opacity; `style.fill` is not used yet.
