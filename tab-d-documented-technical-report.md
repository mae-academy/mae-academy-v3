# Tab D (Documented) — Deep Technical Architecture Report

> **Scope statement.** This document concerns **Tab D (Documented)** of E-Circuits only. It intentionally does not describe Tab A’s independent circuit bench, Tab B’s stable advanced runtime, or Tab C’s archived legacy iframe except where a boundary must be protected. Tab D is the documented extension surface: it shares the V3 workspace view with Tab B while using an isolated runtime, presentation refinements, 25px grid language, and documented MNA path.

## 1. Purpose, Identity, and Non-Negotiable Boundary

Tab D is an academic, interactive circuit workspace whose goal is to let a learner place components, connect terminals, inspect electrical properties, run a guarded numerical simulation, and view analysis in an engineering-readable form. It is not a visual clone detached from mathematics: every visible terminal is meant to map to an electrical terminal key, every completed wire is meant to create a topological union, and every solved value is meant to originate in an MNA calculation or a clearly reported safe failure state.

| Item | Tab D contract |
|---|---|
| Route | `/simulations/circuit-lab/d` |
| Display name | **Tab D (Documented)** / localized equivalents. |
| UI root | Shared V3 `pages/Home.tsx`, entered with Tab D options. |
| Runtime | `TabDSimulationEngine`, an isolated subclass of the general simulation engine. |
| Static analysis adapter | `evaluateTabDStaticMna`, preserving the academic/status view contract. |
| Feature gate | `tabDUiRefinement: true`. This is the primary UI scope gate. |
| Grid | 25px Dot, Cartesian, or Hidden SVG grid. |
| Symbol visual scale | 1.5× local-symbol scale, compensated through visual terminal maps. |
| Wire policy | Orthogonal, terminal-axis-aware, grid-aligned routing. |
| Solver policy | Dedicated documented MNA + damped Newton–Raphson nonlinear path. |
| Tab B policy | Must retain its previous catalog order, 20px behavior, wheel response, symbol branches, and solver runtime. |
| Tab C policy | Must remain an archival editor document; do not modify its bundled legacy engine. |

### 1.1 Entrypoint Chain

```text
SimulationDetail (circuit-lab/d)
  → SimulatorTabD
    → V3SimulatorAppD
      → V3Home(
          createSimulationEngine: TabDSimulationEngine,
          createStaticMna: evaluateTabDStaticMna,
          tabDUiRefinement: true
        )
```

`V3SimulatorAppD.tsx` is deliberately minimal. The architectural separation is provided by dependency injection rather than a duplicate workspace component. This reduces visual divergence, but it also makes `Home.tsx` a high-risk shared file: Tab D changes there must always be scoped through the refinement flag or Tab D injected functions.

## 2. Tab D File Ownership Map

| File | Tab D responsibility | Change risk |
|---|---|---|
| `V3SimulatorAppD.tsx` | Injects isolated runtime, static MNA evaluator, and Tab D presentation flag. | High boundary importance; keep simple. |
| `pages/Home.tsx` | Shared SVG workspace, camera, document state, library, inspector, interactions, grid, labels, wires, analysis UI. | Highest UI regression risk because Tab B uses the same tree. |
| `lib/componentDefs.ts` | Tab D catalog view depends on its component definitions, terminals, dimensions, and property schemas. | Terminal/property changes affect render, topology, inspector, and solver compilation. |
| `lib/symbols.tsx` | Documented SVG branches for Tab D symbols. | Preserve non-documented/Tab B branches. |
| `lib/circuitTypes.ts` | Circuit document, wire, selection, snapshot, and reading contracts. | Changing types is cross-cutting. |
| `lib/wiring.ts` | Generic point, snapping, path, endpoint, corner helpers. | Shared with Tab B; extend carefully. |
| `lib/tabDCanvasGeometry.ts` | Tab D-only gentle zoom, terminal alignment, locked draft corners, orthogonal terminal routing, dogleg lane movement. | Preferred home for new Tab D geometric logic. |
| `lib/tabDSimulation.ts` | Isolated circuit compiler, device state, solve lifecycle, readings, failure adaptation. | High mathematical risk. |
| `lib/tabDDocumentedMna.ts` | Linear documented MNA stamps, LU factorization, backward-Euler R/C/L companions. | Never make visual-only edits here. |
| `lib/tabDNewtonMna.ts` | Damped Newton–Raphson nonlinear companions and Shockley-current helpers. | Requires numerical validation. |
| `lib/tabDResultAdapter.ts` | Converts snapshot output into a safe observable operating point. | Keep output contract stable. |
| `lib/*.test.ts(x)` | Geometry, symbols, MNA, Newton, documented runtime regressions. | Update with every model/geometry change. |

