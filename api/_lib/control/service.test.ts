import { describe, expect, it } from 'vitest';
import { defaultAcVoltageControllerParameters } from '../../../shared/power/acVoltageControllerTypes';
import { defaultChopperParameters } from '../../../shared/power/chopperTypes';
import { defaultInverterParameters } from '../../../shared/power/inverterTypes';
import { defaultRectifierParameters } from '../../../shared/power/rectifierTypes';
import { handleControl } from './handler';
import { simulateAcVoltageController } from './power/acVoltageControllerMath';
import { simulateChopper } from './power/chopperMath';
import { simulateInverter } from './power/inverterMath';
import { simulateControlledRectifier } from './power/rectifierMath';
import { serveControl } from './service';
import { findPolynomialRoots, simulateLtiStepResponse } from './systems/controlMath';
import { controllabilityMatrix, eigenvalues, rank } from './systems/matrixMath';

const ask = (domain: string, request: Record<string, unknown>) => serveControl({ domain, request });
const body = (domain: string, request: Record<string, unknown>) => ask(domain, request).body as Record<string, any>;
const json = (value: unknown) => JSON.parse(JSON.stringify(value));

describe('serveControl · power converters equal the engines', () => {
  it('rectifier, inverter, chopper and AC controller simulations are identical to direct calls', () => {
    expect(body('power', { op: 'rectifier', parameters: defaultRectifierParameters }).simulation).toEqual(json(simulateControlledRectifier(defaultRectifierParameters)));
    expect(body('power', { op: 'inverter', parameters: defaultInverterParameters }).simulation).toEqual(json(simulateInverter(defaultInverterParameters)));
    expect(body('power', { op: 'chopper', parameters: defaultChopperParameters }).simulation).toEqual(json(simulateChopper(defaultChopperParameters)));
    expect(body('power', { op: 'ac-controller', parameters: defaultAcVoltageControllerParameters }).simulation).toEqual(json(simulateAcVoltageController(defaultAcVoltageControllerParameters)));
  });
  it('rejects firing angles outside 0°–180° and out-of-range electrical parameters', () => {
    expect(ask('power', { op: 'rectifier', parameters: { ...defaultRectifierParameters, firingAngle: 181 } }).status).toBe(400);
    expect(ask('power', { op: 'rectifier', parameters: { ...defaultRectifierParameters, firingAngle: -1 } }).status).toBe(400);
    expect(ask('power', { op: 'ac-controller', parameters: { ...defaultAcVoltageControllerParameters, firingAngle: 200 } }).status).toBe(400);
    expect(ask('power', { op: 'chopper', parameters: { ...defaultChopperParameters, dutyCycle: 1.2 } }).status).toBe(400);
    expect(ask('power', { op: 'inverter', parameters: { ...defaultInverterParameters, fundamentalFrequency: 0 } }).status).toBe(400);
    expect(ask('power', { op: 'inverter', parameters: { ...defaultInverterParameters, resistance: 0 } }).status).toBe(400);
  });
});

describe('serveControl · parity sweep: the endpoint equals the engine for every converter configuration', () => {
  const same = (op: string, parameters: object, direct: (p: never) => unknown) => expect(body('power', { op, parameters }).simulation, `${op} ${JSON.stringify(parameters)}`).toEqual(json(direct(parameters as never)));
  it('rectifier: phase × type × load × firing angle', () => {
    for (const phase of ['single', 'three'] as const) for (const rectifierType of ['half', 'full'] as const) for (const loadType of ['R', 'RL', 'RC', 'RLE'] as const) for (const firingAngle of [0, 45, 90, 180])
      same('rectifier', { ...defaultRectifierParameters, phase, rectifierType, loadType, firingAngle }, simulateControlledRectifier as never);
  });
  it('inverter: phase × technique × load', () => {
    for (const phase of ['single', 'three'] as const) for (const technique of ['square', 'single-pulse', 'multi-pulse', 'spwm'] as const) for (const loadType of ['R', 'RL', 'RLE'] as const)
      same('inverter', { ...defaultInverterParameters, phase, technique, loadType }, simulateInverter as never);
  });
  it('chopper: topology × quadrant class × load × duty', () => {
    for (const topology of ['buck', 'boost', 'buck-boost'] as const) for (const quadrantClass of ['A', 'C', 'D', 'E'] as const) for (const loadType of ['R', 'RL', 'RLE'] as const) for (const dutyCycle of [0, 0.3, 0.8, 1])
      same('chopper', { ...defaultChopperParameters, topology, quadrantClass, loadType, dutyCycle }, simulateChopper as never);
  });
  it('AC controller: phase × connection × mode × load × firing angle', () => {
    for (const phase of ['single', 'three'] as const) for (const threePhaseConnection of ['star-3w', 'star-4w', 'delta'] as const) for (const controlMode of ['phase-angle', 'integral-cycle'] as const) for (const loadType of ['R', 'RL'] as const) for (const firingAngle of [0, 60, 120, 180])
      same('ac-controller', { ...defaultAcVoltageControllerParameters, phase, threePhaseConnection, controlMode, loadType, firingAngle }, simulateAcVoltageController as never);
  });
});

