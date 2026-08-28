# MAE Academy PLC Studio

## Deterministic Execution Engine and Logic Architecture

**Author:** Manus AI  
**Scope:** Implementation-ready backend architecture for the Siemens S7-200 instructional profile used by MAE Academy. This is an execution-engine specification, **not UI code**, and it deliberately does not modify the current `plcEngine.ts` implementation.

> **Architectural position.** A PLC simulator is correct only when the same program, physical-event sequence, device profile, and scan-time sequence always yield the same memory image, output image, instruction diagnostics, and power-flow trace. The specification therefore treats every scan as a deterministic state transition rather than as a collection of loosely coupled React-state updates.

The supplied **PLC Summary** defines the course vocabulary: 14 input points, 10 output points, 256 timers, 256 counters, `AC0`–`AC3`, `VW`, `VD`, `IN1`/`IN2`, and `EN`-gated functions. It also distinguishes `MOV-x`, comparison, logical, arithmetic, timer, and counter families. The original S7-200 System Manual is the product-specific authority; the architecture below uses a target profile so that every hardware-specific capacity or special-memory projection can be pinned to the appropriate Siemens manual revision rather than guessed. [1] The S7-200 SMART manual is family-adjacent supporting context, not a substitute for original S7-200 behavior. [2]

> “EN in the next tables is the input contact.” — *PLC Summary*, p. 2 [4]

| Design principle | Required consequence |
|---|---|
| One raw byte store per addressable area | `VB100`, `VW100`, `VD100`, and `V100.3` are aliases, never separately cached values. |
| Snapshot inputs and staged outputs | Program writes become visible to later logic through the **Q image**, but simulated hardware changes only at the output-commit boundary. |
| Immutable program plus mutable scan state | A scan cannot change AST topology; it can only change memory, block state, diagnostics, and trace records. |
| Stable source order | Networks execute from top to bottom; statements inside a network execute from left to right. Conflicting writes are deterministic and linted. |
| Explicit failures | Divide-by-zero, invalid conversion, bad address, overflow, and ambiguous counter edges create diagnostics; they never silently become an arbitrary value. |

---

## 1. Execution Contract and Compatibility Boundary

The existing MAE engine is intentionally compact: it stores I/Q/M bits and `AC`/`VW`/`VD` numbers in separate records, evaluates one flat main branch plus flat parallel branches, and executes a restricted instruction set. That is suitable for a visual teaching prototype, but it cannot express byte aliasing, arbitrary nested branches, image-register boundaries, ENO, or target-profile diagnostics. This document defines a **replacement-compatible core**: the UI may keep producing its current AST temporarily, while an adapter lowers that AST into the normalized program model described below.

The engine must not claim instruction-level identity with every Siemens CPU until its selected `DeviceProfile` has been verified against the exact S7-200 manual and CPU firmware target. The summary supplied to MAE explicitly uses the educational tokens `TOFF` and `TMR`; internally, the architecture normalizes these to `offDelay` and `retentiveOnDelay`, so a dialect adapter can map them to the manufacturer token required by the selected profile. The quick-reference corroborates the common timer/counter family forms, but it is secondary to Siemens documentation. [3]

| Layer | Responsibility | Forbidden behavior |
|---|---|---|
| Parser/lowerer | Validates addresses, symbols, widths, block pins, and nesting; produces immutable normalized IR. | Mutating live memory while parsing. |
| Memory manager | Owns raw area bytes, typed aliases, block instances, I/Q images, and status bits. | Storing the same physical bytes independently as `VW` and `VD` maps. |
| Evaluator | Computes power expressions and typed values in source order. | Reading browser/React state directly. |
| Instruction registry | Defines pure validation plus transactional execution for each opcode. | Letting an instruction partially write memory after a fault. |
| Scan scheduler | Supplies monotonic scan boundaries and `Δt`; commits I/Q images. | Using wall-clock time directly inside an instruction. |
| Trace/diagnostics | Records why a branch did or did not energize, every write, and every fault. | Changing logic outcomes merely because tracing is enabled. |

