import { z } from 'zod';

/** Hard request limits: every array, matrix and numeric range is bounded so a payload cannot exhaust CPU or memory. */
export const CONTROL_LIMITS = {
  maxPolyCoefficients: 13, // degree ≤ 12
  maxStateOrder: 8,
  maxSamples: 1024,
  maxSimTime: 200,
  maxTrajectorySteps: 6000,
  maxFactorIds: 32,
} as const;

const finite = z.number().finite();
const coefficient = finite.min(-1e9).max(1e9);
const polynomial = z.array(coefficient).min(1).max(CONTROL_LIMITS.maxPolyCoefficients);
const positive = (max: number, min = 1e-9) => finite.min(min).max(max);
const nonNegative = (max: number) => finite.min(0).max(max);
const angleDeg = finite.min(0).max(180); // firing angle α: 0° ≤ α ≤ 180°

const matrix = z.array(z.array(coefficient).min(1).max(CONTROL_LIMITS.maxStateOrder)).min(1).max(CONTROL_LIMITS.maxStateOrder);
const rectangular = (value: number[][]) => value.every((row) => row.length === value[0].length);

const control = z.discriminatedUnion('op', [
  /** Root-locus structure of K·N(s)/D(s) and/or the closed-loop poles and unit-step response at one gain. */
  z.object({
    op: z.literal('root-locus'),
    numerator: polynomial,
    denominator: polynomial,
    /** Include the full locus sweep (poles/zeros, asymptotes, branches, breakaway points, crossings). */
    locus: z.boolean().default(true),
    /** Include closed-loop roots and step response at `gain`. */
    gain: finite.min(-1e6).max(1e6).optional(),
    maxTime: positive(CONTROL_LIMITS.maxSimTime, 0.1).default(10),
  }),
  z.object({
    op: z.literal('bode'),
    numerator: polynomial,
    denominator: polynomial,
    gain: finite.min(-1e6).max(1e6).default(1),
    selectedFactorIds: z.array(z.string().max(64)).max(CONTROL_LIMITS.maxFactorIds).default([]),
    samples: z.number().int().min(16).max(CONTROL_LIMITS.maxSamples).default(360),
    timeHorizon: positive(CONTROL_LIMITS.maxSimTime, 0.5).default(12),
  }),
  /** Controllability / observability / eigenvalues of (A, B, C), with optional Ackermann pole placement. */
  z.object({
    op: z.literal('state-space'),
    A: matrix, B: matrix, C: matrix, D: matrix.optional(),
    desiredPoles: z.array(finite.min(-1e6).max(1e6)).max(CONTROL_LIMITS.maxStateOrder).optional(),
  }).refine((v) => rectangular(v.A) && v.A.length === v.A[0].length && v.B.length === v.A.length && v.C[0].length === v.A.length, 'A must be n×n, B n×m and C p×n (n ≤ 8)'),
  z.object({
    op: z.literal('state-trajectory'),
    A: matrix,
    initialState: z.array(coefficient).min(1).max(CONTROL_LIMITS.maxStateOrder),
    duration: positive(100, 0.1).default(12),
    step: positive(1, 0.001).default(0.025),
  }).refine((v) => rectangular(v.A) && v.A.length === v.A[0].length && v.A.length === v.initialState.length, 'A must be n×n matching the state vector')
    .refine((v) => v.duration / v.step <= CONTROL_LIMITS.maxTrajectorySteps, 'too many integration steps'),
  z.object({
    op: z.literal('pid-step'),
    primary: z.enum(['P', 'I', 'D', 'PI', 'PD', 'PID']),
    subtype: z.enum(['parallel', 'series', 'parallel-standard', 'parallel-modified', 'series-standard', 'series-modified']),
    gains: z.object({ kp: finite.min(-1e6).max(1e6), ki: finite.min(-1e6).max(1e6), kd: finite.min(-1e6).max(1e6), n: positive(1e5, 1e-3) }),
    plantNumerator: polynomial,
    plantDenominator: polynomial,
    signal: z.object({ type: z.enum(['impulse', 'step', 'ramp', 'parabolic', 'exponential', 'sine', 'cosine']), magnitude: finite.min(-1e4).max(1e4), parameter: finite.min(-1e3).max(1e3) }),
    maxTime: positive(CONTROL_LIMITS.maxSimTime, 0.5).default(12),
  }),
  z.object({
    op: z.literal('pid-tune'),
    plantNumerator: polynomial,
    plantDenominator: polynomial,
    /** Damping ratio ζ and natural frequency ω_n of the target second-order response. */
    zeta: finite.min(0.05).max(5),
    omegaN: positive(1000, 0.01),
  }),
]);

