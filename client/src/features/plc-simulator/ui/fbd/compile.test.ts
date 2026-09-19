import { describe, expect, it } from 'vitest';
import { validateNetworkLayout } from '../../domain/ast';
import { LOGO_0BA8 } from '../../domain/hardware';
import { createSession } from '../host/session';
import { toProgram } from '../host/program';
import { compileFbd, evaluateLevels } from './compile';
import { addBlock, connect, nextId, type FbdGraph, type FbdKind } from './model';

const profile = LOGO_0BA8;

/** Deterministic PRNG so a failing expression can be reproduced from its seed. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Draw {
  graph: FbdGraph = { blocks: [], links: [] };
  add(kind: FbdKind): string {
    const id = nextId(this.graph, 'b');
    this.graph = addBlock(this.graph, kind, 0, 0, id);
    return id;
  }
  wire(from: string, to: string, pin: number): void {
    const result = connect(this.graph, from, to, pin, nextId(this.graph, 'l'));
    if (!result.ok) throw new Error(result.reason);
    this.graph = result.graph;
  }
}

/** Builds a random gate tree over inputs I1..I4 and returns the block that drives it. */
function tree(draw: Draw, rand: () => number, depth: number, inputs: readonly string[]): string {
  if (depth === 0 || rand() < 0.25) return inputs[Math.floor(rand() * inputs.length)] ?? '';
  const kinds: FbdKind[] = ['and', 'or', 'nand', 'nor', 'xor', 'not'];
  const kind = kinds[Math.floor(rand() * kinds.length)] ?? 'and';
  const gate = draw.add(kind);
  const arity = kind === 'not' ? 1 : kind === 'xor' ? 2 : 2 + Math.floor(rand() * 3);
  for (let pin = 0; pin < arity; pin++) draw.wire(tree(draw, rand, depth - 1, inputs), gate, pin);
  return gate;
}

const truth = (graph: FbdGraph, outputId: string, mask: number): boolean =>
  evaluateLevels(graph, (address) => {
    const match = /^I(\d+)\.(\d+)$/.exec(address);
    return match ? ((mask >> (Number(match[1]) * 8 + Number(match[2]))) & 1) === 1 : false;
  }).get(outputId) ?? false;

describe('FBD -> LAD lowering', () => {
  it('computes the same truth table as the diagram for random gate networks', () => {
    let checked = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const rand = mulberry32(seed);
      const draw = new Draw();
      const inputs = [0, 1, 2, 3].map(() => draw.add('input'));
      const out = draw.add('output');
      draw.wire(tree(draw, rand, 4, inputs), out, 0);

      const result = compileFbd(draw.graph, profile);
      if (result.diagnostics.some((d) => d.severity === 'error')) continue; // too wide for the LOGO! grid
      checked++;

      for (const network of result.networks) expect(validateNetworkLayout(network), `seed ${seed}`).toEqual([]);

      for (let mask = 0; mask < 16; mask++) {
        const session = createSession(profile, result.networks, { scheduler: { schedule: () => 0, cancel: () => {} } });
        session.runtime.loadProgram(toProgram(result.networks, profile));
        expect(session.runtime.compiled.ok, `seed ${seed}`).toBe(true);
        for (let i = 0; i < 4; i++) session.field.setInput(i, ((mask >> i) & 1) === 1);
        session.runtime.step();
        expect(session.memory.readBit('Q0.0'), `seed ${seed} mask ${mask}`).toBe(truth(draw.graph, out, mask));
      }
    }
    expect(checked).toBeGreaterThan(20);
  });

  it('gives every output element its own network ending on the right rail', () => {
    const draw = new Draw();
    const a = draw.add('input');
    const b = draw.add('input');
    const or = draw.add('or');
    const out = draw.add('output');
    draw.wire(a, or, 0);
    draw.wire(b, or, 1);
    draw.wire(or, out, 0);
    const [network] = compileFbd(draw.graph, profile).networks;
    const coil = network?.nodes.find((n) => n.type === 'coil');
    expect(network?.branches).toHaveLength(1);
    expect(coil?.layout.col).toBe((network?.grid.cols ?? 0) - 1);
  });

  it('runs a timer whose done bit feeds an output, ahead of its reader in the program', () => {
    const draw = new Draw();
    const start = draw.add('input');
    const ton = draw.add('ton');
    const out = draw.add('output');
    draw.wire(start, ton, 0);
    draw.wire(ton, out, 0);
    const { networks } = compileFbd(draw.graph, profile);
    expect(networks.map((n) => n.nodes.at(-1)?.type)).toEqual(['timer', 'coil']);

    // each step advances simulated time by 3 s: the 5 s preset is reached on the second
    const session = createSession(profile, networks, { stepDeltaMs: 3000, scheduler: { schedule: () => 0, cancel: () => {} } });
    session.runtime.loadProgram(toProgram(networks, profile));
    session.field.setInput(0, true);
    session.runtime.step();
    expect(session.memory.readBit('Q0.0')).toBe(false);
    session.runtime.step();
    expect(session.memory.readBit('Q0.0')).toBe(true);
  });

  it('latches with SR and lets reset win', () => {
    const draw = new Draw();
    const set = draw.add('input');
    const reset = draw.add('input');
    const sr = draw.add('sr');
    const out = draw.add('output');
    draw.wire(set, sr, 0);
    draw.wire(reset, sr, 1);
    draw.wire(sr, out, 0);
    const { networks } = compileFbd(draw.graph, profile);
    const session = createSession(profile, networks, { scheduler: { schedule: () => 0, cancel: () => {} } });
    session.runtime.loadProgram(toProgram(networks, profile));
    const scan = (s: boolean, r: boolean): boolean => {
      session.field.setInput(0, s);
      session.field.setInput(1, r);
      session.runtime.step();
      return session.memory.readBit('Q0.0');
    };
    expect(scan(true, false)).toBe(true);
    expect(scan(false, false)).toBe(true);
    expect(scan(true, true)).toBe(false);
    expect(scan(false, false)).toBe(false);
  });

  it('reports feedback loops and unconnected outputs', () => {
    const draw = new Draw();
    const a = draw.add('and');
    const n = draw.add('not');
    const out = draw.add('output');
    draw.wire(n, a, 0);
    draw.wire(a, n, 0);
    draw.wire(a, out, 0);
    const messages = compileFbd(draw.graph, profile).diagnostics.map((d) => d.message).join('|');
    expect(messages).toContain('Feedback loop');

    const empty = new Draw();
    empty.add('output');
    expect(compileFbd(empty.graph, profile).diagnostics[0]?.severity).toBe('warning');
  });
});
