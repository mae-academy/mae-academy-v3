# AI-to-AI Logic Blueprint

## Scope and extraction basis

This report extracts the computational engine from the supplied `studio.rungs.dev` archive. The archive is a production bundle rather than the original TypeScript source, so original interface declarations and symbol names have been minified or removed. Where an interface was not retained, the report reproduces the exact surviving JavaScript object shape and the exact generated algorithmic fragments. UI rendering, layout, styling, and editor presentation code are intentionally excluded. The primary computational evidence is the execution worker bundle and the main application bundle that owns the AOI/simulation state and worker bridge. [1] [2]

> **Important boundary:** The archive contains two related representations. The editor stores normalized ladder nodes with generated IDs. The compiler parses source text into a separate AST with `LDProgram`, `LDRung`, `LDCircuit`, `LDBranch`, and `LDInstruction` nodes. The execution engine consumes the compiler AST and generated code, not the editor’s normalized node store directly. [1] [2]

## 1. Core data structures and state management

### 1.1 AOI top-level object

The default AOI constructor creates the following object and validates it through the bundle’s schema parser. A newly created AOI has no tags and one `Logic` routine. [2]

```js
{
  name: String,
  description: String,
  tags: [],
  routines: {
    Logic: {
      type: "ld" | "st",
      content: type === "ld" ? ";" : ""
    }
  }
}
```

The open/load path clones the AOI before placing it into application state. For an exercise it calls the exercise loader; for an example it calls the example loader; otherwise it loads as a user AOI. The available routine names are derived from `Object.keys(e.routines)` and the selected routine is opened separately. [2]

### 1.2 Tag and data-type model

The compiler’s surviving type table defines scalar and structured tag kinds as follows. `BOOL` is a scalar boolean; `DINT` is a signed 32-bit integer; `REAL` is a finite floating-point value bounded by approximately `±3.402823e35`; timer and counter types are object structures. [1]

```js
{
  BOOL:       { name: "BOOL",       category: "boolean", scalar: true  },
  DINT:       { name: "DINT",       category: "integer", scalar: true,
                range: { min: -2147483648, max: 2147483647 } },
  REAL:       { name: "REAL",       category: "float",   scalar: true,
                range: { min: -3402823e32, max: 3402823e32 } },
  TIMER:      { name: "TIMER",      category: "timer",   scalar: false },
  COUNTER:    { name: "COUNTER",    category: "counter", scalar: false },
  FBD_TIMER:  { name: "FBD_TIMER",  category: "timer",   scalar: false },
  FBD_COUNTER:{ name: "FBD_COUNTER",category: "counter", scalar: false },
  FBD_ONESHOT:{ name: "FBD_ONESHOT",category: "oneshot", scalar: false }
}
```

The surviving tag projection used to build compiler context is exact in this form:

```js
function projectContext(aoi) {
  return {
    tags: (aoi?.tags ?? []).map((tag) => ({
      name: tag.name,
      dataType: typeof tag.dataType === "string" ? tag.dataType : "",
      usage: tag.usage,
      dimension:
        "dimension" in tag && typeof tag.dimension === "number"
          ? tag.dimension
          : undefined,
      defaultValue: clone("defaultValue" in tag ? tag.defaultValue : undefined),
      members: membersOf(tag.dataType)
    }))
  };
}
```

The supported ladder operand declarations are:

```js
const BOOL_INPUT       = [{ name: "dataBit",    dataTypes: ["BOOL"], usage: "in" }];
const BOOL_OUTPUT      = [{ name: "dataBit",    dataTypes: ["BOOL"], usage: "out" }];
const BOOL_STORAGE     = [{ name: "storageBit", dataTypes: ["BOOL"], usage: "inout" }];
const ONE_SHOT_OUTPUT  = [
  { name: "storageBit", dataTypes: ["BOOL"], usage: "inout" },
  { name: "outputBit",  dataTypes: ["BOOL"], usage: "out" }
];
const TIMER_OPERAND    = [{ name: "timer",   dataTypes: ["TIMER"],   usage: "inout" }];
const COUNTER_OPERAND  = [{ name: "counter", dataTypes: ["COUNTER"], usage: "inout" }];
const NUMERIC_MOVE     = [
  { name: "source", dataTypes: ["DINT", "REAL"], usage: "in" },
  { name: "dest",   dataTypes: ["DINT", "REAL"], usage: "out" }
];
const NUMERIC_BINARY   = [
  { name: "sourceA", dataTypes: ["DINT", "REAL"], usage: "in" },
  { name: "sourceB", dataTypes: ["DINT", "REAL"], usage: "in" },
  { name: "dest",    dataTypes: ["DINT", "REAL"], usage: "out" }
];
const LIMIT_OPERAND    = [
  { name: "lowLimit",  dataTypes: ["DINT", "REAL"], usage: "in" },
  { name: "test",      dataTypes: ["DINT", "REAL"], usage: "in" },
  { name: "highLimit", dataTypes: ["DINT", "REAL"], usage: "in" }
];
```

### 1.3 Timer, counter, and one-shot structures

The runtime schemas expose the following fields. All fields are optional at validation time; execution fills or normalizes them. [1]

