import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TimingWaveforms } from '@/simulators/digital-logic/components/pages/TimingWaveforms';

describe('TimingWaveforms view', () => {
  it('renders direct expression controls, waveform canvas, and tick actions', () => {
    const markup = renderToStaticMarkup(<TimingWaveforms />);
    expect(markup).toContain('Boolean expression');
    expect(markup).toContain('Play');
    expect(markup).toContain('Add Cycle');
    expect(markup).toContain('Interactive timing waveform canvas');
    expect(markup).toContain('Toggle A at tick 1');
    expect(markup).toContain('Toggle B at tick 1');
  });
});
