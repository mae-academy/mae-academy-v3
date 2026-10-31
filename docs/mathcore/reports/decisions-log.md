# Mathcore decisions log

Append-only. Every pipeline decision: timestamp (UTC), prompt id, decision, reason.

| Timestamp (UTC) | Prompt | Decision | Reason |
|---|---|---|---|
| 2026-10-29 | setup | Re-pointed `origin` to `mae-academy/mae-academy-v3` | Spec Section 2; old remote had identical refs (repository rename) |
| 2026-10-29 | setup | Stopped at P5, then P6 | P5 verified read-only in the Vercel dashboard (production branch `main`); P6 failed: Vercel Authentication blocks anonymous preview access |
| 2026-10-29 | setup | Preview access via Protection Bypass for Automation | Owner choice; secret read only from `VERCEL_AUTOMATION_BYPASS_SECRET` |
| 2026-10-29 | setup | Prompt ids `a-1` to `l-3`, one letter per plan phase | Owner choice; the spec's `s-3` did not match PLAN.md §10 (12 phases, 36 weeks) |
| 2026-10-29 | setup | Prompts for deferred work created with `Status: deferred`: f-1, f-2, i-1..i-4, j-2..j-4 | Owner choice; DECISIONS.md D2 and D3. run-prompt.sh refuses deferred ids |
| 2026-10-29 | setup | Theme lint tokens file: `client/src/index.css` | Owner choice; no dedicated tokens file exists |
| 2026-10-29 | setup | Chunk-size audit proposed as `audit:chunks` | Owner choice; `audit:dist` is a leak scan, not a size audit |
| 2026-10-29 | setup | Gate passes `--run` to the `test` script | `test` is plain `vitest` (watch mode); script change is in the tooling proposal |
| 2026-10-29 | setup | Lint and chunk-size gate steps report SKIPPED until approved | Spec 5.1: no installs before approval; a skip is never reported as a pass |
| 2026-10-29 | setup | run-prompt.sh pushes `mathcore/<id>` before browser tests | A Vercel preview only exists after a push; spec step order 6–8 adjusted |
| 2026-10-29 | setup | PR creation disabled; compare URLs reported instead | Spec 5.3: `gh` not installed or authenticated |
| 2026-10-29 | setup | Golden files: executor writes the generator only (a-1) | Golden files are human-owned; the owner runs the oracle and commits them |
| 2026-10-29 | setup | No dependency or skill installed | Tooling proposal and AgentPhone await owner approval |
| 2026-10-30 | phase-5 | D3 (3D in v1) lifted for Phase 5 only: Matrix3, QR eigenvalues, projected planes, software 3D | Owner instruction (2026-10-30): finish Phases 3, 4 and 5 fully, heavily tested; the 3D parts of Phase 9 stay deferred |
| 2026-10-30 | phase-5 | Work stops after Phase 5; Phase 6 (ODEs) and later belong to a separate scope | Owner instruction (2026-10-30); headless ODE code already on the branch stays, without UI |
| 2026-10-30 | phase-3 | Visual snapshot tests (§10) not added | Their baseline images would be new human-owned baselines (`docs/mathcore/baselines/`); pixel checks at chosen points are used instead |
| 2026-10-31 | follow-up | Drag-frame quality adaptations for dense implicit fields: shading blocks that need refinement are sampled every 2nd mask pixel, and the curve is traced on coarse cells when >= 50 % of coarse cells need refinement (`MASK_REFINE_STEP_DRAG`, `IMPLICIT_DENSE_FRACTION_DRAG`) | Needed to bring the dense drag frame under the unchanged 16 ms limit (B8); release frames are unchanged. Owner may veto: set both to 1 / undefined |
| 2026-10-31 | follow-up-b | B8 coarsening kept after the real optimizations: without it the dense drag is 20.3 ms on two real cores (budget 16); with the coarse curve alone 16.3 ms; with both 13.8 ms. Visual cost: drag mask wrong at 1.69 % of pixels, curve within 0.3 px | Measured, `follow-up-2026-10-31-b.md`; the owner may still veto (question 7 of the handoff) |
| 2026-10-31 | follow-up-b | Two strip Workers on a two-core machine (both cores), drag frames kept in the engine Worker when there are only two strips; idle warm-up of the Workers after load | Needed for the 2-core release budget; see `follow-up-2026-10-31-b.md` |
