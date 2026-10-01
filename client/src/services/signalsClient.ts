import type {
  CompositeAnalysis, ClassificationReport, ContinuousConvolutionResult, ConvolutionRegime, DiscreteConvolution, FourierSeriesResult, Impulse, Pillar, SystemSemantic, TestSample, ForwardZAnalysis, ZPfeTerm,
} from '@shared/signals/results';
import type { DerivationStep } from '@shared/signals/derivationTypes';
import type { Causality, Complex, ForwardLaplaceResult, InverseLaplaceResult, PlaneMode, RocKind, TransferFunction } from '@shared/signals/transferFunction';

const ENDPOINT = '/api/signals/transform';

/** Wire format of one request: `{ action, request: { op, ... } }`, validated server-side by api/signals/schema.ts. */
export interface SignalsRequestBody { action: string; request: { op: string; [key: string]: unknown } }
export type SignalsResponseBody = { v?: number; ok?: boolean; error?: string; ms?: number; [key: string]: unknown };
export type SignalsTransport = (body: SignalsRequestBody, signal?: AbortSignal) => Promise<SignalsResponseBody>;

export class SignalsEngineError extends Error {
  constructor(message: string, readonly status?: number) { super(message); }
}
/** The engine understood the request and rejected its content (expression outside the grammar...). */
export class SignalsEvaluationError extends Error {}

/** POSTs one request to the serverless engine. */
export const evaluateSignalsRemote: SignalsTransport = async (body, signal) => {
  let response: Response;
  try {
    response = await fetch(ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal });
  } catch (error) {
    if ((error as { name?: string }).name === 'AbortError') throw error;
    throw new SignalsEngineError('Cannot reach the simulation engine');
  }
  if (!response.ok) {
    throw new SignalsEngineError(
      response.status === 429 ? 'Simulation rate limit reached' : response.status === 403 ? 'The simulation engine refused this request' : `Simulation engine error (${response.status})`,
      response.status,
    );
  }
  return (await response.json()) as SignalsResponseBody;
};

let transport: SignalsTransport = evaluateSignalsRemote;
/** Test seam: route requests through an in-process handler. Pass `null` to restore the network. */
export const setSignalsTransport = (next: SignalsTransport | null): void => { transport = next ?? evaluateSignalsRemote; };

async function call<T>(action: string, request: SignalsRequestBody['request'], signal?: AbortSignal): Promise<T> {
  const response = await transport({ action, request }, signal);
  if (response.ok === false) throw new SignalsEvaluationError(response.error ?? 'The engine rejected the request');
  return response as unknown as T;
}

// ---- Fourier -------------------------------------------------------------------------------

export type SpectrumSampleWire = { omega: number; real: number; imaginary: number; magnitude: number; phase: number };
export interface SpectrumViewWire { samples: SpectrumSampleWire[]; impulses: Impulse[]; bandwidth: number }
export interface FourierSeriesAnswer { series: FourierSeriesResult; trigSteps: DerivationStep[]; seriesSteps: DerivationStep[] }
export interface FourierTransformAnswer {
  /** The expression this answer belongs to (answers arrive asynchronously). */
  expression: string;
  analytic: boolean;
  /** Why no table pair applied (numerical spectrum shown instead). */
  error?: string;
  latex?: string;
  pairs?: Array<{ timeLatex: string; freqLatex: string }>;
  notes: string[];
  unscaledImpulses: Impulse[];
  /** null when only the analytic pair was requested. */
  spectrum: SpectrumViewWire | null;
  steps: DerivationStep[];
}
export interface FourierInverseAnswer { analytic: boolean; error?: string; latex?: string; notes?: string[]; spectrum?: SpectrumViewWire; trace?: Array<{ x: number; y: number }>; steps: DerivationStep[] }

export const fourierSeriesRemote = (expression: string, period: number, harmonics: number, signal?: AbortSignal) =>
  call<FourierSeriesAnswer>('fourier', { op: 'series', expression, period, harmonics }, signal);
export const fourierTransformRemote = (expression: string, scale: number, spectrum: boolean, signal?: AbortSignal) =>
  call<FourierTransformAnswer>('fourier', { op: 'transform', expression, scale, spectrum }, signal);
