# MAE Academy - Master Core Logic & Simulation Engines Documentation

**Document type:** Simulation-engine handover  
**Scope:** Data models, numerical methods, algorithmic invariants, discrete-event behavior, validation, and state boundaries.  
**Excluded scope:** UI styling, CSS, visual theming, and general frontend composition.

> **Engineering premise.** Every MAE Academy analytical result must arise from a typed computational model, an explicit numerical or logical method, and a controlled failure path. A rendered graph, table, waveform, or diagram is an observer of solver state; it is never the source of truth.

## 1. Core Infrastructure & Performance Tools

### 1.1 Simulation state boundary

The application maintains two distinct classes of state.

| State class | Examples | Storage and update rule |
|---|---|---|
| Durable logical state | Component list, wire graph, signal expression, FSM transitions, selected solver options, sampled result buffer | Typed immutable or controlled mutable data committed after a user action or computation boundary. |
| High-frequency transient state | Pointer coordinates, viewport transform, animation time, scrubber location, intermediate Canvas geometry | Mutable `useRef` snapshots observed in `requestAnimationFrame`; never React state per frame. |

React `setState` is prohibited as the clock for high-frequency physics/math loops. The animation pipeline reads a current typed snapshot, draws it during `requestAnimationFrame`, and schedules only one subsequent frame while the process is active. This prevents render thrashing and memory growth in signal movement, convolution, drag/pan, scope updates, and parameter sweeps.

```text
user input → validate / debounce → pure engine computation
                              ↓
                       typed result snapshot
                              ↓
          React commits discrete UI state / renderer observes ref
                              ↓
               requestAnimationFrame draws current geometry
```

### 1.2 Mathematical presentation boundary

KaTeX is the platform’s global output renderer for equations, integrals, transforms, Boolean notation, truth values, matrices, and derived quantities. The engine returns structured data or LaTeX-safe formula fields; it does not return a raw HTML fragment. Mathematical content remains left-to-right (`dir="ltr"`) independently of interface locale.

### 1.3 Error representation

Every engine returns a controlled result or typed diagnostic. Representative conditions include:

| Domain | Invalid or exceptional condition | Required engine response |
|---|---|---|
| MNA | Singular matrix, floating node, conflicting source | Structured solver error with affected constraint. |
| Boolean parser | Invalid operator order, unmatched grouping, unsupported token | Parse diagnostic while retaining the last valid AST externally. |
| DES | Multiple incompatible drivers, unresolved feedback | Explicit `X` / unknown logic state and bounded event processing. |
| Signal evaluator | Unsupported expression, NaN, infinity, invalid support | Typed invalid sample or parse diagnostic; never silently coerce to zero. |
| Root / transform analysis | Non-convergence or singular evaluation | Bounded iteration outcome with status metadata. |
| FSM | Duplicate IDs, invalid target, unused encoding | Validation failure or explicit don’t-care row. |

## 2. Electrical & Power Engines

### 2.1 E-Circuits: Modified Nodal Analysis

The E-Circuits engine expresses linear circuit constraints in Modified Nodal Analysis form:

$$
[A][x]=[z].
$$

The unknown vector $[x]$ contains node voltages and additional current variables required by ideal voltage sources or dependent constraints. Components contribute stamps to $[A]$ and $[z]$ rather than modifying the final solution directly.

| Element class | Stamp responsibility |
|---|---|
| Resistor / conductance | Adds conductance terms between the two connected node equations. |
| Current source | Adds signed current contribution to the source vector. |
| Voltage source | Adds an auxiliary current unknown and KVL constraint row/column. |
| Dependent source | Adds controlled-coefficient terms and any necessary auxiliary constraint. |
| Capacitor / inductor in transient mode | Uses a numerical companion model for the current time step. |

Ground is the reference node and must be excluded from the unknown voltage basis. Before solving, the engine validates node indexing and circuit topology. A singular system is reported to the caller rather than passed into an unstable inversion routine.

#### Nonlinear diode iteration

Nonlinear components are solved through bounded Newton–Raphson linearization. At iteration $k$, a diode current-voltage model is linearized around the present estimate:

$$
i_D(v_D)\approx i_D(v_D^{(k)})+
\left.\frac{di_D}{dv_D}\right|_{v_D^{(k)}}
\left(v_D-v_D^{(k)}\right).
$$

The material selection—silicon, germanium, or GaAs—changes the physically relevant forward-drop/model constants. Convergence checks include a maximum iteration bound, voltage/current tolerance, and a controlled non-convergence diagnostic.

#### Transient companion models

Transient solvers use a stable companion representation. For a capacitor with timestep $\Delta t$, backward Euler may be represented by:

$$
i_C^{(n)}=\frac{C}{\Delta t}\left(v_C^{(n)}-v_C^{(n-1)}\right).
$$

For trapezoidal integration, the history term is retained and the effective conductance is adjusted accordingly. Inductors use the dual current-history formulation. Any dynamic timestep policy must retain explicit error/convergence bounds.

### 2.2 Circuit topology and geometry contract

Circuit topology is a graph of typed component terminals and net edges. Geometric routing is not the solver, but it is deterministic: each net is a single-bend Manhattan path. Component and terminal coordinates satisfy the 25px snap contract:

$$
v_{snap}=\operatorname{round}\left(\frac{v}{25}\right)\times25.
$$

When a dynamic component loses pins, all attached wires are removed atomically before the pin set is reduced. This prevents dangling graph edges from entering a later MNA or DES pass.

### 2.3 Power Electronics

Power tools maintain a switching topology and a sampled transient waveform buffer. Derived values are computed from samples, not decorative constants.

$$
V_{DC}=\frac{1}{T}\int_0^T v(t)\,dt,
\qquad
V_{RMS}=\sqrt{\frac{1}{T}\int_0^T v^2(t)\,dt}.
$$

Ripple is reported from the appropriate output extrema or waveform definition:

$$
\Delta V=V_{max}-V_{min}.
$$

Thyristor phase control treats firing angle $\alpha$ as a time/phase constraint that alters the conduction interval. Rectifier, inverter, AC-controller, and chopper tools own their switching assumptions and must make those assumptions explicit in input/result data.

## 3. Digital Systems & Hardware Architecture

### 3.1 Discrete Event Simulation (DES)

Digital Logic uses an isolated four-state event engine:

```text
LogicValue = 0 | 1 | Z | X
```

Events carry a timestamp, a deterministic ordering rule, a terminal/value update, and a propagation source. The queue processes events in ascending time order. Combinational gates evaluate variable-length input arrays; their output update is scheduled after the gate propagation delay.

| Gate | Evaluation contract |
|---|---|
| AND | `1` only when all definite inputs are `1`; uncertainty propagates when outcome cannot be resolved. |
| OR | `1` when any definite input is `1`; uncertainty propagates when outcome cannot be resolved. |
| XOR / XNOR | Parity reduction across dynamic input count. |
| NAND / NOR | Inversion of the corresponding resolved aggregate. |
| NOT | Unary inversion with correct `X` and `Z` policy. |

Driver conflicts resolve to `X`, not to an arbitrary last-writer state. Gate input and output roles determine propagation direction; wiring click order must not influence the value flow.

### 3.2 Two-phase commit and delta cycles

Sequential elements must not read writes committed in the same logical evaluation phase. The engine therefore applies a two-phase/delta-cycle procedure.

```text
Phase A: evaluate all triggered sequential elements from committed state
Phase B: stage next outputs / state updates
Commit: apply staged updates together at the delta boundary
```

This model prevents race conditions among flip-flops and supports deterministic clock-edge behavior. Bounded delta-cycle limits detect non-settling feedback rather than allowing a call-stack overflow or unbounded loop.

### 3.3 Boolean compilation and analysis

The pure Boolean compiler follows:

```text
source expression → lexer → implicit AND insertion → Shunting-Yard RPN → AST
                  → evaluator / variable collector / KaTeX generator → truth table
```

Precedence is postfix/prefix complement, AND, XOR, then OR. The parser supports adjacency as AND and stores source complement style so that postfix prime remains visible in academic output. Grouped complement is represented as a unary AST node around the complete child; it is never replaced by an incorrect complement of the last token.

Canonical minterm construction follows the selected truth rows. A `0` expression is legal and produces an empty minterm set rather than a parser crash.

### 3.4 K-Map minimization

K-Map solving is isolated from React. The solver accepts selected minterms, optional don’t-cares, and 2–5 variables. Quine–McCluskey extracts implicants by repeatedly combining terms with one differing bit; Petrick’s method selects a minimum-cost cover when essential prime implicants do not complete coverage.

```text
minterms ∪ don't-cares → implicant combination rounds → prime implicants
true minterms only     → prime-implicant chart → essentials / Petrick cover
selected cover         → SOP terms and diagram-group model
```

Don’t-cares may expand a valid group but are not required coverage targets. Gray-code map geometry translates an implicant into cells and splits wraparound geometry into toroidal segments suitable for SVG drawing.

### 3.5 Universal synthesis, timing, and FSM

Universal synthesis transforms an accepted SOP toward an all-NAND realization and an accepted POS toward an all-NOR realization through explicit double inversion and De Morgan derivation. The engine emits typed stages and a diagram model; it does not use textual `NAND(...)` as the sole final mathematical representation.

