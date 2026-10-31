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

- Translucent planes are blended in a fixed order without per-pixel sorting, so where two translucent planes overlap
  the colors can look slightly different from the other side; a line behind several translucent layers is mixed once.
- Text labels are drawn on top of the frame and are not hidden by surfaces in front of them.
- Frames are rendered at CSS-pixel resolution and scaled up on high-density screens (slightly soft at DPR 2).
- For floating-point (non-rational) 3×3 input, eigenvalues that are distinct but closer than about 10⁻⁵ relative are
  reported as computed by QR (only exactly repeated roots are recognised).
- Ten or more 3×3 items in one view exceed the 25 ms budget for full frames.