```js
// TIMER
{
  PRE: DINT?, ACC: DINT?, EN: BOOL?, TT: BOOL?, DN: BOOL?
}

// COUNTER
{
  PRE: DINT?, ACC: DINT?, CU: BOOL?, CD: BOOL?,
  DN: BOOL?, OV: BOOL?, UN: BOOL?
}

// FBD_TIMER
{
  EnableIn: BOOL?, TimerEnable: BOOL?, PRE: DINT?, Reset: BOOL?,
  EnableOut: BOOL?, ACC: DINT?, EN: BOOL?, TT: BOOL?, DN: BOOL?,
  Status: DINT?, InstructFault: BOOL?, PresetInv: BOOL?
}

// FBD_ONESHOT
{
  EnableIn: BOOL?, InputBit: BOOL?, EnableOut: BOOL?, OutputBit: BOOL?
}

// FBD_COUNTER
{
  EnableIn: BOOL?, CUEnable: BOOL?, CDEnable: BOOL?, PRE: DINT?, Reset: BOOL?,
  EnableOut: BOOL?, ACC: DINT?, CU: BOOL?, CD: BOOL?, DN: BOOL?, OV: BOOL?, UN: BOOL?
}
```

Hidden execution fields are attached directly to structured objects:

```js
const TIMER_STATE = "__timerState";
const CTUD_STATE = "__ctudState";
const ONE_SHOT_STATE = "__oneShotState";

// CTUD hidden state
{
  lastCuEnable: 0 | 1,
  lastCdEnable: 0 | 1,
  acc: integer
}

// OSRI / OSFI hidden state
{
  lastInput: 0 | 1
}

// Timer hidden state
{
  version: 1,
  family: "TON" | "TOF" | "RTO" | "TONR" | "TOFR" | "RTOR",
  kind: "ladder" | "fbd",
  accUs: nonnegative safe integer,
  lastExecUs: nonnegative safe integer,
  lastInput: 0 | 1,
  lastPublishedAccMs: integer,
  dn: 0 | 1,
  tofrNeedsPreset: boolean
}
```

Timer state is considered valid only when all of these invariants hold: version is `1`; kind is either `ladder` or `fbd`; family belongs to the six supported timer families; `accUs`, `lastExecUs`, and `lastPublishedAccMs` are safe integers; `lastExecUs >= 0`; `lastInput` and `dn` are binary; and `tofrNeedsPreset` is boolean. Invalid hidden state is discarded and replaced with a fresh state. [1]

### 1.4 Exact editor-side normalized ladder state

The editor’s source-to-normalized parser creates a separate graph-like state. The exact top-level normalized state is:

```js
{
  rungs: {
    [rungId]: {
      id: String,
      comment: String,
      circuit: {
        type: "circuit",
        id: String,
        elements: Array,
        errors: []
      },
      errors: []
    }
  },
  rungIds: String[],
  selection: {
    selectedIds: String[],
    selectedType: null | String,
    anchorId: null | String
  }
}
```

For an empty source, the exact result is:

```js
{
  state: {
    rungs: {},
    rungIds: [],
    selection: { selectedIds: [], selectedType: null, anchorId: null }
  },
  errors: []
}
```

The normalized editor rung contains a circuit node with `type`, `id`, `elements`, and `errors`; instruction IDs are collected recursively through nested branches. This state is used by the editor serializer and selection logic. [2]

### 1.5 Compiler AST

The execution worker parses Ladder Diagram source into the following exact AST forms:

```js
{
  type: "LDProgram",
  rungs: [
    {
      type: "LDRung",
      index: number,
      circuit: {
        type: "LDCircuit",
        elements: Array<LDInstruction | LDBranch>,
        location: Location | undefined,
        nodeId: String
      },
      location: Location | undefined,
      nodeId: String
    }
  ]
}
```

The node forms created by the parser are:

```js
// Branch
{
  type: "LDBranch",
  circuits: [LDCircuit, ...],
  location: Location,
  nodeId: String
}

// Instruction
{
  type: "LDInstruction",
  instructionType: String,       // upper-case mnemonic
  parameters: LDParameter[],
  location: Location,
  nodeId: String
}

// Decimal/radix numeric literal
{
  type: "LDNumericLiteral",
  value: number,
  dataType: "DINT" | "REAL",
  location: Location,
  nodeId: String
}

// Bare tag reference
{
  type: "LDTagReference",
  name: String,
  location: Location,
  nodeId: String
}

// Member access, e.g. Timer.DN
{
  type: "LDMemberAccess",
  object: LDParameter,
  member: String,
  location: Location,
  nodeId: String
}

// Array access, e.g. Array[Index]
{
  type: "LDIndexedAccess",
  target: LDParameter,
  index: LDIndexExpression,
  location: Location,
  nodeId: String
}
```

The parser consumes one top-level circuit per semicolon. Rung IDs and diagnostic paths are deterministic. Path components are encoded as `r${index}` for a rung, `b${index}` for a branch, `l${index}` for a branch leg, `i${index}` for an instruction, `p${index}` for a parameter, `s` for a subscript, and `m:${lowercaseMember}` for member access. [1]

```js
function nodeId(path) {
  return path.map((part) => {
    switch (part.kind) {
      case "rung":        return `r${part.index}`;
      case "branch":      return `b${part.index}`;
      case "leg":         return `l${part.index}`;
      case "instruction": return `i${part.index}`;
      case "parameter":   return `p${part.index}`;
      case "subscript":   return "s";
      case "member":      return `m:${part.name.toLowerCase()}`;
    }
  }).join(".");
}
```

### 1.6 Simulation manager state tree

The simulation manager’s exact initial state is:

```js
{
  scanCount: 0,
  isRunning: false,
  isPaused: false,
  lastScanDuration: 0,
  averageScanDuration: 0,
  maxScanDuration: 0,
  parameters: {},
  localTags: {},
  errors: [],
  warnings: [],
  runtimeDiagnostics: []
}
```

The manager additionally owns non-state scheduling fields:

```js
{
  aoi: null,
  config: {
    scanTime: 100,
    maxScanTime: 1000,
    enablePerformanceMetrics: true
  },
  intervalId: null,
  callbacks: Set,
  runtimeLogSubscribers: Set,
  scanDurations: [],
  trendHistory: [],
  trendWindowMs: 60000,
  trendMaxPoints: 600,
  pipeline: Promise.resolve(),
  laneBusy: false,
  generation: 0,
  simTimeUs: 0,
  releaseAnchorWallMs: null,
  releaseAnchorSimUs: 0,
  startupPending: false,
  pausedByVisibility: false
}
```

