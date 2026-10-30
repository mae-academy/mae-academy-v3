# Graph IR 1.0 specification

Source of truth for the state document (STEPS.md §5, ADR-9). Code: `shared/mathcore/ir/types.ts` (types),
`shared/mathcore/ir/schema.ts` (validation), `shared/mathcore/ir/codec.ts` (links). Open points are settled by
owner decisions Q5–Q12 (`docs/mathcore/reports/owner-decisions-2026-10-30.md`).

## Document

| Key | Required | Type | Rules |
|---|---|---|---|
| `version` | yes | string | Must be a supported version (`"1.0"`); anything else is rejected with the supported list |
| `viewport` | yes | object | `xmin < xmax`, `ymin < ymax`, all finite; `aspect` is `equal` (default) or `free` |
| `params` | no (default `{}`) | object | ≤ 50 entries; see Parameters |
| `items` | yes | array | ≤ 100 entries; see Items |
| `view` | no | object | `mode` `2d` (`3d` rejected while D3 is deferred), `grid` and `showSteps` booleans, `locale` `ar` \| `en` \| `es` |

Unknown keys are rejected at every level, with the path of the key (Q8).

## Parameters

Name: one letter or a Greek name (`alpha` … `chi`), optionally with a subscript `_[A-Za-z0-9]+`; never a reserved
symbol (`x, y, z, t, r, theta`).

| Key | Rule |
|---|---|
| `value`, `min`, `max`, `step` | finite; `min < max`; `min ≤ value ≤ max`; `step > 0` |
| `animate` | optional: `from`, `to` within `[min, max]`; `period_s` in [0.5, 60]; `loop` boolean (default true) |

Every free symbol of an item that is not reserved and not defined by another item becomes a parameter automatically
with `value 1, min −10, max 10, step 0.1` (`ir/autoParams.ts`, Q10).

## Items

| Key | Rule |
|---|---|
| `id` | `[A-Za-z0-9_-]{1,32}`, unique in the document |
| `latex` | ≤ 2000 characters; parsed MathJSON ≤ 5000 nodes (checked by `parse/parse.ts`) |
| `kind` | optional; one of the STEPS.md §6.1 type names or `Matrix`. `inferType` decides; a disagreeing `kind` produces a warning, never a different type (Q5) |
| `style` | optional: `color` (`#RRGGBB` or a design-token name), `width` in (0, 10], `fill`, `hidden`, `dash` (`solid` \| `dashed` \| `dotted`) |

## Dependencies

Items form a DAG through the names they define (`a = 2`, `f(x) = …`, `M = [[…]]`) and use. Cycles are rejected with
an error naming the items in the cycle (`graph/dag.ts`). A parameter change re-evaluates only its dependents.

## Links

`JSON.stringify(graph)` → `lz-string.compressToEncodedURIComponent` → `?g=`. Encoded length above 8192 characters is
not truncated: the link is refused with "too large to share as a link" and JSON export is offered (`ir/codec.ts`).

## MAE AI

MAE AI emits Graph IR only, never computed numbers; numbers always come from the engine.