---

## 2. Deterministic Scan Cycle

### 2.1 State domains

The engine separates external hardware state from program-visible image state. `physicalInputs` is owned by the simulated backplane. `inputImage` is frozen for a complete scan. `qWork` is the writable logical output image seen by the program during that scan. `physicalOutputs` changes only during output commit. M/V/AC and block instances are internal program state and may be updated in deterministic instruction order.

| Domain | Read during program execution | Written during program execution | External visibility |
|---|---:|---:|---|
| Physical input terminals | No | No | Event source only, sampled at scan start. |
| I image | Yes | No by ordinary user logic | Constant within the scan. |
| Q work image | Yes | Yes | Later networks see earlier coil writes. |
| Physical outputs | No | No | Receives `qWork` only at commit. |
| M/V/AC | Yes | Yes | Writes become visible to later instructions in the same scan. |
| T/C state | Yes through typed views | Yes through timer/counter blocks | State commits in source order. |
| SM/diagnostics | Yes if exposed by profile | Engine-controlled | Cleared or latched by declared policy. |

### 2.2 Exact scan algorithm

The scheduler provides `scanStartNs` from a monotonic clock and a non-negative `deltaMs`. It must reject time reversal. A fixed-step teaching mode may pass exactly `100 ms`; a real-time mode computes `deltaMs = clamp(now - previousStart, 0, maxScanGapMs)`. Clamping is a stated simulation policy that prevents a tab suspension or debugger pause from falsely completing a long timer in one scan.

```ts
function executeScan(engine: EngineState, program: Program, nowNs: bigint): ScanResult {
  const deltaMs = engine.clock.nextDelta(nowNs);     // monotonic, bounded, auditable
  const tx = engine.beginScanTransaction();          // copy-on-write state and fresh trace

  tx.status.beginScan();                             // reset transient flags; retain declared latches
  tx.backplane.applyEventsUpTo(nowNs);               // total order: (timestamp, sequenceNo)
  tx.images.input = tx.backplane.sampleInputs();     // atomic I-image snapshot
  tx.images.qWork = tx.images.qCommitted.clone();    // program-visible logical Q image

  tx.edgeTable.prepare(program, tx.memory);          // compute pulses from current source values
  for (const network of program.networks) {
    const power = evaluatePower(network.power, tx);  // nested AND/OR tree; no hidden reordering
    tx.trace.recordNetworkPower(network.id, power);
    for (const statement of network.statements) {
      executeStatement(statement, power, deltaMs, tx);
    }
  }

  tx.edgeTable.commitPreviousSamples();              // one previous-state advance per scan
  tx.images.qCommitted = tx.images.qWork.clone();
  tx.backplane.writeOutputs(tx.images.qCommitted);   // one hardware-output commit boundary
  tx.clock.commit(nowNs);
  return tx.commit();                                // atomic state publication
}
```

This model is deliberately strict about rapid toggles. An ordinary input pulse that begins and ends entirely between two image acquisitions is not observable by ordinary scan logic; the most recent terminal state is sampled. That is the expected limitation of cyclic image processing. A high-speed counter or interrupt extension must be modeled as a separate timestamped subsystem, not smuggled into the normal cyclic evaluator.

### 2.3 Write ordering and conflicts

Each statement writes a small `WriteSet`, validates it, then commits that write set atomically to the transaction. The next statement sees the result. Therefore, two normal coils targeting `Q0.0` in different networks have deterministic **last executed writer wins** behavior. The compiler emits `MULTIPLE_COIL_WRITER` at build time and the trace records both writers, but the runtime does not invent a merge operation. Set/reset coils use the same program order rule: the later executed S/R action wins if both are true in the same scan.

The input image remains immutable even if malformed IL attempts an `I` write. Such a write is rejected with `READ_ONLY_AREA`; no fallback writes the physical input or image register.

