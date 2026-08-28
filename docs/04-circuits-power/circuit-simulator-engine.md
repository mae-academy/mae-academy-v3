# Circuit Simulator Engine — Technical Handoff

> **Scope.** This is the technical reference for the E-Circuits implementation currently shipped in MAE Academy. It covers all four tabs at a boundary level, while documenting the active V3/Tab D architecture in operational depth. It is intentionally descriptive: this document does not prescribe a replacement engine or authorize changes to the archived Tab C runtime.

## 1. Simulator Landscape and Boundaries

E-Circuits is presented through the route family `/simulations/circuit-lab/:tool`. `SimulationDetail.tsx` mounts all four circuit tools and switches visibility based on the requested tab. The universal simulator title block and tab rail belong to `SimulatorLayout`; each tab owns only its technical workspace.

| Tab | Route suffix | Runtime / rendering boundary | Status and modification rule |
|---|---|---|---|
| A — Classic | `a` | `components/circuit/CircuitStudio.tsx`; native React/SVG bench with its own local document model. | Separate implementation. Do not assume its types or routing are interchangeable with V3. |
| B — Advanced | `b` | `V3SimulatorApp.tsx` mounts shared V3 `pages/Home.tsx` with the stable engine. | Stable compatibility baseline; preserve existing UI and solver behavior. |
| C — Legacy | `c` | `SimulatorTabC.tsx` embeds `/tab-c-legacy/editor/editor.html` in a same-origin iframe. | Archived engine. Do not modify the minified/editor bundle for normal work. |
| D — Documented | `d` | `V3SimulatorAppD.tsx` mounts the same V3 UI tree with `TabDSimulationEngine`, static MNA adapter, and `tabDUiRefinement`. | Current extension target. New documented UI, geometry, and solver additions must remain isolated here. |

### 1.1 Why Tab D Is Isolated

Tab D intentionally reuses the stable Tab B component tree so its visual language remains familiar, but it supplies a separate engine factory and a separate static MNA evaluator. This gives Tab D a controlled route to documented MNA, nonlinear devices, richer component macro-models, a 25px grid language, and source-derived SVG variants without changing Tab B or Tab C.

> **Boundary invariant:** a rendering behavior, catalog ordering, terminal mapping, property control, or solver stamp that exists only for Tab D must be guarded by the Tab D runtime/refinement path. A shared helper may be extended only when the behavior is truly generic and tests prove compatibility.

## 2. Architecture at a Glance

```text
Route /simulations/circuit-lab/d
        │
        ▼
SimulationDetail + SimulatorLayout
        │
        ▼
SimulatorTabD → V3SimulatorAppD
        │
        ▼
V3 Home (React state, SVG scene, toolbars, inspector)
        │                         │
        │                         ├─ componentDefs.ts (catalog, terminals, properties)
        │                         ├─ symbols.tsx (SVG geometry)
        │                         ├─ wiring.ts + tabDCanvasGeometry.ts (grid and routing)
        │                         └─ circuitTypes.ts (data contracts)
        ▼
TabDSimulationEngine
        │
        ├─ terminal union / wire topology compilation
        ├─ primitive and nonlinear device compilation
        ├─ TabDNewtonMna / documented MNA solve
        └─ SimulationSnapshot → UI, instruments, academic analysis adapter
```

### 2.1 Rendering Technology

The V3 workspace is a **native SVG scene** hosted by React. It is not a canvas bitmap and not a DOM element per circuit line. The scene contains SVG definitions for grid patterns, a transformed workspace group for pan/zoom, component symbol groups, wire paths, terminal dots, selection rectangles, handles, text annotations, and overlays.