## 3. UI Architecture and Zone Responsibilities

### 3.1 Command Center

The upper command bar controls the viewport and document actions. It is deliberately separate from the academic inspector so spatial transformation controls are available near other workspace commands.

| Control family | Tab D behavior |
|---|---|
| Zoom | Minus/plus buttons and pointer-anchored mouse wheel. Wheel delta is normalized and clamped through `tabDGentleWheelZoomFactor`. |
| Grid | Dot, Cartesian, Hidden. Each uses an SVG pattern with the same 25px origin. |
| Snap | Component insertion, movement, corners, and visual terminal endpoints share the 25px coordinate language. |
| Wire | Enables click-terminal-to-terminal drafting. |
| NAD | Import/export circuit document format. |
| Clipboard | Copy, cut, paste selected component state with new instance ID and human label. |
| Text | Adds a movable annotation. |
| Transform | Rotate 90°, Rotate 45°, Flip X, Flip Y; active only for a selected component. |
| Instruments | Add DMM or scope components. |
| Run / Reset / speed | Starts solver stepping, resets engine/document solve state, and changes simulation cadence. |

### 3.2 Zone A — Component Library

Tab D’s library is a two-column card grid rather than Tab B’s legacy list. Each card renders a true SVG preview, not a generic icon. The preview uses a generous 102×88 viewport, an internal 1.08 scale, and a local span derived from the component dimensions. Card labels are intentionally smaller than the symbol so visual recognition comes first.

| Library behavior | Tab D detail |
|---|---|
| Search | Filters catalog entries without changing the master definition registry. |
| Categories | May be reordered or curated only in the Tab D display branch. |
| Passive category | Includes resistor, potentiometer, capacitor, inductor, Star (Y), and Delta (Δ) packs. |
| Diode category | Shows a single smart **Diode** entry with Ideal / Si / Ge / GaAs material selection in the inspector, plus Zener/LED/photodiode. |
| Power semiconductors | SCR, DIAC, and TRIAC are intentionally excluded from the Tab D learner catalog and Tab D NAD imports; their Tab B definitions and runtime branches remain unchanged. |
| Preview rendering | `renderSymbol` receives `_documentedStyle: true`; this selects Tab D geometry where a documented branch exists. |
| Insertion | Uses `addComponent`, catalog defaults, next human reference label, and snap-to-grid placement. |

### 3.3 Zone B — Inspector and Academic Output

Zone B is the selected-object inspector and numerical interpretation panel. It never exposes internal UUIDs. Component properties are driven from `ComponentDef.properties`, so adding a property to a definition is the supported route to an inspector control.

| Inspector topic | Tab D rule |
|---|---|
| Labels | Human-readable reference labels, e.g. `R1`, `V1`, `Q1`. |
| Position | Arrow movement and a position readout remain in Zone B. |
| Transform | Moved to Command Center in Tab D; it is intentionally absent from Zone B. |
| Units | Prefixable values in Ω, F, H, V, A use prefix selectors such as p, n, µ, m, base, k, M, G. Solver storage is normalized to base units. |
| Smart diode | Material / Type changes corresponding physical values used by the nonlinear model. |
| Wires | Tab D locks routing to orthogonal mode and presents the documented route policy rather than manual/straight modes. |
| Academic display | KaTeX renders units and variables; labels stay upright after component transforms. |

### 3.4 Zone C — Native SVG Workspace

The workspace is a stateful SVG scene. The root SVG receives mouse, drag/drop, wheel, and context-menu protection. A transformed inner group contains all logical objects. The grid is not a CSS background; it is drawn in SVG so it pans and zooms with components and wires.

## 4. State Model in V3 Home

`V3Home` is a functional React component. Tab D does not have a duplicate state tree: it selects alternate behavior through `tabDUiRefinement` and its injected engine.