---

## 3. Memory Map, Typed Aliases, and Overlap Correctness

### 3.1 Memory representation

All byte-addressable areas are raw `Uint8Array` instances. Typed accessors assemble or decompose values; no `Record<VW, number>` or `Record<VD, number>` is permitted. The original instructional reference identifies V access as byte/word/double-word based and identifies the I/Q/T/C course ranges; capacities outside those published lab bounds come from `DeviceProfile`, not hard-coded assumptions. [1] [2]

```ts
type ByteOrder = "msb-first" | "lsb-first";
type AreaName = "I" | "Q" | "M" | "V" | "SM";
type NumericKind = "U8" | "I16" | "U16" | "I32" | "U32" | "REAL";

interface DeviceProfile {
  readonly id: "s7-200-course-profile";
  readonly byteOrder: ByteOrder;        // S7-profile default: "msb-first"
  readonly byteCapacity: Readonly<Record<AreaName, number>>;
  readonly inputPointCount: number;     // course profile: 14
  readonly outputPointCount: number;    // course profile: 10
  readonly timerCount: number;          // course profile: 256
  readonly counterCount: number;        // course profile: 256
  readonly timerResolutionMs: number;
  readonly counterRange: { min: number; max: number };
  readonly faultProjection: FaultProjection;
}

interface MemoryManager {
  readBit(address: BitAddress): boolean;
  writeBit(address: WritableBitAddress, value: boolean): void;
  readScalar(address: ScalarAddress, kind: NumericKind): number;
  writeScalar(address: ScalarAddress, kind: NumericKind, value: number): WriteFault | null;
  readTimer(index: number): TimerView;
  readCounter(index: number): CounterView;
}
```

`AC0`–`AC3` are represented as explicitly typed accumulator cells rather than aliases of V bytes. Timer and counter instances are also first-class structures, because elapsed time, done state, edge history, and reset state cannot safely be reconstructed from a single raw integer. The device profile may expose read-only timer/counter views through addresses, but the engine owns their state transitions.

### 3.2 Address parsing and bit semantics

The parser converts every address to a canonical tuple before evaluation:

```ts
type BitAddress = { area: AreaName; byte: number; bit: 0|1|2|3|4|5|6|7 };
type ScalarAddress = { area: AreaName; byte: number };

function readBit(bytes: Uint8Array, byte: number, bit: number): boolean {
  return (bytes[byte] & (1 << bit)) !== 0;
}

function writeBit(bytes: Uint8Array, byte: number, bit: number, value: boolean): void {
  const mask = 1 << bit;
  bytes[byte] = value ? (bytes[byte] | mask) : (bytes[byte] & ~mask);
}
```

Bit zero is the least significant bit of its addressed byte. Under the `msb-first` S7 profile, `VW100` reads `VB100` as the high byte and `VB101` as the low byte:

```ts
function readU16V100(v: Uint8Array): number {
  return (v[100] << 8) | v[101];
}
function writeU16V100(v: Uint8Array, value: number): void {
  const x = value & 0xffff;
  v[100] = x >>> 8;
  v[101] = x & 0xff;
}
function readU32V100(v: Uint8Array): number {
  return (((v[100] << 24) >>> 0) | (v[101] << 16) | (v[102] << 8) | v[103]) >>> 0;
}
```

Consequently, writing `V100.3` performs a mask operation on `V[100]`; the very next `VW100` or `VD100` read reflects the changed byte because both accessors read the same raw array. Writing `VW100` changes only `V[100]` and `V[101]`; `VD100` immediately reflects those two new high-order bytes while retaining `V[102]` and `V[103]`. No observer notification, cache invalidation, or synchronization pass is needed. This is the core solution to the overlap problem.

### 3.3 Typed reads, constants, and range discipline

Every instruction declares operand kinds. A literal is parsed once into a `TypedConstant`, including its requested radix and signedness. The evaluator does not compare JavaScript `number` values merely because both look numeric.

