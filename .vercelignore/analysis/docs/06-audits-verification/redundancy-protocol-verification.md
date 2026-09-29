# E-Circuits Multi-Tiered Redundancy Verification

## Live DOM checks

The E-Circuits iframe was opened with `redundancy-final=1`. The parent sidebar reports `overflow-y: hidden`; the library panel reports `overflow-y: hidden`; and only `#toolbox` reports `overflow-y: auto` with `scrollHeight` greater than `clientHeight`. Box 2B independently reports `overflow-y: auto` with a constrained `max-height` of 40vh.

The SVG workspace reports no CSS transform on its canvas wrapper. The pointer bridge uses the SVG root bounding rectangle and viewBox ratio as its first coordinate path, with an event-cloning fallback if browser event fields cannot be overridden.

## Selection and ghost-label checks

An archived R1 was placed and selected inside the iframe. Box 2B rendered `Resistor`, `Name`, `Value`, and the native-update status. All three archived label surfaces (`#floatingtooltip`, `.floatingtooltip`, and `#hintbox`) reported empty text, hidden state, and `display: none`.

## Project checks

`pnpm exec tsc --noEmit` passed. `pnpm vitest run` passed with 14 files and 77 tests. `pnpm build` passed; the existing large bundle advisory remained non-blocking.
