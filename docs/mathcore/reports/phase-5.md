# Phase 5 report: 3D linear algebra (2026-10-30)

D3 (3D in v1) was lifted for this phase by the owner's instruction of 2026-10-30 (`decisions-log.md`). Work stops
after this phase; Phase 6 and later belong to a separate scope.

## Deliverables (STEPS.md §11, Phase 5; §8.2)

| Deliverable | Where | Evidence |
|---|---|---|
| Matrix3 | inference and engine as for 2×2; report with cofactor working, characteristic polynomial, inverse | `analyze.test.ts` |
| QR eigenvalues | `linalg/qr.ts` (Hessenberg + Francis double shift), eigen-directions from the null space | 3000 random 3×3 (trace, det, det(A − λI) = 0); golden ≤ 10⁻⁹ |
| Projected intersecting planes | `render3d/scene.ts` | each plane of a 3×3 system clipped to the viewing box, translucent, one token color per plane; the line where each pair meets (parallel planes visible); marker and label at the unique solution |
| Software 3D | `render3d/raster.ts` (CPU scanline, z-buffer, Lambert), frame rendered in the engine Worker (`render3d/frame.ts`) | no WebGL/WebGPU/Three.js (ADR-4) |
| 3D view | Graph IR `view.mode: "3d"` with an orbit camera saved in links; drag or arrow keys orbit, wheel or + / − zoom, Reset view refits | `schema.test.ts`, e2e "Phase 5" |
| 3×3 matrix picture | image of the unit cube (volume \|det\|, blue or red by orientation), its edges, M·î, M·ĵ, M·k̂, real eigen-directions | `scene.test.ts` |

## Exit criterion: 3D budget met; values match reference

Measured with `scripts/mathcore/bench.ts` (Node, cloud machine) after the review round:

| Case (STEPS.md §7.2) | Target | Measured |
|---|---|---|
| 80×80 grid surface (12,800 triangles), 800×500 frame | ≤ 25 ms | 5.8 ms |
| Same, 1600×1000 frame | ≤ 25 ms | 11.5 ms |
| Phase 5 scene, fitted camera, 1600×1000 | ≤ 25 ms | 8.8 ms |
| Phase 5 scene, camera inside the box, 800×500 (frames while the camera moves) | ≤ 25 ms | 9.9 ms |
| Phase 5 scene, camera inside the box, 1600×1000 (the frame after release) | ≤ 25 ms | 48 ms at the Phase 5 review; 18–23 ms after the follow-up (`follow-up-2026-10-31.md`, B9) |

The 25 ms budget holds for every frame drawn while the camera moves (half resolution, `FRAME3_DRAG_SCALE`), at any
zoom. A full-resolution frame after release with the camera close to the planes (most pixels covered by several
translucent layers) took 48 ms at the Phase 5 review and meets the 25 ms budget since the follow-up (B9).

Values: 3×3 determinants and eigenvalues match the mpmath reference within 10⁻⁹ (see the Phase 4 report for the
measures). Repeated roots are found exactly from the discriminant of the characteristic polynomial, so defective
matrices get exact eigenvalues and the right number of eigen-directions. 3×3 systems satisfy A x = b to 10⁻¹² on 1000
random decimal systems.

## Review round (snapshot 7aeaa25)

| Finding | Fix | Evidence |
|---|---|---|
| No near-plane clipping: zooming in cut planes, axes and labels | triangles (Sutherland–Hodgman) and lines are clipped at 10⁻³ × the camera distance in camera space | `frame.test.ts`: planes painted at distances 22, 5, 2 and 0.5 |
| Defective 3×3 matrices misclassified (λ = 1 triple shown as complex, 6 eigen-lines) | the kind comes from the exact discriminant of the characteristic polynomial on the stored doubles; double and triple roots in closed form; eigen-directions = 3 − rank(A − λI) by exact elimination | `qr.test.ts`: the reviewer's three matrices and a scalar matrix |
| QR overflow/underflow; one failure took down the page | power-of-two scaling in `eigenvalues`; the Worker isolates each item's failure and the 3D frame | entries 1e154, 1e-170, 1e300 to 1e-12 |
| Fast key presses and wheel ticks lost | steps build on the camera last asked for | e2e: ten ArrowLeft presses → +1.0 rad, three "−" → ×1.2³ |
| Absolute camera limits broke large scenes | the IR accepts any positive distance; zoom is limited to 0.05–200 × the box half-size | `moveCamera.test.ts`, `schema.test.ts` |
| Lines drawn over translucent planes | translucent surfaces record their nearest depth; lines behind them are mixed with the surface color | `scene.test.ts` |
| Fit ignored the aspect ratio (box cut on narrow canvases) | the bounding sphere fits the narrower field of view with a 5% margin | all 8 box corners on screen at 1600×1000, 600×600, 360×500, 300×600 |
| Scene size overflow, scale-dependent plane intersections, zero-direction clipping | box half-size capped and non-finite content ignored; unit normals; null for a zero direction | `scene.test.ts` |
| Shared edges blended twice | half-open pixel spans | `scene.test.ts` |
| 3×3 complex pair had no picture | the real eigen-direction is drawn and an arc of θ in the invariant plane (from a complex eigenvector) | `frame.test.ts` ("θ = 90°") |
| Hardcoded values | scene sizes, camera fit and limits, near plane, light, line bias, interaction steps in `constants.ts`; the bench uses the app camera | — |

