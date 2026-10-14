// Fixed, validated symbol library (IEC 60617 / IEEE 315 look). All geometry is in GRID UNITS in the symbol's local
// frame (rot 0, no flip, origin = first terminal, y points down). Terminals sit on integer grid points.

import type { PartAttrs, PartType, Standard } from './types';
import type { Dim } from './values';

export type Seg =
  | ['M', number, number]
  | ['L', number, number]
  | ['Q', number, number, number, number]
  | ['T', number, number]
  | ['A', number, 0 | 1, number, number] // radius, sweep, x, y (circular, small arc)
  | ['Z'];

export type Fill = 'none' | 'black' | 'white';
export type SymPrim =
  | { k: 'line'; x1: number; y1: number; x2: number; y2: number; sw?: number }
  | { k: 'poly'; pts: [number, number][]; closed?: boolean; fill?: Fill }
  | { k: 'rect'; x: number; y: number; w: number; h: number; fill?: Fill }
  | { k: 'circle'; cx: number; cy: number; r: number; fill?: Fill }
  | { k: 'path'; d: Seg[]; fill?: Fill }
  | { k: 'text'; x: number; y: number; text: string; size?: number; anchor?: 'start' | 'middle' | 'end'; bold?: boolean };

export interface SymTerminal { name: string; x: number; y: number; optional?: boolean }
export interface BuiltSymbol {
  terminals: SymTerminal[];
  prims: SymPrim[];
  /** [x0,y0,x1,y1] footprint in grid units (zero-area allowed for points). */
  box: [number, number, number, number];
}
export interface BuildCtx { attrs: PartAttrs; std: Standard; value: string }

export interface SymbolDef {
  type: PartType;
  summary: string;
  analog: boolean;
  prefixes: string[];
  labelMode: 'full' | 'value' | 'none';
  unit: Dim | null;
  valueRequired: boolean;
  isolator?: boolean;
  attrKeys: string[];
  build(ctx: BuildCtx): BuiltSymbol;
}

// ---- primitive helpers ----
const ln = (x1: number, y1: number, x2: number, y2: number, sw?: number): SymPrim => ({ k: 'line', x1, y1, x2, y2, sw });
const pl = (pts: [number, number][], closed = false, fill: Fill = 'none'): SymPrim => ({ k: 'poly', pts, closed, fill });
const rc = (x: number, y: number, w: number, h: number, fill: Fill = 'none'): SymPrim => ({ k: 'rect', x, y, w, h, fill });
const ci = (cx: number, cy: number, r: number, fill: Fill = 'none'): SymPrim => ({ k: 'circle', cx, cy, r, fill });
const pa = (d: Seg[], fill: Fill = 'none'): SymPrim => ({ k: 'path', d, fill });
const tx = (x: number, y: number, text: string, size = 14, anchor: 'start' | 'middle' | 'end' = 'middle', bold = false): SymPrim => ({ k: 'text', x, y, text, size, anchor, bold });
/** Filled arrowhead whose tip is at (tx,ty) and which points along unit-ish direction (dx,dy). */
function ah(tipx: number, tipy: number, dx: number, dy: number, len = 0.4, hw = 0.17): SymPrim {
  const n = Math.hypot(dx, dy) || 1;
  const ux = dx / n, uy = dy / n;
  const bx = tipx - ux * len, by = tipy - uy * len;
  return pl([[tipx, tipy], [bx - uy * hw, by + ux * hw], [bx + uy * hw, by - ux * hw]], true, 'black');
}
const t = (name: string, x: number, y: number, optional?: boolean): SymTerminal => (optional ? { name, x, y, optional } : { name, x, y });

const SYMBOLS: SymbolDef[] = [];
function def(d: Omit<SymbolDef, 'attrKeys' | 'analog' | 'valueRequired' | 'labelMode' | 'unit' | 'prefixes'> & Partial<SymbolDef>): void {
  SYMBOLS.push({ analog: true, prefixes: [], labelMode: 'full', unit: null, valueRequired: false, attrKeys: [], ...d } as SymbolDef);
}

