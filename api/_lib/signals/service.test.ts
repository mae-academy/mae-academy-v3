import { describe, expect, it } from 'vitest';
import { handleSignals } from './handler';
import { parseTransferFunction } from './laplaceEngine';
import { fourierSeries } from './fourierEngine';
import { inverseLaplace } from './laplaceEngine';
import { inverseZ } from './zTransformEngine';
import { continuousConvolutionAt, discreteConvolution } from './convolutionEngine';
import { parseUnifiedSignalNode } from '../../../shared/signals/unifiedSignalParser';
import { serveSignals } from './service';

const ask = (action: string, request: Record<string, unknown>) => serveSignals({ action, request });
const body = (action: string, request: Record<string, unknown>) => ask(action, request).body as Record<string, any>;

describe('serveSignals · parity with the engines', () => {
  it('fourier series equals fourierSeries() on the same signal', () => {
    const res = body('fourier', { op: 'series', expression: '\\text{rect}(t)', period: 2, harmonics: 12 });
    const ast = parseUnifiedSignalNode('\\text{rect}(t)');
    if (!ast.ok) throw new Error('parse');
    expect(res.series).toEqual(JSON.parse(JSON.stringify(fourierSeries(ast.ast, 2, 12))));
    expect(res.trigSteps.length).toBeGreaterThan(0);
  });
  it('fourier transform: analytic pair with a sampled spectrum; numerical fallback; inverse with a trace', () => {
    const a = body('fourier', { op: 'transform', expression: 'e^{-2t}u(t)', scale: 1 });
    expect(a.ok).toBe(true); expect(a.analytic).toBe(true); expect(a.spectrum.samples.length).toBeGreaterThan(100);
    const n = body('fourier', { op: 'transform', expression: '\\sin(t^{2})', scale: 1 });
    expect(n.analytic).toBe(false); expect(n.spectrum.samples.length).toBeGreaterThan(10);
    const inv = body('fourier', { op: 'inverse', source: '\\frac{1}{3+j\\omega}' });
    expect(inv.analytic).toBe(true); expect(inv.trace.length).toBe(601);
    expect(body('fourier', { op: 'series', expression: '((', period: 2, harmonics: 4 }).ok).toBe(false);
  });
  it('laplace parse / inverse / forward / evaluate', () => {
    const parsed = body('laplace', { op: 'parse', source: '\\frac{1}{(s+1)(s+2)}', mode: 's' });
    const system = parseTransferFunction('\\frac{1}{(s+1)(s+2)}', 's');
    expect(parsed.system).toEqual(JSON.parse(JSON.stringify(system)));
    const inv = body('laplace', { op: 'inverse', system: parsed.system, roc: 'right' });
    expect(inv.result.timeLatex).toBe(inverseLaplace(system, 'right').timeLatex);
    expect(body('laplace', { op: 'forward', source: 'e^{-t}u(t)' }).forward.ok).toBe(true);
    expect(body('laplace', { op: 'evaluate', system: parsed.system, view: 'landscape', resolution: 12, span: 4 }).landscape.z.length).toBe(12);
    expect(body('laplace', { op: 'evaluate', system: parsed.system, view: 'frequency' }).points.length).toBe(261);
    expect(body('laplace', { op: 'parse', source: '1/(s+', mode: 's' }).ok).toBe(false);
  });
  it('z-transform forward and inverse (values sampled over the requested indices)', () => {
    expect(body('z-transform', { op: 'forward', source: '0.5^{n}u[n]' }).analysis).toBeTruthy();
    const system = parseTransferFunction('\\frac{z}{z-0.5}', 'z');
    const res = body('z-transform', { op: 'inverse', system, roc: 'right', from: 0, to: 5 });
    const direct = inverseZ(system, 'right');
    expect(res.values).toEqual([0, 1, 2, 3, 4, 5].map(n => direct.value(n)));
  });
  it('convolution: sweep frames equal continuousConvolutionAt; regime; discrete', () => {
    const sweep = body('convolution', { op: 'sweep', x: '\\text{rect}(t)', h: '\\text{rect}(t)', from: -2, to: 2, samples: 9 });
    const x = parseUnifiedSignalNode('\\text{rect}(t)'); if (!x.ok) throw new Error('parse');
    sweep.frames.forEach((frame: { t: number; value: number }) => expect(frame.value).toBeCloseTo(continuousConvolutionAt(x.ast, x.ast, frame.t).value, 12));
    expect(body('convolution', { op: 'regime', x: '\\text{rect}(t)', h: '\\text{rect}(t)', t: 0.3 }).regime.label).toBeTruthy();
    expect(body('convolution', { op: 'frame', x: 'u(t)', h: 'r(t)', t: 1 }).frame.points.length).toBeGreaterThan(0);
    expect(body('convolution', { op: 'discrete', x: [1, 2, 1], h: [1, -1, 2] }).result).toEqual(discreteConvolution([1, 2, 1], [1, -1, 2]));
    expect(body('convolution', { op: 'sweep', x: '((', h: 'u(t)', from: -1, to: 1 }).ok).toBe(false);
  });
  it('classification report and proof data; composite analysis', () => {
    const report = body('classify', { op: 'report', source: 'y(t)=2x(t)+1' });
    expect(report.report.pillars).toHaveLength(5);
    expect(body('classify', { op: 'proof', source: 'y(t)=2x(t)+1', pillar: 'linearity' }).samples.length).toBeGreaterThan(100);
    expect(body('classify', { op: 'proof', source: 'y(t)=x(t+1)', pillar: 'causality' }).io.length).toBe(261);
    expect(body('classify', { op: 'proof', source: 'y(t)=x(t)', pillar: 'stability' }).stability.length).toBeGreaterThan(100);
    expect(body('composite', { op: 'analyze', source: '\\sin(2t)+\\cos(3t)' }).analysis.classification).toBe('Power Signal');
  });
});