Tags with `usage === "local"` are put into `localTags`; all other tags are placed in `parameters`. `EnableIn` and `EnableOut` default to binary `1` unless explicitly normalized otherwise. Scalar defaults are copied directly; structured tags are initialized with the correct member schema; arrays are allocated to the declared dimension and each element is initialized independently. [2]

```js
function buildStateFromAOI(aoi) {
  const state = createInitialState();
  for (const tag of aoi.tags ?? []) {
    const value = initializeTag(tag);
    tag.usage === "local"
      ? state.localTags[tag.name] = value
      : state.parameters[tag.name] = value;
  }
  ensureEnableTagDefaults(state.parameters);
  return state;
}
```

### 1.7 Persisted application store

The persisted Zustand store is version `9`, under the local-storage key `rungs-project`. Its persisted projection is exactly:

```js
{
  aoi: state.aoi ? cloneAndValidate(state.aoi) : state.aoi,
  isAoiModified: state.isAoiModified,
  mode: state.mode,
  exerciseSlug: state.exerciseSlug,
  editors: {
    tabs: state.editors.tabs,
    activeTabIndex: state.editors.activeTabIndex,
    ui: state.editors.ui
  },
  theme: state.theme
}
```

The non-persisted root slices include:

```js
{
  aoi: { aoi: null, isAoiModified: false, aoiLoadId: 0 },
  test: { result: null, isRunning: false },
  library: { instructionExamples: [], exampleAois: [] },
  editors: {
    tabs: [],
    activeTabIndex: 0,
    statusPanel: { unreadErrorCount: 0, activeTab: "errors" },
    ui: { collapsibleSections: {}, rightbarTab: Tm }
  },
  theme: { mode: "dark" | "light" }
}
```

### 1.8 State mutations and mutation safety

The state layer uses Zustand middleware with a mutating draft-style callback. Actions receive a draft-like state object and mutate nested values in place; the middleware produces the next immutable store snapshot. A generic AOI modification helper sets `isAoiModified = true` and clears `test.result`.

```js
function markAoiModified(state) {
  state.isAoiModified = true;
  state.test.result = null;
}
```

Loading an AOI replaces the object, clears the modified flag, increments `aoiLoadId`, switches mode to `user`, clears `exerciseSlug`, and clears test results:

```js
function setLoadedAoi(state, aoi) {
  state.aoi = aoi;
  state.isAoiModified = false;
  state.aoiLoadId += 1;
  state.mode = "user";
  state.exerciseSlug = null;
  state.test.result = null;
}
```

Tag edits mutate the tag array, mark the AOI dirty, clear test results, and, when a tag is renamed, perform a word-boundary, case-insensitive replacement across every routine. Tests are also renamed unless the current mode is `exercise`. [2]

```js
function renameReferences(aoi, oldName, newName, skipTests) {
  const escaped = oldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = RegExp(`\\b${escaped}\\b`, "gi");
  for (const routineName of Object.keys(aoi.routines)) {
    const routine = aoi.routines[routineName];
    if (routine?.content) routine.content = routine.content.replace(re, newName);
  }
  if (aoi.tests && !skipTests) aoi.tests = aoi.tests.replace(re, newName);
}
```

Routine updates compare `type`, `content`, and `description` before mutating. This prevents a no-op update from marking the AOI modified. The simulation manager uses object spread for state replacement on every externally visible transition, so callbacks receive a fresh state object.

## 2. Mathematical engine and algorithms

### 2.1 Compiler-to-solver pipeline

The execution pipeline is deterministic and has five stages:

```text
source text
  -> lexer/tokenizer
  -> LD parser -> LDProgram AST
  -> semantic analysis against projected tag context
  -> JavaScript code generation
  -> Function(context, vars, funcs, log, __scanMode, __trace)
  -> runtime variables Map + logs + optional trace
```

Compilation first lexes and parses. Lexer and parser diagnostics are converted into diagnostic objects. Semantic analysis runs next. Code generation runs only when no error diagnostic exists. The returned compilation object has the shape:

```js
{
  success: boolean,
  code: String | undefined,
  ast: LDProgram,
  diagnostics: Diagnostic[]
}
```

Execution rejects unsuccessful compilation, creates a runtime context with a `Map` of variables, freezes the runtime function map, and invokes the generated JavaScript through `Function(...)` in strict mode. Runtime exceptions are converted to `RT-EXEC-001` log entries and returned with the context. [1]

```js
function execute(code, options) {
  const scanMode = options.scanMode ?? "normal";
  try {
    Function(
      "context", "vars", "funcs", "log", "__scanMode", "__trace",
      `'use strict';\n${code}`
    )(
      { variables: options.variables, logs: options.logs },
      options.variables,
      Object.freeze(runtimeFunctions({
        nowUs: options.nowUs,
        log: options.logs,
        scanMode
      })),
      options.logs,
      scanMode,
      options.trace ?? null
    );
    return options;
  } catch (error) {
    options.logs.push({
      severity: "error",
      code: "RT-EXEC-001",
      message: `Execution error: ${error instanceof Error ? error.message : "Unknown error"}`
    });
    return options;
  }
}
```

### 2.2 Rung power solver

Each rung is compiled into an immediately invoked function. In normal execution, power begins as `1`; in prescan it begins as `0`. Each instruction updates `__power`, and the final value is the rung output power. When tracing is enabled, each rung and instruction records before/after power and operand state. [1]