// ---- passives ----
def({
  type: 'resistor', summary: 'resistor (IEC box / IEEE zigzag)', prefixes: ['R'], unit: 'ohm', valueRequired: true,
  build: ({ std }) => ({
    terminals: [t('1', 0, 0), t('2', 4, 0)],
    prims: std === 'IEEE'
      ? [pl([[0, 0], [1, 0], [1.25, -0.5], [1.75, 0.5], [2.25, -0.5], [2.75, 0.5], [3, 0], [4, 0]])]
      : [ln(0, 0, 1, 0), rc(1, -0.5, 2, 1, 'white'), ln(3, 0, 4, 0)],
    box: [0, -0.5, 4, 0.5],
  }),
});
def({
  type: 'potentiometer', summary: 'potentiometer, wiper W above the body', prefixes: ['R', 'RV', 'VR', 'P'], unit: 'ohm', valueRequired: true,
  build: ({ std }) => ({
    terminals: [t('1', 0, 0), t('2', 4, 0), t('W', 2, -2)],
    prims: [
      ...(std === 'IEEE'
        ? [pl([[0, 0], [1, 0], [1.25, -0.5], [1.75, 0.5], [2.25, -0.5], [2.75, 0.5], [3, 0], [4, 0]])]
        : [ln(0, 0, 1, 0), rc(1, -0.5, 2, 1, 'white'), ln(3, 0, 4, 0)]),
      ln(2, -2, 2, -0.9), ah(2, -0.55, 0, 1, 0.45, 0.17),
    ],
    box: [0, -2, 4, 0.5],
  }),
});
def({
  type: 'capacitor', summary: 'capacitor', prefixes: ['C'], unit: 'F', valueRequired: true,
  build: () => ({
    terminals: [t('1', 0, 0), t('2', 3, 0)],
    prims: [ln(0, 0, 1.25, 0), ln(1.25, -0.75, 1.25, 0.75), ln(1.75, -0.75, 1.75, 0.75), ln(1.75, 0, 3, 0)],
    box: [0, -0.75, 3, 0.75],
  }),
});
def({
  type: 'polarized_capacitor', summary: 'polarized (electrolytic) capacitor; + is the first terminal', prefixes: ['C'], unit: 'F', valueRequired: true,
  build: () => ({
    terminals: [t('+', 0, 0), t('-', 3, 0)],
    prims: [ln(0, 0, 1.25, 0), ln(1.25, -0.75, 1.25, 0.75), pa([['M', 1.7, -0.75], ['Q', 2.1, 0, 1.7, 0.75]]), ln(1.9, 0, 3, 0), tx(0.55, -0.55, '+', 14, 'middle', true)],
    box: [0, -0.95, 3, 0.75],
  }),
});
def({
  type: 'inductor', summary: 'inductor (4 arcs)', prefixes: ['L'], unit: 'H', valueRequired: true,
  build: () => {
    const d: Seg[] = [['M', 0, 0], ['L', 0.4, 0]];
    for (let i = 0; i < 4; i++) d.push(['A', 0.4, 1, 0.4 + 0.8 * (i + 1), 0]);
    d.push(['L', 4, 0]);
    return { terminals: [t('1', 0, 0), t('2', 4, 0)], prims: [pa(d)], box: [0, -0.4, 4, 0.4] };
  },
});
def({
  type: 'transformer', summary: 'transformer: primary P1,P2 left, secondary S1,S2 right (isolator)', prefixes: ['T'], isolator: true,
  build: () => {
    const left: Seg[] = [['M', 1.5, 0]];
    const right: Seg[] = [['M', 2.5, 0]];
    for (let i = 1; i <= 4; i++) { left.push(['A', 0.5, 0, 1.5, i]); right.push(['A', 0.5, 1, 2.5, i]); }
    return {
      terminals: [t('P1', 0, 0), t('P2', 0, 4), t('S1', 4, 0), t('S2', 4, 4)],
      prims: [ln(0, 0, 1.5, 0), ln(0, 4, 1.5, 4), ln(2.5, 0, 4, 0), ln(2.5, 4, 4, 4), pa(left), pa(right), ln(1.8, 0, 1.8, 4), ln(2.2, 0, 2.2, 4), ci(0.7, 0.45, 0.12, 'black'), ci(3.3, 0.45, 0.12, 'black')],
      box: [0, 0, 4, 4],
    };
  },
});

