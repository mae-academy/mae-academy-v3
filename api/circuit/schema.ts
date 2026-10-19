import { z } from 'zod';
import { CIRCUIT_PROTOCOL_VERSION } from '../../shared/circuit/protocol';

/** Hard request limits: every collection is bounded so a payload cannot exhaust memory or CPU. */
export const LIMITS = {
  maxComponents: 400,
  maxWires: 2000,
  maxNets: 2000,
  maxTerminalsPerNet: 400,
  maxPropKeys: 64,
  maxStepsPerRequest: 64,
  /** Simulated seconds in one request (timeStep × steps). */
  maxSimulatedSeconds: 0.25,
  /** Fixed integration sub-steps one request may run; keeps the work per call bounded on every runtime. */
  maxSubsteps: 600,
  maxPathPoints: 2048,
  maxFaces: 512,
  maxStateEntries: 4096,
} as const;

const id = z.string().min(1).max(96);
const terminal = z.string().min(1).max(96).regex(/^[^\s]+:[^\s]+$/, 'terminal keys look like "R1:a"');
const finite = z.number().finite();
const primitive = z.union([z.string().max(256), finite, z.boolean(), z.null()]);

const component = z.object({
  id,
  type: z.string().min(1).max(48),
  label: z.string().max(96).optional(),
  props: z.record(z.string().max(48), primitive).refine((props) => Object.keys(props).length <= LIMITS.maxPropKeys, 'too many properties'),
  state: z.object({ isBurned: z.boolean().optional() }).optional(),
});

const wire = z.tuple([id, id, z.string().min(1).max(48), id, z.string().min(1).max(48)]);

export const CircuitSchema = z.object({
  components: z.array(component).max(LIMITS.maxComponents),
  wires: z.array(wire).max(LIMITS.maxWires),
  nodes: z.record(id, z.array(terminal).max(LIMITS.maxTerminalsPerNet)).refine((nets) => Object.keys(nets).length <= LIMITS.maxNets, 'too many nets'),
});

const hash = z.string().regex(/^[0-9a-f]{32}$/, 'invalid circuit hash');
const point = z.tuple([finite, finite]);
const path = z.array(point).max(LIMITS.maxPathPoints);

const base = { v: z.literal(CIRCUIT_PROTOCOL_VERSION), h: hash.optional(), circuit: CircuitSchema.optional() };

const dc = z.object({ ...base, analysisType: z.literal('dc') });

const bucket = z.tuple([finite, finite, finite]);
const record = <T extends z.ZodType>(value: T) => z.record(z.string().max(160), value).refine((entries) => Object.keys(entries).length <= LIMITS.maxStateEntries, 'state too large');

/** Carried engine state. It comes back from the browser, so it is validated as strictly as any other input. */
export const EngineStateSchema = z.object({
  mna: z.object({ capacitors: record(finite), inductors: record(finite), time: finite }),
  modes: record(z.number().int().min(-1).max(1)),
  relays: record(z.boolean()),
  latches: record(z.boolean()),
  fuses: z.array(id).max(LIMITS.maxStateEntries),
  digital: record(finite),
  coilI: record(finite),
  coilOn: record(z.boolean()),
  acc: finite.min(0).max(1),
  integ: record(z.array(bucket).max(128)),
  disp: record(z.object({
    value: z.number().nullable(), unit: z.string().max(8), status: z.enum(['ready', 'open', 'overflow', 'unsupported']),
    continuity: z.boolean().optional(), frequency: finite.optional(),
  }).loose()),
  dispAt: finite,
  wp: record(finite),
  wpeak: record(finite),
  wpol: record(finite),
  vac: finite,
  lwc: record(finite),
  nodes: record(finite).optional(),
});

const transient = z.object({
  ...base,
  analysisType: z.literal('transient'),
  timeStep: finite.min(1e-6).max(0.05),
  steps: z.number().int().min(1).max(LIMITS.maxStepsPerRequest),
  state: EngineStateSchema.optional(),
  retain: z.array(id).max(LIMITS.maxComponents).optional(),
}).refine((request) => request.timeStep * request.steps <= LIMITS.maxSimulatedSeconds + 1e-9, { message: 'timeStep × steps exceeds the per-request simulated time limit' });

const geometry = z.object({
  branches: z.array(z.object({ id, path })).max(LIMITS.maxComponents),
  wires: z.array(z.object({ id, path })).max(LIMITS.maxWires),
  graph: z.object({
    faces: z.array(z.object({
      index: z.number().int().min(0).max(LIMITS.maxFaces),
      points: path,
      branchDirections: z.array(z.tuple([id, z.number()])).max(LIMITS.maxComponents),
      branchIds: z.array(id).max(LIMITS.maxComponents),
      signedArea: finite,
    })).max(LIMITS.maxFaces),
    topology: z.object({ branchCount: z.number(), netCount: z.number(), connectedComponents: z.number(), expectedMeshCount: z.number(), extractedFaceCount: z.number() }),
  }).optional(),
});

const analysis = z.object({
  ...base,
  analysisType: z.literal('analysis'),
  method: z.enum(['nodal', 'mesh', 'superposition', 'transform', 'thevenin']),
  targetResistor: id.optional(),
  targetSource: id.optional(),
  nodalNodes: z.array(z.object({ node: id, index: z.number().int().min(0).max(LIMITS.maxNets), label: z.string().max(32), color: z.string().max(16) })).max(LIMITS.maxNets).optional(),
  geometry: geometry.optional(),
});

export const SolveRequestSchema = z
  .discriminatedUnion('analysisType', [dc, analysis])
  .or(transient)
  .refine((request) => request.h !== undefined || request.circuit !== undefined, { message: 'send a circuit or a circuit hash' });

export type ParsedSolveRequest = z.infer<typeof SolveRequestSchema>;