describe('request validation and the HTTP handler', () => {
  const post = (text: string) => handleSignals(new Request('http://x/api/signals/transform', { method: 'POST', body: text }));
  it('rejects malformed or out-of-range requests with 400', () => {
    expect(serveSignals({ action: 'nope' }).status).toBe(400);
    expect(ask('fourier', { op: 'series', expression: 'x', period: 1000, harmonics: 4 }).status).toBe(400);
    expect(ask('fourier', { op: 'series', expression: 'x', period: 2, harmonics: 500 }).status).toBe(400);
    expect(ask('fourier', { op: 'series', expression: 'x'.repeat(600), period: 2, harmonics: 4 }).status).toBe(400);
    expect(ask('convolution', { op: 'sweep', x: 'u(t)', h: 'u(t)', from: -1, to: 1, samples: 100000 }).status).toBe(400);
    expect(ask('convolution', { op: 'discrete', x: Array(500).fill(1), h: [1] }).status).toBe(400);
    expect(ask('laplace', { op: 'inverse', system: { mode: 's', numerator: [1], denominator: Array(100).fill(1), zeros: [], poles: [], source: '' }, roc: 'right' }).status).toBe(400);
    expect(ask('z-transform', { op: 'inverse', system: { mode: 'z', numerator: [1], denominator: [1, -1], zeros: [], poles: [], source: '' }, roc: 'sideways' }).status).toBe(400);
    expect(ask('laplace', { op: 'evaluate', system: { mode: 's', numerator: [1], denominator: [1, 1], zeros: [], poles: [{ re: -1, im: 0 }], source: '' }, view: 'frequency', span: 1e9 }).status).toBe(400);
  });
  it('rejects non-POST, bad JSON and oversized bodies; reports server time', async () => {
    expect((await handleSignals(new Request('http://x/', { method: 'GET' }))).status).toBe(405);
    expect((await post('{nope')).status).toBe(400);
    expect((await post('x'.repeat(400 * 1024))).status).toBe(413);
    const ok = await post(JSON.stringify({ action: 'classify', request: { op: 'report', source: 'y(t)=x(t)' } }));
    expect(typeof (await ok.json()).ms).toBe('number');
  });
});