```js
(() => {
  let __power = __prescan ? 0 : 1;
  let __rt = {
    rungIndex: RUNG_INDEX,
    inputPower: !!__power,
    elements: [],
    outputPower: false
  };

  // generated instructions mutate __power here

  __rt.outputPower = !!__power;
  if (__trace) __trace.rungs.push(__rt);
})();
```

A circuit is evaluated strictly left-to-right in source order:

```js
for (let index = 0; index < circuit.elements.length; index++) {
  elementPath.push(index);
  generated.push(generateElement(circuit.elements[index]));
  elementPath.pop();
}
```

A branch is a parallel OR. Each leg receives the same incoming power. Its generated code executes against a private copy of the power variable. The branch result is `1` if any leg returns truthy power; otherwise it is `0`. With tracing, each leg gets its own runtime trace object, then the parent branch records the OR result.

```js
const __br0_0 = (() => {
  let __bp0 = __power;
  // leg 0 generated code, with __power replaced by __bp0
  return __bp0;
})();

const __br0_1 = (() => {
  let __bp0 = __power;
  // leg 1 generated code, with __power replaced by __bp0
  return __bp0;
})();

__power = (__br0_0 || __br0_1) ? 1 : 0;
```

Thus the ladder algebra is series conjunction for sequential instructions and parallel disjunction for branch legs. There is no topological sort and no fixed-point delta-cycle solver in the Ladder Diagram path. Evaluation is a single ordered pass through each rung, followed by the next rung in program order.

### 2.3 Contacts, coils, and one-shot logic

The exact generated equations for the primary Boolean instructions are:

```js
// XIC(dataBit): normally-open contact
__power = __power && (GET(dataBit) ? 1 : 0);

// XIO(dataBit): normally-closed contact
__power = __power && (GET(dataBit) ? 0 : 1);

// OTE(dataBit): destructive output energized by current rung power
if (__power) {
  SET(dataBit, __power);
} else {
  SET(dataBit, __power); // generated setter writes 0 as well
}

// OTL(dataBit): latch only while rung is true
if (__power) SET(dataBit, 1);

// OTU(dataBit): unlatch only while rung is true
if (__power) SET(dataBit, 0);

// AFI: force remainder of rung false
__power = 0;

// NOP: no state or power change
```

`ONS` uses one storage bit and is prescanned by writing the storage bit to `1`. During normal execution, if incoming power is true, it reads storage; stored `1` suppresses power, stored `0` passes one scan, and storage is then set to `1`. If incoming power is false, storage is reset to `0` and output power is forced to `0`.

```js
if (__prescan) {
  SET(storageBit, 1);
} else if (__power) {
  const __storage = GET(storageBit) ? 1 : 0;
  __power = __storage ? 0 : 1;
  SET(storageBit, 1);
} else {
  SET(storageBit, 0);
  __power = 0;
}
```

`OSR` and `OSF` have an explicit storage bit and output bit. Their exact transitions are:

```js
// OSR
if (__prescan) {
  SET(storageBit, 1);
  SET(outputBit, 0);
} else if (__power) {
  const __storage = GET(storageBit) ? 1 : 0;
  if (__storage) {
    SET(outputBit, 0);
  } else {
    SET(storageBit, 1);
    SET(outputBit, 1);
  }
} else {
  SET(storageBit, 0);
  SET(outputBit, 0);
}

// OSF
if (__prescan) {
  SET(storageBit, 0);
  SET(outputBit, 0);
} else if (__power) {
  SET(storageBit, 1);
  SET(outputBit, 0);
} else {
  const __storage = GET(storageBit) ? 1 : 0;
  if (__storage) {
    SET(storageBit, 0);
    SET(outputBit, 1);
  } else {
    SET(outputBit, 0);
  }
}
```

### 2.4 Numeric representation and conversion

`BOOL` values are normalized to `0` or `1`. The conversion used for instruction enable bits is:

```js
function toBool(value) {
  return typeof value === "number"
    ? value === 0 ? 0 : 1
    : typeof value === "boolean"
      ? +!!value
      : typeof value === "string"
        ? +(value.trim() !== "" && value.trim() !== "0")
        : +!!value;
}
```

DINT literals support decimal, binary (`2#...`), octal (`8#...`), and hexadecimal (`16#...`) forms. Radix values are parsed as unsigned bit patterns and converted to signed 32-bit values with `| 0`. Decimal DINT values must be between `-2147483648` and `2147483647`.

The exact DINT coercion rounds to nearest with ties-to-even, then applies signed 32-bit conversion:

```js
function __plcToDint(__v) {
  if (typeof __v !== "number") return __v;
  if (Number.isNaN(__v)) return 0;
  if (__v === Infinity) return 2147483647;
  if (__v === -Infinity) return -2147483648;
  const __f = Math.floor(__v);
  const __d = __v - __f;
  const __r =
    __d < 0.5 ? __f
    : __d > 0.5 ? __f + 1
    : __f % 2 === 0 ? __f
    : __f + 1;
  return __r | 0;
}
```

REAL arithmetic is single-precision-like because each operation applies `Math.fround` to operands and result. DINT arithmetic wraps through JavaScript’s 32-bit operators:

```js
function __plcDintAdd(a, b) { return (a + b) | 0; }
function __plcDintSub(a, b) { return (a - b) | 0; }
function __plcDintMul(a, b) { return Math.imul(a, b); }

function __plcRealAdd(a, b) { return Math.fround(Math.fround(a) + Math.fround(b)); }
function __plcRealSub(a, b) { return Math.fround(Math.fround(a) - Math.fround(b)); }
function __plcRealMul(a, b) { return Math.fround(Math.fround(a) * Math.fround(b)); }
function __plcRealDiv(a, b) { return Math.fround(Math.fround(a) / Math.fround(b)); }
function __plcRealNeg(a)   { return Math.fround(0 - Math.fround(a)); }
function __plcRealAbs(a)   { return Math.fround(Math.abs(Math.fround(a))); }
function __plcRealSqrt(a)  { return Math.fround(Math.sqrt(Math.abs(Math.fround(a)))); }
```