// ---- sources ----
def({
  type: 'vsource', summary: 'DC voltage source; + is the first terminal', prefixes: ['V'], unit: 'V', valueRequired: true,
  build: () => ({
    terminals: [t('+', 0, 0), t('-', 4, 0)],
    prims: [ln(0, 0, 1, 0), ci(2, 0, 1, 'white'), ln(3, 0, 4, 0), tx(1.5, 0, '+', 18), tx(2.5, 0, '−', 18)],
    box: [0, -1, 4, 1],
  }),
});
def({
  type: 'vsource_ac', summary: 'AC (sine) voltage source', prefixes: ['V', 'AC'], unit: 'V', valueRequired: true,
  build: () => ({
    terminals: [t('1', 0, 0), t('2', 4, 0)],
    prims: [ln(0, 0, 1, 0), ci(2, 0, 1, 'white'), ln(3, 0, 4, 0), pa([['M', 1.4, 0], ['Q', 1.7, -0.8, 2, 0], ['T', 2.6, 0]])],
    box: [0, -1, 4, 1],
  }),
});
def({
  type: 'isource', summary: 'ideal current source; arrow points from terminal 1 to 2', prefixes: ['I'], unit: 'A', valueRequired: true,
  build: () => ({
    terminals: [t('1', 0, 0), t('2', 4, 0)],
    prims: [ln(0, 0, 1, 0), ci(2, 0, 1, 'white'), ln(3, 0, 4, 0), ln(1.3, 0, 2.3, 0), ah(2.7, 0, 1, 0, 0.5, 0.2)],
    box: [0, -1, 4, 1],
  }),
});
def({
  type: 'battery', summary: 'battery cell; + (long plate) is the first terminal', prefixes: ['B', 'V', 'BT'], unit: 'V', valueRequired: true,
  build: () => ({
    terminals: [t('+', 0, 0), t('-', 3, 0)],
    prims: [ln(0, 0, 1.25, 0), ln(1.25, -0.8, 1.25, 0.8), ln(1.75, -0.4, 1.75, 0.4, 4), ln(1.75, 0, 3, 0), tx(0.55, -0.55, '+', 14, 'middle', true)],
    box: [0, -0.95, 3, 0.9],
  }),
});

// ---- reference / net symbols ----
def({
  type: 'ground', summary: 'earth/ground reference (node 0), terminal at top', labelMode: 'none',
  build: () => ({
    terminals: [t('G', 0, 0)],
    prims: [ln(0, 0, 0, 1), ln(-0.75, 1, 0.75, 1), ln(-0.5, 1.3, 0.5, 1.3), ln(-0.25, 1.6, 0.25, 1.6)],
    box: [-0.75, 0, 0.75, 1.6],
  }),
});
def({
  type: 'rail', summary: 'DC supply rail T-symbol; value = voltage; same value = same net', labelMode: 'value', unit: 'V', valueRequired: true,
  build: () => ({
    terminals: [t('V', 0, 0)],
    prims: [ln(0, 0, 0, -1), ln(-0.75, -1, 0.75, -1)],
    box: [-0.75, -1, 0.75, 0],
  }),
});
def({
  type: 'port', summary: 'open port (named net, open circle); value = net name', labelMode: 'value', valueRequired: true,
  build: () => ({ terminals: [t('P', 0, 0)], prims: [ci(0, 0, 0.2, 'white')], box: [0, 0, 0, 0] }),
});
def({
  type: 'junction', summary: 'forced junction dot (no terminals)', labelMode: 'none', analog: false,
  build: () => ({ terminals: [], prims: [], box: [0, 0, 0, 0] }),
});

