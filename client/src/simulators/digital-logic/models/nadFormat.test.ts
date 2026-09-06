import { describe, expect, it } from 'vitest';
import { createNadDocument, parseNad, serializeNad } from '@/simulators/digital-logic/models/nadFormat';

describe('NAD persistence format', () => {
  it('round-trips a Tab B topology through a .nad JSON document', () => {
    const source = createNadDocument({
      components: [{ id: 'r1', type: 'resistor', x: 120, y: 80, rotation: 0, flipH: false, flipV: false, label: 'R1', props: { resistance: 1000 } }],
      wires: [], texts: [], viewport: { pan: [12, -8], zoom: 1.25 }, workspace: { gridVisible: true, snapEnabled: true },
    });
    const restored = parseNad(serializeNad(source));
    expect(restored.format).toBe('MAE-NAD');
    expect(restored.components[0].label).toBe('R1');
    expect(restored.viewport).toEqual({ pan: [12, -8], zoom: 1.25 });
  });

  it('rejects JSON that is not a supported NAD document', () => {
    expect(() => parseNad(JSON.stringify({ format: 'JSON', version: 1 }))).toThrow('unsupported document format');
  });
});