### 2.5 Division, modulo, and unary math

DINT division truncates toward zero. Division by zero returns the left operand. DINT modulo by zero returns `0`. REAL division follows IEEE-like JavaScript floating behavior, including infinity/NaN propagation; REAL modulo by zero returns `a / 0`.

```js
function __plcDivDint(left, right) {
  if (right === 0) return left;
  return Math.trunc(left / right) | 0;
}

function __plcModDint(left, right) {
  if (right === 0) return 0;
  return (left % right) | 0;
}

function __plcRealMod(a, b) {
  const fb = Math.fround(b);
  if (fb === 0) return Math.fround(a) / 0;
  return Math.fround(Math.fround(a) % fb);
}
```

Instruction selection is type-sensitive:

```js
const bothDint = isDint(sourceA) && isDint(sourceB);
const realMode = isReal(sourceA) || isReal(sourceB) || destinationType === "REAL";

ADD/SUB/MUL:
  realMode ? __plcRealOp(a, b) : __plcDintOp(a, b)

DIV/MOD:
  bothDint && !realMode ? __plcDintOp(a, b)
  : realMode             ? __plcRealOp(a, b)
  :                        a / b or a % b
```

Unary operations are exact in the generated source:

```js
ABS(REAL) -> __plcRealAbs(value)
ABS(DINT) -> (Math.abs(value) | 0)
NEG(REAL) -> __plcRealNeg(value)
NEG(DINT) -> ((0 - value) | 0)
SQRT(any) -> __plcRealSqrt(value) // square root of abs(value)
```

### 2.6 Bitwise operations

REAL operands used by Ladder bitwise operations are converted to DINT first. The generated formulas are:

```js
AND(a, b, d) -> SET(d, GET(a) & GET(b));
OR(a, b, d)  -> SET(d, GET(a) | GET(b));
XOR(a, b, d) -> SET(d, GET(a) ^ GET(b));
NOT(a, d)    -> SET(d, ~GET(a));
```

`MVM` preserves destination bits masked off and copies source bits masked on:

```js
const result = ((source & mask) | (destination & ~mask));
SET(destination, result);
```

`BTD` copies a field of `length` bits from `sourceBit` in the source into `destBit` in the destination. The field mask is all ones for length `>= 32`, otherwise `(1 << length) - 1`; the destination mask is the field mask shifted by `destBit`.

```js
const fieldMask = length >= 32 ? -1 : (1 << length) - 1;
const destinationMask = (fieldMask << destBit) | 0;
const field = ((source >>> sourceBit) & fieldMask) << destBit;
const result = (destination & ~destinationMask) | (field & destinationMask);
SET(destination, result | 0);
```

### 2.7 Comparisons and LIMIT

Comparisons preserve the incoming series power through conjunction with the comparison result:

```js
__power = __power && (coerce(A) OP coerce(B) ? 1 : 0);
```

The supported operators are `===`, `!==`, `>`, `>=`, `<`, and `<=`. If either operand is REAL, the other is coerced to REAL before comparison.

`LIMIT(low, test, high)` is inclusive. NaN operands force false. If `low <= high`, the test must lie inside the interval. If the bounds are reversed, the accepted region is outside the band:

```js
const low = coerce(lowLimit);
const test = coerce(testValue);
const high = coerce(highLimit);
if (low !== low || test !== test || high !== high) return 0;
if (low <= high) return (test >= low && test <= high) ? 1 : 0;
return (test >= low || test <= high) ? 1 : 0;
```

### 2.8 Counter algorithms

`CTU` and `CTD` detect rising edges of the current rung power. Prescan sets `CU` or `CD` to `1`, preventing a false first-scan edge. `CTU` increments on a transition from previous `CU === 0` to current rung power true. It wraps to `-2147483648` and sets `OV = 1` on overflow. `CTD` decrements on an equivalent rising edge and wraps to `2147483647` with `UN = 1` on underflow. `DN` is recomputed as `ACC >= PRE`.

```js
function CTU(context, power, counter) {
  if (context.scanMode === "prescan") {
    counter.CU = 1;
    return 0;
  }
  const previous = counter.CU;
  if (power && !previous) {
    counter.ACC += 1;
    if (counter.ACC > 2147483647) {
      counter.ACC = -2147483648;
      counter.OV = 1;
    }
  }
  counter.CU = +!!power;
  counter.DN = +(counter.ACC >= counter.PRE);
  return power;
}

function CTD(context, power, counter) {
  if (context.scanMode === "prescan") {
    counter.CD = 1;
    return 0;
  }
  const previous = counter.CD;
  if (power && !previous) {
    counter.ACC -= 1;
    if (counter.ACC < -2147483648) {
      counter.ACC = 2147483647;
      counter.UN = 1;
    }
  }
  counter.CD = +!!power;
  counter.DN = +(counter.ACC >= counter.PRE);
  return power;
}
```

`CTUD` keeps hidden edge state for both directions. Its signed edge delta is `(+risingCU) - (+risingCD)`, so simultaneous rising edges cancel. Reset clears the hidden accumulator and prior-edge state. It then publishes `EnableIn`, `CUEnable`, `CDEnable`, `PRE`, `Reset`, `ACC`, `DN`, `OV`, and `UN`; `EnableOut` equals the caller’s enable value.

### 2.9 Ladder timer algorithms

Timer time is tracked in integer microseconds. The execution clock must return a nonnegative safe integer. The helper converts elapsed microseconds to published milliseconds using nearest-integer rounding:

