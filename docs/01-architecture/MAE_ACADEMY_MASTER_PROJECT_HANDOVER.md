# MAE Academy - Master Project Handover Documentation

**Document status:** Engineering handover baseline  
**Project:** MAE Academy Interactive Engineering Platform  
**Audience:** Product engineering, simulation-engineering, QA, and maintenance teams  
**Repository baseline:** React + TypeScript + Vite project with client-side route ownership  
**Last verified baseline:** 61 Vitest files / 314 tests passing, TypeScript check passing, production build passing.

> **Purpose.** This is the master maintenance and extension contract for MAE Academy. It records the present implementation structure, the required visual language, the computational responsibilities of every simulator suite, and the non-negotiable boundaries that prevent educational or numerical regressions.

## 1. Executive Summary & Technology Stack

MAE Academy is a client-rendered engineering education platform containing specialized interactive studios for controls, circuits, power electronics, signals, logic, computation, automation, linear algebra, and communication. The running repository uses React with strict TypeScript, Vite, Wouter client routing, Tailwind CSS, Framer Motion, and Node.js tooling. The requested route semantics are represented by `/simulations/:suite/:tool`; this is the Vite/Wouter equivalent of a Next.js-style `/simulations/[id]` hierarchy.

| Layer | Current technology | Ownership and rule |
|---|---|---|
| Application runtime | React 19, TypeScript | Keep solver contracts and React view state separate. Strict type checks are mandatory. |
| Build and routing | Vite, Wouter | `App.tsx` owns top-level routes; `SimulationDetail.tsx` maps simulator suite and tool routes. |
| Styling | Tailwind CSS, global tokens in `index.css` | Theme-aware utilities and the MAE visual contract are preferred over isolated arbitrary styling. |
| Motion | Framer Motion | Use for discrete entrances, panel transitions, and deliberate state changes; do not use it as the numerical simulation clock. |
| Mathematical output | KaTeX / `react-katex` | This is the standard for equations, truth tables, Boolean symbols, integrals, and analytical output. Never expose raw LaTeX to learners. |
| Structured math entry | MathLive where installed | Signal and transform tools use structured editable math input; parsed/evaluated values remain outside the visual editor. |
| Verification | Vitest, `tsc --noEmit`, Vite production build | Each engine is tested as a pure module before UI wiring. |

### 1.1 The 60 fps Invariant

React `setState` must **not** drive high-frequency Canvas/SVG animation, drag rendering, oscilloscope frames, or continuously changing curves. High-rate pipelines retain mutable geometry, cursor position, time, and sampled traces in `useRef` objects and draw through `requestAnimationFrame`. React state is reserved for discrete user intent: selecting a tool, committing a parameter, starting or stopping a simulation, or publishing a calculated result.

The observer boundary is therefore explicit: a solver or signal source publishes typed output; a renderer observes the latest ref snapshot; React renders persistent controls and result metadata. This separation prevents browser stalls during root-locus sweeps, convolution movement, waveform updates, graph pan/zoom, and component dragging.

## 2. MAE Aesthetic & Global Design System

Control Systems and Power Electronics define the preferred visual and operational benchmark. A simulation must read as a calibrated engineering instrument: quiet work surfaces, clear input-to-canvas-to-result flow, exact mathematical typography, and visible but restrained semantic feedback.

### 2.1 Theme, color, and strokes

The existing theme context applies the Tailwind `dark` class. All additions must remain readable in both modes.

| Surface or semantic role | Light mode | Dark mode | Required use |
|---|---|---|---|
| Outer application shell | `bg-gray-50` or project shell token | `bg-gray-950` / dark engineering shell | Page background and framing. |
| Workspace | `bg-white` | elevated `bg-gray-900` | Interactive drawing fields and analytical work areas. |
| SVG component stroke | `#3b4449` | `#E5E7EB` | Electrical symbols, signal axes, logic diagrams, and mathematical geometry. |
| Grid line | `rgba(0,0,0,0.1)` | `rgba(255,255,255,0.1)` | Canvas/SVG construction and 25px circuit grids. |
| Primary state | professional indigo/blue | equivalent high-contrast indigo | Active control, selected tool, current mode. |
| Error state | `text-red-500` | contrast-safe red | Invalid expression, singular matrix, invalid topology, parse failure. |
| Success / snap state | `text-emerald-500` | contrast-safe emerald | Valid solver state, geometric snapping, accepted configuration. |

