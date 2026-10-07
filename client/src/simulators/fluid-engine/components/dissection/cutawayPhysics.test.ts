import { describe, expect, it } from 'vitest';
import { FluidEngine } from '@shared/fluid/engine/FluidEngine';
import type { EngineComponent, EngineNetwork, EngineSnapshot, EngineWire } from '@shared/fluid/engine/types';
import { springEquilibriumStroke } from '@shared/fluid/engine/componentSolvers';
import { defaultFluidProps, getFluidDefinition } from '../../models/fluidCatalog';
import {
  CUSHION_ZONE,
  analyzeAnd,
  analyzeCushion,
  analyzeCutaway,
  analyzeOr,
  analyzeSingle,
  analyzeSpool,
  clampPistonX,
  cutawayKindOf,
  landPositions,
  spoolGeometry,
  spoolStart,
  type CutawayComponent,
} from './cutawayPhysics';

const part = (id: string, type: string, props: Record<string, unknown> = {}): CutawayComponent => ({
  id, type, label: id, props: { ...defaultFluidProps(getFluidDefinition(type)!), ...props },
});
const pipe = (from: string, to: string): EngineWire => {
  const [fromComp, fromTerm] = from.split(':');
  const [toComp, toTerm] = to.split(':');
  return { id: `${from}>${to}`, fromComp, fromTerm, toComp, toTerm };
};
const engineOf = (components: EngineComponent[], pipes: Array<[string, string]> = []) => new FluidEngine({ components, wires: pipes.map(([a, b]) => pipe(a, b)) } as EngineNetwork);
const PILOTED = { actuationLeft: 'Pneumatic Pilot', actuationRight: 'Pneumatic Pilot' };

describe('which components open a cutaway', () => {
  it('covers AND, OR, 3/2, 5/2, 5/3 and the cylinders only', () => {
    expect(['dual-pressure-valve', 'shuttle-valve', 'valve-3-2-nc', 'valve-3-2-no', 'hvalve-3-2-nc', 'valve-2-2-no', 'valve-4-2', 'hvalve-4-2', 'flow-control', 'flow-control-oneway', 'valve-5-2', 'valve-5-3', 'check-valve', 'check-valve-spring', 'cylinder-double', 'cylinder-double-rod', 'cylinder-single'].map(type => cutawayKindOf({ type })))
      .toEqual(['and', 'or', 'spool32', 'spool32', 'spool32', 'spool22', 'spool42', 'spool42', 'throttle', 'oneway', 'spool52', 'spool53', 'check', 'springCheck', 'cushion', 'cushion', 'single']);
    for (const type of ['valve-4-3', 'pressure-source', 'regulator-nr']) expect(cutawayKindOf({ type })).toBeNull();
  });

  it('analyzeCutaway returns nothing for other parts', () => {
    const valve = part('v', 'regulator-nr');
    expect(analyzeCutaway(valve, engineOf([valve]).getSnapshot())).toBeNull();
  });
});

describe('AND / OR cutaways follow the engine', () => {
  const gate = (type: string, left: number, right: number) => {
    const component = part('g', type);
    const engine = engineOf([component]);
    engine.injectPressure('g', 'x', left);
    engine.injectPressure('g', 'y', right);
    return { component, snapshot: engine.step() };
  };

  it('AND: one signal blocks port 2 with the spool pushed away from it; both centre the spool and open it', () => {
    const rows: Array<[number, number, string, number, string]> = [
      [0, 0, 'idle', 0, 'Idle'],
      [6, 0, 'blocked', 1, 'left'],
      [0, 6, 'blocked', -1, 'right'],
      [6, 6, 'open', 0, 'both'],
    ];
    for (const [left, right, tone, offset, text] of rows) {
      const { component, snapshot } = gate('dual-pressure-valve', left, right);
      const analysis = analyzeAnd(component, snapshot);
      expect(analysis.tone).toBe(tone);
      expect(analysis.offset).toBe(offset);
      expect(analysis.state.toLowerCase()).toContain(text.toLowerCase());
      expect(analysis.out).toBe(left > 0 && right > 0 ? 6 : 0);
      expect(analysis.readings.map(reading => reading.bar)).toEqual([left, right, analysis.out]);
    }
  });

  it('OR: the ball is driven onto the idle inlet and port 2 carries the higher pressure', () => {
    const rows: Array<[number, number, number, number]> = [[0, 0, 0, 0], [6, 0, 1, 6], [0, 4, -1, 4], [6, 4, 1, 6], [6, 6, 0, 6]];
    for (const [left, right, offset, out] of rows) {
      const { component, snapshot } = gate('shuttle-valve', left, right);
      const analysis = analyzeOr(component, snapshot);
      expect(analysis.offset).toBe(offset);
      expect(analysis.out).toBe(out);
      expect(analysis.open).toBe(left > 0 || right > 0);
    }
    expect(analyzeOr(...Object.values(gate('shuttle-valve', 6, 0)) as [CutawayComponent, EngineSnapshot]).description).toContain('right conical seat');
  });
});