// ---- diodes ----
function diode(type: PartType, summary: string, bar: SymPrim, extra: SymPrim[] = [], top = -0.5): void {
  def({
    type, summary, prefixes: type === 'led' ? ['D', 'LED'] : type === 'zener' ? ['D', 'Z'] : ['D'],
    build: () => ({
      terminals: [t('A', 0, 0), t('K', 3, 0)],
      prims: [ln(0, 0, 1, 0), pl([[1, -0.5], [1, 0.5], [2, 0]], true, 'white'), bar, ln(2, 0, 3, 0), ...extra],
      box: [0, top, 3, 0.5],
    }),
  });
}
diode('diode', 'diode, A=anode K=cathode (bar)', ln(2, -0.5, 2, 0.5));
diode('zener', 'zener diode', pl([[1.75, -0.5], [2, -0.5], [2, 0.5], [2.25, 0.5]]));
diode('schottky', 'Schottky diode', pl([[1.75, -0.25], [1.75, -0.5], [2, -0.5], [2, 0.5], [2.25, 0.5], [2.25, 0.25]]));
diode('led', 'light-emitting diode', ln(2, -0.5, 2, 0.5), [
  ln(1.1, -0.7, 1.6, -1.2), ah(1.75, -1.35, 1, -1, 0.4, 0.15),
  ln(1.6, -0.55, 2.1, -1.05), ah(2.25, -1.2, 1, -1, 0.4, 0.15),
], -1.4);

// ---- switches ----
def({
  type: 'switch', summary: 'SPST switch; attrs.state open|closed, attrs.control e.g. "PWM"', prefixes: ['S', 'SW', 'K'], attrKeys: ['state', 'control'],
  build: ({ attrs }) => ({
    terminals: [t('1', 0, 0), t('2', 4, 0)],
    prims: [ln(0, 0, 1, 0), ln(3, 0, 4, 0), ci(1, 0, 0.15, 'black'), ci(3, 0, 0.15, 'black'),
      attrs.state === 'closed' ? ln(1, 0, 3, 0) : ln(1, 0, 2.8, -0.85)],
    box: [0, -1, 4, 0.2],
  }),
});
def({
  type: 'switch_spdt', summary: 'SPDT switch C common, 1 upper throw, 2 lower; attrs.state "1"|"2"', prefixes: ['S', 'SW', 'K'], attrKeys: ['state', 'control'],
  build: ({ attrs }) => ({
    terminals: [t('C', 0, 0), t('1', 4, -1), t('2', 4, 1)],
    prims: [ln(0, 0, 1, 0), ln(3, -1, 4, -1), ln(3, 1, 4, 1), ci(1, 0, 0.15, 'black'), ci(3, -1, 0.15, 'black'), ci(3, 1, 0.15, 'black'),
      attrs.state === '2' ? ln(1, 0, 3, 1) : ln(1, 0, 3, -1)],
    box: [0, -1, 4, 1],
  }),
});

// ---- transistors ----
function bjt(type: 'npn' | 'pnp', nobase = false): BuiltSymbol {
  const emitter: SymPrim[] = [ln(1, 0.5, 2, 1.5), ln(2, 1.5, 2, 2)];
  const arrow = type === 'npn' ? ah(1.85, 1.35, 1, 1, 0.4, 0.17) : ah(1.15, 0.65, -1, -1, 0.4, 0.17);
  return {
    terminals: [t('B', 0, 0), t('C', 2, -2), t('E', 2, 2)],
    prims: [...(nobase ? [] : [ln(0, 0, 1, 0)]), ln(1, -1, 1, 1), ln(1, -0.5, 2, -1.5), ln(2, -1.5, 2, -2), ...emitter, arrow],
    box: [0, -2, 2, 2],
  };
}
def({ type: 'npn', summary: 'NPN BJT (arrow out of emitter)', prefixes: ['Q'], build: () => bjt('npn') });
def({ type: 'pnp', summary: 'PNP BJT (arrow into base)', prefixes: ['Q'], build: () => bjt('pnp') });

