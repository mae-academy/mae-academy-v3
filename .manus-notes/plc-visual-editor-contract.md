# PLC Ladder Visual Editor Contract — August 27, 2026

The Visual Editor Blueprint requires a DOM-only ladder surface. The canvas root is a focusable `role="application"` container. Each rung has a gutter, a `le-rung-tracks-grid` with a flexible left main rail, and a right end rail. Circuits recurse through flex containers. A parallel branch is an in-flow vertical flex column of child circuits, bounded by CSS-border divs, rather than a Canvas/SVG path or absolute x/y geometry.

Each basic instruction is an inline two-row, three-column `le-instruction-grid`: the tag label spans row 1 and a left wire, exact DOM symbol, and right wire occupy row 2. Contacts use the two side bars plus an optional XIO slash; coils use DOM half-circles and L/U markings. Timers, counters, math, comparison, and logical instructions use structured DOM block rows populated from instruction descriptors and runtime tag values.

The rebuilt workspace may use MAE Academy palette, typography, and interaction states, but must preserve this DOM/Flexbox/CSS Grid geometry and its recursive circuit/branch hierarchy exactly.

## Current replacement boundary

The existing `PLCLadderCanvas.tsx` is a fixed-coordinate SVG sheet with hard-coded rail positions, manually computed branch paths, SVG `foreignObject` editing, and SVG drag targets. This directly conflicts with the blueprint. It will be replaced by a React DOM renderer that accepts a normalized rung/circuit/branch document and emits only `div`-based rails, wires, symbols, blocks, and nested branch columns. The legacy component will not be adapted incrementally because retaining any absolute SVG branch routing would violate the reference contract.

The host studio must also migrate from its present flat `contacts`/`parallelBranches` model to the normalized document, then serialize it deterministically to the new PLC backend source before running a scan. The backend remains entirely isolated from editor state and visual geometry.

The live `/simulations/plc/a` station now renders the initial program with a DOM ladder: grid labels, basic contact/coil shapes, a structured TON block, rails, and normal-flow wires are present without an SVG ladder sheet. The remaining implementation check is the visual accuracy of selected/energized states and DOM drop operations for series and parallel insertion.

Live validation confirms the station route renders no SVG ladder surface, and a `Start` input followed by a manual scan writes `Motor:1`, advances the scan counter to `1`, and energizes the first rung using the MAE red reference treatment. Model-level regressions confirm serial insertion, parallel-branch conversion, branch-level insertion, source serialization, and instruction moves without any visual coordinates.

Browser-level drag verification confirmed the same DOM path: dropping `XIC` on a wire inserts a serial instruction into the compiled source, and dropping `Parallel Branch` on a wire transforms the source into `[XIC(Start)|XIC(Start)] ...`. The rendered editor exposes one branch wrapper and its required three level-boundary drop zones, matching the recursive branch contract.

Dropping `XIO` onto a branch-level boundary inserted a new parallel level at the live DOM boundary. The document became `[XIO(Stop)|XIC(Start)|XIC(Start)] ...`, and the boundary count advanced from three to four. This confirms the editor uses the documented branch-column hierarchy rather than fixed coordinate paths.