Timing Waveforms are tick-indexed. Input tracks are editable, the output is evaluated from a valid Boolean AST, and propagation delay is represented as an integer tick shift. Unknown or transitional periods remain explicit rather than being hidden by interpolation.

The State Machine Explorer uses typed Moore/Mealy states and transitions, supports Binary/Gray/One-Hot encodings, and classifies unused state vectors as don’t-cares. Excitation tables are derived per flip-flop family:

| Flip-flop | Derived condition |
|---|---|
| D | $D=Q^{+}$ |
| T | $T=Q\oplus Q^{+}$ |
| JK | Derived from present/next transition with explicit don’t-care entries. |
| SR | Derived from present/next transition with forbidden/unused conditions isolated. |

Each excitation column can be reduced through the K-Map engine before the Verilog generation step. State and transition identifiers are allocated uniquely; list labels cannot serve as identifiers.

## 4. DSP, LTI, and Control Systems

### 4.1 Complex numbers and transforms

Signals & Systems uses a numeric complex representation:

```text
Complex = { real: number, imag: number }
```

Complex arithmetic methods remain pure: addition, subtraction, multiplication, division with zero checks, magnitude, phase, and conjugation. Transformation engines may cache sampled results but must invalidate caches when signal definition or sampling configuration changes.

### 4.2 Continuous and discrete convolution

Continuous convolution is evaluated numerically from finite support/intersection bounds:

$$
y(t)=\int_{-\infty}^{\infty}x(\tau)h(t-\tau)\,d\tau.
$$

The engine derives overlap bounds from the supports of $x(\tau)$ and transformed $h(t-\tau)$, samples the product at bounded step $\Delta\tau$, and uses trapezoidal integration:

$$
\int_a^b f(\tau)\,d\tau
\approx \sum_{k=0}^{N-1}\frac{f_k+f_{k+1}}{2}\Delta\tau.
$$

Discrete convolution uses the exact finite/infinite-support sum over the defined input range:

$$
y[n]=\sum_{k=-\infty}^{\infty}x[k]h[n-k].
$$

The Dirac delta is a symbolic signal flag. When the applicable sampling property is valid, it triggers an analytical shortcut rather than an unstable finite-height approximation.

### 4.3 Frequency response and Bode data

Frequency-response magnitude is computed from the complex response:

$$
M_{dB}(\omega)=20\log_{10}\left|H(j\omega)\right|.
$$

The frequency grid is base-10 logarithmic. Phase unwrapping chooses a continuous branch by adding or subtracting $2\pi$ whenever a successive sampled difference exceeds the configured branch threshold. The unwrapped phase buffer—not a visual line fix—is the data source for the plotted curve.

### 4.4 Control systems

Control engines work with transfer functions and state-space models:

$$
G(s)=\frac{N(s)}{D(s)},
\qquad
\dot{x}=Ax+Bu,
\qquad
y=Cx+Du.
$$

Root Locus samples gain $K$ and solves the closed-loop characteristic equation for each step. The root solver must report convergence/conditioning and preserve association across nearby gains where needed for stable branches. PID input changes $K_p$, $K_i$, and $K_d$ then triggers a bounded response recomputation; reported overshoot, rise time, and settling time derive from the sampled response and documented tolerance rules.

## 5. Pure Mathematics & Graphing Engines

The advanced math subsystem models symbolic input as a structured expression tree. Parsing produces an AST; evaluation compiles that tree into an instruction sequence with explicit domain checks for division, roots, logarithms, infinity, and NaN.

| Layer | Responsibility |
|---|---|
| Lexer / structured math DOM | Identifies tokens, fraction/subscript/superscript structure, and cursor-sensitive blocks. |
| AST | Represents operators, function calls, literals, variables, and grouped terms. |
| Evaluator | Computes values with domain and interval guards. |
| Explicit sampler | Adapts sample spacing based on midpoint/neighbor deviation around sharp bends. |
| Implicit sampler | Uses padded quadtree spatial subdivision, akin to a marching-squares decision process. |
| Label resolver | Avoids overlap and maintains readable orientation independent of parent transform. |

Adaptive sampling refines an interval only when the deviation/curvature criterion indicates that a coarse segment would misrepresent the curve. Implicit plotting subdivides a bounding region until sign/range information proves a cell empty or it reaches an accepted resolution; padded bounds avoid clipping a contour on a cell boundary.

Linear Algebra uses typed matrices/vectors, dimensions checks before operations, and geometric relation:

$$
w=Av.
$$

The solver separates determinant/RREF/eigen computations from the graphical transformation layer. Singular matrices, rank deficiency, and complex eigenvalue requirements are reported as data conditions rather than hidden rendering failures.

## 6. Assembler and PLC Engines

