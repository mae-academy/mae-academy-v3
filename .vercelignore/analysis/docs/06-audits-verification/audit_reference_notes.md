# Grand Logic Audit — Source Requirements

This note records the user-supplied audit directive for the current task. It is documentation only and does not modify application behavior.

## Scope and constraints

- Add and run focused automated unit tests sequentially, one tool at a time.
- Do not modify UI or SVG source; restrict any changes to engine logic and non-UI test coverage.
- Correct only defects evidenced by the new tests, then retain each test as a regression case.

## Control Systems audit targets

- Verify imaginary-axis poles are handled as marginal stability without a divide-by-zero failure.
- Verify an unstable transfer function exhibits bounded/guarded time-domain behavior rather than an unbounded execution loop.
- Verify positive-feedback reduction when the feedback gain is negative, including the sign convention.

## Digital Logic audit targets

- Verify parsing, operator precedence, and KaTeX representation for a deeply nested Boolean expression.
- Verify cyclic K-map minimization with no essential prime implicant and a don’t-care-heavy simplification case.
- Verify NAND-only synthesis does not add redundant double inversions when input already contains NAND logic.
- Verify a five-state Mealy FSM uses three flip-flops and treats unused encodings as don’t-cares for JK and T excitation tables.
- Verify ring-oscillator feedback is contained by the discrete-event scheduler and multi-driver conflicts resolve to X.

## Architectural references supplied earlier

- Circuit Simulator Engine Technical Handoff: strict runtime/UI boundaries, authoritative logical coordinates, explicit terminal topology, and warning snapshots for unsolvable circuits.
- Mathematical Engine Blueprint: raw syntax tree → semantic tree → compiled evaluation; dependency-aware invalidation; finite/jump isolation; bounded adaptive work.
- Dynamic Math Typesetting and Canvas Rendering Blueprint: tree/DOM/renderer separation, shared forward/inverse projection, pixel-space hit testing, and model-space refinement.