| Visual layer | Technology | Responsibility |
|---|---|---|
| Workspace container | React DOM | Defines layout zone, receives pointer/keyboard events, and owns the SVG element ref. |
| Grid | SVG `<pattern>` + `<rect>` | Dot, Cartesian, and hidden modes. Tab D uses a 25px logical pitch. |
| Camera | SVG group transform | Applies translation and scale consistently to grid, components, wires, dots, and labels. |
| Symbols | React SVG renderers in `symbols.tsx` | Creates source, passive, semiconductor, relay, transformer, logic, and instrument geometry. |
| Wires | SVG polyline/path functions | Renders stored `Point[]` paths as straight or orthogonal segments. |
| Terminals | SVG circles plus optional visual lead | Displays connection dots at the authoritative wire endpoint; a short lead bridges body geometry when grid registration differs. |
| Labels / values | SVG text + KaTeX label component | Keeps electrical labels upright even when the symbol body is rotated. |
| Inspector / toolbar | React DOM | Edits selected component, wire, text, transform, grid, and simulator controls. |
| Tab C | Embedded document / legacy SVG editor | Preserved legacy behavior; not part of V3 SVG state. |

### 2.2 V3 Workspace Zones

| Zone | Name | Main responsibilities |
|---|---|---|
| A | Component Library | Search, category groups, two-column Tab D SVG cards, component insertion. |
| B | Active Element & Properties | Inspector for labels, properties, engineering prefixes, transforms, instruments, and wire settings. |
| C | Native Grid Workspace | SVG grid, components, terminals, wires, selection, annotations, panning, zooming, and drawing interaction. |
| Top command bar | Command Center | Zoom, grid mode, snap, wire mode, NAD import/export, clipboard, text, transforms, instruments, run/reset, speed. |
| Phase 3 | Academic Analysis | Nodal/mesh/superposition/source transformation/Thévenin analysis driven from circuit state. |

## 3. Core Data Model

The following contracts are declared in `client/src/v3-simulator/lib/circuitTypes.ts`. They are the authoritative state shapes for the shared V3 document.

### 3.1 Circuit Component

| Field | Type / shape | Meaning |
|---|---|---|
| `id` | string | Stable client-generated instance identifier. Internal only; never show it as learner-facing text. |
| `type` | string | Catalog key resolved through `getDef(type)` in `componentDefs.ts`. |
| `x`, `y` | number | Logical workspace origin / component center. Tab D placements are snapped to its 25px lattice. |
| `rotation` | number | Degrees of symbol rotation. |
| `flipH`, `flipV` | boolean | Horizontal and vertical reflections. |
| `label` | string | Human-readable designator, for example `R1`, `V1`, or `Q1`. |
| `props` | record of unknown values | Typed by the `ComponentDef` property schema at runtime: electrical values, waveform, material, model parameters, toggles, meter mode, etc. |

### 3.2 Wire / Connection

| Field | Type / shape | Meaning |
|---|---|---|
| `id` | string | Wire instance identifier. |
| `fromComp`, `fromTerm` | strings | Component and terminal where the wire begins. |
| `toComp`, `toTerm` | strings | Component and terminal where the wire ends. |
| `path` | ordered two-number points | Logical vertices in workspace coordinates; endpoints are refreshed from current terminal positions. |
| `routing` | `orthogonal`, `straight`, or `manual` | Declares the wire route mode. Tab D constrains its UI to orthogonal behavior. |
| `color` | optional string | Optional visual wire override. |

### 3.3 Supporting UI State

| State family | Shape / examples | Owner and role |
|---|---|---|
| `components` | Array of Circuit Components | Main document state in V3 Home. |
| `wires` | Array of Circuit Wires | Main connectivity/visual route state. |
| `texts` | Array of workspace text records with position, font size, color, and rotation | Movable annotations. |
| `selection` | `null`, component selection, wire selection, or text selection | Determines inspector content and editing target. |
| `pan`, `zoom` | two-number translation and scalar factor | Camera state; pointer coordinate conversion uses both. |
| `gridMode`, `snapEnabled` | Dot/Cartesian/Hidden plus Boolean snapping | Grid presentation and insertion/editing constraint. |
| `wiring` | Draft origin terminal, hover target/point, locked corner data | Live click-to-wire interaction. |
| `dragging` / marquee | Active drag or selection rectangle metadata | Pointer interaction state. |
| `snapshot` | `SimulationSnapshot` | Latest simulation result for voltages, currents, power state, readings, and warnings. |
| `running`, speed / time | Boolean, numeric multiplier, simulation time | Simulation lifecycle and sampling. |