export const fourierInverseRemote = (source: string, signal?: AbortSignal) => call<FourierInverseAnswer>('fourier', { op: 'inverse', source }, signal);

// ---- Laplace / Z ---------------------------------------------------------------------------

export const parseTransferFunctionRemote = async (source: string, mode: PlaneMode, signal?: AbortSignal): Promise<TransferFunction> =>
  (await call<{ system: TransferFunction }>('laplace', { op: 'parse', source, mode }, signal)).system;
export const inverseLaplaceRemote = (system: TransferFunction, roc: RocKind, signal?: AbortSignal) =>
  call<{ result: InverseLaplaceResult; steps: DerivationStep[] }>('laplace', { op: 'inverse', system, roc }, signal);
export const forwardLaplaceRemote = (source: string, signal?: AbortSignal) =>
  call<{ forward: ForwardLaplaceResult; steps: DerivationStep[] }>('laplace', { op: 'forward', source }, signal);
export const forwardZRemote = async (source: string, signal?: AbortSignal): Promise<ForwardZAnalysis> =>
  (await call<{ analysis: ForwardZAnalysis }>('z-transform', { op: 'forward', source }, signal)).analysis;
export interface InverseZAnswer {
  result: { direct: number[]; terms: ZPfeTerm[]; pfeLatex: string; timeLatex: string; warnings: string[] };
  indices: number[];
  values: number[];
  steps: DerivationStep[];
}
export const inverseZRemote = (system: TransferFunction, roc: RocKind, from: number, to: number, signal?: AbortSignal) =>
  call<InverseZAnswer>('z-transform', { op: 'inverse', system, roc, from, to }, signal);

// ---- Convolution ---------------------------------------------------------------------------

export type ConvolutionFrameWire = Omit<ContinuousConvolutionResult, 'points'>;
export const convolutionSweepRemote = async (x: string, h: string, from: number, to: number, samples = 481, signal?: AbortSignal): Promise<ConvolutionFrameWire[]> =>
  (await call<{ frames: ConvolutionFrameWire[] }>('convolution', { op: 'sweep', x, h, from, to, samples }, signal)).frames;
export const convolutionFrameRemote = async (x: string, h: string, t: number, signal?: AbortSignal): Promise<ContinuousConvolutionResult> =>
  (await call<{ frame: ContinuousConvolutionResult }>('convolution', { op: 'frame', x, h, t }, signal)).frame;
export const convolutionRegimeRemote = async (x: string, h: string, t: number, signal?: AbortSignal): Promise<ConvolutionRegime> =>
  (await call<{ regime: ConvolutionRegime }>('convolution', { op: 'regime', x, h, t }, signal)).regime;
export const discreteConvolutionRemote = async (x: number[], h: number[], signal?: AbortSignal): Promise<DiscreteConvolution> =>
  (await call<{ result: DiscreteConvolution }>('convolution', { op: 'discrete', x, h }, signal)).result;

// ---- System classification & composite signals ----------------------------------------------

export const classifyReportRemote = (source: string, signal?: AbortSignal) => call<{ system: SystemSemantic; report: ClassificationReport }>('classify', { op: 'report', source }, signal);
export interface ProofAnswer {
  verdict: string;
  stability?: Array<{ t: number; input: number; output: number }>;
  samples?: TestSample[];
  io?: Array<{ t: number; input: number; output: number }>;
}
export const classifyProofRemote = (source: string, pillar: Pillar['id'], a: number, b: number, t0: number, signal?: AbortSignal) =>
  call<ProofAnswer>('classify', { op: 'proof', source, pillar, a, b, t0 }, signal);
export const analyzeCompositeRemote = async (source: string, periodicOverride: 'auto' | 'periodic' | 'aperiodic', windowStart: number, windowEnd: number, signal?: AbortSignal): Promise<CompositeAnalysis> =>
  (await call<{ analysis: CompositeAnalysis }>('composite', { op: 'analyze', source, periodicOverride, windowStart, windowEnd }, signal)).analysis;

export type { Causality, Complex };