DC rails are a special exception to generic accent use: they must be strict **T-shaped rails** and remain neutral engineering strokes (`#3b4449` or `#E5E7EB`), not blue decorative elements.

### 2.2 Typography and localization

Use the platform UI sans-serif for interface controls and `font-mono` for numerical values, matrices, codes, truth states, coordinate labels, and generated HDL. Arabic and English are supported by `LocaleContext`; application text adopts the active `dir` value. Mathematical spans, binary values, code, table bits, and symbolic identifiers must remain `dir="ltr"` so that $Q_1Q_0$, $x[n]$, and Verilog identifiers preserve their academic order in RTL layouts.

### 2.3 Micro-interaction rules

Cards and purposeful controls can use restrained elevation and a short `300ms` transition. The standard simulator card pattern is `rounded-xl`, a subtle theme-aware border, and a small upward hover translation. Inputs pair sliders with exact numeric values whenever an engineering parameter is adjusted. Engineering-prefix selectors expose `p`, `n`, `µ`, `m`, `k`, `M`, and `G`; solvers receive normalized SI magnitudes rather than display strings.

Heavy calculations—matrix inversion, large root-locus sweeps, wide transform generation, or expensive signal resampling—are debounced before recomputation. Lightweight visual feedback can update in an animation frame.

## 3. Universal Simulator UI Architecture

The preferred simulator form is an explicit three-pane working field. Compact analytical tools may express the panes as adjacent cards at narrower widths, but they retain the same ownership separation.

| Pane | Typical Tailwind size | Responsibilities | Prohibited responsibilities |
|---|---:|---|---|
| Left: Library / Inputs | `w-80` or `w-96`, `overflow-y-auto`, `border-r` | Components, equations, presets, parameter sliders, input vectors, drag sources. | High-rate plot rendering or result-only summaries. |
| Center: Canvas / Workspace | `flex-1`, relative | Large SVG/Canvas workspace, panning, zooming, drag interactions, construction grid, time plots. | Unbounded React state writes every frame. |
| Right: Inspector / Analytics | `w-80` or `w-96`, `border-l` | Selected-element properties, solver status, calculated quantities, plots, diagnostics. | Owning the canonical geometric state of the central canvas. |

`SimulatorLayout.tsx` provides the universal heading and segmented navigation for route-based studios. `SimulationDetail.tsx` selects a concrete studio component from the suite and tab slug. Digital Logic is intentionally different: its single external `workspace` route delegates to a locally managed six-tool application, preserving the mounted schematic state while local tools change.

```text
/simulations/:suite/:tool
        │
        ├── App.tsx: top-level route ownership
        ├── SimulationDetail.tsx: route metadata → studio selection
        ├── SimulatorLayout.tsx: page title + tool navigation frame
        └── Suite Studio: local inputs + numerical engine + renderer
```

## 4. Simulation Engines Encyclopedia

This section defines the required educational and computational scope for the ten simulator families. The **implemented status** differentiates a mounted specialized studio from a registered route awaiting an approved equation-level scope; it does not relax the standard for future work.

### 4.1 Digital Logic Design Suite

**Status:** Specialized, isolated suite mounted through `DigitalLogicSimulatorApp.tsx`.

Digital Logic uses a discrete-event simulation model with four logic states: `0`, `1`, `Z`, and `X`. Combinational propagation is deterministic and respects gate propagation delay; sequential behavior uses two-phase / delta-cycle commits to avoid race conditions. Wiring semantics are based on terminal roles rather than click order, preventing direction-dependent propagation errors.