| Family | Operand contract | Result/fault rule |
|---|---|---|
| `x` comparison | Both operands must share a declared numeric kind after only explicit literal coercion. | Boolean result; incompatible types produce `TYPE_MISMATCH`. |
| `MOV-x` | Source and destination have identical declared width, or an explicit conversion opcode is used. | Byte-exact copy for equal widths; no hidden truncation. |
| `ADD/SUB/MUL/DIV-x` | All operands use the instruction-declared integer/real kind. | Widen calculation, validate, then apply profile overflow policy. |
| Word logic | Operands use unsigned bit patterns of declared width. | Bitwise result, then exact-width write. |

The recommended simulator policy is **flag-and-wrap** for integer overflow: calculate in a widened host representation, set `SM.overflow` through the profile projection, then retain the low `n` bits for an `n`-bit target. This avoids a silent clamp and makes every bit outcome deterministic. Divide-by-zero performs **no destination write**, sets `SM.divideByZero`, sets `ENO = false`, and records `DIVIDE_BY_ZERO`; it does not manufacture `0` or `Infinity`. A target-specific profile may override either choice only with a cited manufacturer requirement.

---

## 4. Program IR, Power Flow, and Nested Graph Traversal

### 4.1 Normalized AST

The present UI can lower its simple contact arrays into this AST. The new IR additionally supports arbitrary nesting, edge contacts, expression-based compare nodes, and statements with explicit EN/ENO semantics.

```ts
type PowerExpr =
  | { tag: "contact"; id: string; address: BitAddress; polarity: "NO" | "NC" }
  | { tag: "edge"; id: string; address: BitAddress; edge: "rising" | "falling" }
  | { tag: "compare"; id: string; op: CompareOp; left: ValueRef; right: ValueRef }
  | { tag: "series"; id: string; children: readonly PowerExpr[] }
  | { tag: "parallel"; id: string; children: readonly PowerExpr[] };

interface Network {
  readonly id: string;
  readonly power: PowerExpr;
  readonly statements: readonly Statement[];
}

type Statement = CoilStmt | SetResetStmt | BlockStmt;
interface Program { readonly schema: 1; readonly networks: readonly Network[]; }
```

`series` is Boolean AND and `parallel` is Boolean OR. The tree is explicit, so a parallel group may appear inside a series group and vice versa without flattening errors. The compiler rejects empty groups, cycles, invalid addresses, blocks with missing mandatory pins, and output statements that are disconnected from a power expression.

### 4.2 Power evaluation and traceability

The evaluator is recursive but source-ordered. It returns a `PowerResult` that includes the Boolean result and a structured trace. It may short-circuit pure contact subtrees for performance, but edge state must be sampled in an edge pre-pass to prevent a false pulse when an upstream contact later becomes true.

```ts
interface PowerResult { value: boolean; trace: PowerTraceNode; }

function evaluatePower(expr: PowerExpr, ctx: EvalContext): PowerResult {
  switch (expr.tag) {
    case "contact": {
      const raw = ctx.memory.readBit(expr.address);
      return traced(expr.id, expr.polarity === "NO" ? raw : !raw);
    }
    case "edge": return traced(expr.id, ctx.edges.pulse(expr.id));
    case "compare": return traced(expr.id, compareTyped(expr.op, expr.left, expr.right, ctx));
    case "series": return allInSourceOrder(expr.children, ctx);
    case "parallel": return anyInSourceOrder(expr.children, ctx);
  }
}
```

For an expression `A AND (B OR (C AND D))`, the actual value is `A ∧ (B ∨ (C ∧ D))`; it is never reduced to `(A ∧ B) ∨ (C ∧ D)`. The trace preserves each child evaluation and can answer, for example, “Rung 12 is false because `I0.4` is false, while the parallel subbranch was true.” This trace is a read-only audit product and cannot alter memory.

