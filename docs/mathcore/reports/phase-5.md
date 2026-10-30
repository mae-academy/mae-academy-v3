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

| Case (STEPS.md §7.2) | Target | Measured (Node, cloud machine) |
|---|---|---|
| 80×80 grid surface (12,800 triangles), 800×500 frame (camera moving: half resolution) | ≤ 25 ms | 5.8 ms |
| Same, 1600×1000 frame | ≤ 25 ms | 13.7 ms |
| Phase 5 scene (3 planes + unit-cube image), 1600×1000 | ≤ 25 ms | 14–18 ms |

Values: 3×3 determinants and eigenvalues match the mpmath reference within 10⁻⁹ (see the Phase 4 report for the
measures); 3×3 systems satisfy A x = b to 10⁻¹² on 1000 random decimal systems.

## Notes

- The default camera is oblique (azimuth 1.1, elevation 0.45): at 45° the common planes x = y and x = −y are seen
  edge-on and vanish. The fitted distance is 4.5 × the box half-size (the box's bounding sphere fills the view).
- Planes are drawn only when the unknowns are x, y and z (in any order); other names keep the report without a picture.
- In the 3D view, curves and regions are not drawn (they stay in the 2D view); the page says so.

## Known limits

- Translucent planes are blended in a fixed order without per-pixel sorting, so where two translucent planes overlap
  the colors can look slightly different from the other side.
- Text labels are drawn on top of the frame and are not hidden by surfaces in front of them.