| Tool | Engine contract | Learner-facing behavior |
|---|---|---|
| Schematic Workspace | Isolated DES engine, scalable pins, SVG symbols | Draw and wire gates/ICs on a 25px grid without mandatory analog ground constraints. |
| Logic Analyzer | Lexer → Shunting-Yard → AST → evaluator / KaTeX | Boolean expression parsing, canonical truth table, editable outputs, SOP/POS reconstruction. Postfix ASCII/Unicode prime is preserved in the AST and rendered visibly. |
| K-Map Minimizer | Quine–McCluskey + Petrick | 2–4 variable interactive cells, Gray-code headers, `0/1/X`, visual implicant groups, live SOP. |
| Universal Synthesis | Typed synthesis engine | Academic SOP→NAND and POS→NOR derivation using double inversion and De Morgan; symbols use visible prime notation and standard gate diagrams. |
| Timing Waveforms | Tick engine + SVG waveform tracks | Input editing, a deterministic clock, one-tick output propagation, uncertainty/glitch treatment. |
| State Machine Explorer | FSM engine + K-Map simplification | Moore/Mealy, Binary/Gray/One-Hot encoding, excitation tables for D/T/JK/SR, native SVG states, and copyable Verilog. |

Never merge `client/src/DigitalLogicDesign/` into the inherited `v3-simulator/` tree. The former is a protected state domain with explicit decoupled engines and tests.

### 4.2 Signals & Systems Suite

**Status:** Specialized suite synchronized from the v3-2 Signals module tree.

Signals & Systems separates continuous-time (CT) and discrete-time (DT) display semantics. CT paths are smooth sampled polylines; DT results are **stem plots**, each sample represented by a vertical lollipop stem and node. Dirac $\delta(t)$ is symbolic and appears as a vertical arrow; it is not approximated only as a narrow numeric rectangle.

| Tool | Engine / mathematical rule | Visualization rule |
|---|---|---|
| Signal Operations & Properties | Signal AST and structured math evaluation | Shift, scale, fold, periodicity, and energy operations on a sampled analytical view. |
| System Classification | System property evaluator | Linearity, time invariance, causality, stability, and memory classification with direct evidence. |
| Convolution Engine | Continuous and discrete convolution engine | Three-tier field: fixed $x(\tau)$, transformed $h(t-\tau)$, product/area and output $y(t)$. |
| 3D Fourier Analysis | Fourier / harmonic model | Time-domain signal, spectrum, harmonic construction, and waterfall presentation. |
| 3D Laplace & S-Plane | Complex-domain solver | Pole-zero map, ROC logic, and explicit unit-circle treatment in the $z$-plane. |

A custom complex value representation carries real and imaginary parts for Laplace and $Z$-domain calculations. Frequency response uses a base-10 logarithmic axis and phase unwrapping to prevent artificial discontinuity jumps.

### 4.3 E-Circuits Simulator

**Status:** Specialized circuit studios, including canonical and documented tabs.

E-Circuits uses Modified Nodal Analysis (MNA):

$$[A][x]=[z].$$

Component stamps contribute to the system matrix and source vector. Solvers must detect singular systems, floating nodes, impossible source conflicts, and failed nonlinear iterations; the browser must show a controlled diagnostic rather than throw. Circuit wires are strict single-bend Manhattan paths and component terminal positions are snapped by:

$$x_{snap}=\operatorname{round}\left(\frac{x}{25}\right)\times25.$$

Smart diode selection is consolidated through the inspector: silicon, germanium, and GaAs select the corresponding forward-drop behavior in the Newton–Raphson solve path. Labels remain upright by applying inverse rotation relative to their component geometry.

### 4.4 Control Systems Simulator

**Status:** Specialized studios for Root Locus, PID, Frequency Response, and State Space.

Control tools accept transfer functions such as:

$$G(s)=\frac{N(s)}{D(s)},$$

and state-space objects such as $(A,B,C,D)$. Root Locus visualization must derive poles, zeros, characteristic roots, asymptotic guidance, and breakaway behavior from the actual numerical model. The PID tool binds $K_p$, $K_i$, and $K_d$ controls to a responsive step response and metrics including overshoot, settling time, and rise time. Frequency response tools must preserve phase continuity and correctly distinguish magnitude and phase axes.