```js
nowUs = Math.trunc(clock());
elapsedUs = Math.max(0, nowUs - lastExecUs);
publishedMs = Math.floor(accUs / 1000 + 0.5);
presetMs = Math.max(Math.trunc(PRE), 1);
```

The timer runtime preserves externally edited `ACC`: when published `ACC` differs from `lastPublishedAccMs`, it resets hidden `accUs` to the externally supplied milliseconds.

```js
if (ACC !== timer.lastPublishedAccMs) {
  timer.accUs = ACC * 1000;
}
```

`TON` and `RTO` accumulate elapsed time only while input power is true, not done, and no rising/falling transition is being treated as a reset edge. `TON` resets `ACC` and `DN` immediately when power goes false. `RTO` retains the accumulator when power goes false. `TOF` sets `ACC = PRE` and `DN = 0` while power is true; once power falls, it accumulates elapsed time and clears `DN` after the preset is reached. [1]

```js
const transition = timerFamily === "TOF"
  ? previousInput === 1 && input === 0
  : previousInput === 0 && input === 1;
const elapsedUs = Math.max(0, nowUs - state.lastExecUs);

if (family === "TON") {
  if (input) {
    validatePreset();
    if (!transition && !done) {
      state.accUs += elapsedUs;
      if (roundMs(state.accUs) >= max(trunc(PRE), 1)) done = 1;
    }
  } else {
    state.accUs = 0;
    done = 0;
  }
} else if (family === "RTO") {
  if (input) {
    validatePreset();
    if (!transition && !done) {
      state.accUs += elapsedUs;
      if (roundMs(state.accUs) >= max(trunc(PRE), 1)) done = 1;
    }
  }
} else { // TOF
  if (input) {
    state.accUs = 0;
    done = 1;
  } else {
    validatePreset();
    if (!transition && done) {
      state.accUs += elapsedUs;
      if (roundMs(state.accUs) >= max(trunc(PRE), 1)) done = 0;
    }
  }
}

ACC = roundMs(state.accUs);
EN = input;
TT = family === "TOF" ? (!input && done ? 1 : 0) : (input && !done ? 1 : 0);
DN = done;
state.lastExecUs = nowUs;
state.lastInput = input;
state.lastPublishedAccMs = ACC;
```

Prescan initializes `TON` with `ACC = 0`, `DN = 0`; `TOF` with `ACC = PRE`, `DN = 0`; and all timer hidden timing fields with the current clock.

### 2.10 FBD timer and counter algorithms

FBD timers use `TimerEnable`, `Reset`, `EnableIn`, `EnableOut`, `ACC`, `DN`, `EN`, `TT`, `Status`, `InstructFault`, and `PresetInv`. `TONR` resets when disabled or reset; `RTOR` retains while disabled but resets on `Reset`; `TOFR` is an off-delay with a `tofrNeedsPreset` latch that ensures the preset is loaded after reset/activation. Negative presets are treated as an instruction fault and set `InstructFault = 1`, `PresetInv = 1`, and `Status = 3`.

FBD one-shots use the exact edge predicates:

```js
// OSFI
const input = toBool(oneShot.InputBit);
oneShot.OutputBit = +(input === 0 && state.lastInput === 1);
state.lastInput = input;

// OSRI
const input = toBool(oneShot.InputBit);
oneShot.OutputBit = +(input === 1 && state.lastInput === 0);
state.lastInput = input;
```

Prescan seeds `OSFI.lastInput = 0` and `OSRI.lastInput = 1`, then disables `EnableIn` and `EnableOut` for the prescan call.

## 3. Event loop and execution flow

### 3.1 Worker protocol

The main bundle creates a module Web Worker using the supplied worker asset. Requests carry an ID, command type, and payload. A pending `Map` stores promise resolvers and optional timeout IDs. Responses resolve or reject the matching pending request. Worker errors and message errors terminate and recreate the worker, rejecting all pending promises.

```js
// request
const id = `${Date.now()}-${requestId++}`;
const message = payload === undefined
  ? { id, type }
  : { id, type, payload };
pending.set(id, { resolve, reject, timeoutId });
worker.postMessage(message);

// response
const pendingRequest = pending.get(event.data.id);
if (pendingRequest) {
  pending.delete(event.data.id);
  if (pendingRequest.timeoutId !== undefined)
    clearTimeout(pendingRequest.timeoutId);
  event.data.success
    ? pendingRequest.resolve(event.data.result)
    : pendingRequest.reject(Error(event.data.error));
}
```

The worker accepts exactly these commands:

```js
compile:
  payload = { sourceCode, context }
  -> { id, success: true, result: compilationResult }

execute:
  payload = { compilationResult, parameters, options }
  -> { id, success: true, result: serializedExecutionContext }

executeRoutine:
  payload = { aoi, routineName, parameters, options }
  -> { id, success: true,
       result: { compilationResult, executionContext, executedRoutineName } }

clearCache:
  -> { id, success: true, result: null }

invalidateCache:
  payload = { aoiName }
  -> { id, success: true, result: null }
```

Unknown commands return `{ id, success: false, error }`. The worker serializes execution contexts as:

```js
function serializeContext(context) {
  return {
    variables: Array.from(context.variables.entries()),
    logs: [...context.logs],
    nowUs: validateExecutionTime(context.nowUs()),
    ...(context.scanMode ? { scanMode: context.scanMode } : {}),
    trace: context.trace ?? null
  };
}
```

The main thread reconstructs the `variables` array as a new `Map`, clones logs, and recreates a constant clock function from the serialized time.

### 3.2 Compile cache

Compiled routines are cached in a `Map`. The cache key is AOI name plus routine name; the signature includes routine content, projected tag metadata, and whether tracing is enabled. A cache hit returns the prior compilation result. AOI invalidation deletes keys beginning with `${aoiName}:`; clear-cache empties the entire map.