| State | Shape | Tab D significance |
|---|---|---|
| `components` | Array of `CircuitComponent` | Authoritative component document. |
| `wires` | Array of `CircuitWire` | Authoritative terminal connectivity and SVG path storage. |
| `texts` | Array of `WorkspaceText` | User annotations; independent of electrical topology. |
| `selection` | Component, wire, text, or `null` | Selects inspector and edit semantics. |
| `marqueeIds` | Array of component IDs | Current multi-selection visual state. |
| `clipboardComponent` | Component or `null` | Copy/cut/paste source snapshot. |
| `pan` | Two-number point | SVG camera translation. |
| `zoom` | Scalar | SVG camera scale, bounded from 0.2× to 3×. |
| `tabDGridMode` | dots / cartesian / hidden | Tab D grid view. |
| `snapEnabled` | Boolean | Logical placement/corner snap control. |
| `wiring` | Draft state | Start terminal, hover target/point, and locked corners. |
| `dragState` | Drag metadata or `null` | Component/text/marquee/pan interaction lifecycle. |
| `cursor` | Two-number point | Latest logical pointer position for preview. |
| `search`, `collapsedCategories` | Library UI state | Does not alter the definition registry. |
| `simulationRunning`, `simulationSpeed` | Boolean and scalar | Controls animation frame solve stepping. |
| `snapshot` | `SimulationSnapshot` | Latest node/terminal/branch/readings/warnings result. |
| `animationTime` | Number | Symbol and waveform visual animation time. |
| `darkPreview` | Boolean | Mirrors root `.dark` class via `MutationObserver`. |
| `analysisTraces`, `activeAnalysisMethod` | Mesh/nodal trace records | Drives pedagogical overlays and derivation views. |

### 4.1 Core Object Shapes

| Object | Required fields | Meaning |
|---|---|---|
| Component | ID, type, x/y, rotation, flipH, flipV, label, props | A placed catalog item. `props` stores component-specific electrical and UI values. |
| Wire | ID, source component/terminal, destination component/terminal, ordered point path, routing mode, optional color | A visual wire and an electrical terminal union. |
| Workspace text | ID, x/y, text, font size, color, rotation | A non-electrical drawing annotation. |
| Selection | Kind and ID or null | Identifies one editable object. |
| Snapshot | Time, voltage/current maps, history maps, readings, warnings, convergence flag | Solver-to-UI data transport. |
| Instrument reading | Value, unit, status, optional continuity/frequency/samples | Safe display model for meters and scopes. |

### 4.2 Reference Labels

The component reference is generated by `nextComponentLabel` using a type-to-prefix map. Examples include `V` for voltage source, `R` for resistor, `RV` for potentiometer, `D` for diode, `Q` for transistors, `K` for relay/contactors, `T` for transformers, `VM` for voltmeter, `DMM` for multimeter, and `OSC` for scope. The ID remains internal; the reference label is learner-facing.

## 5. Coordinate System, Grid, and Symbol Registration

### 5.1 Logical Coordinate Layers

| Layer | Meaning | Rule |
|---|---|---|
| Browser client coordinates | Mouse/touch position relative to viewport. | Never use directly as circuit coordinates. |
| SVG local/world coordinates | Client point minus SVG bounding rectangle and pan, divided by zoom. | Used for all placement, hit-testing, drag, and drafting. |
| Component origin | `component.x`, `component.y` logical center. | Tab D origins snap to 25px. |
| Raw visual terminal | Component origin plus transformed/scaled local terminal coordinate. | Aligns with source SVG body. |
| Snapped terminal | Raw visual terminal projected to 25px lattice. | Authoritative wire endpoint and terminal dot. |
| Wire path | Ordered world points. | Endpoints match snapped terminal points; interior corners remain grid-aligned. |

The client-to-world transformation is conceptually: subtract the SVG’s left/top location, subtract current pan, then divide by zoom. Keeping this transformation in one shared callback prevents the classic “component drifts away from cursor after panning” bug.

### 5.2 Tab D Constants

| Constant | Current meaning |
|---|---|
| `TAB_D_GRID_SIZE` | 25 logical pixels. |
| `TAB_D_SYMBOL_SCALE` | 1.5× visual symbol body scale. |
| Wheel delta clamp | −80 to +80 pixels prior to exponential scaling. |
| Gentle zoom coefficient | 0.00045 in the exponential zoom factor. |
| Zoom clamp | 0.2× to 3×. |