### 4.5 Power Electronics Simulator

**Status:** Specialized studios for rectifiers, inverters, AC voltage controllers, and choppers.

Power Electronics models switching configurations and presents time-dependent voltage/current behavior. Outputs report ripple voltage $\Delta V$, DC average $V_{DC}$, and RMS quantities. SCR-compatible workflows treat firing angle $\alpha$ as a physical control input whose sweep changes the conduction window and corresponding waveform; the visual update must not invent a result unconnected to the engine state.

### 4.6 Advanced Math & Graphing Engine

**Status:** Platform-capability boundary; structured mathematical input is mounted in signal tools.

The intended graphing subsystem treats entered math as a virtual mathematical DOM. Fractions and superscripts have cursor-aware structure (`upInto`, `downInto`) rather than simple string replacement. Parsing produces an AST, which is compiled into an evaluable instruction sequence. Explicit functions are sampled adaptively near curvature or high-frequency behavior; implicit equations use padded spatial subdivision / quadtree logic to avoid undersampling contours. Labels must remain upright even when the parent geometry has rotation.

### 4.7 Communication & Network

**Status:** Route registered; a specialized Studio awaits an equation-level approved implementation brief.

The planned suite covers analog modulation (AM, FM, PM), digital modulation (ASK, FSK, PSK), SNR computation, AWGN/bit-error studies, network nodes, and packet-flow rendering. Before implementation, an approved model must explicitly define baseband signal assumptions, modulation index or deviation, carrier conventions, bandwidth, noise spectral density, detection method, sampling, and intended error-rate equation. No unapproved communications solver may be inferred from a UI label alone.

### 4.8 Linear Algebra

**Status:** Specialized `LinearAlgebraStudio` with sections a–e.

The Linear Algebra studio owns matrix operations, determinant/RREF workflow, vector-space analysis, eigenvalue/eigenvector interpretation, and geometric transformations. A transformation canvas must use the matrix relation:

$$w=Av,$$

and should distinguish original and transformed coordinates, basis vectors, and any singular transformation condition. Matrix displays use monospace or KaTeX-formatted notation where academically appropriate.

### 4.9 Assembler (8086/RISC)

**Status:** Specialized `AssemblerStudio` and compact entry surface.

Assembler tools render CPU instruction flow, memory placement, register state such as `AX`, `BX`, `CX`, and `DX`, stack operations, and stepwise execution. The execution engine—not presentational animation—remains the source of truth for register and memory updates. Instruction traces must expose the current instruction pointer, decoded operation, pre-state, and committed post-state.

### 4.10 PLC (Programmable Logic Controller)

**Status:** Siemens S7-200 specialized entry plus route-based extension surface.

PLC simulation models ladder diagrams and instruction-list progression. The core scan-cycle ordering is input sampling, program evaluation, then output update. Normal-open and normal-closed contacts, coils, timers, counters, and motor sequence states must be evaluated from the cycle state rather than rendered as unrelated static decoration.

## 5. Directory and Ownership Reference

```text
client/src/
├── App.tsx                         # global client routing
├── pages/SimulationDetail.tsx       # suite/tool dispatcher
├── components/
│   ├── SimulatorLayout.tsx          # global simulator frame
│   ├── control/                     # control studios
│   ├── circuit/                     # circuit tabs and MNA-facing UI
│   ├── power/                       # power-electronics studios
│   ├── signals/                     # Signals & Systems UI and canvas helpers
│   ├── digitalLogic/                # entry bridge to isolated Logic suite
│   ├── assembler/                   # CPU instruction studies
│   ├── plc/                         # ladder / PLC studies
│   ├── linearAlgebra/               # matrix studies
│   └── ui/                          # shared visual primitives / KaTeX support
├── DigitalLogicDesign/
│   ├── DigitalLogicSimulatorApp.tsx # local tab host; preserves schematic mount
│   ├── pages/                       # Analyzer, K-Map, Synthesis, Timing, FSM
│   ├── utils/                       # pure logic, timing, K-Map, FSM engines
│   └── lib/                         # DES runtime and IEEE symbol geometry
├── lib/signals/                     # pure signal, convolution, Fourier, Laplace engines
├── contexts/                        # Locale and theme state
├── data/platform.ts                 # route and tab metadata
└── v3-simulator/                    # inherited V3 application boundary
```

