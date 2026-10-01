// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { parseUnifiedSignalNode } from '@shared/signals/unifiedSignalParser';
import { continuousConvolutionAt } from '../../../../api/_lib/signals/convolutionEngine';
import { convolutionSweepRemote, SignalsEvaluationError, parseTransferFunctionRemote } from '@/services/signalsClient';
import { frameFromSweep } from './convolutionFrames';
import { SystemClassificationLab } from './SystemClassificationLab';
import { installInProcessSignalsApi, uninstallInProcessSignalsApi } from './test-utils';

vi.mock('mathlive', () => ({ MathfieldElement: class {} }));
beforeAll(() => {
  installInProcessSignalsApi();
  window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});
afterAll(uninstallInProcessSignalsApi);
afterEach(cleanup);

describe('signals studios over the serverless engine', () => {
  it('convolution playback: sweep frames interpolate to the engine value between samples and carry the integrand', async () => {
    const x = parseUnifiedSignalNode('\\text{rect}(t)'); const h = parseUnifiedSignalNode('\\text{rect}(t)');
    if (!x.ok || !h.ok) throw new Error('parse');
    const frames = await convolutionSweepRemote('\\text{rect}(t)', '\\text{rect}(t)', -3, 3, 601);
    for (const t of [-1.37, -0.2, 0.013, 0.8, 2.2]) {
      const frame = frameFromSweep(frames, x.ast, h.ast, t, { from: -3, to: 3 });
      expect(frame.value).toBeCloseTo(continuousConvolutionAt(x.ast, h.ast, t).value, 2);
    }
    const overlapping = frameFromSweep(frames, x.ast, h.ast, 0.3, { from: -3, to: 3 });
    expect(overlapping.points.length).toBeGreaterThan(10);
    expect(overlapping.points.every(p => Math.abs(p.product - p.x * p.shiftedH) < 1e-12)).toBe(true);
    expect(frameFromSweep(null, x.ast, h.ast, 0, { from: -3, to: 3 }).value).toBe(0);
  });

  it('client: invalid expressions surface as SignalsEvaluationError, parsed transfer functions come back as data', async () => {
    await expect(parseTransferFunctionRemote('1/(s+', 's')).rejects.toBeInstanceOf(SignalsEvaluationError);
    const system = await parseTransferFunctionRemote('\\frac{1}{(s+1)(s+3)}', 's');
    expect(system.poles.map(p => p.re)).toEqual([-3, -1]);
  });

  it('system classification: the five pillars render from the engine report', async () => {
    const { container } = render(<SystemClassificationLab />);
    await waitFor(() => expect(container.innerHTML).toMatch(/Linearity/));
    await waitFor(() => expect(screen.getAllByText(/Linear|Non-Linear/).length).toBeGreaterThan(0));
  });
});
