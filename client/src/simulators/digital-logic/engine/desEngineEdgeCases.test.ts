import { describe, expect, it } from 'vitest';
import { DiscreteEventLogicEngine } from '@/simulators/digital-logic/engine/desLogicCore';
import type { CircuitComponent, CircuitWire } from '@/simulators/digital-logic/models/circuitTypes';

const component = (id: string, type: string, props: Record<string, unknown> = {}): CircuitComponent => ({ id, type, x: 0, y: 0, rotation: 0, flipH: false, flipV: false, label: id, props });
const wire = (id: string, fromComp: string, fromTerm: string, toComp: string, toTerm: string): CircuitWire => ({ id, fromComp, fromTerm, toComp, toTerm, routing: 'orthogonal', path: [[0, 0], [20, 0]] });

describe('DES engine resilience', () => {
  it('resolves opposing output drivers as X and emits a conflict warning', () => {
    const engine = new DiscreteEventLogicEngine();
    engine.setCircuit([component('one', 'digital-input', { state: 'HIGH' }), component('zero', 'digital-input', { state: 'LOW' }), component('gate', 'gate-not')], [wire('one', 'one', 'out', 'gate', 'a'), wire('zero', 'zero', 'out', 'gate', 'a')]);
    expect(engine.getLogicState('gate', 'a')).toBe('X');
    expect(engine.getSnapshot().warnings.some(warning => warning.code === 'logic-driver-conflict')).toBe(true);
  });

  it('processes a delayed NOT feedback loop as queued events rather than exhausting the call stack', () => {
    const engine = new DiscreteEventLogicEngine();
    expect(() => engine.setCircuit([component('not', 'gate-not', { propagationDelayNs: 1 })], [wire('feedback', 'not', 'y', 'not', 'a')])).not.toThrow();
    const before = engine.getTime(); engine.step(0.000001);
    expect(engine.getTime()).toBeGreaterThan(before);
    expect([0, 1]).toContain(engine.getLogicState('not', 'y'));
  });

  it('emits alternating ring-oscillator wire states at the configured gate-delay cadence', () => {
    const engine = new DiscreteEventLogicEngine();
    engine.setCircuit([component('not', 'gate-not', { propagationDelayNs: 1 })], [wire('feedback', 'not', 'y', 'not', 'a')]);
    const transitions: Array<{ value: 0 | 1 | 'Z' | 'X'; atNs: number }> = [];
    const unsubscribe = engine.subscribeToWire('feedback', (value, atNs) => transitions.push({ value, atNs }));

    engine.step(0.0000001);
    unsubscribe();

    expect(transitions.map(transition => transition.value)).toContain(0);
    expect(transitions.map(transition => transition.value)).toContain(1);
    expect(transitions.every(transition => Number.isFinite(transition.atNs))).toBe(true);
    expect(transitions.some((transition, index) => index > 0 && transition.atNs - transitions[index - 1].atNs === 1)).toBe(true);
  });
});
