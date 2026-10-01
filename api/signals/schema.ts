import { z } from 'zod';

/** Hard request limits: every string, array and numeric range is bounded so a payload cannot exhaust CPU or memory. */
export const SIGNALS_LIMITS = {
  maxExpressionChars: 512,
  maxPolyCoefficients: 33,
  maxRoots: 32,
  maxHarmonics: 60,
  maxSweepSamples: 1201,
  maxSequence: 64,
  maxIndices: 129,
  maxSpectrumSamples: 1024,
} as const;

const finite = z.number().finite();
const int = z.number().int().finite();
const expression = z.string().min(1).max(SIGNALS_LIMITS.maxExpressionChars);
const complex = z.object({ re: finite, im: finite });
const roc = z.enum(['right', 'left', 'two-sided']);

/** The transfer-function object the studios hold; the engine recomputes everything derived from it. */
const transferFunction = z.object({
  mode: z.enum(['s', 'z']),
  numerator: z.array(finite).min(1).max(SIGNALS_LIMITS.maxPolyCoefficients),
  denominator: z.array(finite).min(1).max(SIGNALS_LIMITS.maxPolyCoefficients),
  zeros: z.array(complex).max(SIGNALS_LIMITS.maxRoots),
  poles: z.array(complex).max(SIGNALS_LIMITS.maxRoots),
  source: z.string().max(SIGNALS_LIMITS.maxExpressionChars),
});

const fourier = z.discriminatedUnion('op', [
  /** Fourier series c_k of x(t) for one fundamental period, with the EFS/TFS derivations. */
  z.object({ op: z.literal('series'), expression, period: finite.min(0.05).max(200), harmonics: int.min(1).max(SIGNALS_LIMITS.maxHarmonics) }),
  /** 𝓕{x(t)}: analytic table pair when one applies, else the numerical spectrum over ±omegaRange. */
  z.object({
    op: z.literal('transform'),
    expression,
    scale: finite.min(0.05).max(50),
    omegaRange: finite.min(1).max(200).default(40),
    samples: int.min(16).max(SIGNALS_LIMITS.maxSpectrumSamples).default(400),
    /** false: only the analytic pair and its impulse lines (the series workspace needs no spectrum samples). */
    spectrum: z.boolean().default(true),
  }),
  /** 𝓕⁻¹{X(jω)}: the spectrum source is a frequency-domain expression. */
  z.object({ op: z.literal('inverse'), source: expression }),
]);

const laplace = z.discriminatedUnion('op', [
  z.object({ op: z.literal('parse'), source: expression, mode: z.enum(['s', 'z']) }),
  z.object({ op: z.literal('inverse'), system: transferFunction, roc }),
  z.object({ op: z.literal('forward'), source: expression }),
  /** Sampled views over a bounded range of the s or z plane. */
  z.object({
    op: z.literal('evaluate'),
    system: transferFunction,
    view: z.enum(['frequency', 'landscape', 'impulse']),
    /** Half-width of the evaluated frequency / plane window. */
    span: finite.min(0.1).max(100).default(14),
    resolution: int.min(8).max(200).default(42),
  }),
]);

const zTransform = z.discriminatedUnion('op', [
  z.object({ op: z.literal('forward'), source: expression }),
  z.object({ op: z.literal('inverse'), system: transferFunction, roc, from: int.min(-64).max(64).default(-8), to: int.min(-64).max(64).default(24) }),
]);

const convolution = z.discriminatedUnion('op', [
  /** y(t) on a uniform grid across [from, to]: the studio animates playback from these frames. */
  z.object({ op: z.literal('sweep'), x: expression, h: expression, from: finite.min(-1000), to: finite.max(1000), samples: int.min(8).max(SIGNALS_LIMITS.maxSweepSamples).default(481) }),
  z.object({ op: z.literal('frame'), x: expression, h: expression, t: finite.min(-1000).max(1000) }),
  z.object({ op: z.literal('regime'), x: expression, h: expression, t: finite.min(-1000).max(1000) }),
  z.object({ op: z.literal('discrete'), x: z.array(finite).min(1).max(SIGNALS_LIMITS.maxSequence), h: z.array(finite).min(1).max(SIGNALS_LIMITS.maxSequence) }),
]);

const classify = z.discriminatedUnion('op', [
  z.object({ op: z.literal('report'), source: expression }),
  z.object({
    op: z.literal('proof'),
    source: expression,
    pillar: z.enum(['linearity', 'time', 'causality', 'memory', 'stability']),
    a: finite.min(-100).max(100).default(1),
    b: finite.min(-100).max(100).default(1),
    t0: finite.min(-100).max(100).default(1),
  }),
]);

const composite = z.object({
  op: z.literal('analyze'),
  source: expression,
  periodicOverride: z.enum(['auto', 'periodic', 'aperiodic']).default('auto'),
  windowStart: finite.min(-1e4).max(1e4).default(-5),
  windowEnd: finite.min(-1e4).max(1e4).default(5),
});

/** Action discriminator: every request names one engine and one operation of it. */
export const SignalsRequestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('fourier'), request: fourier }),
  z.object({ action: z.literal('laplace'), request: laplace }),
  z.object({ action: z.literal('z-transform'), request: zTransform }),
  z.object({ action: z.literal('convolution'), request: convolution }),
  z.object({ action: z.literal('classify'), request: classify }),
  z.object({ action: z.literal('composite'), request: composite }),
]);
export type SignalsRequest = z.infer<typeof SignalsRequestSchema>;