### 4.3 Edges without phantom pulses

Each edge detector has `{ initialized, previous, pulse }`. At the beginning of a scan, the engine reads its source from the frozen image/memory context and calculates:

```ts
rising  = initialized && current && !previous;
falling = initialized && !current && previous;
nextPrevious = current;
```

`previous` is committed once after all networks execute. On the first scan after program load, `initialized` becomes true and both pulse types are false. Therefore, holding `I0.0` high while an upstream contact is false does not create a later false rising edge merely because that upstream contact becomes true.

---

## 5. EN, ENO, and Transactional Instruction Semantics

Every non-timer complex block uses the following common contract. `EN` is the power result entering the block. `ENO` is the block's result-validity signal, not a copy of `EN` under fault conditions.

| Condition | Destination | ENO | Status |
|---|---|---|---|
| `EN = false` | No destination write; previous destination remains. | `false` | No arithmetic fault created. |
| `EN = true`, validation succeeds | Commit the complete validated write set. | `true` | Any overflow flag follows profile policy. |
| `EN = true`, runtime fault | Commit no partial data write. | `false` | Set the named diagnostic/fault bit and trace entry. |

```ts
interface InstructionDefinition<T extends Statement> {
  readonly opcode: T["opcode"];
  validate(stmt: T, profile: DeviceProfile): CompileDiagnostic[];
  execute(stmt: T, input: ExecuteInput, tx: ScanTransaction): ExecuteResult;
}
interface ExecuteResult {
  readonly eno: boolean;
  readonly writes: readonly MemoryWrite[];
  readonly diagnostics: readonly RuntimeDiagnostic[];
}
```

Instruction execution first resolves all reads from the current transaction, validates the result, and only then commits `writes`. Thus an arithmetic result cannot write its output byte before discovering that a later required write is invalid.

---

## 6. Exhaustive Behavior of the Supported Instruction Set

### 6.1 NO, NC, normal, Set, and Reset coils

| Component | Inputs/state | Per-scan rule | Side effect |
|---|---|---|---|
| NO contact `---| |---` | Addressed bit `b` | Returns `b`. | None. |
| NC contact `---|/|---` | Addressed bit `b` | Returns `!b`. | None. |
| Normal coil `---( )---` | Rung power `p` | Writes `p` to its Q/M target immediately in `qWork` or internal memory. | Later networks read the new logical value; hardware waits for commit. |
| Set coil `---(S)---` | `p`, target `t` | If `p`, write `true`; otherwise preserve `t`. | Latching write. |
| Reset coil `---(R)---` | `p`, target `t` | If `p`, write `false`; otherwise preserve `t`. | Latching write. |
| Positive edge `---|P|---` | Current and previous source bit | Returns rising pulse from edge table. | Previous state advances once per scan. |
| Negative edge `---|N|---` | Current and previous source bit | Returns falling pulse from edge table. | Previous state advances once per scan. |

Multiple writers remain legal but diagnosed. A normal coil is not intrinsically latched: it writes false as soon as its input power is false. Set/reset are level-controlled operations whose persistence comes from “no write when false,” not from a hidden JavaScript latch.

### 6.2 Timer state machines

Timer instances use:

```ts
interface TimerState {
  accMs: number;
  done: boolean;
  previousIn: boolean;
  initialized: boolean;
}
```

`PT` is validated as a finite, non-negative duration quantized to the `DeviceProfile.timerResolutionMs`. The actual delta used is the scheduler's bounded monotonic `deltaMs`; a timer never calls `Date.now()` or relies on animation frames. The supplied PLC Summary shows `IN`/`PT` for TON and TOFF, `IN`/`PT`/`Reset` for TMR, and a done output; those pin responsibilities are retained in the block contract.