describe('spool geometry', () => {
  const groups = (kind: 'spool52' | 'spool53', offset: number) => {
    const { covered, intervals } = spoolGeometry(landPositions(spoolStart(kind, offset)));
    return { covered, groups: intervals.map(interval => interval.ports.join('')) };
  };

  it('5/2 rest: 1→2 and 4→5 are joined by grooves, 3 is sealed', () => {
    expect(groups('spool52', 0)).toEqual({ covered: [], groups: ['', '54', '12', '3'] });
  });

  it('5/2 actuated: the spool has slid one pitch, so 1→4 and 2→3 are joined and 5 is isolated', () => {
    expect(groups('spool52', 1)).toEqual({ covered: [], groups: ['5', '41', '23', ''] });
    expect(spoolStart('spool52', 1) - spoolStart('spool52', 0)).toBe(90);
  });

  it('5/3 left pilot 14 and right pilot 12 reproduce the two 5/2 positions', () => {
    expect(groups('spool53', 1)).toEqual(groups('spool52', 1));
    expect(groups('spool53', -1)).toEqual(groups('spool52', 0));
  });

  it('5/3 centre: lands sit on 5, 1 and 3; ports 4 and 2 are enclosed volumes joined to nothing', () => {
    expect(groups('spool53', 0)).toEqual({ covered: ['5', '1', '3'], groups: ['', '4', '2', ''] });
  });
});

describe('spool analysis', () => {
  const valve = (type: string, props: Record<string, unknown> = PILOTED) => {
    const component = part('v', type, props);
    const engine = engineOf([part('src', 'pressure-source') as EngineComponent, component], [['src:out', 'v:p1']]);
    return { component, engine };
  };

  it('5/2 reports the rest and actuated states with the fluid paths of the live pressures', () => {
    const { component, engine } = valve('valve-5-2');
    const rest = analyzeSpool(component, engine.step(), 'spool52');
    expect(rest.state).toBe('Rest position — 1→2, 4→5');
    expect(rest.offset).toBe(0);
    expect(rest.connections).toEqual([{ from: '1', to: '2' }]);
    expect(rest.description).toBe('Working Port 4 vents through the groove to exhaust Port 5. A groove bridges supply Port 1 to working Port 2. Exhaust Port 3 is sealed off.');

    engine.injectPressure('v', 'pilotL', 6);
    const actuated = analyzeSpool(component, engine.step(), 'spool52');
    expect(actuated.state).toBe('Actuated — 1→4, 2→3');
    expect(actuated.offset).toBe(1);
    expect(actuated.start).toBe(255);
    expect(actuated.connections).toEqual([{ from: '1', to: '4' }]);
    expect(actuated.pilotLeft).toBe(6);
    expect(actuated.readings.find(reading => reading.label === '14')?.bar).toBe(6);
    expect(actuated.description).toContain('A groove bridges supply Port 1 to working Port 4');
    expect(actuated.description).toContain('Exhaust Port 5 is sealed off');
  });

  it('5/3 centre traps the cylinder lines and isolates the supply; the pilots move it either way', () => {
    const { component, engine } = valve('valve-5-3');
    engine.injectPressure('v', 'p4', 5); // a loaded cylinder line
    const mid = analyzeSpool(component, engine.step(), 'spool53');
    expect(mid.state).toBe('Mid-position — all ports closed');
    expect(mid.tone).toBe('blocked');
    expect(mid.covered).toEqual(['5', '1', '3']);
    expect(mid.connections).toEqual([]);
    expect(mid.description).toContain('Supply Port 1 is blocked by a land');
    expect(mid.description).toContain('Working Port 4 is closed — the cylinder line is trapped at 5.0 bar');

    engine.injectPressure('v', 'p4', null);
    engine.injectPressure('v', 'pilotL', 6);
    expect(analyzeSpool(component, engine.step(), 'spool53').state).toBe('Left pilot 14 — 1→4, 2→3');
    engine.injectPressure('v', 'pilotL', 0);
    engine.injectPressure('v', 'pilotR', 6);
    const right = analyzeSpool(component, engine.step(), 'spool53');
    expect(right.state).toBe('Right pilot 12 — 1→2, 4→5');
    expect(right.offset).toBe(-1);
  });
});