function mos(type: 'nmos' | 'pmos', bodyDiode: boolean): BuiltSymbol {
  const n = type === 'nmos';
  const prims: SymPrim[] = [
    ln(0, 0, 0.8, 0), ln(0.8, -0.8, 0.8, 0.8),
    ln(1.1, -1, 1.1, -0.6), ln(1.1, -0.3, 1.1, 0.3), ln(1.1, 0.6, 1.1, 1),
    pl([[1.1, -0.8], [2, -0.8], [2, -2]]), pl([[1.1, 0.8], [2, 0.8], [2, 2]]),
    pl([[1.1, 0], [2, 0], [2, 0.8]]),
    n ? ah(1.1, 0, -1, 0, 0.4, 0.17) : ah(1.75, 0, 1, 0, 0.4, 0.17),
  ];
  let right = 2;
  if (bodyDiode) {
    const up = n; // nmos: anode at source (bottom) conducting up to drain
    prims.push(pl([[2, -1.4], [3, -1.4], [3, -0.3]]), pl([[3, 0.3], [3, 1.4], [2, 1.4]]), ci(2, -1.4, 0.15, 'black'), ci(2, 1.4, 0.15, 'black'));
    prims.push(up ? pl([[2.6, 0.3], [3.4, 0.3], [3, -0.3]], true, 'white') : pl([[2.6, -0.3], [3.4, -0.3], [3, 0.3]], true, 'white'));
    prims.push(up ? ln(2.6, -0.3, 3.4, -0.3) : ln(2.6, 0.3, 3.4, 0.3));
    right = 3.4;
  }
  return { terminals: [t('G', 0, 0), t('D', 2, -2), t('S', 2, 2)], prims, box: [0, -2, right, 2] };
}
def({ type: 'nmos', summary: 'N-channel enhancement MOSFET; attrs.body_diode', prefixes: ['M', 'Q'], attrKeys: ['body_diode'], build: ({ attrs }) => mos('nmos', attrs.body_diode === true) });
def({ type: 'pmos', summary: 'P-channel enhancement MOSFET; attrs.body_diode', prefixes: ['M', 'Q'], attrKeys: ['body_diode'], build: ({ attrs }) => mos('pmos', attrs.body_diode === true) });
def({
  type: 'igbt', summary: 'IGBT (insulated gate, collector/emitter)', prefixes: ['Q', 'M'],
  build: () => ({
    terminals: [t('G', 0, 0), t('C', 2, -2), t('E', 2, 2)],
    prims: [ln(0, 0, 0.6, 0), ln(0.6, -0.9, 0.6, 0.9), ln(1, -1, 1, 1), ln(1, -0.5, 2, -1.5), ln(2, -1.5, 2, -2), ln(1, 0.5, 2, 1.5), ln(2, 1.5, 2, 2), ah(1.85, 1.35, 1, 1, 0.4, 0.17)],
    box: [0, -2, 2, 2],
  }),
});

