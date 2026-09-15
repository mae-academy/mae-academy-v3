import { describe, expect, it } from 'vitest';
import {
  createNadDocument,
  parseNad,
  serializeNad,
  compressProjectState,
  decompressProjectState,
  normalizeWire,
  normalizeComponent,
} from '@/simulators/circuit-engine/models/nadFormat';
import type { CircuitComponent, CircuitWire } from '@/simulators/circuit-engine/models/circuitTypes';

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

  it('strictly serializes wires with persistent IDs, component/pin bindings, and waypoints', () => {
    const comp1: CircuitComponent = { id: 'c-uuid-1', type: 'dc-voltage', x: 100, y: 100, rotation: 0, flipH: false, flipV: false, label: 'V1', props: { voltage: 12 } };
    const comp2: CircuitComponent = { id: 'c-uuid-2', type: 'resistor', x: 200, y: 100, rotation: 0, flipH: false, flipV: false, label: 'R1', props: { resistance: 1000 } };
    const rawWire: CircuitWire = {
      id: 'w-uuid-1',
      fromComp: 'c-uuid-1',
      fromTerm: 'pos',
      toComp: 'c-uuid-2',
      toTerm: 'a',
      waypoints: [{ x: 100, y: 100 }, { x: 150, y: 100 }, { x: 200, y: 100 }],
    };

    const doc = createNadDocument({
      components: [comp1, comp2],
      wires: [rawWire],
      texts: [],
    });

    const json = serializeNad(doc);
    const parsed = JSON.parse(json);

    // Verify wire JSON strictly contains all required fields
    const wireJson = parsed.wires[0];
    expect(wireJson.id).toBe('w-uuid-1');
    expect(wireJson.sourceComponentId).toBe('c-uuid-1');
    expect(wireJson.sourcePinId).toBe('pos');
    expect(wireJson.targetComponentId).toBe('c-uuid-2');
    expect(wireJson.targetPinId).toBe('a');
    expect(wireJson.waypoints).toHaveLength(3);

    // Verify round-trip deserialization preserves pin references
    const restoredDoc = parseNad(json);
    const restoredWire = restoredDoc.wires[0];
    expect(restoredWire.fromComp).toBe('c-uuid-1');
    expect(restoredWire.fromTerm).toBe('pos');
    expect(restoredWire.toComp).toBe('c-uuid-2');
    expect(restoredWire.toTerm).toBe('a');
    expect(restoredWire.sourceComponentId).toBe('c-uuid-1');
    expect(restoredWire.targetComponentId).toBe('c-uuid-2');
  });

  it('compresses and decompresses circuit state for URL deep-linking', () => {
    const comp: CircuitComponent = { id: 'v1', type: 'dc-voltage', x: 50, y: 50, rotation: 0, flipH: false, flipV: false, label: 'V1', props: { voltage: 5 } };
    const wire: CircuitWire = {
      id: 'w1',
      fromComp: 'v1',
      fromTerm: 'pos',
      toComp: 'v1',
      toTerm: 'neg',
      waypoints: [{ x: 50, y: 50 }, { x: 50, y: 100 }],
    };

    const doc = createNadDocument({
      components: [comp],
      wires: [wire],
      texts: [],
    });

    const compressed = compressProjectState(doc);
    expect(typeof compressed).toBe('string');
    expect(compressed.length).toBeGreaterThan(0);

    const decompressed = decompressProjectState(compressed);
    expect(decompressed).not.toBeNull();
    expect(decompressed?.components[0].id).toBe('v1');
    expect(decompressed?.wires[0].id).toBe('w1');
    expect(decompressed?.wires[0].fromTerm).toBe('pos');
  });
});

