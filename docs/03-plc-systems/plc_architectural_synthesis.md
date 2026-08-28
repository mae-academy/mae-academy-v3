# PLC Architectural Synthesis & Dynamic Analysis Report

This document serves as the unified, deep analytical synthesis of the MAE Academy PLC system architecture, combining the backend deterministic execution engine, the DOM-based visual editor, memory management, and systemic constraints. 

It defines the **DYNAMICS** of how the system works together as a cohesive whole.

## 1. Core Execution Dynamics

The PLC system is fundamentally a deterministic execution engine simulating a cyclic scan, rather than a collection of loosely coupled React state updates. The core lifecycle of execution enforces strict ordering and reproducibility:

### 1.1 The Scan Cycle Lifecycle
Every scan is treated as an atomic state transition:
1. **Input Snapshot:** External physical inputs are sampled and frozen into the `inputImage` at the start of the scan boundary.
2. **Edge Pre-Pass:** The engine computes rising/falling pulses based on current source values and advances prior samples. This prevents "phantom pulses" where a change in an upstream contact might falsely trigger a rising edge.
3. **Logic Evaluation (Source Order):** Networks evaluate strictly from top to bottom, and statements within networks from left to right. The engine evaluates the AST power graph recursively (handling nested `series` (AND) and `parallel` (OR) expressions) without hidden reordering.
4. **Instruction Transactions:** When power reaches an instruction (`EN = true`), the instruction resolves all reads, validates its operation, and commits its `writes` atomically. If a runtime fault occurs (e.g., divide-by-zero), the instruction commits no partial writes and sets `ENO = false` along with specific diagnostics.
5. **Output Commit:** The program-visible logical `qWork` image is committed to the physical outputs boundary exactly once at the end of the scan.

### 1.2 `__power` Manipulation and Flow
Power flow through the ladder graph (`__power`) is deterministically traced. For an expression like `A AND (B OR (C AND D))`, the result is evaluated preserving the exact nested logic. The trace output (`PowerResult`) retains each child's evaluation state, allowing the system to answer exactly *why* a specific rung evaluated to true or false without reducing or flattening the logic tree.

## 2. Visual to AST Bridge

The architectural boundary between the UI rendering and the Execution Engine is strictly maintained. The visual editor is responsible purely for generating the normalized AST, which is then lowered into the execution layer.

### 2.1 DOM-Based Rendering (No Canvas/SVG)
The ladder editor explicitly **does NOT use Canvas or SVG** for drawing logic lines or calculating layouts. Instead, it relies on a flexible **DOM-based rendering tree** using React:
- **CSS Grid & Flexbox:** The `le-instruction-grid` uses a highly specific 2-row layout (Row 1 for tags, Row 2 for the wire and symbol center). Visual wires and parallel branches (`le-circuit-branch-group`) are rendered as `div` and `span` elements structured via `display: flex` and `position: relative/absolute`.
- **Flexible Flow:** The UI naturally expands. Branch side lines are absolutely positioned relative to their content boundaries, eliminating the need for hardcoded global coordinate calculations.

### 2.2 Drag-and-Drop (DnD) Collision Math
Because there is no global Canvas coordinate system, the Drag-and-Drop system does not use absolute `x,y` grid snapping.
- **Euclidean Collision:** When dragging instructions, the system calculates drop targets by reading live DOM rectangles (`getBoundingClientRect`) and using `Math.hypot` to measure the Euclidean distance between the pointer and the exact center of valid wire anchors or branch boundaries.
- **Droppable Descriptors:** Every drop zone generates a deterministic ID (e.g., `wire-<circuitId>-<anchorId>`) mapping the physical DOM interaction back to the logical AST insertion point.

## 3. State & Memory Management

The PLC system implements a highly rigorous memory map that accurately simulates industrial PLC hardware (e.g., Siemens S7-200 profile).

### 3.1 Raw Byte Stores and Alias Coherence
State is strictly normalized. There is exactly one raw byte store (`Uint8Array`) per addressable area (`I`, `Q`, `M`, `V`).
- **Aliasing:** `VB100`, `VW100`, `VD100`, and `V100.3` are all explicitly typed views over the *exact same raw bytes*. Writing to `V100.3` immediately mutates the underlying byte array using bitwise masking, so any subsequent read of `VW100` in the same scan will deterministically reflect that change.
- **No Desynchronization:** Because there are no separate caches or `Record<VW, number>` objects, alias desynchronization is structurally impossible.

### 3.2 Persistent State Machines (Timers/Counters)
Timers and Counters are treated as first-class, stateful block instances, as their internal variables (`ACC`, `DN`, edge history, initialization state) cannot be safely derived from a single integer. 
- A Timer instance tracks elapsed time using the scheduler's explicit, monotonic `Δt` (delta Ms) and never reads `Date.now()` directly inside the instruction, preventing race conditions or false completion on tab suspension.

### 3.3 Worker Map and Read-Back
Execution happens within a Web Worker to ensure UI thread performance. The memory map and block states exist within the Worker's context. After a scan commits, the `ScanResult` (including the I/Q images and trace) is asynchronously messaged back to the UI state manager (via Zustand), ensuring the visual editor only renders definitively committed and audited state.

## 4. Critical Constraints & Audit Issues

The architecture imposes several non-negotiable boundaries to ensure industrial simulation accuracy and failure containment.

### 4.1 Determinism and Scan Integrity
- **Proof Obligation:** The same sequence of inputs, clock ticks, and AST topology must *always* yield the exact same memory image. Time reversal is rejected.
- **Atomic Commits:** Transactions are copy-on-write. If the system crashes mid-scan, partial memory writes must never leak into the visible state.

### 4.2 Math Faults and Edge Cases
- **Flag-and-Wrap:** Integer arithmetic follows a flag-and-wrap policy. Operations that overflow will set the `SM.overflow` bit while wrapping the integer value.
- **Divide by Zero:** Emits a runtime diagnostic, sets `SM.divideByZero`, forces `ENO = false`, and critically **omits any write to the destination memory**. It does not output `0` or `Infinity`.
- **Multiple Writers:** Two coils targeting `Q0.0` in different networks are legally evaluated using **"last executed writer wins"** semantics. The compiler flags this as `MULTIPLE_COIL_WRITER`, but the runtime executes it deterministically.

### 4.3 Visual Rules and DOM Boundaries
- **Strict UI Alignment:** Because the editor uses CSS Grid, any visual misalignment (e.g., coils floating above wires) is considered a CSS Grid failure, not a rendering engine bug. The horizontal wire must permanently occupy row 2 of the `le-instruction-grid` to strike through the vertical center of every component.
- **OpenPLC Integration Constraints:** Any future generation of IL (Instruction List) code for external targets (like OpenPLC) must perfectly reflect the hierarchical AST (`series`/`parallel`) without manufacturing arbitrary jumps, relying on the internal AST-to-IL lowerer documented in the architecture.