```js
const cacheKey = `${aoi.name}:${routineName}`;
const signature = `${routine.content}:${JSON.stringify(context.tags)}${trace ? ":trace" : ""}`;
const cached = cache.get(cacheKey);
if (cached && cached.signature === signature) return cached.result;
const result = compileRoutine(routine);
cache.set(cacheKey, { signature, result });
return result;
```

### 3.3 Prescan and normal scan sequence

A normal simulation starts by rebuilding parameters and locals from AOI tag definitions, clearing errors and warnings, resetting the simulation clock, and enqueueing startup. Startup executes `Logic` in `scanMode = "prescan"`. If that succeeds and a `Prescan` routine exists, the worker then executes the explicit `Prescan` routine in normal mode. Only after this does the manager release the periodic scan interval.

```js
async function runStartup() {
  await executePrescan();
  if (generationChanged() || !state.isRunning) return;

  startupPending = false;
  releaseAnchorWallMs = null;
  releaseAnchorSimUs = simTimeUs;
  captureTrendPoint(simTimeUs, Date.now(), state.parameters);

  if (!state.isPaused) {
    rebaseReleaseClock();
    startScanInterval();
  }
  notifyCallbacks();
}
```

Prescan merges parameters and locals into one input object, executes `Logic` with the current simulation time, rejects compilation failures, emits runtime diagnostics, and reads worker variables back into separate parameter/local objects.

```js
const variables = { ...state.parameters, ...state.localTags };
const result = await executeRoutine(aoi, "Logic", variables, {
  nowUs: () => simTimeUs,
  scanMode: "prescan"
});

if (!result.compilationResult.success) stopWithError();
if (emitRuntimeDiagnostics(result.executedRoutineName, result.executionContext.logs)) return;
const { newParameters, newLocalTags } = readBackVariables(
  aoi,
  result.executionContext.variables
);
state = { ...state, parameters: newParameters, localTags: newLocalTags };
```

### 3.4 Scheduled and manual scans

The configured scan time defaults to `100 ms`. The scheduled interval does not blindly execute one scan every callback. It advances simulated time from the wall-clock release anchor in integral scan periods. If time advanced and the execution lane is free, it enqueues one scheduled scan. Manual stepping is allowed only while running and paused; it advances simulation time by exactly one scan period before executing one scan.

```js
const periodUs = Math.max(1, Math.round(Math.max(0, config.scanTime) * 1000));

// manual step
if (reason === "manual-step") {
  simTimeUs += periodUs;
  releaseAnchorSimUs = simTimeUs;
}

// scheduled interval
const previous = simTimeUs;
syncSimulationClock();
if (simTimeUs !== previous) {
  if (!laneBusy) enqueue(() => executeScan("scheduled-release"));
}
```

The simulation clock is quantized to whole scan periods:

```js
function currentSimulationTimeUs() {
  if (
    !state.isRunning ||
    state.isPaused ||
    startupPending ||
    releaseAnchorWallMs === null
  ) return simTimeUs;

  const elapsedUs = Math.max(
    0,
    Math.floor((performance.now() - releaseAnchorWallMs) * 1000)
  );
  const periodUs = scanPeriodUs();
  const completedPeriods = Math.floor(elapsedUs / periodUs);
  return releaseAnchorSimUs + completedPeriods * periodUs;
}
```

The normal scan sequence is:

```js
async function executeScan(reason) {
  if (!aoi) return;
  const generationAtStart = generation;
  if (reason === "manual-step") {
    simTimeUs += scanPeriodUs();
    releaseAnchorSimUs = simTimeUs;
  }

  const scanTimeUs = simTimeUs;
  const wallStart = performance.now();
  const variables = { ...state.parameters, ...state.localTags };
  const result = await executeRoutine(aoi, "Logic", variables, {
    nowUs: () => scanTimeUs,
    trace: aoi.routines.Logic.type === "ld"
  });

  if (generationAtStart !== generation) return;
  if (!result.compilationResult.success) {
    handleError(`Compilation failed: ${result.compilationResult.error}`);
    return;
  }
  if (!result.executionContext) return;

  const { newParameters, newLocalTags } = readBackVariables(
    aoi,
    result.executionContext.variables
  );
  state = { ...state, parameters: newParameters, localTags: newLocalTags };

  if (emitRuntimeDiagnostics(
    result.executedRoutineName ?? "Logic",
    result.executionContext.logs ?? []
  )) return;

  const durationMs = performance.now() - wallStart;
  updateScanMetrics(durationMs);
  state = {
    ...state,
    scanCount: state.scanCount + 1,
    parameters: newParameters,
    localTags: newLocalTags,
    lastScanDuration: durationMs,
    trace: result.executionContext.trace ?? undefined
  };
  captureTrendPoint(scanTimeUs, Date.now(), newParameters);
  if (durationMs > config.maxScanTime)
    handleWarning(`Scan time ${durationMs}ms exceeded maximum ${config.maxScanTime}ms`);
  notifyCallbacks();
}
```

### 3.5 Queue serialization and cancellation

The manager serializes scans through a promise pipeline. Each enqueue captures the current `generation`. A queued operation runs only if its captured generation equals the current generation. `stop()` increments generation, invalidating all already queued work without requiring destructive cancellation of the promises.

```js
function enqueue(operation) {
  const capturedGeneration = generation;
  const next = pipeline.then(async () => {
    if (capturedGeneration !== generation) return;
    laneBusy = true;
    try {
      await operation();
    } finally {
      laneBusy = false;
    }
  });
  pipeline = next.catch(() => undefined);
  return next;
}
```