### 6.1 Assembler execution model

The Assembler suite owns a CPU state snapshot containing general registers (`AX`, `BX`, `CX`, `DX`), pointer/index registers (`SP`, `BP`, `SI`, `DI`, `IP`), flags, memory, and stack. One instruction cycle is observable and deterministic.

```text
fetch instruction at IP
→ decode operands and addressing mode
→ validate operand width / memory access
→ execute against pre-state
→ commit register, flags, memory, and IP post-state
→ append trace record
```

Trace records include pre-state, decoded instruction, changed registers/memory, and post-state. The display of a register is never allowed to mutate the emulated CPU state.

### 6.2 PLC scan-cycle model

PLC execution follows a strict scan cycle:

$$
\text{Read Inputs}
\rightarrow
\text{Execute Ladder / IL Logic}
\rightarrow
\text{Update Outputs}.
$$

Normal-open and normal-closed contacts read the relevant input/image table; coils stage output state; timers and counters retain their typed accumulated state. Outputs update only at the cycle boundary, so that rung order and scan semantics remain deterministic.

## 7. Communication & Network Scope

The Communication & Network route is registered as a platform suite. A full specialized engine requires an approved equation-level implementation brief before release. The following models define the intended computational scope.

For AM modulation:

$$
s(t)=\left[A_c+m(t)\right]\cos\left(2\pi f_c t\right).
$$

Digital modulation models include ASK, FSK, and PSK; constellation points, symbol mapping, sampling, carrier assumptions, and detector type must be explicit. AWGN experiments require a noise model, $E_b/N_0$ or SNR definition, detector decision regions, and the exact BER comparison formula. Network routing requires a graph model, packet queue/latency assumptions, and a deterministic routing policy. No communication solver is considered academically valid when these assumptions are left implicit.

## 8. Testing, Determinism, and Release Gates

Pure engines receive direct Vitest coverage before a React adapter is introduced. Tests target ordinary results, boundary cases, invalid input, state preservation, and known theoretical identities.

| Engine | Minimum test focus |
|---|---|
| MNA / nonlinear circuit | Element stamps, reference handling, singular configurations, convergence/non-convergence. |
| DES | Gate truth tables, driver conflict `X`, directional propagation, dynamic pin wire cleanup, delta-cycle behavior. |
| Boolean / K-Map | Precedence, grouping, postfix primes, truth-table output, QMC/Petrick selection, don’t-care handling, wrap geometry. |
| FSM | Encoding, unused vectors, D/T/JK/SR excitation, transitions, K-Map equations, Verilog structure. |
| Signals | Parser, support bounds, numerical convolution, discrete sums, delta behavior, frequency/phase processing. |
| Control | Transfer-function parsing, root behavior, response metrics, parameter edge cases. |
| Math | AST domain failures, adaptive refinement conditions, matrix dimension/rank checks. |
| Assembler / PLC | Instruction/cycle commits, memory safety, flags, contacts, timers, and output update order. |

Before a checkpoint is published, run:

```bash
pnpm vitest run
pnpm check
pnpm build
```

The baseline after v3-2 Signals synchronization was **61 test files and 314 tests passing**, with TypeScript and production builds passing. New work must preserve or raise that coverage without weakening existing assertions.

## 9. Safe Extension Protocol

1. Define a typed, React-independent engine contract first.
2. Write focused tests for the equation, algorithm, or state transition before UI wiring.
3. Add a narrow adapter that converts typed engine output into KaTeX, SVG, Canvas, or table data.
4. Preserve stable suite boundaries; in particular, do not overwrite `DigitalLogicDesign/` with inherited simulator files.
5. Validate parser failures, numerical singularities, unknown values, and state destruction paths explicitly.
6. Only publish a checkpoint after full tests, TypeScript, production build, and visual inspection complete.

## 10. Handover Sign-Off

| Approval role | Name | Signature | Date | Scope |
|---|---|---|---|---|
| Simulation Engineering Lead |  |  |  | Numerical models, assumptions, convergence, and error contracts. |
| Principal Application Architect |  |  |  | Typed module boundaries, state management, routing ownership, and dependency integrity. |
| Verification Lead |  |  |  | Unit tests, integration validation, production build, and regression evidence. |
| Academic Content Owner |  |  |  | Formula conventions, units, notation, and learner-facing correctness. |
| Release Owner |  |  |  | Checkpoint/publishing readiness and recovery procedure. |

> **Handover commitment.** Every MAE Academy computation remains explainable, deterministic under its declared assumptions, isolated from presentation concerns, and protected by an explicit validation path.

## References

[1]: ./MAE_ACADEMY_MASTER_PROJECT_HANDOVER.md "MAE Academy - Master Project Handover Documentation"
