import { z } from 'zod';
import { estimateSupport } from '../../../shared/signals/plotAutoScale';
import { parseUnifiedSignal, parseUnifiedSignalNode } from '../../../shared/signals/unifiedSignalParser';
import { frequencyResponse, impulseResponse, magnitudeLandscape, type TransferFunction } from '../../../shared/signals/transferFunction';
import type { Complex } from '../../../shared/signals/transferFunction';
import { createCompositeSignal } from '../../../shared/signals/compositeSignal';
import { SignalsRequestSchema, type SignalsRequest } from '../../signals/schema';
import { analyzeCompositeSignal } from './compositeSignal';
import { continuousConvolutionAt, discreteConvolution } from './convolutionEngine';
import { analyzeConvolutionRegime } from './convolutionPiecewise';
import { deriveForwardFourierSteps, deriveInverseFourierSteps, forwardFourier, inverseFourier, sampleSpectrum, scaleSpectrum, spectrumBandwidth, type SpectrumModel } from './fourierAnalytic';
import { deriveFourierSeriesSteps, deriveTrigSeriesSteps, fourierSeries, fourierTransform } from './fourierEngine';
import { deriveForwardLaplaceSteps, deriveInverseLaplaceSteps, forwardLaplace, inverseLaplace, parseTransferFunction } from './laplaceEngine';
import { evaluateUnifiedSignal } from '../../../shared/signals/unifiedSignalParser';
import { nodeToLatex } from '../../../shared/signals/mathExpression';
import { classifySystem, evaluateSystem, parseSystemExpression, shiftTestSamples, stabilitySamples, superpositionSamples, x2 } from './systemClassifier';
import { analyzeForwardZ, deriveInverseZSteps, inverseZ } from './zTransformEngine';

export const SIGNALS_PROTOCOL_VERSION = 1;