### 5.3 Terminal Authority Rule

The raw symbol terminal is not automatically the visible electrical connection point. For Tab D, `getRawCanvasTerminalPosition` computes source geometry under visual scale, rotation, and reflection; `getCanvasTerminalPosition` then aligns the point to the 25px lattice. When raw and snapped points differ, rendering draws a short noninteractive visual lead from the symbol body to the snapped terminal dot.

This is intentional. It resolves the conflict between large 1.5× symbols, arbitrary SVG local geometry, and a fixed 25px wiring lattice. Wires connect to terminal dots, terminal dots sit on Dot and Cartesian grid nodes, and visual leads prevent a gap between body and electrical endpoint.

### 5.4 Documented Terminal Overrides

Some Tab D symbols have source-specific visual terminal maps because their documented SVG geometry differs from shared catalog-local offsets.

| Symbol | Tab D visual terminal policy |
|---|---|
| Three-phase source | L1/L2/L3 at the three right-hand outputs; neutral at the opposite left output. |
| Resistor | Symmetric leads use local ±100/3, mapping through 1.5× scale to ±50px world distance—an exact 25px multiple. |
| Potentiometer | Equal horizontal endpoints use local ±100/3; vertical wiper uses local −100/3, mapping to the upper grid node. |
| Star pack | Three pins use local ±100/3 positions so world points land on exact lattice nodes, while short visual lead corrections preserve 120° body geometry. |
| Delta pack | Visual vertices are mapped separately from the shared default definition. |

### 5.5 Label Geometry

Symbol bodies may rotate; labels do not. The outer component group applies translation, while an inner symbol group applies rotation/reflection/scale. Labels render in the outer layer with an orientation-aware offset:

| Terminal arrangement after transform | Label placement |
|---|---|
| Horizontal two-terminal body | Above the component. |
| Vertical two-terminal body | To the side of the component. |
| Other component families | Horizontal baseline with a calculated clearance from symbol dimensions. |

## 6. SVG Symbol System

### 6.1 Rendering Contract

`symbols.tsx` maps catalog symbol keys to React SVG renderers. Every renderer receives current property data, powered state, animation time, and a documented-style marker. A documented-style renderer must keep terminal geometry, line weight, and output group bounds compatible with Tab D visual terminal maps.

| Rule | Required practice |
|---|---|
| Documented branch | Use `_documentedStyle: true` for Tab D-only geometry. |
| Shared branch preservation | Keep Tab B/legacy visual branches available. |
| Standard linework | Use consistent dark schematic ink `#1A2744` unless a semantic electrical color is explicitly required. |
| Terminal proximity | Symbol lead must reach the raw visual terminal; bridge reaches the snapped endpoint when necessary. |
| Transform integrity | Draw related geometry in a rigid `<g>` so rotate/flip transforms move all parts together. |
| Text | Keep name/value outside rotated symbol group. |

### 6.2 Documented Symbol Refinements Already Implemented

| Family | Tab D implementation status |
|---|---|
| DC power rail | T-shaped neutral linework, not a blue special-case rail. |
| VAC / IAC | Centered sine wave; IAC places the waveform on the source-circle centerline beneath its direction arrow. |
| VABC | Circular PHASE body with right-side phases starting exactly at the circle boundary; the central phase is axis-aligned and the upper/lower phases use their matching circle intersections. |
| Three-phase rail | Horizontal red/yellow/blue phase lines with neutral. |
| Resistor | Centered IEEE-style rectangular body matching the documented potentiometer body, with no wiper branch and lattice-aligned leads. |
| Potentiometer | Centered 3:1 IEEE-like rectangular body, equal endpoints, centered vertical wiper. |
| Inductor / coils | Repeated regular semicircular arcs. |
| Star/Delta | Each network uses three identical compact rectangular resistor arms. Star arms are placed at 0°, 120°, and 240° without return paths or overlap; their snapped terminal dots retain the 25px lattice contract. |
| Op-amp | IEEE-style triangle with conventional − upper and + lower inputs; all five leads terminate at the true triangle boundary before continuing to their 25px-grid terminal dots. |
| BJT | Direct collector/emitter slopes and transformed arrowheads collinear with emitter lead. |
| Transformer / CT / autotransformer | Regular half-circle windings, core/tap geometry, straight terminal extensions. |
| Relay / contactor | Semicircular coil body with existing contacts preserved. |