`stop()` clears the interval, increments `generation`, clears startup and visibility pause flags, resets release anchors, and replaces only the externally visible running flags:

```js
function stop() {
  syncSimulationClock();
  generation += 1;
  startupPending = false;
  pausedByVisibility = false;
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
  releaseAnchorWallMs = null;
  releaseAnchorSimUs = simTimeUs;
  state = { ...state, isRunning: false, isPaused: false };
  notifyCallbacks();
}
```

Page visibility pauses a running, unpaused simulation when the document becomes hidden and resumes it when visible again. It uses the same pause/resume path as an explicit user pause, but records `pausedByVisibility` so automatic resumption is possible.

### 3.6 Runtime diagnostics and fault termination

Runtime diagnostics are deduplicated by the tuple `code | rung | element | message`. The first unique diagnostic is emitted to runtime-log subscribers, appended to `errors` using its message, appended to `runtimeDiagnostics` using the full diagnostic object, then the simulation is stopped. This means a runtime diagnostic is fail-stop rather than a recoverable per-rung warning.

```js
function emitRuntimeDiagnostics(routineName, logs) {
  const unique = dedupe(logs);
  for (const diagnostic of unique) {
    emitRuntimeLog({
      level: diagnostic.severity,
      message: `Routine '${routineName}'${rungSuffix}: ${diagnostic.message}`,
      code: diagnostic.code,
      rung: diagnostic.rung,
      element: diagnostic.element
    });
    state = {
      ...state,
      errors: [...state.errors, diagnostic.message],
      runtimeDiagnostics: [...state.runtimeDiagnostics, diagnostic]
    };
    stop();
    notifyCallbacks();
    return true;
  }
  return false;
}
```

Array subscripting is also fail-stop. Index expressions use DINT-style arithmetic with NaN propagation; division or modulo by zero produces NaN; an invalid index raises `RT-ARR-001` with either `division or MOD by zero in the subscript` or the concrete index.

### 3.7 Read-back and alias separation

The worker executes with a single `Map` containing both parameters and locals. After execution, the manager iterates the AOI tag definitions and copies values back into separate objects according to `usage`:

```js
function readBackVariables(tags, variables) {
  const newParameters = { ...state.parameters };
  const newLocalTags = { ...state.localTags };

  for (const tag of tags ?? []) {
    if (!variables.has(tag.name)) continue;
    const value = clone(variables.get(tag.name));
    tag.usage === "local"
      ? newLocalTags[tag.name] = value
      : newParameters[tag.name] = value;
  }
  ensureEnableTagDefaults(newParameters);
  return { newParameters, newLocalTags };
}
```

The use of cloning on read-back prevents structured runtime objects and arrays from sharing mutable references with the worker-returned context.

## 4. Exact instruction dispatch

The runtime function map binds the instruction mnemonic to either a pure mathematical function or a stateful PLC function. The exact dispatch categories are:

```js
ABS  -> Math.abs
SQRT -> Math.sqrt(Math.abs(value))
SIN  -> Math.sin
COS  -> Math.cos
TAN  -> Math.tan
SIZE -> array-size routine
TONR -> FBD on-delay routine
TOFR -> FBD off-delay routine
RTOR -> FBD retentive timer routine
CTUD -> FBD up/down counter routine
OSRI -> FBD rising one-shot routine
OSFI -> FBD falling one-shot routine
TON  -> ladder TON routine
TOF  -> ladder TOF routine
RTO  -> ladder RTO routine
CTU  -> ladder CTU routine
CTD  -> ladder CTD routine
RES  -> timer/counter reset routine
```

Ladder instructions are generated inline around the `__power` variable. Stateful timer/counter instructions load a structured tag, call the runtime function, then write the structured object back into the `vars` map. Output instructions write only when their rung semantics require it; input instructions update power through conjunction.

## 5. Final execution blueprint

The complete computational model, omitting UI, is:

```js
function oneScan(aoi, parameters, localTags, nowUs, scanMode = "normal") {
  const variables = new Map([
    ...Object.entries(parameters),
    ...Object.entries(localTags)
  ]);

  const context = {
    variables,
    logs: [],
    nowUs,
    scanMode,
    trace: scanMode === "normal" ? { sourceHash: "", rungs: [] } : null
  };

  // compile or retrieve cached Logic routine
  const compilation = compileRoutine(aoi.routines.Logic, projectContext(aoi));
  if (!compilation.success || !compilation.code)
    return { compilation, context };

  // execute generated JS
  execute(compilation.code, context);

  // caller reads Map values back into parameter/local partitions
  return { compilation, context };
}

function scanLoop() {
  prescanOnce();
  while (isRunning) {
    if (isPaused) await manualStepOrResume();
    else await queuedScheduledScan();
  }
}
```

The computational truth is therefore an ordered, single-pass ladder interpreter implemented as generated JavaScript. Series elements are Boolean conjunctions on a mutable `__power` bit. Branches are independent leg evaluations whose outputs are ORed. Numeric instructions use explicit DINT wrapping or REAL32 rounding. Stateful instructions persist hidden edge/timer state inside structured tag objects. The real-time wrapper advances a quantized microsecond simulation clock, serializes scans through a generation-guarded promise lane, executes prescan before normal scans, and reads a worker `Map` back into separated parameters and locals. There is no graph topological sort, no iterative convergence solver, and no multi-pass delta-cycle algorithm in the extracted Ladder Diagram execution path.

## References

[1]: `file:///home/ubuntu/studio-rungs-analysis/studio.rungs.dev/assets/aoi-execution.worker-B8lRXcof.js` "Supplied AOI execution worker bundle"

[2]: `file:///home/ubuntu/studio-rungs-analysis/studio.rungs.dev/assets/index-Cva4zvxr.js` "Supplied main application bundle containing state and simulation orchestration"
