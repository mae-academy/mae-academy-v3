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
import type { CircuitComponent, CircuitWire } from '@shared/circuit/circuitTypes';

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

  it('normalizes {x, y} object coordinates in path, waypoints, and junctionPoint into Point tuples', () => {
    const rawWire = {
      id: 'w-obj',
      fromComp: 'r1',
      fromTerm: 'b',
      toComp: 'junc_1',
      path: [{ x: 100, y: 150 }, { x: 200, y: 150 }],
      waypoints: [{ x: 150, y: 150 }],
      junctionPoint: { x: 200, y: 150 },
      junctionWireId: 'w-main',
      routing: 'straight',
    };
    const normalized = normalizeWire(rawWire);
    expect(normalized.path).toEqual([[100, 150], [200, 150]]);
    expect(normalized.waypoints).toEqual([[150, 150]]);
    expect(normalized.junctionPoint).toEqual([200, 150]);
    expect(normalized.junctionWireId).toBe('w-main');
    expect(normalized.routing).toBe('straight');
    expect(normalized.toTerm).toBe('p'); // Defaults junction pin to 'p'
  });

  it('coerces string numbers in component definitions safely to finite numbers', () => {
    const rawComp = {
      id: 'r1',
      type: 'resistor',
      x: '150',
      y: '225.5',
      rotation: '90',
      label: 'R1',
    };
    const normalized = normalizeComponent(rawComp);
    expect(normalized.x).toBe(150);
    expect(normalized.y).toBe(225.5);
    expect(normalized.rotation).toBe(90);
  });

  it('parses minimal document omitting optional viewport and workspace with safe defaults', () => {
    const minimal = JSON.stringify({
      format: 'MAE-NAD',
      version: 1,
      components: [{ id: 'r1', type: 'resistor', x: 100, y: 100 }],
      wires: [{ id: 'w1', fromComp: 'r1', fromTerm: 'a', toComp: 'r1', toTerm: 'b', path: [[100, 100], [100, 200]] }],
    });
    const doc = parseNad(minimal);
    expect(doc.components).toHaveLength(1);
    expect(doc.wires).toHaveLength(1);
    expect(doc.texts).toEqual([]);
    expect(doc.viewport.pan).toEqual([0, 0]);
    expect(doc.viewport.zoom).toBe(1);
    expect(doc.workspace.gridVisible).toBe(true);
    expect(doc.workspace.snapEnabled).toBe(true);
  });

  it('round-trips a T-junction topology preserving junction metadata and coordinates', () => {
    const comp1: CircuitComponent = { id: 'v1', type: 'dc-voltage', x: 100, y: 100, rotation: 0, flipH: false, flipV: false, label: 'V1', props: {} };
    const comp2: CircuitComponent = { id: 'r1', type: 'resistor', x: 300, y: 100, rotation: 0, flipH: false, flipV: false, label: 'R1', props: {} };
    const comp3: CircuitComponent = { id: 'r2', type: 'resistor', x: 200, y: 250, rotation: 90, flipH: false, flipV: false, label: 'R2', props: {} };

    const wire1: CircuitWire = {
      id: 'w1',
      fromComp: 'v1',
      fromTerm: 'pos',
      toComp: 'junc_abc',
      toTerm: 'p',
      path: [[100, 100], [200, 100]],
      routing: 'orthogonal',
    };
    const wire2: CircuitWire = {
      id: 'w2',
      fromComp: 'junc_abc',
      fromTerm: 'p',
      toComp: 'r1',
      toTerm: 'a',
      path: [[200, 100], [300, 100]],
      routing: 'orthogonal',
    };
    const wire3: CircuitWire = {
      id: 'w3',
      fromComp: 'r2',
      fromTerm: 'a',
      toComp: 'junc_abc',
      toTerm: 'p',
      path: [[200, 220], [200, 100]],
      routing: 'straight',
      junctionPoint: [200, 100],
      junctionWireId: 'w1',
    };

    const doc = createNadDocument({
      components: [comp1, comp2, comp3],
      wires: [wire1, wire2, wire3],
    });

    const serialized = serializeNad(doc);
    const restored = parseNad(serialized);

    expect(restored.wires).toHaveLength(3);
    const restoredW3 = restored.wires.find(w => w.id === 'w3');
    expect(restoredW3).toBeDefined();
    expect(restoredW3?.routing).toBe('straight');
    expect(restoredW3?.junctionPoint).toEqual([200, 100]);
    expect(restoredW3?.junctionWireId).toBe('w1');
    expect(restoredW3?.toComp).toBe('junc_abc');
  });
});

