import { describe, it, expect } from 'vitest';
import type { CircuitComponent, CircuitWire } from './circuitTypes';
import { replaceComponent } from './circuitTypes';

function makeComponent(overrides: Partial<CircuitComponent> & Pick<CircuitComponent, 'id' | 'type' | 'label'>): CircuitComponent {
  return { x: 100, y: 200, rotation: 90, flipH: true, flipV: false, props: {}, ...overrides };
}

function makeWire(overrides: Partial<CircuitWire> & Pick<CircuitWire, 'id' | 'fromComp' | 'fromTerm' | 'toComp' | 'toTerm'>): CircuitWire {
  return { path: [], routing: 'orthogonal', ...overrides };
}

describe('replaceComponent', () => {
  it('inherits position, rotation and flip from the replaced component', () => {
    const oldComponent = makeComponent({ id: 'R1', type: 'resistor', label: 'R1' });
    const result = replaceComponent([oldComponent], [], 'R1', ['a', 'b'], ['a', 'b'], {
      id: 'D1', type: 'diode', label: 'D1', props: { forwardVoltage: 0.7 },
    });
    expect(result).not.toBeNull();
    const [newComponent] = result!.components;
    expect(newComponent).toMatchObject({ id: 'D1', type: 'diode', label: 'D1', x: 100, y: 200, rotation: 90, flipH: true, flipV: false });
  });

  it('rewires by terminal position when pin counts match, even if terminal ids differ', () => {
    // Resistor uses a/b; diode uses anode/cathode — same count (2), different names.
    const oldComponent = makeComponent({ id: 'R1', type: 'resistor', label: 'R1' });
    const other = makeComponent({ id: 'V1', type: 'dc-voltage', label: 'V1' });
    const wires: CircuitWire[] = [
      makeWire({ id: 'w1', fromComp: 'V1', fromTerm: 'pos', toComp: 'R1', toTerm: 'a' }),
      makeWire({ id: 'w2', fromComp: 'R1', fromTerm: 'b', toComp: 'V1', toTerm: 'neg' }),
    ];
    const result = replaceComponent([oldComponent, other], wires, 'R1', ['a', 'b'], ['anode', 'cathode'], {
      id: 'D1', type: 'diode', label: 'D1', props: {},
    });
    expect(result).not.toBeNull();
    expect(result!.wires).toEqual([
      makeWire({ id: 'w1', fromComp: 'V1', fromTerm: 'pos', toComp: 'D1', toTerm: 'anode' }),
      makeWire({ id: 'w2', fromComp: 'D1', fromTerm: 'cathode', toComp: 'V1', toTerm: 'neg' }),
    ]);
  });

  it('drops connected wires instead of transferring them when pin counts differ', () => {
    const oldComponent = makeComponent({ id: 'R1', type: 'resistor', label: 'R1' });
    const other = makeComponent({ id: 'V1', type: 'dc-voltage', label: 'V1' });
    const untouched = makeComponent({ id: 'R2', type: 'resistor', label: 'R2' });
    const wires: CircuitWire[] = [
      makeWire({ id: 'w1', fromComp: 'V1', fromTerm: 'pos', toComp: 'R1', toTerm: 'a' }),
      makeWire({ id: 'w2', fromComp: 'R1', fromTerm: 'b', toComp: 'V1', toTerm: 'neg' }),
      makeWire({ id: 'w3', fromComp: 'V1', fromTerm: 'pos', toComp: 'R2', toTerm: 'a' }),
    ];
    // 2-pin resistor -> 3-pin BJT: no safe pin mapping.
    const result = replaceComponent([oldComponent, other, untouched], wires, 'R1', ['a', 'b'], ['base', 'collector', 'emitter'], {
      id: 'Q1', type: 'bjt-npn', label: 'Q1', props: {},
    });
    expect(result).not.toBeNull();
    expect(result!.wires).toEqual([makeWire({ id: 'w3', fromComp: 'V1', fromTerm: 'pos', toComp: 'R2', toTerm: 'a' })]);
    expect(result!.components.find(c => c.id === 'Q1')).toBeDefined();
  });

  it('returns null when the target component does not exist', () => {
    const result = replaceComponent([], [], 'missing', ['a', 'b'], ['a', 'b'], { id: 'D1', type: 'diode', label: 'D1', props: {} });
    expect(result).toBeNull();
  });

  it('drops a wire whose recorded terminal is not part of the old definition', () => {
    const oldComponent = makeComponent({ id: 'R1', type: 'resistor', label: 'R1' });
    const wires: CircuitWire[] = [makeWire({ id: 'w1', fromComp: 'R1', fromTerm: 'stray', toComp: 'R1', toTerm: 'a' })];
    const result = replaceComponent([oldComponent], wires, 'R1', ['a', 'b'], ['anode', 'cathode'], {
      id: 'D1', type: 'diode', label: 'D1', props: {},
    });
    expect(result!.wires).toEqual([]);
  });
});
