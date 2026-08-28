import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WaveformTrack, squareWavePath } from './WaveformTrack';

describe('WaveformTrack', () => {
  it('converts tick states into a sharp square-wave path', () => {
    expect(squareWavePath([0, 1, 1, 0], 10, 4, 20)).toBe('M 0 20 L 10 20 L 10 4 L 20 4 L 30 4 L 30 20 L 40 20');
  });

  it('renders clickable input segments plus X shading and hazard markers', () => {
    const markup = renderToStaticMarkup(<svg><WaveformTrack waveform={{ name: 'A', type: 'input', data: [0, 'X', 1] }} y={24} tickWidth={18} width={54} interactive hazards={[{ tick: 1, kind: 'static', transientValues: [1, 0, 1] }]} /></svg>);
    expect(markup).toContain('Toggle A at tick 1');
    expect(markup).toContain('Toggle A at tick 3');
    expect(markup).toContain('#fee2e2');
    expect(markup).toContain('#fef3c7');
  });
});
