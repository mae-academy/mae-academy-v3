# Digital Logic Design — DES Upgrade Handoff

## Scope and isolation

The discrete-event simulation upgrade is confined to `client/src/DigitalLogicDesign`. The mounted route is `/simulations/digital-logic-design/workspace`, and `DigitalLogicSimulatorApp.tsx` now constructs `DiscreteEventLogicEngine`. The original E-Circuits routes, including Tab B, Tab C, and Tab D, retain their separate modules and runtime behavior.

## Runtime architecture

`lib/desLogicCore.ts` provides a React-independent, four-state logic core. `LogicState` supports `0`, `1`, `Z`, and `X`; all gate and behavioral equations preserve unknown-state propagation. `LogicComponent` provides staged output state, while event processing is ordered by scheduled nanosecond timestamp, delta phase, and insertion sequence. Evaluate events stage next outputs; commit events publish those outputs and schedule connected receivers, preventing sequential components from racing within one logical edge.

The core exposes `subscribeToWire(wireId, listener)`. The workspace registers these observers only for the active wire document and updates the corresponding SVG path directly. React snapshots are coalesced on an animation frame and timer-state refreshes are limited for the Digital Logic route. This keeps wire-state rendering out of a high-frequency `useState` loop while preserving inspector and status correctness.

## Component catalog

The Digital Logic workspace filters exclusively to these visual groups:

| Group | Components |
|---|---|
| I/O | Logic Input, Logic Output |
| Logic Gates | AND, OR, NOT, NAND, NOR, XOR, XNOR |
| Combinational Circuits | Half/Full Adders, Half/Full Subtractors, Comparator, Priority Encoder, selector-scalable Decoder/MUX/DEMUX, N-Bit Adder, Parity Generator/Checker, ALU (4-bit) |
| Sequential Circuits | Clock, SR/D/JK/T Flip-Flops, Shift Register, Counter, N-Bit Register, RAM (16×8), ROM (16×8), Frequency Divider |

Advanced items render as behavioral IC blocks whose visible leads are generated from the same runtime pin maps as the DES engine. Their equations remain behavioral rather than expanding to internal gate objects. MUX, Decoder, and DEMUX expose one to three selector bits, yielding 2, 4, or 8 data/output lanes. N-Bit Adder and N-Bit Register expose 4-bit and 8-bit modes. RAM implements a bounded 16×8 synchronous-write memory with output enable; ROM is a deterministic 16-word educational address-image; and Frequency Divider supports divide-by 2/4/8/16. Changes to a scalable property are transactional: the workspace derives the new pin set, removes every wire connected to a removed pin, then commits the component and retained wire document together. The Clock has an editable period in milliseconds, and clock edges are scheduled from that period rather than tied to browser-frame count.

## Validation record

The DES suite includes independent `logicGateTruthTables`, `combinationalLogic`, `sequentialLogic`, and `desEngineEdgeCases` files. It covers every basic two-input truth-table row, dynamic four-input AND, Full Adder, 4×1 MUX routing, active-high Decoder, parity, ALU addition, D/JK edge behavior, serial-to-parallel shifting, RAM/ROM, Frequency Divider, multi-driver conflicts, and a delayed NOT feedback loop. Conflicting non-Z drivers resolve to `X`, while feedback processing is capped per simulation slice and queued rather than recursing. Geometry tests cover 20px pin axes, selector/bit lane contracts, and wire pruning for removed dynamic pins. The project-wide command `pnpm vitest run` completed with **43 passing test files and 231 passing tests**. `pnpm check` and `pnpm build` also completed successfully after the upgrade.

## Maintenance constraints

Do not reintroduce the analogue MNA runtime as the mounted Digital Logic execution engine. `digitalLogicSimulation.ts` explicitly ignores DES-only types for its legacy documented-MNA preparation path so clone regression coverage stays intact; this is not the active logic simulator. Keep new logic components synchronized across `logicPinsFor`, component definitions, `dynamicLogicGeometry.ts`, behavioral equations, and the atomic scale-update flow in `pages/Home.tsx`. Preserve the 25px grid, direct wire observer pattern, and original Tab D isolation when extending this feature.

## Symbol geometry contract

Complex Digital Logic symbols use `logicBlockLayoutFor` as their single source of truth for SVG leads, runtime terminals, selection bounds, and palette previews. Its local grid unit projects to the 25px workspace lattice under the established Digital Logic symbol scale. MUX/DEMUX use opposing trapezoids with selector leads on the bottom edge; the ALU uses a left V-notch; full/n-bit adders put carry-in above and carry-out below; flip-flops render an edge-trigger triangle beside the clock lead; and RAM/ROM use a 5% internal storage grid with control leads along the bottom edge. Do not introduce independent renderer-only pin coordinates: any visual lead must originate from the corresponding layout pin.