### 3.4 Component Catalog Definitions

`componentDefs.ts` is the catalog source of truth. Every `ComponentDef` specifies a catalog category, type key, display name, description, symbol key, dimensions, terminal records, and property schema. A terminal record has a terminal `id`, learner-readable `name`, and local x/y location. A property record describes the inspector’s control type, unit, default value, select options, limits, and help text.

| Category | Supported families in current V3 catalog |
|---|---|
| Sources | DC voltage, DC power rail, AC voltage, balanced three-phase source, three-phase rail, DC current, AC current, ground. |
| Passive | Resistor, potentiometer, capacitor, inductor, Star (Y) resistor pack, Delta (Δ) resistor pack in Tab D’s curated library. |
| Controlled Sources & Networks | VCCS, VCVS, CCCS, CCVS. |
| Diodes | Tab D smart material-selectable diode, Zener, LED, photodiode; Tab B retains the original material-specific entries. |
| Transistors | BJT NPN/PNP, enhancement MOSFET N/P, JFET N/P. |
| Switches | SPST NO/NC, SPDT, DPST, DPDT, pushbuttons, auxiliary contacts. |
| Protection | Relay SPST/SPDT/DPST/DPDT, contactor, fuse, circuit breaker. |
| Transformers | Two-winding transformer, center-tapped transformer, autotransformer. |
| Power semiconductors | SCR, DIAC, TRIAC. |
| Motors & lamps | DC motor, three-phase motor, lamp. |
| Op-amps | Finite-gain educational op-amp model. |
| Digital logic | Logic input/output plus AND, OR, NOT, NAND, NOR, XOR, XNOR macro-models. |
| Measurement | Voltmeter, ammeter, DMM, four-channel oscilloscope. |

### 3.5 Result Snapshot and Readings

`SimulationSnapshot` is the view-model interface returned by the runtime. It includes time; node, terminal, branch, and wire current maps; powered/intensity maps; history series; keyed instrument readings; warnings; and a convergence flag.

An instrument reading records a numeric value, a unit, and a status (`ready`, `open`, `overflow`, or `unsupported`) with optional continuity, frequency, or waveform samples. UI components should show a safe human-facing state such as open circuit or overload whenever a reading is absent or invalid; they must not fabricate a numeric result.

## 4. Electrical Topology and MNA Pipeline

### 4.1 From Wires to Nets

Wires are geometrically stored as paths but electrically treated as terminal unions. The engine creates a terminal key by combining component ID and terminal ID. It initializes a union-find parent map for every declared terminal, unions the keys at the ends of each wire, and treats the ground terminal’s root as net `0`. All other roots receive named net identifiers.

This separation is essential: changing an orthogonal bend must alter the SVG path but **must not** alter electrical connectivity. Conversely, a new completed wire changes topology regardless of how the path is rendered.

### 4.2 Tab D Runtime Sequence

| Step | Implementation responsibility | Result |
|---|---|---|
| 1. Set circuit | `TabDSimulationEngine.setCircuit` clones components and wire paths, clears documented MNA and device state. | Runtime begins from a clean document snapshot. |
| 2. Compile topology | `compileDocumentedPrimitives` builds terminal unions and identifies ground/reference. | Each terminal resolves to `0` or a named non-reference net. |
| 3. Compile primitives | Component types and normalized properties become resistor/source/reactive/dependent/protection/instrument primitives and nonlinear devices. | Solver-ready MNA primitive arrays plus a commit function. |
| 4. Solve | `TabDNewtonMna.solve` is invoked with elapsed time. | MNA operating point, branch currents, time, and convergence result. |
| 5. Commit state | Device-specific state is updated after solution: reactive histories, relay/contact state, digital level, fuses/breakers, and other protected state. | State is ready for the next step. |
| 6. Adapt observations | Terminal voltages and instrument readings are computed from the solved nets/currents. | `SimulationSnapshot` for SVG/UI/academic analysis. |
| 7. Handle failure | Solver errors are caught and converted into a non-converged snapshot containing a `TAB_D_MNA` warning. | Browser remains alive; the UI reports a safe failure. |