## 7. Orthogonal Wiring System

### 7.1 Input Lifecycle

| Phase | Behavior |
|---|---|
| Select start | Click within terminal hit radius. Draft stores source component ID, terminal ID, exact snapped terminal point, and terminal axis. |
| Hover / move | Cursor world point updates. Tab D draws provisional orthogonal path. |
| Lock a corner | A click away from final terminal locks a horizontal or vertical corner based on dominant movement. Locked corners do not move afterward. |
| Complete target | Click another terminal; engine resolves both endpoint references and commits a wire. |
| Move component | Attached wires refresh endpoints from current terminal positions. |
| Edit dogleg lane | For a four-point route, dragging a handle relocates the shared lane only; all legs remain 90° and snap to grid. |

### 7.2 Terminal-Axis-Aware Route Selection

The route utility avoids visual hooks where a wire exits one terminal, changes direction, then doubles back toward the receiving terminal. It uses terminal axis as input:

| Start axis | End axis | Preferred initial route |
|---|---|---|
| Vertical | Horizontal | Start vertically from source, then turn horizontally into target. |
| Horizontal | Vertical | Start horizontally from source, then turn vertically into target. |
| Horizontal | Horizontal | Use an x-lane snapped to midpoint; produce horizontal–vertical–horizontal dogleg if endpoints differ in both axes. |
| Vertical | Vertical | Use a y-lane snapped to midpoint; produce vertical–horizontal–vertical dogleg if required. |
| Aligned endpoints | Any | Single direct horizontal or vertical segment. |
| Locked corners exist | Any | Preserve each locked corner and draw only the final provisional leg. |

### 7.3 Draft-Corner Guarantees

`lockTabDWireCorner` never returns a diagonal coordinate. It compares pointer movement from the current anchor: dominant horizontal movement locks x while preserving anchor y; dominant vertical movement locks y while preserving anchor x. `tabDOrthogonalDraftPath` uses locked corners as immutable history and applies routing only to the final open segment.

### 7.4 Electrical vs Visual Semantics

| Visual event | Electrical effect |
|---|---|
| Drag a bend | None; changes only `Wire.path`. |
| Move a component | None to net membership; endpoint coordinates are refreshed. |
| Complete terminal-to-terminal wire | Unions source and target terminal keys into one electrical net. |
| Two wires cross without defined junction | No union should be inferred. |
| Add grid dot or Cartesian line | No electrical effect. |

## 8. Tab D Simulation Runtime

### 8.1 Lifecycle

`TabDSimulationEngine` clones the current components and wires on `setCircuit`, resets documented MNA state, and clears relay, power latch, fuse, breaker, and digital-level state. Each `step(elapsedSeconds)` recompiles documented primitives, solves them, commits applicable dynamic state, derives terminal values/readings, and returns a new snapshot.

| Runtime storage | Purpose |
|---|---|
| `tabDComponents`, `tabDWires` | Cloned document runtime input. |
| `documentedMna` | Dedicated damped Newton–Raphson wrapper around linear MNA. |
| `documentedSnapshot` | Latest Tab D solution or guarded failure snapshot. |
| Relay map | Hysteretic/latched relay and contactor state. |
| Power latch map | Protected state for relevant switching devices. |
| Fuse set | IDs of blown fuses. |
| Breaker set | IDs of tripped breakers. |
| Digital-level map | Current logical analog levels for digital macro-models. |

### 8.2 Net Compilation

Every catalog terminal is assigned a terminal key combining component ID and terminal ID. The compiler creates a union-find parent map, then unions keys for each completed wire. Ground is required; its union root becomes electrical net `0`. All other roots become named nets. This compilation is deterministic and independent of wire path shape.

### 8.3 Primitive Families

`TabDPrimitive` supports resistor, current source, voltage source, capacitor, inductor with series resistance, VCCS, VCVS, CCCS, CCVS, and a resistive switch. Voltage, inductor, VCVS, and CCVS allocate MNA branch-current unknowns. Other models stamp conductance/current relationships directly.

