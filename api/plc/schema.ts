import { z } from 'zod';

/** Hard request limits: every array is bounded so a payload cannot exhaust memory or CPU. */
export const LIMITS = {
  maxScansPerRequest: 64,
  maxDeltaMs: 1000,
  maxNetworks: 512,
  maxNodesPerNetwork: 128,
  maxBranchesPerNetwork: 64,
  maxStateEntries: 1024,
  maxBase64Chars: 32_768, // 24 KiB of raw bytes: covers the largest V area (10 KiB)
} as const;

const id = z.string().min(1).max(64);
const address = z.string().min(1).max(16).regex(/^[A-Za-z]{1,2}\d{1,5}(\.\d)?$/, 'malformed PLC address');
const int = z.number().int().finite();
const finite = z.number().finite();

const operand = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('address'), address }),
  z.object({ kind: z.literal('constant'), value: finite }),
]);
const flow = z.object({ kind: z.literal('flow') });

const layout = z.object({
  row: int.min(0).max(1024),
  col: int.min(0).max(1024),
  rowSpan: int.min(1).max(1024),
  colSpan: int.min(1).max(1024),
  branchId: id.nullable(),
});
const base = { id, layout, symbol: z.string().max(64).optional() };

const numericType = z.enum(['BYTE', 'INT', 'DINT', 'REAL']);
const logicWidth = z.enum(['BYTE', 'WORD', 'DWORD']);
const optAddr = address.optional();

const contact = z.object({ ...base, type: z.literal('contact'), variant: z.enum(['NO', 'NC', 'P', 'N']), operand: address });
const outputCoil = z.object({ ...base, type: z.literal('coil'), variant: z.enum(['OUT', 'INTERNAL']), target: address });
const setResetCoil = z.object({ ...base, type: z.literal('coil'), variant: z.enum(['SET', 'RESET']), target: address, count: int.min(1).max(256) });
const masterCoil = z.object({ ...base, type: z.literal('coil'), variant: z.literal('MASTER'), mode: z.enum(['begin', 'end']) });

const timer = z.object({
  ...base,
  type: z.literal('timer'),
  fn: z.enum(['TON', 'TOF', 'TONR']),
  instance: address,
  timeBaseMs: z.union([z.literal(1), z.literal(10), z.literal(100)]),
  inputs: z.object({ EN: flow.optional(), IN: flow, PT: operand }),
  outputs: z.object({ ENO: optAddr, Q: optAddr, ET: optAddr }),
});
const counterOut = z.object({ ENO: optAddr, Q: optAddr, CV: optAddr });
const ctu = z.object({ ...base, type: z.literal('counter'), fn: z.literal('CTU'), instance: address, outputs: counterOut, inputs: z.object({ EN: flow.optional(), CU: flow, R: flow, PV: operand }) });
const ctd = z.object({ ...base, type: z.literal('counter'), fn: z.literal('CTD'), instance: address, outputs: counterOut, inputs: z.object({ EN: flow.optional(), CD: flow, LD: flow, PV: operand }) });
const ctud = z.object({ ...base, type: z.literal('counter'), fn: z.literal('CTUD'), instance: address, outputs: counterOut, inputs: z.object({ EN: flow.optional(), CU: flow, CD: flow, R: flow, PV: operand }) });

const compare = z.object({ ...base, type: z.literal('compare'), op: z.enum(['==', '<>', '>=', '<=', '>', '<']), dataType: numericType, lhs: operand, rhs: operand });
const binaryMath = z.object({ ...base, type: z.literal('math'), fn: z.enum(['ADD', 'SUB', 'MUL', 'DIV']), dataType: numericType, out: address, eno: optAddr, in1: operand, in2: operand });
const unaryMath = z.object({ ...base, type: z.literal('math'), fn: z.enum(['SQR', 'SIN', 'COS', 'EXP', 'LN', 'ABS']), dataType: numericType, out: address, eno: optAddr, in: operand });
const binaryWord = z.object({ ...base, type: z.literal('wordLogic'), fn: z.enum(['W_AND', 'W_OR', 'W_XOR']), width: logicWidth, out: address, eno: optAddr, in1: operand, in2: operand });
const unaryWord = z.object({ ...base, type: z.literal('wordLogic'), fn: z.literal('W_NOT'), width: logicWidth, out: address, eno: optAddr, in: operand });

// Variants share `type`, so they are matched by trying each in turn.
const node = z.union([contact, outputCoil, setResetCoil, masterCoil, timer, ctu, ctd, ctud, compare, binaryMath, unaryMath, binaryWord, unaryWord]);

const branch = z.object({
  id,
  parentId: id.nullable(),
  splitCol: int.min(0).max(1024),
  mergeCol: int.min(0).max(1024),
  rowStart: int.min(0).max(1024),
  rowEnd: int.min(0).max(1024),
});

const network = z.object({
  id,
  title: z.string().max(256).optional(),
  comment: z.string().max(2048).optional(),
  grid: z.object({ rows: int.min(1).max(1024), cols: int.min(1).max(1024) }),
  nodes: z.array(node).max(LIMITS.maxNodesPerNetwork),
  branches: z.array(branch).max(LIMITS.maxBranchesPerNetwork),
});

export const ProgramSchema = z.object({
  schemaVersion: z.literal(1),
  profileId: id,
  networks: z.array(network).max(LIMITS.maxNetworks),
});

const base64 = z.string().max(LIMITS.maxBase64Chars).regex(/^[A-Za-z0-9+/]*={0,2}$/, 'invalid base64');
const u16Array = z.array(int.min(0).max(0xffff)).max(1024);

const timerState = z.object({
  accumulatedMs: finite,
  timing: z.boolean(),
  previousIn: z.boolean(),
  lastScan: int.min(0),
  pending: z.object({ fn: z.enum(['TON', 'TOF', 'TONR']), timeBaseMs: finite, preset: finite, input: z.boolean() }).nullable(),
});
const counterState = z.object({
  previousCu: z.boolean(),
  previousCd: z.boolean(),
  previousLd: z.boolean(),
  previousR: z.boolean(),
  lastScan: int.min(0),
});

const indexedStore = z.object({ current: u16Array, preset: u16Array, status: base64 });

/** Everything a stateless server needs to continue a run where the previous request stopped. */
export const StateSchema = z.object({
  memory: z.object({
    profileId: id,
    bytes: z.object({ I: base64.optional(), Q: base64.optional(), M: base64.optional(), V: base64.optional() }),
    indexed: z.object({ T: indexedStore.optional(), C: indexedStore.optional() }),
  }),
  runtime: z.object({
    edges: z.array(z.tuple([id, z.boolean()])).max(LIMITS.maxStateEntries),
    timers: z.array(z.tuple([address, timerState])).max(LIMITS.maxStateEntries),
    counters: z.array(z.tuple([address, counterState])).max(LIMITS.maxStateEntries),
  }),
  cycle: int.min(0),
});

export const EvaluateRequestSchema = z.object({
  program: ProgramSchema,
  /** Omit (or null) for a cold start: memory zeroed, edges and timers cleared. */
  state: StateSchema.nullish(),
  /** Ask for the power-flow trace of the last scan (canvas wire highlighting). */
  trace: z.boolean().optional(),
  scans: z
    .array(z.object({ deltaMs: finite.min(0).max(LIMITS.maxDeltaMs), inputs: base64 }))
    .min(1)
    .max(LIMITS.maxScansPerRequest),
});

export type EvaluateRequest = z.infer<typeof EvaluateRequestSchema>;
export type WireState = z.infer<typeof StateSchema>;
