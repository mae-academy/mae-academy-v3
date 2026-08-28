# E-Circuits Tab D Browser Validation — August 27, 2026

- The live documented circuit-lab route renders the DC Power Rail with a **single positive connector** and a 24 V source condition referenced to ground; no negative rail terminal is present in the canvas or solver output.
- The active-component inspector contains a KaTeX-formatted engineering reference, no component icon, no `DC MNA` label, and no position/coordinate controls.
- A direct body click changed the SPST-NO switch inspector state from `open` to `closed` without entering wiring mode.
- A held canvas `mousedown` changed the NO pushbutton state to `pressed`; the matching `mouseup` returned it to `released`.
- The documented route retained the real Academic Analysis panels and solver-backed source condition after the refinement.