describe('cushion analysis', () => {
  const snapshotOf = (component: CutawayComponent, stroke: number, velocity: number, rearBar = 6, frontBar = 0): EngineSnapshot => ({
    ...engineOf([component]).getSnapshot(),
    cylinders: { [component.id]: { stroke, velocity, force: 0, chamberPressureA: rearBar, chamberPressureB: frontBar } },
    portPressure: { [`${component.id}:a`]: rearBar, [`${component.id}:b`]: frontBar },
  });

  it('engages the front spear only in the last 10% of the stroke and throttles the exhaust while moving into it', () => {
    const cylinder = part('c', 'cylinder-double', { cushioning: 'Adjustable - both' });
    const normal = analyzeCushion(cylinder, snapshotOf(cylinder, 0.5, 0.2));
    expect(normal.state).toBe('Normal stroke — free exhaust');
    expect(normal.front.engaged || normal.rear.engaged).toBe(false);

    const entering = analyzeCushion(cylinder, snapshotOf(cylinder, 0.95, 0.1));
    expect(entering.front.engaged).toBe(true);
    expect(entering.front.depth).toBeCloseTo(0.5);
    expect(entering.throttled).toBe(true);
    expect(entering.state).toBe('Cushioning — exhaust throttled');
    expect(entering.description).toContain('adjustable needle valve');

    const edge = analyzeCushion(cylinder, snapshotOf(cylinder, 1 - CUSHION_ZONE, 0.1));
    expect(edge.front.engaged).toBe(false);
  });

  it('is seated when stopped inside a zone, and the rear spear engages near stroke 0 while retracting', () => {
    const cylinder = part('c', 'cylinder-double', { cushioning: 'Fixed - both' });
    expect(analyzeCushion(cylinder, snapshotOf(cylinder, 1, 0)).state).toBe('Seated in the front cushion');
    const retracting = analyzeCushion(cylinder, snapshotOf(cylinder, 0.04, -0.1));
    expect(retracting.rear.engaged).toBe(true);
    expect(retracting.rear.adjustable).toBe(false);
    expect(retracting.throttled).toBe(true);
    expect(retracting.description).not.toContain('adjustable needle valve');
  });

  it('a one-sided cushion leaves the other end plain; none at all is a plain end stop', () => {
    const rearOnly = part('c', 'cylinder-double', { cushioning: 'Fixed - rear' });
    const analysis = analyzeCushion(rearOnly, snapshotOf(rearOnly, 0.97, 0.1));
    expect(analysis.front.enabled).toBe(false);
    expect(analysis.throttled).toBe(false);
    const plain = part('p', 'cylinder-double');
    expect(analyzeCushion(plain, snapshotOf(plain, 0.97, 0.1)).state).toBe('Plain end stop — no cushioning');
  });

  it('follows a real cylinder run from the engine', () => {
    const cylinder = part('cyl', 'cylinder-double', { cushioning: 'Adjustable - both' });
    const engine = engineOf(
      [part('src', 'pressure-source') as EngineComponent, part('v', 'valve-5-2', PILOTED) as EngineComponent, cylinder],
      [['src:out', 'v:p1'], ['v:p4', 'cyl:a'], ['v:p2', 'cyl:b']],
    );
    engine.injectPressure('v', 'pilotL', 6);
    let throttledSeen = false;
    let peakDepth = 0;
    for (let tick = 0; tick < 600; tick += 1) {
      const analysis = analyzeCushion(cylinder, engine.step());
      throttledSeen = throttledSeen || analysis.throttled;
      peakDepth = Math.max(peakDepth, analysis.front.depth);
    }
    expect(throttledSeen).toBe(true);
    expect(peakDepth).toBeCloseTo(1, 6);
    expect(analyzeCushion(cylinder, engine.getSnapshot()).state).toBe('Seated in the front cushion');
  });
});