| Primitive | MNA treatment |
|---|---|
| Resistor | Conductance stamp based on inverse resistance with guarded lower bound. |
| Current source | RHS injection from positive to negative terminal. |
| Voltage source | Extra branch-current unknown plus voltage constraint. |
| Capacitor | Backward-Euler conductance `C/dt` plus prior-voltage current companion. |
| Inductor | Branch unknown with companion resistance `L/dt + series R` and prior-current RHS. |
| VCCS | Controlled conductance matrix stamp. |
| VCVS | Branch constraint plus control-voltage gain equation. |
| CCCS/CCVS | Reference an existing current-control branch; missing branch yields safe MNA error. |
| Resistive switch | Uses very low on resistance / very high off resistance rather than physically deleting a branch. |

### 8.4 Linear Solve and Reference Protection

The linear MNA core builds an augmented square matrix and RHS, performs LU factorization with partial pivoting, then uses forward/back substitution. It explicitly rejects singular pivot values and throws a `TabDMnaError` identifying likely causes: missing reference or conflicting ideal constraints. It also rejects any nonempty primitive graph that lacks net `0`.

### 8.5 Nonlinear Devices and Newton–Raphson

Nonlinear devices expose their current direction, a current function of node voltages, and the nodes on which current depends. The solver computes a finite-difference local derivative at each control node, converts the nonlinear branch into VCCS partial stamps plus an equivalent current source, solves the linearized system, then applies damping and bounded voltage increments.

| Safeguard | Current policy |
|---|---|
| Shockley exponent | Clamped between −40 and +40. |
| Current | Bounded by maximum magnitude. |
| Conductance | Bounded by maximum magnitude. |
| Iteration count | Default maximum 50. |
| Voltage tolerance | Default `1e−7`, floor `1e−10`. |
| Damping | Default 0.65, clamped between 0.05 and 1. |
| Voltage update | Per-node delta limited to ±0.35V before damping. |
| Dynamic-state commit | Capacitor/inductor state commits only once after final nonlinear convergence. |
| Failure | A nonconvergence error becomes a Tab D warning snapshot, not an uncaught UI failure. |

### 8.6 Smart Diode Material Binding

Tab D library shows one smart diode. Inspector material choice maps Ideal, Silicon, Germanium, and GaAs to model properties consumed by the nonlinear compile path. The material choice is stateful component metadata, not merely a label. This is a Tab D behavior; Tab B intentionally maintains material-specific catalog entries.

### 8.7 Instrument and Snapshot Adaptation

After a solve, Tab D computes terminal voltages from net mapping, branch currents from primitive/NR output, and reading objects for voltmeters, ammeters, DMM, and scope. The snapshot exposes convergence status and warnings. The observable operating-point adapter is the guarded bridge for instrument/analysis extensions; use it rather than reaching into private engine fields.

## 9. Current Catalog and Modeling Notes

| Family | Representative elements | Tab D behavior note |
|---|---|---|
| Sources | DC/AC voltage/current, rails, VABC | Waveform source value uses amplitude, frequency, phase, offset, and sine/square/sawtooth/triangle selection where applicable. |
| Passives | R, RV, C, L, Star, Delta | R/C/L use documented MNA primitives; RV and network packs have visual terminal registration that must stay synchronized. |
| Controlled | VCCS, VCVS, CCCS, CCVS | Stamped through controlled primitive families; current-controlled types require a valid branch. |
| Semiconductors | Smart diode, Zener, LED, photodiode, BJT/MOSFET/JFET, SCR/DIAC/TRIAC | Educational nonlinear/macro-model path; validate any new physical parameter carefully. |
| Protection and relays | Switches, relays, contactors, fuse, breaker | Visual contacts and state models are related but have separate simulation state transitions. |
| Transformers / op-amp | Transformer, CT, autotransformer, op-amp | Educational dependent-source/macro-model semantics rather than hidden third-party black boxes. |
| Digital | Logic input/output and gates | Analog macro-model semantics using thresholds and output levels rather than a separate pure event simulator. |
| Instruments | Voltmeter, ammeter, DMM, scope | Workspace components with terminals; readings flow from snapshot. |

## 10. Tab D-Specific Regression Tests