describe('serveControl · control systems', () => {
  const num = [1, 2]; const den = [1, 3, 2, 0];
  it('root locus: singularities, asymptotes, branches, and the closed loop at a gain', () => {
    const res = body('control', { op: 'root-locus', numerator: [1], denominator: den, gain: 2, maxTime: 5 });
    expect(res.locus.openLoopPoles.length).toBe(3);
    expect(res.locus.asymptotes.angles).toHaveLength(3);
    expect(res.locus.branches.length).toBeGreaterThan(0);
    expect(res.locus.breakawayPoints.length).toBeGreaterThan(0);
    expect(res.closedLoop.roots.length).toBe(3);
    const direct = simulateLtiStepResponse([2], [1, 3, 2, 2], 1.0, 5, 0.01);
    expect(res.closedLoop.stepResponse).toEqual(json(direct));
    expect(body('control', { op: 'root-locus', numerator: num, denominator: den, locus: false, gain: 1 }).locus).toBeUndefined();
    expect(res.locus.openLoopPoles.map((p: { re: number }) => p.re).sort()).toEqual(json(findPolynomialRoots(den)).map((p: { re: number }) => p.re).sort());
  });
  it('bode: factors, response on the selected factors, margins and the closed-loop step', () => {
    const res = body('control', { op: 'bode', numerator: [10], denominator: [1, 3, 2, 0], gain: 1, samples: 64 });
    expect(res.factors.length).toBeGreaterThan(1);
    expect(res.response).toHaveLength(64);
    expect(res.margins.gainCrossover).toBeTruthy();
    expect(res.stepResponse.t.length).toBeGreaterThan(10);
    const some = body('control', { op: 'bode', numerator: [10], denominator: [1, 3, 2, 0], selectedFactorIds: [res.factors[0].id], samples: 32 });
    expect(some.response).toHaveLength(32);
  });
  it('state space: rank / eigenvalue analysis equals the matrix engine; Ackermann placement; trajectory', () => {
    const A = [[0, 1], [-2, -3]]; const B = [[0], [1]]; const C = [[1, 0]];
    const res = body('control', { op: 'state-space', A, B, C, desiredPoles: [-4, -5] });
    expect(res.analysis.controllabilityRank).toBe(rank(controllabilityMatrix(A, B)));
    expect(res.analysis.eigenvalues).toEqual(json(eigenvalues(A)));
    expect(res.analysis.controllable).toBe(true);
    expect(res.placement.gain).toEqual([18, 6]);
    expect(body('control', { op: 'state-space', A: [[1, 0], [0, 2]], B: [[0], [0]], C }).analysis.controllable).toBe(false);
    const traj = body('control', { op: 'state-trajectory', A, initialState: [1, 0], duration: 6, step: 0.05 }).trajectory;
    expect(traj.time.length).toBe(traj.states.length);
    expect(traj.states.at(-1)[0]).toBeCloseTo(0, 1);
  });
  it('pid: step scope with metrics and spec-based tuning', () => {
    const gains = { kp: 2, ki: 1, kd: 0.2, n: 100 };
    const res = body('control', { op: 'pid-step', primary: 'PID', subtype: 'parallel-standard', gains, plantNumerator: [1], plantDenominator: [1, 2, 1], signal: { type: 'step', magnitude: 1, parameter: 1 }, maxTime: 10 });
    expect(res.scope.t.length).toBeGreaterThan(100);
    expect(Number.isFinite(res.scope.overshoot)).toBe(true);
    expect(res.controller.numerator.length).toBeGreaterThan(0);
    const tuned = body('control', { op: 'pid-tune', plantNumerator: [1], plantDenominator: [1, 2, 1], zeta: 0.7, omegaN: 2 });
    expect(Object.keys(tuned.gains).sort()).toEqual(['kd', 'ki', 'kp', 'n']);
  });
  it('validates degree, matrix order, sample counts and integration size', () => {
    expect(ask('control', { op: 'root-locus', numerator: [1], denominator: Array(14).fill(1) }).status).toBe(400);
    expect(ask('control', { op: 'state-space', A: Array.from({ length: 9 }, () => Array(9).fill(0)), B: Array.from({ length: 9 }, () => [0]), C: [Array(9).fill(0)] }).status).toBe(400);
    expect(ask('control', { op: 'state-space', A: [[0, 1], [1, 0]], B: [[1]], C: [[1, 0]] }).status).toBe(400);
    expect(ask('control', { op: 'bode', numerator: [1], denominator: [1, 1], samples: 100000 }).status).toBe(400);
    expect(ask('control', { op: 'state-trajectory', A: [[0, 1], [1, 0]], initialState: [1, 0], duration: 100, step: 0.001 }).status).toBe(400);
    expect(ask('control', { op: 'nope' }).status).toBe(400);
  });
});

describe('HTTP handler', () => {
  const post = (text: string) => handleControl(new Request('http://x/api/control/solve', { method: 'POST', body: text }));
  it('rejects non-POST, bad JSON and oversized bodies; reports server time', async () => {
    expect((await handleControl(new Request('http://x/', { method: 'GET' }))).status).toBe(405);
    expect((await post('{nope')).status).toBe(400);
    expect((await post('x'.repeat(400 * 1024))).status).toBe(413);
    const ok = await post(JSON.stringify({ domain: 'power', request: { op: 'chopper', parameters: defaultChopperParameters } }));
    expect(typeof (await ok.json()).ms).toBe('number');
  });
});
