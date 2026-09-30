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

// Runtime state is opaque to the browser: it echoes back what the previous response carried. The
// compact positional form is validated strictly because it is still client-supplied.
//   edges:    [nodeId, 0|1]
//   timers:   [address, accumulatedMs, flags (1 = timing, 2 = previousIn), lastScan, pending]
//   counters: [address, flags (1 = Cu, 2 = Cd, 4 = Ld, 8 = R), lastScan]
//   pending:  0 | [fn (0 TON, 1 TOF, 2 TONR), timeBaseMs, preset, input 0|1]
const bit = z.union([z.literal(0), z.literal(1)]);
const pending = z.union([z.literal(0), z.tuple([int.min(0).max(2), finite, finite, bit])]);
export const RuntimeWireSchema = z.tuple([
  z.array(z.tuple([id, bit])).max(LIMITS.maxStateEntries),
  z.array(z.tuple([address, finite, int.min(0).max(3), int.min(0), pending])).max(LIMITS.maxStateEntries),
  z.array(z.tuple([address, int.min(0).max(15), int.min(0)])).max(LIMITS.maxStateEntries),
]);
export type RuntimeWire = z.infer<typeof RuntimeWireSchema>;

const hash = z.string().regex(/^[0-9a-f]{32}$/, 'invalid program hash');

/**
 * Protocol v2 request. The program is sent once (no `h`), after which the client sends only the
 * hash the server returned. Memory is a zero-run-suppressed image (see shared/plcWire.ts).
 */
export const EvaluateRequestSchema = z
  .object({
    v: z.literal(2),
    /** Hash of a program the server has seen; omit it and send `program` instead to (re)register. */
    h: hash.optional(),
    program: ProgramSchema.optional(),
    st: z.object({ m: base64, r: RuntimeWireSchema, c: int.min(0) }),
    /** Input image for every scan in the batch. */
    in: base64,
    n: int.min(1).max(LIMITS.maxScansPerRequest),
    /** Simulated milliseconds per scan. */
    dt: finite.min(0).max(LIMITS.maxDeltaMs),
    /** Ask for the power-flow trace of the last scan. */
    tr: z.boolean().optional(),
  })
  .refine((request) => request.h !== undefined || request.program !== undefined, { message: 'send a program or a program hash' });

export type EvaluateRequest = z.infer<typeof EvaluateRequestSchema>;
