# Legacy Root Locus Integration Boundary

## Scope Contract

The source of truth is the supplied legacy archive. The new MAE Academy will keep its existing page shell and tool navigation, while the **Root Locus workspace** will receive the legacy simulator internals without functional changes.

| Legacy source | Role in the integration | Preservation rule |
|---|---|---|
| `components/control/RootLocusStudio.tsx` | Main state model, S-plane canvas, step-response canvas, gain calibration, roots, metrics, and interaction handlers | Preserve calculations, defaults, control behavior, drawing logic, pan/zoom, reset, autoscale, and animation timing. |
| `components/control/TransferFunctionInput.tsx` | Polynomial/ZPK input modes and live transfer-function LaTeX rendering | Preserve the data shape, parsing, formulas, defaults, and field behavior. |
| `components/control/RootLocusStepsPanel.tsx` | Six analytic steps and `Show` highlight actions | Preserve all step IDs, formulas, conditions, and highlight triggers. |
| `components/ui/KatexMath.tsx` | KaTeX rendering with tolerant parse handling | Preserve `throwOnError: false`, display behavior, and output rendering. |
| `lib/controlMath.ts` | Polynomial roots, breakaway logic, root-locus trajectories, RK4 response, and metrics | Copy unchanged, including numerical thresholds and adaptive trajectory logic. |

## Integration Limits

The Root Locus simulator will be mounted only within `/simulations/control-systems/root-locus`. No changes will be made to the legacy mathematical engine, formulas, default coefficients, plot semantics, user controls, metric definitions, or Show-button animation contract. New-site work is limited to import-path adaptation, dependency installation, and containment inside the established MAE page layout.

## Required Legacy Capabilities

The integrated workspace must retain Polynomial and ZPK transfer-function entry; KaTeX transfer-function output; Cartesian and polar S-plane grids; drag pan, scroll zoom, reset; closed-loop roots; gain calibration; RK4 step response with max-time input; transient metrics; and the analytic steps with their canvas highlight effects.
