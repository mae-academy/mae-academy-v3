import type { Complex } from '@shared/control/polynomial';
import type { FactorSlopeEvent, FrequencyFactor, FrequencyPoint, StabilityMargins } from '@shared/control/frequencyTypes';
import type { Matrix, PolePlacementResult, StateTrajectory, Vector, ComplexValue } from '@shared/control/matrixTypes';
import type { ControllerPrimary, ControllerSubtype, PidGains, PidScopeData, SignalType, TransferPolynomial } from '@shared/control/pidTypes';
import type { StepResponseData } from '@shared/control/stepTypes';
import type { AcControllerSimulation, AcVoltageControllerParameters } from '@shared/power/acVoltageControllerTypes';
import type { ChopperParameters, ChopperSimulation } from '@shared/power/chopperTypes';
import type { InverterParameters, InverterSimulation } from '@shared/power/inverterTypes';
import type { RectifierParameters, RectifierSimulation } from '@shared/power/rectifierTypes';

const ENDPOINT = '/api/control/solve';

/** Wire format of one request: `{ domain, request: { op, ... } }`, validated server-side by api/control/schema.ts. */
export interface ControlRequestBody { domain: 'control' | 'power'; request: { op: string; [key: string]: unknown } }
export type ControlResponseBody = { v?: number; ok?: boolean; error?: string; ms?: number; [key: string]: unknown };
export type ControlTransport = (body: ControlRequestBody, signal?: AbortSignal) => Promise<ControlResponseBody>;

export class ControlEngineError extends Error {
  constructor(message: string, readonly status?: number) { super(message); }
}
/** The engine understood the request and rejected its content (singular system, unsupported plant...). */
export class ControlEvaluationError extends Error {}

/** POSTs one request to the serverless engine. */
export const evaluateControlRemote: ControlTransport = async (body, signal) => {
  let response: Response;
  try {
    response = await fetch(ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal });
  } catch (error) {
    if ((error as { name?: string }).name === 'AbortError') throw error;
    throw new ControlEngineError('Cannot reach the simulation engine');
  }
  if (!response.ok) {
    throw new ControlEngineError(
      response.status === 429 ? 'Simulation rate limit reached' : response.status === 403 ? 'The simulation engine refused this request' : response.status === 400 ? 'The parameters are outside the supported range' : `Simulation engine error (${response.status})`,
      response.status,
    );
  }
  return (await response.json()) as ControlResponseBody;
};

let transport: ControlTransport = evaluateControlRemote;
/** Test seam: route requests through an in-process handler. Pass `null` to restore the network. */
export const setControlTransport = (next: ControlTransport | null): void => { transport = next ?? evaluateControlRemote; };

async function call<T>(domain: ControlRequestBody['domain'], request: ControlRequestBody['request'], signal?: AbortSignal): Promise<T> {
  const response = await transport({ domain, request }, signal);
  if (response.ok === false) throw new ControlEvaluationError(response.error ?? 'The engine rejected the request');
  return response as unknown as T;
}

// ---- Power electronics ---------------------------------------------------------------------

export const simulateRectifierRemote = async (parameters: RectifierParameters, signal?: AbortSignal): Promise<RectifierSimulation> => (await call<{ simulation: RectifierSimulation }>('power', { op: 'rectifier', parameters }, signal)).simulation;
export const simulateInverterRemote = async (parameters: InverterParameters, signal?: AbortSignal): Promise<InverterSimulation> => (await call<{ simulation: InverterSimulation }>('power', { op: 'inverter', parameters }, signal)).simulation;
export const simulateChopperRemote = async (parameters: ChopperParameters, signal?: AbortSignal): Promise<ChopperSimulation> => (await call<{ simulation: ChopperSimulation }>('power', { op: 'chopper', parameters }, signal)).simulation;
export const simulateAcControllerRemote = async (parameters: AcVoltageControllerParameters, signal?: AbortSignal): Promise<AcControllerSimulation> => (await call<{ simulation: AcControllerSimulation }>('power', { op: 'ac-controller', parameters }, signal)).simulation;

// ---- Control systems -----------------------------------------------------------------------

export interface RootLocusAnswer {
  locus?: {
    openLoopZeros: Complex[];
    openLoopPoles: Complex[];
    asymptotes: { centroid: number; angles: number[] } | null;
    branches: Complex[][];
    imagCrossings: Array<{ k: number; omega: number }>;
    angleDepartures: Array<{ pole: Complex; angleDeg: number }>;
    breakawayPoints: number[];
  };
  closedLoop?: { roots: Complex[]; stepResponse: StepResponseData };
}
export const rootLocusRemote = (numerator: number[], denominator: number[], options: { locus?: boolean; gain?: number; maxTime?: number } = {}, signal?: AbortSignal) =>
  call<RootLocusAnswer>('control', { op: 'root-locus', numerator, denominator, ...options }, signal);

export interface BodeAnswer {
  factors: FrequencyFactor[];
  response: FrequencyPoint[];
  margins: StabilityMargins;
  slopeLogic: { initialSlopeDbPerDecade: number; events: FactorSlopeEvent[] };
  closedLoop: { numerator: number[]; denominator: number[] };
  stepResponse: StepResponseData;
}
export const bodeRemote = (numerator: number[], denominator: number[], gain: number, selectedFactorIds: string[], timeHorizon: number, samples = 360, signal?: AbortSignal) =>
  call<BodeAnswer>('control', { op: 'bode', numerator, denominator, gain, selectedFactorIds, timeHorizon, samples }, signal);

export type StateSpaceAnalysis =
  | { error: string }
  | { characteristic: number[]; eigenvalues: ComplexValue[]; controllability: Matrix; observability: Matrix; controllabilityRank: number; observabilityRank: number; controllable: boolean; observable: boolean; error?: undefined };
export const stateSpaceRemote = (A: Matrix, B: Matrix, C: Matrix, D: Matrix, desiredPoles: number[] | null, signal?: AbortSignal) =>
  call<{ analysis: StateSpaceAnalysis; placement: PolePlacementResult | null }>('control', { op: 'state-space', A, B, C, D, ...(desiredPoles ? { desiredPoles } : {}) }, signal);
export const stateTrajectoryRemote = async (A: Matrix, initialState: Vector, duration: number, step?: number, signal?: AbortSignal): Promise<StateTrajectory> =>
  (await call<{ trajectory: StateTrajectory }>('control', { op: 'state-trajectory', A, initialState, duration, ...(step ? { step } : {}) }, signal)).trajectory;

export interface PidStepAnswer { controller: TransferPolynomial; inputTransfer: TransferPolynomial; scope: PidScopeData }
export const pidStepRemote = (primary: ControllerPrimary, subtype: ControllerSubtype, gains: PidGains, plantNumerator: number[], plantDenominator: number[], signal: { type: SignalType; magnitude: number; parameter: number }, maxTime: number, abort?: AbortSignal) =>
  call<PidStepAnswer>('control', { op: 'pid-step', primary, subtype, gains, plantNumerator, plantDenominator, signal, maxTime }, abort);
export const pidTuneRemote = async (plantNumerator: number[], plantDenominator: number[], zeta: number, omegaN: number, signal?: AbortSignal): Promise<PidGains> =>
  (await call<{ gains: PidGains }>('control', { op: 'pid-tune', plantNumerator, plantDenominator, zeta, omegaN }, signal)).gains;