## 6. State, Error, and Safety Contracts

1. **No solver mutates view-only data.** View state may annotate a solver result, but it must not silently alter canonical components, signal definitions, truth data, or matrix coefficients.
2. **Invalid input preserves useful context.** The Logic Analyzer keeps the last valid AST/table while showing an invalid-expression state. Equivalent behavior is required for other parse-driven tools.
3. **Unknown is a value.** `X` and `Z` in logic, unused FSM rows, invalid measurement conditions, and singular MNA diagnostics must be explicit states—not coerced to zero.
4. **Dynamic removal is atomic.** Reducing a gate or IC input count removes connecting wires before removing pins to prevent dangling graph edges.
5. **Keys are semantic and unique.** React lists must use stable entity IDs, not duplicate human-readable labels such as `Code` or recycled state names.
6. **No raw internal identifiers.** UUIDs, wire IDs, node IDs, or raw parser tokens must never reach learner-facing output.

## 7. Quality Gates and Release Procedure

Every implementation change passes the following gates before a checkpoint is saved and published:

| Gate | Required command or inspection | Acceptance criterion |
|---|---|---|
| Unit and integration tests | `pnpm vitest run` | All existing and new tests pass; pure engine tests cover new mathematical branches. |
| Static types | `pnpm check` | `tsc --noEmit` completes with no error. |
| Production build | `pnpm build` | Vite build completes; no unresolved imports. |
| Visual route inspection | Representative screenshots / live path checks | Canvas, SVG, KaTeX, theme contrast, and responsive layout render correctly. |
| Console inspection | Fresh browser logs | No new duplicate keys, unhandled rejections, or render errors. Historical HMR entries are not treated as current failures without reproduction. |
| Scope isolation | Diff review | A targeted suite change does not overwrite stable tool trees outside its boundary. |

## 8. Maintenance and Expansion Protocol

New features follow a solver-first workflow. First define a typed, React-independent model and unit tests. Then render it through a narrow adapter component. Finally, add a UI test and route-level inspection. For complex physical models where formula details are missing, the implementation must stop for an approved equation rather than approximate an instructional result.

When synchronizing external or historical project baselines, copy only the compatible module tree and its declared dependencies. Do not blindly overwrite `SimulationDetail.tsx`, `data/platform.ts`, `DigitalLogicDesign/`, or global theming because they may contain later local integrations. The v3-2 Signals synchronization is the reference pattern: import its isolated signal interfaces and engines, add declared dependency support, then integrate the new route branches without replacing the existing Digital Logic dispatch.

## 9. Sign-Off & Approvals

This handover is accepted when the responsible teams confirm that the declared boundaries, visual rules, mathematical constraints, and release gates are understood and adopted for future work.

| Approval role | Name | Signature | Date | Scope of approval |
|---|---|---|---|---|
| Product Owner |  |  |  | Learning outcomes, simulator inventory, and roadmap priorities. |
| Principal Frontend Architect |  |  |  | Routing, theme, 3-pane architecture, accessibility, and performance boundaries. |
| Simulation / Electrical Engineering Lead |  |  |  | MNA, DES, Signals, Control, Power, and numerical validation contracts. |
| Quality Assurance Lead |  |  |  | Test gates, route inspections, and regression acceptance. |
| DevOps / Release Owner |  |  |  | Checkpoint, publishing, environment, and recovery process. |

> **Final handover statement.** The MAE Academy platform is to be maintained as a set of coherent, independently testable engineering instruments. Visual consistency must never substitute for numerical correctness, and numerical sophistication must never break accessibility, state isolation, or learner legibility.

## References

[1]: ./MAE_ACADEMY_PLATFORM_ARCHITECTURE.md "MAE Academy Unified Platform Architecture"