// ---- op-amp / optocoupler ----
def({
  type: 'opamp', summary: 'op-amp; attrs.supply adds V+ (top) and V- (bottom)', prefixes: ['U'], attrKeys: ['supply'],
  build: ({ attrs }) => {
    const sup = attrs.supply === true;
    const terminals = [t('IN-', 0, 0), t('IN+', 0, 2), t('OUT', 6, 1)];
    const prims: SymPrim[] = [ln(0, 0, 1, 0), ln(0, 2, 1, 2), ln(5, 1, 6, 1), pl([[1, -0.5], [1, 2.5], [5, 1]], true, 'white'), tx(1.55, 0, '−', 16), tx(1.55, 2, '+', 16)];
    if (sup) {
      terminals.push(t('V+', 3, -1), t('V-', 3, 3));
      prims.push(ln(3, -1, 3, 0.25), ln(3, 1.75, 3, 3));
    }
    return { terminals, prims, box: sup ? [0, -1, 6, 3] : [0, -0.5, 6, 2.5] };
  },
});
def({
  type: 'optocoupler', summary: 'optocoupler: input A,K (left), output C,E (right) (isolator)', prefixes: ['U', 'OK'], isolator: true,
  build: () => {
    const q = bjt('npn', true);
    const shift = (p: SymPrim): SymPrim => {
      const dx = 3.5, dy = 2;
      switch (p.k) {
        case 'line': return { ...p, x1: p.x1 + dx, y1: p.y1 + dy, x2: p.x2 + dx, y2: p.y2 + dy };
        case 'poly': return { ...p, pts: p.pts.map(([x, y]) => [x + dx, y + dy] as [number, number]) };
        default: return p;
      }
    };
    return {
      terminals: [t('A', 0, 0), t('K', 0, 4), t('C', 7, 0), t('E', 7, 4)],
      prims: [
        rc(1, -0.5, 5, 5), pl([[0, 0], [2, 0], [2, 0.5]]), pl([[2, 3.5], [2, 4], [0, 4]]),
        pl([[1.5, 0.5], [2.5, 0.5], [2, 1.5]], true, 'white'), ln(1.5, 1.5, 2.5, 1.5), ln(2, 1.5, 2, 3.5),
        ah(3.1, 0.9, 1, 0, 0.35, 0.14), ln(2.5, 0.9, 3.1, 0.9), ah(3.1, 1.5, 1, 0, 0.35, 0.14), ln(2.5, 1.5, 3.1, 1.5),
        ...q.prims.map(shift),
        ln(5.5, 0, 7, 0), ln(5.5, 4, 7, 4),
      ],
      box: [0, -0.5, 7, 4.5],
    };
  },
});

// ---- control blocks ----
def({
  type: 'block', summary: 'transfer-function block; attrs.w,h (grid, h even); value = text; ports in (left-centre), out (right-centre)',
  analog: false, labelMode: 'none', valueRequired: true, attrKeys: ['w', 'h'],
  build: ({ attrs, value }) => {
    const w = attrs.w ?? 4, h = attrs.h ?? 2;
    return {
      terminals: [t('in', 0, 0), t('out', w, 0)],
      prims: [rc(0, -h / 2, w, h, 'white'), tx(w / 2, 0, value, 14)],
      box: [0, -h / 2, w, h / 2],
    };
  },
});
def({
  type: 'sum', summary: 'summing junction; ports W,N,E,S (all optional); attrs.signs {"W":"+","S":"-"}',
  analog: false, labelMode: 'none', attrKeys: ['signs'],
  build: ({ attrs }) => {
    const prims: SymPrim[] = [ci(1, 0, 1, 'white'), ln(0.3, -0.7, 1.7, 0.7), ln(0.3, 0.7, 1.7, -0.7)];
    const pos: Record<string, [number, number]> = { W: [-0.5, -0.6], N: [1.6, -1.4], E: [2.5, -0.6], S: [1.6, 1.5] };
    for (const key of ['W', 'N', 'E', 'S'] as const) {
      const s = attrs.signs?.[key];
      if (s) prims.push(tx(pos[key][0], pos[key][1], s, 20, 'middle', true));
    }
    return { terminals: [t('W', 0, 0, true), t('N', 1, -1, true), t('E', 2, 0, true), t('S', 1, 1, true)], prims, box: [0, -1, 2, 1] };
  },
});
def({
  type: 'gain', summary: 'gain triangle (value text inside); ports in, out', analog: false, labelMode: 'none', valueRequired: true,
  build: ({ value }) => ({
    terminals: [t('in', 0, 0), t('out', 5, 0)],
    prims: [ln(0, 0, 1, 0), pl([[1, -1.5], [1, 1.5], [4, 0]], true, 'white'), ln(4, 0, 5, 0), tx(1.85, 0, value, 14)],
    box: [0, -1.5, 5, 1.5],
  }),
});