| Mode | `IN = true` | `IN = false` | Reset | `DN` |
|---|---|---|---|---|
| `TON` / on-delay | `ACC = min(ACC + Δt, PT)` | `ACC = 0` | N/A | `ACC >= PT`. |
| `TOFF` / off-delay | `ACC = PT`; `DN = true`; remember input true. | On the falling edge set `ACC = PT`; on later false scans decrement by `Δt`. | N/A | True while input is true or `ACC > 0`; false at expiration. |
| `TMR` / retentive on-delay | `ACC = min(ACC + Δt, PT)`. | Preserve `ACC` and `DN`. | `Reset = true` has priority: `ACC = 0`, `DN = false`. | `ACC >= PT` until reset. |

For `PT = 0`, TON and TMR set done on an enabled true input; TOFF becomes false immediately after a falling edge. A timer address used more than once in a program is a compile-time diagnostic because sharing one instance creates order-dependent behavior. The engine can still execute it deterministically using last executed writer semantics, but the program should be treated as structurally suspect.

### 6.3 CTU, CTD, and CTUD counters

Counter state has `value`, `done`, `previousCu`, `previousCd`, and initialization flags. `CU`/`CD` are edge-sensitive. The engine samples their current resolved Boolean sources every scan; it computes pulses before counter execution, then advances prior samples once at scan end. `R` is level-sensitive and has highest priority.

| Mode | Reset false and input edge | Reset true | Done condition |
|---|---|---|---|
| `CTU` | Rising `CU` increments once. | Set value to zero; suppress count. | `value >= PV`. |
| `CTD` | Rising `CD` decrements once. | Set value to `PV` or profile-declared reset value; the choice is explicit in the selected dialect profile. | `value <= PV` under the declared CTD convention. |
| `CTUD` | Rising `CU` increments; rising `CD` decrements. | Reset dominates both count edges. | Profile-defined comparison, normally derived from current value and `PV`. |

For simultaneous CTUD up and down edges, the recommended safety policy is `R` first, then **no count change plus `SIMULTANEOUS_COUNTER_EDGES` diagnostic**, rather than an undocumented hidden priority. The profile may set an explicit CU-or-CD priority only if a cited device specification requires it. Values are checked against `DeviceProfile.counterRange`; overflow follows the same explicit flag-and-wrap or fault-no-write policy selected for that target.

### 6.4 Comparators

Comparators are normally `PowerExpr` nodes: their Boolean result is inserted directly into the ladder-power graph. An optional comparator statement may additionally write a destination bit, but it must declare that side effect explicitly. `==`, `>`, `<`, `>=`, and `<=` first resolve both operands under the instruction's declared type. A literal may be parsed into that type only if it is exactly representable; a `REAL`/integer mix requires an explicit conversion policy, not JavaScript's implicit coercion.

When compare is invoked with `EN = false`, it emits `ENO = false` and performs no destination write. With `EN = true`, `ENO` equals the comparison result for a predicate form. If a comparison is embedded in a power expression, the Boolean result is the continuation power; the trace records both typed operands and the resolved relation.

### 6.5 MOV, arithmetic, and word logic

`MOV-x` copies exactly the width declared by `x`, after validating both addresses and access rights. `ADD`, `SUB`, `MUL`, and `DIV` read both operands before writing the destination. `AND-W` and `OR-W` operate on raw width-limited unsigned bit patterns; they do not treat values as JavaScript truthiness. The supplied course reference explicitly frames `IN1`/`IN2` as Siemens registers compatible with block data type and describes `EN` as an upstream input contact, so the compiler binds pin kinds before runtime. [4]

| Instruction condition | Required engine behavior |
|---|---|
| `EN = false` | No data output update; `ENO = false`. |
| Valid integer overflow | Apply profile policy, set overflow status, expose bit-exact result if profile uses wrapping. |
| Divide by zero | No destination mutation; set divide-by-zero diagnostic; `ENO = false`. |
| Square root of negative integer/real | No destination mutation; set invalid-value diagnostic; `ENO = false`. |
| Source overlaps destination | Legal because all source operands are resolved before the write set commits. |
| Invalid address or width | Compile error when static; runtime fault with no write only for dynamic/symbol resolution path. |

