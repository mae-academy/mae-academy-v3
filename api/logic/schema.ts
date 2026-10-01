import { z } from 'zod';

/** Hard request limits: every array and string is bounded so a payload cannot exhaust memory or CPU. */
export const LOGIC_LIMITS = {
  maxComponents: 512,
  maxWires: 2048,
  maxProps: 64,
  maxOps: 16,
  maxEvents: 8192,
  maxExpressionChars: 256,
  maxTicks: 256,
  maxTracks: 8,
  maxStates: 16,
  maxTransitions: 64,
  maxSteps: 64,
} as const;

const int = z.number().int().finite();
const finite = z.number().finite();
const name = z.string().min(1).max(64);
const logicState = z.union([z.literal(0), z.literal(1), z.literal('Z'), z.literal('X')]);
const expression = z.string().min(1).max(LOGIC_LIMITS.maxExpressionChars);

const prop = z.union([z.string().max(256), z.number().finite(), z.boolean(), z.null()]);
const component = z.object({
  id: name,
  type: name,
  x: finite.default(0),
  y: finite.default(0),
  rotation: finite.default(0),
  flipH: z.boolean().default(false),
  flipV: z.boolean().default(false),
  label: z.string().max(64).default(''),
  props: z.record(z.string().max(64), prop).refine(value => Object.keys(value).length <= LOGIC_LIMITS.maxProps, 'too many properties'),
});
const wire = z.object({ id: name, fromComp: name, fromTerm: name, toComp: name, toTerm: name });
const circuit = {
  components: z.array(component).max(LOGIC_LIMITS.maxComponents),
  wires: z.array(wire).max(LOGIC_LIMITS.maxWires),
};

export const KMapRequest = z.object({
  op: z.literal('kmap'),
  variables: z.array(z.string().regex(/^[A-Za-z]$/)).min(2).max(5),
  minterms: z.array(int.min(0).max(31)).max(32),
  dontCares: z.array(int.min(0).max(31)).max(32).default([]),
});

export const SynthesisRequest = z.object({ op: z.literal('synthesis'), expression, mode: z.enum(['NAND', 'NOR']) });
export const TruthTableRequest = z.object({ op: z.literal('truth-table'), expression });

const fsmValue = z.enum(['0', '1', 'X']);
export const FsmRequest = z.object({
  op: z.literal('fsm'),
  machine: z.object({
    kind: z.enum(['Moore', 'Mealy']),
    inputName: z.string().regex(/^[A-Za-z]$/),
    outputName: z.string().min(1).max(8),
    states: z.array(z.object({ id: name, name, output: fsmValue, x: finite, y: finite })).min(1).max(LOGIC_LIMITS.maxStates),
    transitions: z.array(z.object({ id: name, from: name, to: name, input: fsmValue, output: fsmValue.optional() })).max(LOGIC_LIMITS.maxTransitions),
  }),
  encoding: z.enum(['Binary', 'Gray', 'One-Hot']),
  flipFlop: z.enum(['D', 'T', 'JK', 'SR']),
  /** Also return the generated Verilog. */
  hdl: z.boolean().default(false),
});

const waveformValue = z.union([z.literal(0), z.literal(1), z.literal('X'), z.literal('Z')]);
const waveform = z.object({ name: z.string().min(1).max(16), type: z.enum(['input', 'output', 'clock']), data: z.array(waveformValue).min(1).max(LOGIC_LIMITS.maxTicks) });
export const TimingRequest = z.object({
  op: z.literal('timing'),
  expression,
  inputTracks: z.array(waveform).max(LOGIC_LIMITS.maxTracks),
  clock: waveform,
  options: z.object({ delayTicks: int.min(0).max(64).optional(), outputName: z.string().min(1).max(16).optional() }).default({}),
});

const desState = z.object({
  t: finite.min(0),
  seq: int.min(0),
  d: int.min(0).max(1_000_000),
  osc: z.boolean(),
  bud: z.boolean(),
  ev: z.array(z.tuple([int.min(0), finite.min(0), int.min(0), name, z.union([z.literal(0), z.literal(1)])])).max(LOGIC_LIMITS.maxEvents),
  clk: z.array(z.tuple([name, finite.min(0)])).max(LOGIC_LIMITS.maxComponents),
  inputs: z.record(z.string().max(64), logicState),
  comps: z.record(
    z.string().max(64),
    z.object({
      i: z.array(z.tuple([z.string().max(16), logicState])).max(64),
      o: z.array(z.tuple([z.string().max(16), logicState])).max(64),
      n: z.array(z.tuple([z.string().max(16), logicState])).max(64),
      lc: logicState,
      // Component-specific storage (flip-flop phase, RAM words...): JSON, bounded by the body limit.
      x: z.unknown(),
    }),
  ),
});
const desOp = z.discriminatedUnion('t', [
  z.object({ t: z.literal('toggle'), id: name }),
  z.object({ t: z.literal('drive'), id: name, value: logicState }),
  z.object({ t: z.literal('step'), dt: finite.min(0).max(1) }),
]);
export const DesRequest = z.object({
  op: z.literal('des'),
  ...circuit,
  /** `null` builds the circuit from scratch (power-up); otherwise the state the previous response carried. */
  state: desState.nullable(),
  ops: z.array(desOp).max(LOGIC_LIMITS.maxOps),
});

export const MixedRequest = z.object({
  op: z.literal('mixed'),
  engine: z.enum(['tab-d', 'ideal']),
  ...circuit,
  steps: int.min(1).max(LOGIC_LIMITS.maxSteps).default(2),
  dt: finite.min(1e-9).max(1).default(1e-3),
});

export const LogicRequestSchema = z.discriminatedUnion('op', [KMapRequest, SynthesisRequest, TruthTableRequest, FsmRequest, TimingRequest, DesRequest, MixedRequest]);
export type LogicRequest = z.infer<typeof LogicRequestSchema>;
