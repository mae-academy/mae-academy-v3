import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TimingWaveforms } from '@/simulators/digital-logic/components/pages/TimingWaveforms';

describe('TimingWaveforms view', () => {
  it('renders timing controls, waveform canvas, and tick actions without duplicate expression input', () => {
    const markup = renderToStaticMarkup(<TimingWaveforms />);
    expect(markup).not.toContain('id="timing-expression"');
    expect(markup).toContain('Timing Controls');
    expect(markup).toContain('Play');
    expect(markup).toContain('Add Cycle');
    expect(markup).toContain('Interactive timing waveform canvas');
    expect(markup).toContain('Toggle A at tick 1');
    expect(markup).toContain('Toggle B at tick 1');
  });
});