---

## 7. Failure Containment, Invariants, and Proof Obligations

It would be inaccurate to claim that an unimplemented engine “cannot fail.” What can be specified and then tested is a set of invariants that excludes the failure classes most likely to corrupt PLC behavior.

> **Proof boundary.** The architecture proves determinism by construction only if the parser, device profile, instruction registry, and memory manager implement these contracts. Product equivalence still requires regression vectors against the selected Siemens CPU/manual and a test harness.

| Invariant | Enforcement | Test obligation |
|---|---|---|
| Alias coherence | One raw byte store per area; typed reads are pure views. | Random `VB/VW/VD/bit` writes followed by exhaustive alias reads. |
| Atomic scan | Copy-on-write transaction publishes only after all networks complete. | Inject fault at every instruction index; compare pre/post state. |
| Source-order determinism | Program/network IDs and child arrays are immutable ordered lists. | Replay same event log twice; hash state and trace after every scan. |
| No phantom edges | Edge pre-pass samples once, commits previous state once. | Hold an edge source high while its upstream path is false, then enable path. |
| Timer reproducibility | Scheduler supplies an explicit `Δt`. | Replay with identical `Δt` sequence; compare `ACC`/`DN` bit-for-bit. |
| Safe math faults | Validate full write set before commit. | Divide-by-zero and invalid root leave destination unchanged. |
| Output boundary | Q work and physical Q are distinct. | Verify a coil is readable by later logic before hardware commit. |

The regression suite should include nested shapes such as `A AND (B OR (C AND D))`, multiple parallel branches with shared contacts, two coils targeting one Q bit, aliased writes (`V100.3`, `VW100`, `VD100`), timer expiry at exactly `PT`, `PT = 0`, counter edges one scan apart, held-high counter inputs, reset/count coincidence, and input events that occur between scan boundaries.

---

## 8. Implementation Sequence

The first engineering milestone is a non-UI `MemoryManager` test suite: raw-byte alias tests must pass before any visual ladder migration. The second milestone is the normalized AST plus pure `evaluatePower` tests for nested AND/OR and edge pre-sampling. The third milestone is a transactional scan coordinator with I/Q images and reproducible clock injection. Only then should the instruction registry be expanded in the following order: contacts/coils, S/R/edge contacts, timers, counters, typed compare/MOV, arithmetic, and word logic. The final milestone is differential testing against manually curated S7-200 reference programs and published instruction examples.

| Milestone | Exit criterion |
|---|---|
| M1: Raw memory | 100% alias property tests pass for configured I/Q/M/V bounds. |
| M2: Power graph | Nested series/parallel and edge traces match golden results. |
| M3: Scan coordinator | Identical event/clock logs replay to identical full-state hashes. |
| M4: Stateful blocks | Timer/counter boundary and reset tests pass at every relevant edge. |
| M5: Data instructions | Type, overflow, and divide-by-zero behavior match profile golden vectors. |
| M6: Compatibility adapter | Current MAE AST and IL lower to normalized IR with explicit diagnostics for unsupported constructs. |

---

## References

[1]: https://support.industry.siemens.com/cs/document/1109582/s7-200-system-manual?dti "Siemens Industry Support — S7-200 System Manual"

[2]: https://assets.new.siemens.com/siemens/assets/api/uuid:aa045b50-b9f4-4e46-a4c4-ca882c5f00ec/version:1573484388/s7-200-smart-system-manual-en-us.pdf "Siemens — SIMATIC S7-200 SMART System Manual"

[3]: http://newengineeringpractice.blogspot.com/2012/01/siemens-s7-200-plc-quick-reference.html "Siemens S7-200 PLC Quick Reference (secondary mirror)"

[4]: file:///home/ubuntu/upload/PLCSummary.pdf "User-supplied PLC Summary, pp. 2–7"