// ---- logic gates (IEEE distinctive) ----
function gate(kind: 'and' | 'or' | 'xor', bubble: boolean): BuiltSymbol {
  const prims: SymPrim[] = [];
  let lead = 1;
  if (kind === 'and') {
    prims.push(pa([['M', 1, -0.5], ['L', 2.5, -0.5], ['A', 1.5, 1, 2.5, 2.5], ['L', 1, 2.5], ['Z']], 'white'));
  } else {
    prims.push({ k: 'path', fill: 'white', d: [['M', 1, -0.5], ['L', 1.6, -0.5], ['Q', 3.4, -0.4, 4, 1], ['Q', 3.4, 2.4, 1.6, 2.5], ['L', 1, 2.5], ['Q', 1.7, 1, 1, -0.5], ['Z']] });
    lead = 1.2;
    if (kind === 'xor') { prims.push(pa([['M', 0.7, 2.5], ['Q', 1.4, 1, 0.7, -0.5]])); lead = 0.9; }
  }
  const outX = bubble ? 4.4 : 4;
  if (bubble) prims.push(ci(4.2, 1, 0.2, 'white'));
  prims.push(ln(0, 0, lead, 0), ln(0, 2, lead, 2), ln(outX, 1, 5, 1));
  return { terminals: [t('A', 0, 0), t('B', 0, 2), t('Y', 5, 1)], prims, box: [0, -0.5, 5, 2.5] };
}
const GATES: [PartType, 'and' | 'or' | 'xor', boolean, string][] = [
  ['and', 'and', false, 'AND gate'], ['nand', 'and', true, 'NAND gate'],
  ['or', 'or', false, 'OR gate'], ['nor', 'or', true, 'NOR gate'],
  ['xor', 'xor', false, 'XOR gate'], ['xnor', 'xor', true, 'XNOR gate'],
];
for (const [type, kind, bubble, name] of GATES) {
  def({ type, summary: `${name}: inputs A,B output Y`, analog: false, prefixes: ['U', 'G'], build: () => gate(kind, bubble) });
}
function inverter(bubble: boolean): BuiltSymbol {
  const prims: SymPrim[] = [ln(0, 0, 1, 0), pl([[1, -1], [1, 1], [3, 0]], true, 'white')];
  if (bubble) prims.push(ci(3.2, 0, 0.2, 'white'), ln(3.4, 0, 4, 0));
  else prims.push(ln(3, 0, 4, 0));
  return { terminals: [t('A', 0, 0), t('Y', 4, 0)], prims, box: [0, -1, 4, 1] };
}
def({ type: 'not', summary: 'inverter: A -> Y', analog: false, prefixes: ['U', 'G'], build: () => inverter(true) });
def({ type: 'buffer', summary: 'buffer: A -> Y', analog: false, prefixes: ['U', 'G'], build: () => inverter(false) });
def({
  type: 'dff', summary: 'D flip-flop: D, CLK left; Q, QN right (QN optional)', analog: false, prefixes: ['U', 'FF'],
  build: () => ({
    terminals: [t('D', 0, 0), t('CLK', 0, 2), t('Q', 6, 0), t('QN', 6, 2, true)],
    prims: [rc(1, -1, 4, 4, 'white'), ln(0, 0, 1, 0), ln(0, 2, 1, 2), ln(5, 0, 6, 0), ln(5, 2, 5.4, 2), ci(5.2, 2, 0.2, 'white'), ln(5.4, 2, 6, 2),
      pl([[1, 1.65], [1.5, 2], [1, 2.35]]), tx(1.35, 0, 'D', 14, 'start'), tx(4.65, 0, 'Q', 14, 'end')],
    box: [0, -1, 6, 3],
  }),
});

export const SYMBOL_LIST: readonly SymbolDef[] = SYMBOLS;
const BY_TYPE = new Map<string, SymbolDef>(SYMBOLS.map((s) => [s.type, s]));
export function getSymbol(type: string): SymbolDef | undefined {
  return BY_TYPE.get(type);
}