describe('clampPistonX', () => {
  it('maps the stroke onto the inner bore and never leaves it', () => {
    expect(clampPistonX(0, 162, 590)).toBe(162);
    expect(clampPistonX(1, 162, 590)).toBe(590);
    expect(clampPistonX(0.5, 162, 590)).toBe(376);
    for (const stroke of [-5, 1.0001, 7, Number.POSITIVE_INFINITY, Number.NaN]) {
      const x = clampPistonX(stroke, 162, 590);
      expect(x).toBeGreaterThanOrEqual(162);
      expect(x).toBeLessThanOrEqual(590);
    }
  });
});

describe('single-acting analysis', () => {
  const cylinder = part('s', 'cylinder-single');
  const snap = (stroke: number, velocity: number, bar: number): EngineSnapshot => ({
    ...engineOf([cylinder]).getSnapshot(),
    cylinders: { s: { stroke, velocity, force: 0, chamberPressureA: bar, chamberPressureB: 0 } },
    portPressure: { 's:a': bar },
  });

  it('reports the spring compression and the phase of the stroke', () => {
    expect(analyzeSingle(cylinder, snap(0, 0, 0)).state).toBe('At rest — spring holds the piston back');
    const out = analyzeSingle(cylinder, snap(0.4, 0.2, 5));
    expect(out.state).toBe('Extending — pressure compresses the spring');
    expect(out.springCompression).toBeCloseTo(0.4);
    expect(analyzeSingle(cylinder, snap(0.4, -0.2, 0)).state).toBe('Retracting — spring drives the piston back');
    expect(analyzeSingle(cylinder, snap(1, 0, 6)).state).toBe('Fully extended — spring compressed');
    expect(analyzeSingle(cylinder, snap(0.5, 0, 3)).state).toBe('Held mid-stroke — pressure balances the spring');
    expect(analyzeSingle(cylinder, snap(0, 0, 0.5)).state).toBe('Pressurised — below the spring preload');
    expect(analyzeSingle(cylinder, snap(1.5, 0, 6)).springCompression).toBe(1);
    expect(analyzeCutaway(cylinder, snap(0, 0, 0))!.kind).toBe('single');
  });

  /** A real engine run: source at `bar` → pushbutton 3/2 → single-acting cylinder, settled. */
  const settled = (bar: number, seconds = 6) => {
    const component = part('s', 'cylinder-single');
    const engine = engineOf(
      [part('src', 'pressure-source', { pressure: bar }), part('v', 'valve-3-2-nc', { actuationLeft: 'Pushbutton', actuationRight: 'Spring Return' }), component],
      [['src:out', 'v:p1'], ['v:p2', 's:a']],
    );
    engine.setManual('v', 'left', true);
    return { component, snapshot: engine.step(seconds), engine };
  };

  it('reads the equilibrium the engine computed: partial stroke at 1.5 bar, full at 6 bar', () => {
    const low = settled(1.5);
    const reading = analyzeSingle(low.component, low.snapshot);
    expect(reading.equilibrium).toBeCloseTo(springEquilibriumStroke(1.5));
    expect(reading.stroke).toBeCloseTo(reading.equilibrium, 6);
    expect(reading.state).toBe('Held mid-stroke — pressure balances the spring');
    expect(reading.springBar).toBeCloseTo(1.5); // spring force = air force at the resting stroke
    expect(reading.rearBar).toBeCloseTo(1.5);
    expect(reading.description).toContain('1.5 bar');

    const high = settled(6);
    const full = analyzeSingle(high.component, high.snapshot);
    expect(full.stroke).toBe(1);
    expect(full.equilibrium).toBe(1);
    expect(full.state).toBe('Fully extended — spring compressed');
  });

  it('follows the spring back to the rear cap when the supply is vented', () => {
    const { component, engine } = settled(6);
    engine.setManual('v', 'left', false);
    const returning = analyzeSingle(component, engine.step(0.1));
    expect(returning.state).toBe('Retracting — spring drives the piston back');
    const home = analyzeSingle(component, engine.step(4));
    expect(home.stroke).toBe(0);
    expect(home.equilibrium).toBe(0);
    expect(home.rearBar).toBeCloseTo(0);
  });

  it('a supply below the spring preload leaves the piston on the rear cap', () => {
    const { component, snapshot } = settled(0.8);
    const reading = analyzeSingle(component, snapshot);
    expect(reading.stroke).toBe(0);
    expect(reading.equilibrium).toBe(0);
    expect(reading.state).toBe('Pressurised — below the spring preload');
  });
});