### 4.3 Numerical Models and Safety

| Model | Tab D handling |
|---|---|
| Linear DC MNA | Stamps passive components and independent/dependent sources into the documented MNA system. |
| Nonlinear semiconductors | Uses bounded Newton–Raphson iterations with Shockley-based diode companions. The smart diode’s Material / Type selection changes the physical parameter set for Ideal, Si, Ge, or GaAs. |
| Capacitors / inductors | Uses companion-model state and transient-step handling; documented runtime supports numerical time stepping instead of display-only values. |
| Op-amp / dependent source behavior | Uses finite/high-gain educational macro-model semantics, not a hidden black-box browser calculation. |
| Switching / protection | Relays, contactors, fuses, breakers, power semiconductors, and digital macros retain guarded internal device state across steps. |
| Singular/impossible circuits | Errors are contained as snapshot warnings rather than uncaught React exceptions. Ground/reference is required for the documented solve path. |
| Static analysis | `evaluateTabDStaticMna` adapts documented runtime output to the stable academic/status UI contract. |

### 4.4 Mathematical Presentation

The solver may keep internal net and branch identifiers, but the learner-facing analysis must translate them to readable references and symbols. KaTeX renders academic units and variables. The analysis path includes nodal, mesh, superposition, source transformation, and Thévenin modules, plus normalization and reduced-matrix helpers.

## 5. Interaction System

### 5.1 Coordinate Transform

Pointer input is converted from viewport coordinates to logical workspace coordinates by subtracting the SVG bounding rectangle and pan translation, then dividing by zoom. This avoids the historical offset class of errors created by global page positioning or CSS transform scaling.

| Rule | Effect |
|---|---|
| Use the live SVG/container rectangle | Placement and interaction remain local to the actual canvas. |
| Subtract pan before scaling | Component previews do not jump after viewport panning. |
| Divide by zoom | Logical grid and hit-testing remain consistent across zoom levels. |
| Snap logical coordinates | Component placement, dragging, selected movement, corners, and Tab D endpoints share the same grid. |
| Do not add CSS scale to the SVG host | Native SVG coordinate math and pointer location remain aligned. |

### 5.2 Drag, Select, Copy, and Transform

| Interaction | Behavior |
|---|---|
| Library insertion | A library card adds a component using the catalog default properties, an auto-incremented human label, and a snapped origin. |
| Component movement | Pointer drag and keyboard nudge update logical component position; Tab D uses the 25px grid. |
| Selection | Click selects component, wire, or workspace text; inspector edits the selected object. |
| Marquee | Workspace selection rectangle captures components in range where enabled. |
| Clipboard | Copy/cut/paste clones component data with a new ID and new human label. |
| Rotation / reflection | Selected components can rotate 90° or 45° and flip horizontally/vertically; Tab D exposes these commands in the top toolbar. Symbols rotate, while name/value labels remain upright. |
| Text | A movable text annotation is added by command or keyboard shortcut. |

### 5.3 Wiring and Routing

The user starts a wire by selecting a terminal and completes it by selecting a target terminal. Terminal hit-testing uses the visually authoritative terminal position, not merely the unscaled component definition. A successful wire stores both endpoint ownership and a point path.