## Notes

- The default camera is oblique (azimuth 1.1, elevation 0.45): at 45° the common planes x = y and x = −y are seen
  edge-on and vanish. The fitted distance makes the box's bounding sphere fit the narrower field of view.
- Planes are drawn only when the unknowns are x, y and z (in any order); other names keep the report without a picture.
- In the 3D view, curves and regions are not drawn (they stay in the 2D view); the page says so.

## Known limits

- Translucent triangles are sorted by their mean depth, not split where they intersect: two translucent planes that cross
  each other can blend in the wrong order along the crossing line. Lines are composited in exact per-pixel depth order
  with the translucent fragments on their pixel (fixed in A6, `render3d.test.ts`).
- Text labels are drawn on top of the frame and are not hidden by surfaces in front of them.
- Frames are rendered at CSS-pixel resolution and scaled up on high-density screens (slightly soft at DPR 2).
- 3×3 eigenvalues are the roots of the exact characteristic polynomial of the stored doubles, refined in 512-bit
  fixed point (`linalg/exactRoots.ts`): every value is within 1e-9 of its own magnitude (STEPS.md §8.2), including
  eigenvalues 1e-12 of ‖A‖ and roots 2⁻⁴⁰ apart. No tolerance merges two distinct roots. A matrix typed as decimals whose
  exact decimal matrix has a repeated root is reported as repeated (a Jordan block with λ = 1.1 shows 1.1 three
  times). A matrix whose entries were rounded by a floating-point computation (P·J·P⁻¹ in doubles) is reported with the
  exact eigenvalues of what is stored: a split pair or triple about 1e-8 apart, or a complex pair. Eigenvectors come from
  the numerical rank of A − λI. Cost: about 1 ms per matrix.
- Full 1600×1000 frames grow with the number of items (Node, one thread, measured 2026-10-31): 1 item 12.8 ms, 5 items
  26.7 ms, 10 items 48.0 ms, 20 items 144.3 ms. The 25 ms budget is held for the Phase 5 scene (one 3×3 system and one
  3×3 matrix) and for the drag frames; more items than about 5 at full quality are not within it.
- Thin 3D lines are never lost: a line shorter than a pixel still lights two pixels (`render3d.test.ts`, B11). The
  thin-feature limit of Phase 3 applies to 2D curves and shading only.
- On a real 2-core CPU the browser misses the 16 ms drag budget for the Phase 3 fields (see phase-3.md, the 2-core
  rows); the 3D frames were not measured in a browser on 2 cores.

## Follow-up (2026-10-31): A1–A7, B9 (commits 6bb2582 … 084aedf)

Each item has a test that failed before its fix. Numbers are measured on the cloud machine (Node, `scripts/mathcore/bench.ts`, one thread):

| Item | Fix | Test (file) | Measured before → after |
|---|---|---|---|
| A1 near plane | `NEAR_RELATIVE` 1e-3 → 1e-6 | "A1: the near plane…" (`render3d.test.ts`) | 8760 floor pixels missing at distance 20 → 0 |
| A2 defective 3×3 | discriminant test with rounded entries | "A2: defective and repeated 3×3…" (`qr.test.ts`) | Jordan forms with decimal λ: distinct or complex, 3 directions → repeated, correct eigenspace |
| A3 entries near 10^±200 | power-of-two scaling before cross products | "A3: entries near 1e±200" (`qr.test.ts`) | NaN or wrong vectors → finite unit vectors |
| A4 rapid keys and wheel | none needed (camera ref already in place); browser coverage added | "rapid keys and wheel ticks all count" (×5, e2e) | with the ref reverted the steps are lost (0.6 vs 1.3 rad) |
| A5 large scenes | boxes > 10¹⁵ built in scene units | "A5 and A7…" (`frame.test.ts`) | 10³⁹ and above: planes and matrix missing, only the axes drawn (3 % of pixels) → drawn |
| A6 lines and translucent planes | depth-ordered compositing | "A6: lines are composited…" (`render3d.test.ts`) | line behind two planes (214, 203, 224) → (114, 64, 164) |
| A7 aspect ratio | none needed (`fitDistance` already uses the aspect); labels checked | "A5 and A7…" (`frame.test.ts`) | passes before and after |
| B9 release frame | row blend of translucent layers, packed 32-bit blend, cached buffers | "B9: the row blend…" (`render3d.test.ts`) | Phase 5 zoomed scene, 1600×1000: 48.4 ms → 21.2 ms (Node today) |

**3D frame budgets (Node, one thread, 2026-10-31):** 80×80 grid drag 7.7 ms, full 14.2 ms; Phase 5 scene fitted 10.3 ms,
zoomed drag 7.6 ms, zoomed full 21.2 ms (budget 25 ms for each, `bench.ts`). The release frame of the zoomed scene is
within 25 ms on this machine; a D1 reference device is still to be measured.

