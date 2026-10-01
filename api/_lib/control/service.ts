import { z } from 'zod';
import { ControlRequestSchema, type ControlRequest } from '../../control/schema';
import { simulateAcVoltageController } from './power/acVoltageControllerMath';
import { simulateChopper } from './power/chopperMath';
import { simulateInverter } from './power/inverterMath';
import { simulateControlledRectifier } from './power/rectifierMath';
import { analyzeStateSpace, closedLoopAt, computeBode, computeRootLocus, runPid, stateTrajectory, tunePid } from './systems/studios';

export const CONTROL_PROTOCOL_VERSION = 1;

export interface ServeResult {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

type Req<D extends ControlRequest['domain']> = Extract<ControlRequest, { domain: D }>['request'];

function runControl(request: Req<'control'>): Record<string, unknown> {
  switch (request.op) {
    case 'root-locus':
      return {
        ok: true,
        ...(request.locus ? { locus: computeRootLocus(request.numerator, request.denominator) } : {}),
        ...(request.gain !== undefined ? { closedLoop: closedLoopAt(request.numerator, request.denominator, request.gain, request.maxTime) } : {}),
      };
    case 'bode':
      return { ok: true, ...computeBode(request.numerator, request.denominator, request.gain, request.selectedFactorIds, request.samples, request.timeHorizon) };
    case 'state-space':
      return { ok: true, ...analyzeStateSpace(request.A, request.B, request.C, request.A.length, request.desiredPoles ?? null) };
    case 'state-trajectory':
      return { ok: true, trajectory: stateTrajectory(request.A, request.initialState, request.duration, request.step) };
    case 'pid-step':
      return { ok: true, ...runPid(request.primary, request.subtype, request.gains, request.plantNumerator, request.plantDenominator, request.signal, request.maxTime) };
    case 'pid-tune':
      return { ok: true, gains: tunePid(request.plantNumerator, request.plantDenominator, request.zeta, request.omegaN) };
  }
}

function runPower(request: Req<'power'>): Record<string, unknown> {
  switch (request.op) {
    case 'rectifier': return { ok: true, simulation: simulateControlledRectifier(request.parameters) };
    case 'inverter': return { ok: true, simulation: simulateInverter(request.parameters) };
    case 'chopper': return { ok: true, simulation: simulateChopper(request.parameters) };
    case 'ac-controller': return { ok: true, simulation: simulateAcVoltageController(request.parameters) };
  }
}

/** Transport-free request handler: easy to test, and shared by the Vercel function and Express. */
export function serveControl(payload: unknown): ServeResult {
  const parsed = ControlRequestSchema.safeParse(payload);
  if (!parsed.success) return { status: 400, body: { error: 'Invalid request', issues: z.treeifyError(parsed.error) } };
  try {
    const request = parsed.data;
    const result = request.domain === 'control' ? runControl(request.request) : runPower(request.request);
    return { status: 200, body: { v: CONTROL_PROTOCOL_VERSION, ...result } };
  } catch (error) {
    // Singular systems, unsupported plants: the caller's input, reported as a diagnostic.
    return { status: 200, body: { v: CONTROL_PROTOCOL_VERSION, ok: false, error: error instanceof Error ? error.message : 'Evaluation failed' } };
  }
}
