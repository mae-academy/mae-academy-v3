// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { KMapMinimizer } from '@/simulators/digital-logic/components/pages/KMapMinimizer';
import { StateMachineExplorer } from '@/simulators/digital-logic/components/pages/StateMachineExplorer';
import { TimingWaveforms } from '@/simulators/digital-logic/components/pages/TimingWaveforms';
import { installInProcessLogicApi, uninstallInProcessLogicApi } from '@/simulators/digital-logic/remote/test-utils';

beforeAll(installInProcessLogicApi);
afterAll(uninstallInProcessLogicApi);
afterEach(cleanup);

/** The three solver-backed pages render their results from replies of the serverless engine. */
describe('solver pages over the serverless engine', () => {
  it('K-map: minimized hardware cost arrives from the engine', async () => {
    render(<KMapMinimizer />);
    expect(await screen.findByText(/\d+ terms · \d+ literals/)).toBeTruthy();
  });

  it('FSM explorer: state table and minimized equations arrive from the engine', async () => {
    const { container } = render(<StateMachineExplorer />);
    await waitFor(() => expect(container.querySelectorAll('table tbody tr').length).toBeGreaterThan(5)); // state + excitation rows
    await waitFor(() => expect(container.querySelectorAll('.katex-display').length).toBeGreaterThan(0)); // minimized equations
    expect(container.innerHTML).not.toContain('exceeds 5-variable');
  });

  it('timing waveforms: hazard analysis output renders a waveform for F', async () => {
    const { container } = render(<TimingWaveforms />);
    await waitFor(() => expect(container.innerHTML).toContain('Interactive timing waveform canvas'));
  });
});