export interface ServeResult {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

const fail = (error: string) => ({ ok: false as const, error });
const impulsesOf = (model: SpectrumModel) => model.impulses.map(impulse => ({ omega: impulse.omega, area: impulse.area }));

/** A spectrum model is a closure over its table pair; the browser gets it sampled, with its impulse lines. */
const spectrumView = (model: SpectrumModel) => {
  const bandwidth = spectrumBandwidth(model);
  return { samples: sampleSpectrum(model, bandwidth), impulses: impulsesOf(model), bandwidth };
};

/** Symmetric time window around the signal's support (3 periods / ±6 s when it never decays). */
function traceWindow(fn: (time: number) => number, periodHint?: number): number {
  const support = estimateSupport(fn, 30, 0.05, 1e-4);
  if (!support.unbounded) return Math.min(20, Math.max(2, 1.2 * Math.max(Math.abs(support.lo), Math.abs(support.hi))));
  return periodHint ? Math.min(20, Math.max(2, 3 * periodHint)) : 6;
}
const sampleTrace = (fn: (time: number) => number, radius: number, samples = 600) =>
  Array.from({ length: samples + 1 }, (_, index) => { const x = -radius + (2 * radius * index) / samples; const y = fn(x); return { x, y: Number.isFinite(y) ? y : 0 }; });

type Req<A extends SignalsRequest['action']> = Extract<SignalsRequest, { action: A }>['request'];

function runFourier(request: Req<'fourier'>): Record<string, unknown> {
  if (request.op === 'series') {
    const parsed = parseUnifiedSignalNode(request.expression);
    if (!parsed.ok) return fail(parsed.error);
    return {
      ok: true,
      series: fourierSeries(parsed.ast, request.period, request.harmonics),
      trigSteps: deriveTrigSeriesSteps(parsed.ast, request.period),
      seriesSteps: deriveFourierSeriesSteps(parsed.ast, request.period),
    };
  }
  if (request.op === 'transform') {
    const node = parseUnifiedSignal(request.expression);
    const ast = parseUnifiedSignalNode(request.expression);
    if (!node.ok || !ast.ok) return fail(!node.ok ? node.error : (ast as { error: string }).error);
    const forward = forwardFourier(node.node);
    const steps = deriveForwardFourierSteps(node.node);
    if (forward.ok) {
      const model = scaleSpectrum(forward.spectrum, request.scale);
      return { ok: true, expression: request.expression, analytic: true, latex: forward.spectrum.latex, pairs: forward.spectrum.pairs, notes: forward.notes, unscaledImpulses: impulsesOf(forward.spectrum), spectrum: request.spectrum ? spectrumView(model) : null, steps };
    }
    if (!request.spectrum) return { ok: true, expression: request.expression, analytic: false, error: forward.error, notes: [], unscaledImpulses: [], spectrum: null, steps };
    // Numerical fallback: wide pass, then crop to the 10% bandwidth (+20%).
    const wide = fourierTransform(ast.ast, request.scale, request.omegaRange, request.samples, 10, 2000).spectrum;
    const peak = Math.max(...wide.map(point => point.magnitude), 1e-12);
    const edge = Math.max(0, ...wide.filter(point => point.magnitude > 0.1 * peak).map(point => Math.abs(point.omega)));
    const bandwidth = Math.min(40, Math.max(4, 1.2 * edge));
    return { ok: true, expression: request.expression, analytic: false, error: forward.error, notes: [], unscaledImpulses: [], spectrum: { samples: wide.filter(point => Math.abs(point.omega) <= bandwidth), impulses: [], bandwidth }, steps };
  }
  const inverse = inverseFourier(request.source);
  const steps = deriveInverseFourierSteps(request.source);
  if (!inverse.ok) return { ok: true, analytic: false, error: inverse.error, steps };
  const lines = inverse.spectrum.impulses.map(impulse => Math.abs(impulse.omega)).filter(omega => omega > 1e-9);
  const radius = traceWindow(inverse.valueAt, lines.length ? (2 * Math.PI) / Math.min(...lines) : undefined);
  return { ok: true, analytic: true, latex: inverse.latex, notes: inverse.notes, spectrum: spectrumView(inverse.spectrum), trace: sampleTrace(inverse.valueAt, radius), steps };
}

function runLaplace(request: Req<'laplace'>): Record<string, unknown> {
  if (request.op === 'parse') {
    try { return { ok: true, system: parseTransferFunction(request.source, request.mode) }; } catch (error) { return fail(error instanceof Error ? error.message : 'Invalid transfer function'); }
  }
  if (request.op === 'inverse') {
    const system = request.system as TransferFunction;
    return { ok: true, result: inverseLaplace(system, request.roc), steps: deriveInverseLaplaceSteps(system, request.roc, {}, { time: 'h', freq: 'H' }) };
  }
  if (request.op === 'forward') {
    const parsed = parseUnifiedSignal(request.source);
    if (!parsed.ok) return fail(parsed.error);
    const evaluate = (node: Parameters<typeof evaluateUnifiedSignal>[0], at: number) => evaluateUnifiedSignal(node, at);
    return { ok: true, forward: forwardLaplace(parsed.node, evaluate, nodeToLatex), steps: deriveForwardLaplaceSteps(parsed.node, evaluate, nodeToLatex, { time: 'h', freq: 'H' }) };
  }
  const system = request.system as TransferFunction;
  if (request.view === 'frequency') return { ok: true, points: frequencyResponse(system, 260, request.span) };
  if (request.view === 'impulse') return { ok: true, points: impulseResponse(system) };
  return { ok: true, landscape: magnitudeLandscape(system, request.resolution, Math.min(request.span, 20)) };
}

function runZ(request: Req<'z-transform'>): Record<string, unknown> {
  if (request.op === 'forward') return { ok: true, analysis: analyzeForwardZ(request.source) };
  const system = request.system as TransferFunction;
  const result = inverseZ(system, request.roc);
  const indices = Array.from({ length: Math.max(0, request.to - request.from + 1) }, (_, i) => request.from + i);
  const { value, ...data } = result;
  return { ok: true, result: data, indices, values: indices.map(n => { const v = value(n); return Number.isFinite(v) ? v : 0; }), steps: deriveInverseZSteps(system, request.roc) };
}

function runConvolution(request: Req<'convolution'>): Record<string, unknown> {
  if (request.op === 'discrete') return { ok: true, result: discreteConvolution(request.x, request.h) };
  const x = parseUnifiedSignalNode(request.x); const h = parseUnifiedSignalNode(request.h);
  if (!x.ok) return fail(x.error);
  if (!h.ok) return fail(h.error);
  if (request.op === 'regime') return { ok: true, regime: analyzeConvolutionRegime(x.ast, h.ast, request.t, new Map()) };
  if (request.op === 'frame') return { ok: true, frame: continuousConvolutionAt(x.ast, h.ast, request.t) };
  const frames = Array.from({ length: request.samples }, (_, i) => {
    const t = request.from + ((request.to - request.from) * i) / (request.samples - 1);
    const { points: _points, ...frame } = continuousConvolutionAt(x.ast, h.ast, t);
    return frame;
  });
  return { ok: true, frames };
}

function runClassify(request: Req<'classify'>): Record<string, unknown> {
  const parsed = parseSystemExpression(request.source);
  if (!parsed.ok) return fail(parsed.error);
  const report = classifySystem(parsed.system);
  if (request.op === 'report') return { ok: true, system: parsed.system, report };
  const verdict = report.pillars.find(item => item.id === request.pillar)?.verdict ?? '';
  const proof: Record<string, unknown> = { ok: true, verdict };
  if (request.pillar === 'stability') proof.stability = stabilitySamples(parsed.system);
  else if (request.pillar === 'linearity') proof.samples = superpositionSamples(parsed.system, request.a, request.b);
  else if (request.pillar === 'time') proof.samples = shiftTestSamples(parsed.system, request.t0);
  else {
    const count = 260; const from = -3; const to = 3;
    proof.io = Array.from({ length: count + 1 }, (_, i) => { const t = from + ((to - from) * i) / count; return { t, input: x2(t), output: evaluateSystem(parsed.system, x2, t) }; });
  }
  return proof;
}

function runComposite(request: Req<'composite'>): Record<string, unknown> {
  const parsed = parseUnifiedSignal(request.source);
  if (!parsed.ok) return fail(parsed.error);
  const model = createCompositeSignal(parsed.node, parsed.latex);
  return { ok: true, analysis: analyzeCompositeSignal(model, { periodicOverride: request.periodicOverride, windowStart: request.windowStart, windowEnd: request.windowEnd }) };
}

function run(request: SignalsRequest): Record<string, unknown> {
  switch (request.action) {
    case 'fourier': return runFourier(request.request);
    case 'laplace': return runLaplace(request.request);
    case 'z-transform': return runZ(request.request);
    case 'convolution': return runConvolution(request.request);
    case 'classify': return runClassify(request.request);
    case 'composite': return runComposite(request.request);
  }
}

/** Transport-free request handler: easy to test, and shared by the Vercel function and Express. */
export function serveSignals(payload: unknown): ServeResult {
  const parsed = SignalsRequestSchema.safeParse(payload);
  if (!parsed.success) return { status: 400, body: { error: 'Invalid request', issues: z.treeifyError(parsed.error) } };
  try {
    return { status: 200, body: { v: SIGNALS_PROTOCOL_VERSION, ...run(parsed.data) } };
  } catch (error) {
    // The engines throw on expressions outside their grammar: the caller's input, reported as a diagnostic.
    return { status: 200, body: { v: SIGNALS_PROTOCOL_VERSION, ok: false, error: error instanceof Error ? error.message : 'Evaluation failed' } };
  }
}

export type { Complex };
