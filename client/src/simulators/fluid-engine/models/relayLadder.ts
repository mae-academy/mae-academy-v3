/**
 * Electro-pneumatic relay ladder (DIN EN 61082-1 / Festo current-path diagram): a +24 V rail on top, a 0 V rail below and
 * vertical current paths between them. Each path is a series of condition groups (sensors, pushbuttons, relay and timer
 * contacts; the elements of one group are in parallel, so groups are AND and the members of a group are OR) that feeds a
 * single load at the bottom, next to the 0 V rail: a relay coil, a valve solenoid or a timer coil.
 *
 * Everything here is pure. The solver is a relay scan: contacts see the coil states of the previous pass, and a tick is
 * repeated until the relays settle, so self-holding and chained relays behave like real hardware within one tick.
 */

export const CONDITION_KINDS = ['sensor', 'pushbutton', 'relayContact', 'timerContact'] as const;
export const LOAD_KINDS = ['relayCoil', 'solenoid', 'timerCoil'] as const;
export type ConditionKind = (typeof CONDITION_KINDS)[number];
export type LoadKind = (typeof LOAD_KINDS)[number];
export type LadderElementKind = ConditionKind | LoadKind;

export const isConditionKind = (kind: unknown): kind is ConditionKind => (CONDITION_KINDS as readonly unknown[]).includes(kind);
export const isLoadKind = (kind: unknown): kind is LoadKind => (LOAD_KINDS as readonly unknown[]).includes(kind);

export type ContactForm = 'NO' | 'NC';
export type TimerMode = 'on' | 'off';

export interface LadderElement {
  id: string;
  kind: LadderElementKind;
  /** Designation drawn beside the symbol: 1B1, S5, K1, KT1, 1Y1. Matched case-insensitively. */
  tag: string;
  /** Optional description drawn under the tag ("START"). */
  caption?: string;
  /** Contacts: normally open or normally closed. Defaults to NO. */
  form?: ContactForm;
  /** Pushbuttons: a detented (maintained) switch instead of a momentary one. */
  detent?: boolean;
  /** Timer coils: delay in seconds. */
  delay?: number;
  /** Timer coils: on-delay (contact closes after the delay) or off-delay (contact opens after the delay). */
  mode?: TimerMode;
}

export interface LadderPath {
  id: string;
  /** Series (AND) of parallel (OR) groups, from the +24 V rail down to the load. */
  conditions: LadderElement[][];
  load: LadderElement | null;
}

export interface LadderCircuit { paths: LadderPath[] }

export const EMPTY_LADDER: LadderCircuit = { paths: [] };
export const DEFAULT_TIMER_DELAY = 2;

export const tagKey = (tag: string): string => tag.replace(/\$/g, '').trim().toLowerCase();

/* ───────────────────────── Editing (immutable) ───────────────────────── */