| Routing area | Baseline behavior | Tab D-specific behavior |
|---|---|---|
| Grid pitch | Shared V3 defaults use 20px in generic helpers. | 25px local lattice with aligned grid patterns and terminal endpoints. |
| Endpoint refresh | Moving/transforming a component re-resolves its attached wire endpoints. | Uses scaled visual terminal maps, grid alignment, and optional short symbol leads. |
| Default route | Generic route helper supports orthogonal, straight, and manual modes. | Orthogonal terminal-aware route only. |
| Short paths | Generic midpoint routes can require a bend. | Terminal-axis-aware routing avoids a return/hook into the receiving component. |
| Draft corner | Generic paths can be manually edited. | A clicked directional change locks the corner; later pointer movement adds the final orthogonal leg rather than moving the locked corner. |
| Dogleg editing | Existing wire tools can add/move corners. | A lane/corner drag snaps to the 25px lattice and preserves 90° legs. |
| Junctions | Connectivity uses completed terminal-to-terminal wires; geometry helpers support junction/rail logic where applied. | Do not infer an electrical union merely from a visual crossing. |

### 5.4 Zoom and Grid Controls

Tab D uses Dot, Cartesian, and Hidden SVG grid modes, all registered to a 25px origin. Dot markers and Cartesian intersections share the same origin so a terminal can sit on the same logical node in either mode. Wheel zoom is pointer-anchored and intentionally gentler than Tab B’s existing behavior; it clamps the zoom range and does not modify Tab B’s handler semantics.

## 6. Current State and Latest Engineering Checkpoint

### 6.1 Working Scope

The current documented Tab D runtime supports the catalog listed earlier, SVG symbol rendering, selection/transforms, 25px Dot/Cartesian/Hidden grids, component placement, terminal hit testing, orthogonal wiring, inspector property editing, engineering prefixes, simulation status, MNA/NR failure reporting, meters, scope UI, and the academic-analysis surface.

The last feature work before this document focused on **grid registration of symbols**. The documented resistor now maps its visual leads to exact lattice points. The variable resistor uses a centered IEEE-style body and vertical wiper endpoint that maps to a grid node. The Star pack retains its three 120° resistor bodies, but short terminal-lead corrections allow all three connection endpoints to land on valid 25px coordinates. Tests verify these world coordinates after Tab D’s 1.5x visual symbol scale.

### 6.2 Current Verification Baseline

| Check | Latest verified outcome at documentation time |
|---|---|
| TypeScript | Passed with no type errors. |
| Vitest | 19 test files and 102 tests passed. |
| Production build | Passed; existing large bundle-size advisory remains non-blocking. |
| Tab B isolation | Route loaded with its original grid/catalog behavior. |
| Tab C isolation | Legacy archival route loaded independently. |
| Tab D grid registration | Resistor, potentiometer, and Star terminal positions tested on the 25px lattice. |

## 7. Critical Warnings and Safe Change Protocol

> **Do not treat the simulator as a single file.** A visual terminal, the wire endpoint, its terminal definition, its MNA net, its inspector property, and its tests can form one cross-file contract.

| Risk area | Why it is risky | Required safeguard |
|---|---|---|
| Tab boundaries | Tab B and Tab D share V3 Home and symbol registry code, while Tab C is legacy iframe content. | Gate Tab D-only behavior through the documented flag/runtime. Browser-check B, C, and D after shared changes. |
| `componentDefs.ts` | Defines terminal count, local coordinates, properties, sizes, categories, and labels used by rendering and solver compilation. | Update symbol geometry, visual terminal maps, solver compiler, and tests together when changing a terminal or property. |
| `symbols.tsx` | A renderer can have documented and legacy branches. | Do not replace a common branch simply because Tab D needs new geometry. Preserve non-documented output. |
| `Home.tsx` | Owns the shared V3 event model, camera, document state, and inspector wiring. | Avoid broad rewrites. A change to terminal coordinate math can regress dragging, zoom, selection, and Tab B. |
| Wire geometry | Visual points and electrical topology are related but distinct. | Never make a visual crossing electrically connected without an explicit graph rule. Keep all endpoints on the intended grid. |
| 25px visual scale | Tab D symbols render at a 1.5x visual scale relative to catalog local coordinates. | Derive/document visual terminal mappings mathematically; do not “eyeball” rounding. Test world coordinates. |
| MNA stamping | Incorrect matrix row/column or source branch handling can silently give false engineering results. | Add pure solver tests, singularity/error tests, KCL/KVL sanity checks, and known-circuit comparisons before UI use. |
| Nonlinear iteration | Newton–Raphson can fail to converge or become numerically unstable. | Bound iterations, preserve error reporting, and never replace failure with fabricated values. |
| Reactive transient state | Capacitor/inductor companion state is time-dependent. | Reset appropriately on document reset; test time-step behavior separately from static DC analysis. |
| Tab C legacy bundle | It has historical input, iframe, and lifecycle assumptions. | Do not edit/minify/replace it for normal Tab D or styling work. Work at its thin React wrapper only when explicitly required. |
| Academic output | Raw IDs and raw LaTeX harm learner-facing output. | Translate identifiers and use KaTeX for electrical notation. |