| Test area | Primary files | What it protects |
|---|---|---|
| Geometry | `tabDCanvasGeometry.test.ts` | Gentle zoom factor, terminal lattice alignment, locked corners, terminal-aware routing, dogleg lane snapping. |
| Symbols | `symbols.test.tsx` | Documented SVG geometry, coils, BJT arrows, resistor symmetry, variable resistor registration, Star/Delta composition. |
| Runtime | `tabDSimulation.test.ts` | Tab D compiled runtime behavior and material changes. |
| Documented MNA | `tabDDocumentedMna.test.ts` | Primitive stamps, grounded solve requirements, error handling, R/C/L companion behavior. |
| Newton MNA | `tabDNewtonMna.test.ts` | Shockley bounds, nonlinear convergence, damping/error policy. |
| Result adapter | `tabDResultAdapter` tests where present | Safe observable operating-point behavior. |

## 11. Critical Change Warnings

> **The highest-risk Tab D regressions come from changing only one side of a coupled contract.** A terminal cannot be changed safely in only the SVG or only the component definition; a property cannot be changed safely in only the inspector or only the solver.

| Do not change in isolation | Coupled contracts that must be reviewed together |
|---|---|
| Local terminal coordinate | `componentDefs.ts` terminal record, documented SVG lead, `getRawCanvasTerminalPosition` override, `getCanvasTerminalPosition`, wire refresh, tests. |
| Symbol dimension / scale | Palette preview, component hit-box, label clearance, visual terminal map, grid bridge. |
| Grid size | Dot pattern, Cartesian pattern, component insertion, key nudge, drag snap, endpoint projection, wire corners, tests. |
| Wire route helper | Live preview, click completion, attached endpoint refresh, corner handles, Tab B generic routing behavior. |
| Tab D component property | Catalog schema, inspector rendering, display formatting/prefix normalization, primitive compile logic, solver test. |
| Primitive kind | Type union, matrix stamps, branch-current map, compile logic, error cases, academic adapter, tests. |
| MNA failure handling | Snapshot warning UI, run-loop behavior, instrument display, analysis status. |
| Documented SVG branch | Non-documented symbol renderer used by Tab B must remain intact. |

## 12. Safe Extension Procedure for Tab D

| Requested change | Required sequence |
|---|---|
| Visual-only symbol correction | Confirm Tab D scope → adjust documented SVG group → update terminal map if geometry changed → run symbol and geometry tests → verify Tab B/C. |
| Grid/terminal correction | Start with pure geometry helper/test → calculate raw-to-world scale → project endpoint to 25px → add lead only when needed → test actual world coordinates. |
| New wire behavior | Define pure route contract and test short/long/rotated cases → apply in Tab D branch → browser-test Dot and Cartesian plus zoom/pan. |
| New component model | Add definition/properties → decide primitive vs nonlinear/macro model → write solver tests first → compile runtime → bind inspector/SVG → test a grounded known circuit. |
| New material selection | Store explicit property → map to physical model data in compile path → make display/inspector clear → test that material changes computation, not only UI. |
| New academic derivation | Build a decoupled pure TypeScript solver/formatter → validate against known result → adapt to KaTeX output → connect to Tab D analysis UI. |

## 13. Current Status at Report Creation

| Verification | Status |
|---|---|
| TypeScript | Passing at the most recent documented checkpoint. |
| Vitest | 19 files / 102 tests passing at the most recent documented checkpoint. |
| Production build | Passing; only the known large-chunk advisory remains. |
| Tab D grid | Dot and Cartesian share a 25px origin. |
| Tab D terminals | Symbol terminal dots and wire endpoints use the same snapped lattice. |
| Tab D routing | Orthogonal terminal-aware routing, locked drafting corners, and snapped dogleg lanes are implemented. |
| Tab D visual catalog | Two-column SVG library; documented symbol variants for key electrical families. |
| Tab B | Verified independently after prior Tab D refinements. |
| Tab C | Verified independently as archival iframe tab. |

## 14. Maintenance Requirement

Update this report whenever Tab D gains a new terminal topology, symbol-scale rule, grid/routing rule, primitive type, nonlinear model, documented catalog behavior, or integration boundary. Update it in the same checkpoint as the engineering change so future contributors can distinguish intentional Tab D divergence from accidental shared-runtime drift.