let counter = 0;
/** Ids only have to be unique within a document; a counter plus a random part survives loading saved files. */
export const newLadderId = (prefix: string): string => `${prefix}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const newPath = (): LadderPath => ({ id: newLadderId('p'), conditions: [], load: null });

export function makeElement(kind: LadderElementKind, tag: string, options: Partial<Omit<LadderElement, 'id' | 'kind' | 'tag'>> = {}): LadderElement {
  const element: LadderElement = { id: newLadderId('e'), kind, tag, ...options };
  if (isConditionKind(kind)) element.form ??= 'NO';
  if (kind === 'timerCoil') {
    element.mode ??= 'on';
    element.delay ??= DEFAULT_TIMER_DELAY;
  }
  return element;
}

const mapPath = (circuit: LadderCircuit, pathId: string, change: (path: LadderPath) => LadderPath): LadderCircuit => ({
  paths: circuit.paths.map(path => (path.id === pathId ? change(path) : path)),
});

export const addPath = (circuit: LadderCircuit): LadderCircuit => ({ paths: [...circuit.paths, newPath()] });
export const removePath = (circuit: LadderCircuit, pathId: string): LadderCircuit => ({ paths: circuit.paths.filter(path => path.id !== pathId) });

/** Adds a condition below the last one of the path (series / AND). */
export const addSeries = (circuit: LadderCircuit, pathId: string, element: LadderElement): LadderCircuit =>
  mapPath(circuit, pathId, path => ({ ...path, conditions: [...path.conditions, [element]] }));

/** Adds a condition beside the elements of one group (parallel / OR). */
export const addParallel = (circuit: LadderCircuit, pathId: string, group: number, element: LadderElement): LadderCircuit =>
  mapPath(circuit, pathId, path => ({ ...path, conditions: path.conditions.map((members, index) => (index === group ? [...members, element] : members)) }));

export const setLoad = (circuit: LadderCircuit, pathId: string, element: LadderElement | null): LadderCircuit =>
  mapPath(circuit, pathId, path => ({ ...path, load: element }));

export function findElement(circuit: LadderCircuit, elementId: string): LadderElement | undefined {
  for (const path of circuit.paths) {
    if (path.load?.id === elementId) return path.load;
    for (const group of path.conditions) for (const element of group) if (element.id === elementId) return element;
  }
  return undefined;
}

export const updateElement = (circuit: LadderCircuit, elementId: string, patch: Partial<Omit<LadderElement, 'id' | 'kind'>>): LadderCircuit => ({
  paths: circuit.paths.map(path => ({
    ...path,
    conditions: path.conditions.map(group => group.map(element => (element.id === elementId ? { ...element, ...patch } : element))),
    load: path.load?.id === elementId ? { ...path.load, ...patch } : path.load,
  })),
});

export const removeElement = (circuit: LadderCircuit, elementId: string): LadderCircuit => ({
  paths: circuit.paths.map(path => ({
    ...path,
    conditions: path.conditions.map(group => group.filter(element => element.id !== elementId)).filter(group => group.length > 0),
    load: path.load?.id === elementId ? null : path.load,
  })),
});

/** Every element of the circuit, in path order, conditions before load. */
export const elementsOf = (circuit: LadderCircuit): LadderElement[] =>
  circuit.paths.flatMap(path => [...path.conditions.flat(), ...(path.load ? [path.load] : [])]);

/* ───────────────────────── Cross references ───────────────────────── */

export interface CrossReference {
  /** 1-based number of the current path holding the coil. */
  pathNumber: number;
  tag: string;
  /** Path numbers where a normally-open contact of this relay is used. */
  no: number[];
  /** Path numbers where a normally-closed contact of this relay is used. */
  nc: number[];
}

/** For each relay or timer coil, the paths that use its make (NO) and break (NC) contacts: the table under the 0 V rail. */
export function crossReferences(circuit: LadderCircuit): CrossReference[] {
  const references: CrossReference[] = [];
  circuit.paths.forEach((path, index) => {
    const coil = path.load;
    if (!coil || (coil.kind !== 'relayCoil' && coil.kind !== 'timerCoil')) return;
    const contactKind: ConditionKind = coil.kind === 'relayCoil' ? 'relayContact' : 'timerContact';
    const used = (form: ContactForm) => circuit.paths.flatMap((other, otherIndex) => (
      other.conditions.flat().some(element => element.kind === contactKind && tagKey(element.tag) === tagKey(coil.tag) && (element.form ?? 'NO') === form) ? [otherIndex + 1] : []
    ));
    references.push({ pathNumber: index + 1, tag: coil.tag, no: used('NO'), nc: used('NC') });
  });
  return references;
}

/* ───────────────────────── Solver ───────────────────────── */

export interface LadderInputs {
  /** Sensor signals by lower-cased tag (a limit switch made = true). */
  sensors: Record<string, boolean>;
  /** Pushbuttons currently operated (held, or latched when detented) by lower-cased tag. */
  pressed: Record<string, boolean>;
}

export interface TimerState {
  /** Seconds counted towards the delay. */
  elapsed: number;
  /** State of the timed contact's actuator: true once an on-delay timer elapsed, true until an off-delay timer elapsed. */
  out: boolean;
}

export interface LadderState {
  /** Relay coils energised, by lower-cased tag. */
  relays: Record<string, boolean>;
  timers: Record<string, TimerState>;
}

export const EMPTY_LADDER_STATE: LadderState = { relays: {}, timers: {} };

export interface ElementStatus {
  /** +24 V reaches the element's top terminal. */
  live: boolean;
  /** Contacts: the element passes current. Loads: the load is energised. */
  closed: boolean;
}

export interface PathStatus {
  /** Current reaches the top of each condition group. */
  groupLive: boolean[];
  /** Each condition group passes current. */
  groupClosed: boolean[];
  /** The whole path conducts: its load is energised. */
  energised: boolean;
}

export interface LadderResult {
  state: LadderState;
  elements: Record<string, ElementStatus>;
  paths: Record<string, PathStatus>;
  /** Solenoids energised, by lower-cased tag. */
  solenoids: Record<string, boolean>;
}

const isTimerCoil = (element: LadderElement) => element.kind === 'timerCoil';

function contactClosed(element: LadderElement, inputs: LadderInputs, state: LadderState): boolean {
  const key = tagKey(element.tag);
  const actuated = element.kind === 'sensor' ? Boolean(inputs.sensors[key])
    : element.kind === 'pushbutton' ? Boolean(inputs.pressed[key])
      : element.kind === 'relayContact' ? Boolean(state.relays[key])
        : Boolean(state.timers[key]?.out);
  return (element.form ?? 'NO') === 'NO' ? actuated : !actuated;
}

/** Evaluates every path against the given state: which elements conduct and which loads are energised. */
function evaluate(circuit: LadderCircuit, inputs: LadderInputs, state: LadderState): Omit<LadderResult, 'state'> & { energised: Record<string, boolean> } {
  const elements: Record<string, ElementStatus> = {};
  const paths: Record<string, PathStatus> = {};
  const energised: Record<string, boolean> = {};
  const solenoids: Record<string, boolean> = {};
  for (const path of circuit.paths) {
    let live = true;
    const groupLive: boolean[] = [];
    const groupClosed: boolean[] = [];
    for (const group of path.conditions) {
      groupLive.push(live);
      let any = false;
      for (const element of group) {
        const closed = contactClosed(element, inputs, state);
        elements[element.id] = { live, closed };
        any ||= closed;
      }
      groupClosed.push(any);
      live &&= any;
    }
    const on = live && path.load !== null;
    paths[path.id] = { groupLive, groupClosed, energised: on };
    if (path.load) {
      elements[path.load.id] = { live, closed: on };
      const key = tagKey(path.load.tag);
      energised[`${path.load.kind}:${key}`] = Boolean(energised[`${path.load.kind}:${key}`]) || on;
      if (path.load.kind === 'solenoid') solenoids[key] = Boolean(solenoids[key]) || on;
    }
  }
  return { elements, paths, solenoids, energised };
}

/** One relay scan pass: advances timers by `dt` and returns the coil states the evaluated paths demand. */
function pass(circuit: LadderCircuit, inputs: LadderInputs, previous: LadderState, dt: number): { state: LadderState; view: ReturnType<typeof evaluate> } {
  const view = evaluate(circuit, inputs, previous);
  const relays: Record<string, boolean> = {};
  for (const [key, on] of Object.entries(view.energised)) if (key.startsWith('relayCoil:')) relays[key.slice('relayCoil:'.length)] = on;

  const timers: Record<string, TimerState> = {};
  for (const path of circuit.paths) {
    const coil = path.load;
    if (!coil || !isTimerCoil(coil)) continue;
    const key = tagKey(coil.tag);
    if (key in timers) continue;
    const delay = Math.max(0, coil.delay ?? DEFAULT_TIMER_DELAY);
    const on = Boolean(view.energised[`timerCoil:${key}`]);
    const before = previous.timers[key] ?? { elapsed: 0, out: false };
    if (coil.mode === 'off') {
      if (on) timers[key] = { elapsed: 0, out: true };
      else if (before.out) {
        const elapsed = before.elapsed + dt;
        timers[key] = { elapsed, out: elapsed < delay };
      } else timers[key] = { elapsed: 0, out: false };
    } else if (on) {
      const elapsed = Math.min(delay, before.elapsed + dt);
      timers[key] = { elapsed, out: elapsed >= delay };
    } else timers[key] = { elapsed: 0, out: false };
  }
  return { state: { relays, timers }, view };
}

const MAX_SETTLE_PASSES = 16;
const sameState = (a: LadderState, b: LadderState): boolean => {
  const same = <T>(x: Record<string, T>, y: Record<string, T>, equal: (p: T, q: T) => boolean) => {
    const keys = Array.from(new Set([...Object.keys(x), ...Object.keys(y)]));
    for (const key of keys) if (!(key in x) || !(key in y) || !equal(x[key], y[key])) return false;
    return true;
  };
  return same(a.relays, b.relays, (p, q) => p === q) && same(a.timers, b.timers, (p, q) => p.out === q.out && p.elapsed === q.elapsed);
};

/**
 * Advances the circuit by `dt` seconds of simulated time. The first pass counts time; further passes (dt = 0) let chained
 * relays and self-holding paths settle. A circuit that never settles (a relay interrupting its own coil, a buzzer) falls
 * back to one pass per tick, as a real scan would.
 */
export function stepLadder(circuit: LadderCircuit, inputs: LadderInputs, previous: LadderState, dt: number): LadderResult {
  const first = pass(circuit, inputs, previous, dt);
  let current = first;
  for (let round = 0; round < MAX_SETTLE_PASSES; round++) {
    const next = pass(circuit, inputs, current.state, 0);
    // Elapsed time only counts in the first pass; the state is stable once nothing changes any more.
    if (sameState(next.state, current.state)) {
      const settled = evaluate(circuit, inputs, next.state);
      return { state: next.state, elements: settled.elements, paths: settled.paths, solenoids: settled.solenoids };
    }
    current = next;
  }
  const fallback = evaluate(circuit, inputs, first.state);
  return { state: first.state, elements: fallback.elements, paths: fallback.paths, solenoids: fallback.solenoids };
}

/** The circuit with nothing running: every relay released, every timer reset, no current anywhere beyond the open contacts. */
export function idleLadder(circuit: LadderCircuit, inputs: LadderInputs = { sensors: {}, pressed: {} }): LadderResult {
  return stepLadder(circuit, inputs, EMPTY_LADDER_STATE, 0);
}

/* ───────────────────────── Persistence ───────────────────────── */

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

function sanitizeElement(raw: unknown, wanted: 'condition' | 'load'): LadderElement | null {
  if (!isRecord(raw) || typeof raw.id !== 'string' || typeof raw.tag !== 'string') return null;
  if (wanted === 'condition' ? !isConditionKind(raw.kind) : !isLoadKind(raw.kind)) return null;
  const element: LadderElement = { id: raw.id, kind: raw.kind as LadderElementKind, tag: raw.tag };
  if (typeof raw.caption === 'string' && raw.caption !== '') element.caption = raw.caption;
  if (raw.form === 'NO' || raw.form === 'NC') element.form = raw.form;
  if (raw.detent === true) element.detent = true;
  if (typeof raw.delay === 'number' && Number.isFinite(raw.delay) && raw.delay >= 0) element.delay = raw.delay;
  if (raw.mode === 'on' || raw.mode === 'off') element.mode = raw.mode;
  return element;
}

/** Reads a saved ladder; anything malformed is dropped rather than failing the whole project. */
export function sanitizeLadder(raw: unknown): LadderCircuit {
  if (!isRecord(raw) || !Array.isArray(raw.paths)) return EMPTY_LADDER;
  const paths = raw.paths.flatMap((entry): LadderPath[] => {
    if (!isRecord(entry) || typeof entry.id !== 'string') return [];
    const groups = Array.isArray(entry.conditions) ? entry.conditions : [];
    const conditions = groups.flatMap((group): LadderElement[][] => {
      const members = (Array.isArray(group) ? group : []).flatMap(item => sanitizeElement(item, 'condition') ?? []);
      return members.length > 0 ? [members] : [];
    });
    return [{ id: entry.id, conditions, load: sanitizeElement(entry.load, 'load') }];
  });
  return { paths };
}

/* ───────────────────────── Default designations ───────────────────────── */

const PREFIX: Record<LadderElementKind, string> = { sensor: 'B', pushbutton: 'S', relayContact: 'K', timerContact: 'KT', relayCoil: 'K', solenoid: 'Y', timerCoil: 'KT' };

/**
 * Next free designation for a new element: sensors continue 1B1, 1B2 …, pushbuttons S1, S2 …, relays K1 …, solenoids 1Y1 …,
 * timers KT1 …. Contacts default to the coil they most plausibly belong to (the first relay or timer in the circuit).
 */
export function suggestTag(circuit: LadderCircuit, kind: LadderElementKind, preferred: string[] = []): string {
  const taken = new Set(elementsOf(circuit).filter(element => element.kind === kind).map(element => tagKey(element.tag)));
  if (kind === 'relayContact' || kind === 'timerContact') {
    const coils = elementsOf(circuit).filter(element => element.kind === (kind === 'relayContact' ? 'relayCoil' : 'timerCoil'));
    return coils[0]?.tag ?? (kind === 'relayContact' ? 'K1' : 'KT1');
  }
  const free = (candidate: string) => !taken.has(tagKey(candidate));
  const known = preferred.find(free);
  if (known) return known;
  const circuitNumber = kind === 'sensor' || kind === 'solenoid' ? '1' : '';
  for (let n = 1; n < 1000; n++) {
    const candidate = `${circuitNumber}${PREFIX[kind]}${n}`;
    if (free(candidate)) return candidate;
  }
  return `${circuitNumber}${PREFIX[kind]}`;
}