## 8. Recommended Extension Workflow

| Change type | Safe sequence |
|---|---|
| New visual symbol in Tab D | Add documented SVG branch → confirm terminals → add/update Tab D visual terminal map → register grid endpoints → add symbol/geometry tests → browser-check placement/wiring. |
| New electrical component | Extend `componentDefs.ts` schema → implement isolated primitive/stamp in Tab D compiler → add pure solver tests and error cases → expose inspector controls → bind SVG → validate known circuit. |
| New analysis theorem | Build a decoupled TypeScript solver first → add deterministic tests → translate data to readable/Katex output → connect UI. |
| Wire UX adjustment | Modify pure geometry helpers first → unit-test path shapes and grid alignment → wire into Tab D branch → test short, long, moved, rotated, and zoomed connections. |
| General V3 UI adjustment | Verify whether it belongs to B and D. If only D needs it, use the refinement branch rather than changing the baseline UI. |

## 9. File Map for Simulator Work

| File | Read or change it when… |
|---|---|
| `components/circuit/SimulatorTabB.tsx` | Confirming the stable advanced wrapper. |
| `components/circuit/SimulatorTabC.tsx` | Adjusting only the archival wrapper, not legacy engine internals. |
| `components/circuit/SimulatorTabD.tsx` | Confirming Tab D entry from the route. |
| `v3-simulator/V3SimulatorApp.tsx` | Reviewing Tab B V3 mount boundary. |
| `v3-simulator/V3SimulatorAppD.tsx` | Reviewing Tab D engine/flag injection. |
| `v3-simulator/pages/Home.tsx` | Changing shared visual workspace, input flow, catalog display, toolbars, inspector, terminal visuals, or wire handling. |
| `v3-simulator/lib/circuitTypes.ts` | Changing circuit-document state or result payload shapes. |
| `v3-simulator/lib/componentDefs.ts` | Changing catalog metadata, terminals, dimensions, or inspector schema. |
| `v3-simulator/lib/symbols.tsx` | Changing SVG symbol geometry; preserve documented/legacy branches. |
| `v3-simulator/lib/wiring.ts` | Changing generic snapping/path geometry. |
| `v3-simulator/lib/tabDCanvasGeometry.ts` | Changing Tab D-only zoom, grid, terminal alignment, or orthogonal-routing rules. |
| `v3-simulator/lib/simulation.ts` | Reviewing generic engine behavior used by baseline V3. |
| `v3-simulator/lib/tabDSimulation.ts` | Changing Tab D primitive compilation, runtime state, readings, or error adaptation. |
| `v3-simulator/lib/tabDDocumentedMna.ts` | Changing documented linear MNA primitive stamps. |
| `v3-simulator/lib/tabDNewtonMna.ts` | Changing nonlinear iteration/companion behavior. |
| `v3-simulator/lib/*test*` | Adding or adjusting regression coverage with every material engine or geometry change. |

## 10. Maintenance Requirement

Whenever a new solver family, terminal model, renderer mode, persistence mechanism, or tab boundary is added, update this document and `project-architecture-and-style.md` in the same checkpoint. The documents are intended to prevent future contributors from unknowingly crossing a stable boundary or treating visual geometry as independent of electrical behavior.