const rectifier = z.object({
  op: z.literal('rectifier'),
  parameters: z.object({
    phase: z.enum(['single', 'three']),
    rectifierType: z.enum(['half', 'full']),
    fullWaveSubtype: z.enum(['bridge', 'center-tapped']),
    loadType: z.enum(['R', 'RL', 'RC', 'RLC', 'RLE']),
    freeWheelingDiode: z.boolean(),
    voltageFormat: z.enum(['rms', 'peak']),
    inputVoltage: nonNegative(1e5),
    frequency: finite.min(1).max(2000),
    firingAngle: angleDeg,
    resistance: positive(1e6),
    inductanceMilliHenry: nonNegative(1e5),
    capacitanceMicroFarad: nonNegative(1e6),
    backEmfVoltage: finite.min(-1e5).max(1e5),
    pulseCount: z.union([z.literal(6), z.literal(12)]),
  }),
});
const inverter = z.object({
  op: z.literal('inverter'),
  parameters: z.object({
    phase: z.enum(['single', 'three']),
    singlePhaseSubtype: z.enum(['half-bridge', 'full-bridge']),
    threePhaseConduction: z.enum(['180', '120']),
    technique: z.enum(['square', 'single-pulse', 'multi-pulse', 'spwm']),
    fundamentalFrequency: finite.min(1).max(2000),
    carrierFrequency: finite.min(1).max(1e6),
    modulationIndex: nonNegative(5),
    dcVoltage: nonNegative(1e5),
    loadType: z.enum(['R', 'RL', 'RLE']),
    resistance: positive(1e6),
    inductanceMilliHenry: nonNegative(1e5),
    backEmfVoltage: finite.min(-1e5).max(1e5),
    shootThroughFault: z.boolean().optional(),
  }),
});
const chopper = z.object({
  op: z.literal('chopper'),
  parameters: z.object({
    topology: z.enum(['buck', 'boost', 'buck-boost']),
    quadrantClass: z.enum(['A', 'B', 'C', 'D', 'E']),
    control: z.enum(['pwm', 'frequency']),
    dutyCycle: finite.min(0).max(1),
    switchingFrequency: finite.min(1).max(1e6),
    inputVoltage: nonNegative(1e5),
    loadType: z.enum(['R', 'RL', 'RLE']),
    resistance: positive(1e6),
    inductanceMilliHenry: nonNegative(1e5),
    backEmfVoltage: finite.min(-1e5).max(1e5),
  }),
});
const acController = z.object({
  op: z.literal('ac-controller'),
  parameters: z.object({
    phase: z.enum(['single', 'three']),
    topology: z.enum(['unidirectional', 'bidirectional']),
    threePhaseConnection: z.enum(['star-3w', 'star-4w', 'delta']),
    controlMode: z.enum(['phase-angle', 'integral-cycle']),
    firingAngle: angleDeg,
    onCycles: z.number().int().min(0).max(1000),
    offCycles: z.number().int().min(0).max(1000),
    voltageFormat: z.enum(['rms', 'peak']),
    inputVoltage: nonNegative(1e5),
    frequency: finite.min(1).max(2000),
    loadType: z.enum(['R', 'RL']),
    resistance: positive(1e6),
    inductanceMilliHenry: nonNegative(1e5),
  }),
});
const power = z.discriminatedUnion('op', [rectifier, inverter, chopper, acController]);

/** Domain discriminator: `control` (systems) or `power` (converters); each names one operation of it. */
export const ControlRequestSchema = z.discriminatedUnion('domain', [
  z.object({ domain: z.literal('control'), request: control }),
  z.object({ domain: z.literal('power'), request: power }),
]);
export type ControlRequest = z.infer<typeof ControlRequestSchema>;
