# Second follow-up round (2026-10-31, from 856420e): 2-core performance, per-value eigenvalues, device scripts, flake hunt, owner decisions

All timings below are Chromium 153 in the cloud container restricted to two CPUs with `taskset -c 0,1` (the page
reports 2 logical cores), engine Worker round trips for a 1600×1000 canvas, median of 5 repeats of the 9-run medians
(`scripts/mathcore/bench-browser.cjs`, five repeats per row). The machine is shared and noisy (repeats of one row
vary by about ±15 %), so each row is given with its repeats or sessions. No D1 or MacBook figure exists.

## Item 1: 2-core performance

Baseline at `856420e` (real two cores): reference field drag 34 ms, release 195 ms; dense field sin(x²+y²) < 0 drag
32 ms, release 208 ms.

Profile first. (1) The Worker's own compute time is 90–95 % of the round trip (messages and copies 1–6 ms).
(2) A fresh Worker's first drag frames run 3–5 times slower than later ones (JIT): dense drag 32, 59, 50, 22, 14, 21 …
then 8–13 ms after about 15 frames, even on two cores. (3) Release = a drag-quality preview frame (9–50 ms) plus the
full frame (130–300 ms). (4) At full quality the contour spends more time in its own bookkeeping than in evaluating F
(424k evaluations, 57–78 ms in Node, of which evaluation 8–14 ms). (5) With two cores no strip Worker started.

Changes (each a measured step; output of the contour and mask is unchanged, pinned in `marching.test.ts`):

| Change | Effect, dense field, real two cores |
|---|---|
| Typed arrays instead of Maps for crossings and links; direct corner reads; batched corner evaluation; inlined slope and mask loops | Node full frame (contour + mask) 95 → 72 ms; drag frame 29 → 14 ms |
| The release's preview frame is the last drag frame of the same view when nothing changed (`dragFrames` in the engine Worker; `ItemResult.reused`) | release −10 … −50 ms (the preview was recomputed) |
| Both cores run strips on a two-core machine (`stripWorkerCount(2) = 2`); drag frames stay in the engine Worker when there are only two strips | release 160 → 121 ms; drag 34 → 14 ms |
| `bindXY`: per-binding two-variable evaluator (environment set once, two writes per call) | drag 16.7 → 12.5 ms, release 146 → 122 ms |
| Idle warm-up: up to 8 silent drag-quality passes (at most 400 ms) after a document with implicit items loads, served only when no request is queued (`warmup.ts`) | removes the cold-start penalty if the first drag comes more than about a second after load |

Final numbers, two real cores, default protocol (the bench waits 1 s after loading before the first frame, as a user
does; `idleAfterLoadMs` is in the JSON):

| Case | Budget | Session A | Session B | Result |
|---|---|---|---|---|
| Dense sin(x²+y²) < 0, drag | ≤ 16 ms | 12.5 ms | 13.0 ms | met |
| Dense, release | ≤ 150 ms | 121.8 ms | 128.4 ms | met |
| Reference field, drag | ≤ 16 ms | 18.6 ms | 20.3 ms | **not met** |
| Reference field, release | ≤ 150 ms | 136.6 ms | 169.3 ms | **not met reliably** |

With no idle gap (the first frame right after load, cold JIT), dense drag is 23.4 ms and dense release 154.4 ms:
**not met**; the first frames of a fresh Worker stay slow. The 3D scene under two cores, measured in Node with
`taskset` (one thread, as the 3D frame runs in the engine Worker): zoomed release frame 20.0 ms, fitted 12.0 ms, zoomed
drag 11.2 ms, 80×80 surface 8.6 / 14.2 ms, all within 25 ms; a browser measurement of the 3D frame on two cores was not
taken.

Remaining gaps and causes: the reference field's drag frame is evaluation-bound (56k evaluations of a compiled closure
at about 115 ns each is 6.6 ms of a 10 ms frame; 22k of the 56k are the aliasing probes, which are an accuracy feature
and were not removed); its release (full quality) varies 122–227 ms between repeats. Cold start remains slow because
V8 compiles the hot loops on first use.

**The B8 coarsening is still needed.** Without it (the same build with `MASK_REFINE_STEP_DRAG = 1` and the dense
tracing off) the dense drag is 20.3 ms; with the coarse curve alone it is 16.3 ms; with both 13.8 ms (earlier build).
Visual cost of the coarse setting for sin(x²+y²) < 0 (measured; pinned by `marching.test.ts`, "visual cost of the drag-frame coarsening"): the drag mask is wrong
at 1.69 % of its 400×250 pixels against the exact value at their centres (0.00 % without the sampling step; the full
frame that follows is 0.00 %); the coarse curve has the same 28 pieces and the same length (124.4 units) as the fine
one, and every point of the fine curve lies within 0.3 CSS px of it.

## Item 2: 3×3 eigenvalues per value

See `phase-4.md`. 23 exact cases, before 14 over 1e-9 (worst 0.65), after 0. Changes to existing expectations: the six
A2 cases built by floating-point multiplication (they now read as a split pair or triple, the exact eigenvalues of the
stored doubles) were rebuilt as typed decimals. The A2 tolerance was removed because it merged widely spread spectra
(eigenvalues 1, 1.5, 1000 gave 0.25 relative error) and distinct eigenvalues up to 5e-7 apart.

## Item 3: device scripts

`bench.ts` and `bench-browser.cjs` print one JSON document (device, cores, runtime or browser version, per case median,
max, budget, pass). `device-results-template.md` has the commands and fields. **Pending owner hardware.**

## Item 4: intermittent browser failure

Method: the suite run in a loop, one log per run, the failing test taken from the `✘` marker.

- Runs 1–20 (25 tests, after items 2, 3 and 5): all passed.
- Rule: no failure in 20, so 40 more, on the item 1 build (26 tests). Runs 21–25 passed, **run 26 failed**, run 27 passed;
  the loop was stopped there to fix the cause (27 runs, one failure).
- The failing test: `rapid keys and wheel ticks all count (per frame)` (the A4 test added in the first follow-up round).
  Its azimuth was right (all 24 key presses counted) and its distance was 222.9 instead of 267.5, that is 30·1.2¹¹ instead
  of 30·1.2¹²: **one wheel tick lost**.
- Root cause: `GraphCanvas` mirrored `props.camera` into a ref in a passive effect. A wheel tick is not a discrete React
  event, so it can arrive after the commit of the previous tick but before that commit's effect has run; the effect then
  overwrote the newer step with the stale prop and the next tick started one step behind. Key presses are discrete events
  (React flushes pending effects before them), which is why the key tests never failed.
- Fix: `CameraSync` (`ui/camera.ts`) remembers the last 64 steps asked for; a prop that is one of them leaves the current
  camera alone, and only a camera that is none of ours (a loaded link, Reset view) replaces it.
- Deterministic reproduction: the e2e tests "101 alternating wheel ticks, one per frame / per task, lose no step" end the
  distance at 30·1.2 only if no tick is lost. Before the fix 6 of 6 runs failed (final distances 1000, 0.62, 321 …); after
  it 5 of 5 sessions passed. Unit tests in `moveCamera.test.ts` replay the interleaving (and a 200-trial random one).
- Clean runs after the fix: **20 consecutive runs of the full suite (28 tests each), all passed** (`run 1 … run 20`, exit 0).
  Totals on this flake: 20 + 7 runs before the fix with 1 failure (run 26), 20 after with none.

## Item 5: owner decisions Q1–Q17

`owner-decisions-review.md`: evidence rows, empty confirmation column.
