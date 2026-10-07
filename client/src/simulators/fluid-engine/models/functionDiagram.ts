/**
 * Displacement-step (function) diagram model: a sequence tracker, not a recorder.
 *
 * Each cylinder's piston position is watched sample by sample. Leaving an end position starts a *move* (1A+, 2A−…), arriving at
 * the opposite end completes it. Moves that start within `STEP_MERGE_SECONDS` of each other form one *step*. The steps of the first
 * cycle are kept until the whole circuit is back in the state it started in; that closes the cycle and freezes it. Every later
 * loop only advances a playhead (it overwrites a single live step), so the diagram never grows and never stacks traces.
 *
 * Line `n` of the diagram is the state before step `n`; step `n` is drawn between line `n` and line `n + 1`, so a four-step
 * cycle reads 1 · 2 · 3 · 4 · 1.
 */

export type Level = 0 | 1;

export interface DiagramMove {
  cylinderId: string;
  /** +1: extending (0 → 1), −1: retracting (1 → 0). */
  direction: 1 | -1;
  start: number;
  /** Simulation time of arrival, or null while the piston is still travelling. */
  end: number | null;
}

export interface DiagramStep {
  start: number;
  moves: DiagramMove[];
}

interface Motion {
  /** End the piston last rested at. */
  end: Level;
  /** End it is travelling away from, or null while it rests. */
  from: Level | null;
  position: number;
}

export interface CycleTracker {
  time: number;
  /** Level of every cylinder when tracking began. */
  initial: Record<string, Level>;
  motion: Record<string, Motion>;
  /** Steps of the first cycle; frozen once `cycleLength` is known. */
  steps: DiagramStep[];
  /** Number of steps after which the circuit is back in its initial state; null until the first cycle closes. */
  cycleLength: number | null;
  /** The step in progress during later cycles (it overwrites the previous loop's). */
  live: DiagramStep | null;
  /** Running count of steps started, across cycles. */
  stepNumber: number;
}

/** A piston within this fraction of its stroke of an end counts as there when no sensor reading is given (3 mm of a 100 mm stroke). */
export const END_POSITION = 0.03;
/** Moves starting closer together than this belong to the same step. */
export const STEP_MERGE_SECONDS = 0.15;
/** Fewest step columns the grid shows, so a cycle that has not closed yet still reads 1 · 2 · 3 · 4 · 1. */
export const MIN_STEP_COLUMNS = 4;

export const emptyTracker = (): CycleTracker => ({ time: 0, initial: {}, motion: {}, steps: [], cycleLength: null, live: null, stepNumber: 0 });

/** What one snapshot says about a cylinder: where the piston is and which end's position switch is made (null in mid-stroke). */
export interface CylinderReading {
  position: number;
  end: Level | null;
}

/** Readings from bare positions, for callers without sensor states. */
export function readingsFromPositions(positions: Record<string, number>): Record<string, CylinderReading> {
  return Object.fromEntries(Object.entries(positions).map(([id, position]) => [id, { position, end: position <= END_POSITION ? 0 : position >= 1 - END_POSITION ? 1 : null }]));
}

/**
 * Replaces (or, returning null, removes) the unfinished move of one cylinder. It need not be in the newest step: in one snapshot a
 * piston can arrive while another has already set off and opened the next step.
 */
function mapOpenMove(state: CycleTracker, cylinderId: string, change: (move: DiagramMove) => DiagramMove | null): CycleTracker {
  const isOpen = (move: DiagramMove) => move.cylinderId === cylinderId && move.end === null;
  const apply = (step: DiagramStep): DiagramStep => ({ ...step, moves: step.moves.flatMap(move => (isOpen(move) ? change(move) ?? [] : [move])) });
  if (state.live?.moves.some(isOpen)) {
    const live = apply(state.live);
    return live.moves.length === 0 ? { ...state, live: null, stepNumber: state.stepNumber - 1 } : { ...state, live };
  }
  for (let index = state.steps.length - 1; index >= 0; index -= 1) {
    if (!state.steps[index].moves.some(isOpen)) continue;
    const updated = apply(state.steps[index]);
    const steps = updated.moves.length === 0 ? state.steps.filter((_, at) => at !== index) : state.steps.map((step, at) => (at === index ? updated : step));
    return { ...state, steps, stepNumber: state.cycleLength === null ? steps.length : state.stepNumber };
  }
  return state;
}

function addMove(state: CycleTracker, move: DiagramMove): CycleTracker {
  const joins = (step: DiagramStep | null | undefined): step is DiagramStep => Boolean(step) && Math.abs(move.start - step!.start) <= STEP_MERGE_SECONDS;
  if (state.cycleLength === null) {
    const last = state.steps[state.steps.length - 1];
    const steps = joins(last) ? [...state.steps.slice(0, -1), { ...last, moves: [...last.moves, move] }] : [...state.steps, { start: move.start, moves: [move] }];
    return { ...state, steps, stepNumber: steps.length };
  }
  return joins(state.live)
    ? { ...state, live: { ...state.live, moves: [...state.live.moves, move] } }
    : { ...state, live: { start: move.start, moves: [move] }, stepNumber: state.stepNumber + 1 };
}

/** Closes the first cycle once every move is finished and every cylinder is back where it started. */
function closeCycle(state: CycleTracker): CycleTracker {
  if (state.cycleLength !== null || state.steps.length === 0) return state;
  if (state.steps.some(step => step.moves.some(move => move.end === null))) return state;
  const levels: Record<string, Level> = { ...state.initial };
  for (const step of state.steps) for (const move of step.moves) levels[move.cylinderId] = move.direction === 1 ? 1 : 0;
  return Object.keys(state.initial).every(id => levels[id] === state.initial[id]) ? { ...state, cycleLength: state.steps.length } : state;
}

/**
 * Feeds one snapshot (simulation `time`, a reading per cylinder id). A piston rests at an end while that end's position switch
 * is made, so strokes begin and end exactly where the engine's ±3 mm switches do. Snapshots that are not newer than the last
 * are ignored. A piston that crossed its whole stroke between two snapshots still counts as a move.
 */
export function trackSample(previous: CycleTracker, time: number, readings: Record<string, CylinderReading>): CycleTracker {
  if (Object.keys(previous.motion).length > 0 && time <= previous.time) return previous;
  let state: CycleTracker = { ...previous, time, initial: { ...previous.initial }, motion: { ...previous.motion } };
  for (const [id, { position, end: level }] of Object.entries(readings)) {
    const known = state.motion[id];
    if (!known) {
      const rest: Level = level ?? (position < 0.5 ? 0 : 1);
      state.initial[id] = rest;
      state.motion[id] = { end: rest, from: null, position };
      continue;
    }
    let motion: Motion = { ...known, position };
    if (level === null) {
      if (motion.from === null) {
        motion = { ...motion, from: motion.end };
        state = addMove(state, { cylinderId: id, direction: motion.end === 0 ? 1 : -1, start: time, end: null });
      }
    } else if (motion.from !== null) {
      // Arrived at the opposite end: the move is done. Back where it left from: it never was a move.
      state = level !== motion.from ? mapOpenMove(state, id, move => ({ ...move, end: time })) : mapOpenMove(state, id, () => null);
      motion = { end: level, from: null, position };
    } else if (level !== motion.end) {
      state = addMove(state, { cylinderId: id, direction: level === 1 ? 1 : -1, start: previous.time, end: time });
      motion = { end: level, from: null, position };
    }
    state.motion = { ...state.motion, [id]: motion };
  }
  return closeCycle(state);
}

/* ───────────────────────── What the chart draws ───────────────────────── */

export interface ViewMove {
  cylinderId: string;
  direction: 1 | -1;
  /** 0 … 1 through the stroke; 1 once arrived. */
  progress: number;
  end: number | null;
}

export interface ViewStep {
  moves: ViewMove[];
  /** Mean progress of its moves: 1 once every move has arrived. */
  progress: number;
}

export interface CycleView {
  /** Step columns in the grid. */
  columns: number;
  /** Labels of the vertical step lines: 1 … columns, then the closing 1 that completes the cycle. */
  labels: number[];
  complete: boolean;
  /** 1-based number of the cycle being executed. */
  cycleNumber: number;
  initial: Record<string, Level>;
  steps: ViewStep[];
  /** Playhead position in step-column units (0 … columns), or null before anything has been tracked. */
  playhead: number | null;
}

export function cycleView(tracker: CycleTracker): CycleView {
  const progressOf = (move: DiagramMove): number => {
    if (move.end !== null) return 1;
    const position = tracker.motion[move.cylinderId]?.position ?? 0;
    return Math.min(1, Math.max(0, move.direction === 1 ? position : 1 - position));
  };
  const viewOf = (step: DiagramStep): ViewStep => {
    const moves = step.moves.map((move): ViewMove => ({ cylinderId: move.cylinderId, direction: move.direction, progress: progressOf(move), end: move.end }));
    return { moves, progress: moves.length === 0 ? 0 : moves.reduce((sum, move) => sum + move.progress, 0) / moves.length };
  };
  const length = tracker.cycleLength;
  const steps = tracker.steps.map(viewOf);
  const columns = length ?? Math.max(MIN_STEP_COLUMNS, steps.length);
  const labels = [...Array.from({ length: columns }, (_, index) => index + 1), 1];

  let playhead: number | null = null;
  if (Object.keys(tracker.motion).length > 0) {
    if (steps.length === 0) playhead = 0;
    else if (length === null) playhead = steps.length - 1 + steps[steps.length - 1].progress;
    else {
      const current = tracker.live ? viewOf(tracker.live) : steps[length - 1];
      playhead = ((tracker.stepNumber - 1) % length) + current.progress;
    }
  }
  return {
    columns,
    labels,
    complete: length !== null,
    cycleNumber: length === null ? 1 : Math.floor((tracker.stepNumber - 1) / length) + 1,
    initial: tracker.initial,
    steps,
    playhead: playhead === null ? null : Math.min(columns, playhead),
  };
}

export type DiagramPoint = [number, number];

/**
 * Displacement trace of one cylinder as straight segments in (step column, level) units: flat while it dwells, a straight ramp
 * across the column of its move. A move still in progress is drawn up to the piston, and nothing beyond the step in progress.
 */
export function displacementTrace(view: CycleView, cylinderId: string): DiagramPoint[] {
  let level: number = view.initial[cylinderId] ?? 0;
  const points: DiagramPoint[] = [[0, level]];
  for (let column = 0; column < view.steps.length; column += 1) {
    const step = view.steps[column];
    const move = step.moves.find(candidate => candidate.cylinderId === cylinderId);
    if (!move) {
      points.push([column + step.progress, level]);
      if (step.progress < 1) break;
      continue;
    }
    const target = move.direction === 1 ? 1 : 0;
    level += (target - level) * move.progress;
    points.push([column + move.progress, level]);
    if (move.progress < 1) break;
  }
  return points;
}

export interface SensorMark {
  /** Step line the switch is made at (the end of the move). */
  line: number;
  level: Level;
  cylinderId: string;
  end: 'retracted' | 'extended';
}

/** Position switches made at the end of every finished move. */
export function sensorMarks(view: CycleView): SensorMark[] {
  return view.steps.flatMap((step, column) => step.moves.filter(move => move.progress >= 1).map((move): SensorMark => {
    const level: Level = move.direction === 1 ? 1 : 0;
    return { line: column + 1, level, cylinderId: move.cylinderId, end: level === 1 ? 'extended' : 'retracted' };
  }));
}

export interface SignalLink {
  line: number;
  /** The switch that fires (the one made last by the previous step). */
  from: { cylinderId: string; level: Level };
  /** The move it starts. */
  to: { cylinderId: string; level: Level };
}

/** Which sensor trip starts which move: the last switch made by step `n` starts every move of step `n + 1`. */
export function signalLinks(view: CycleView): SignalLink[] {
  return view.steps.flatMap((step, column): SignalLink[] => {
    const before = view.steps[column - 1];
    if (!before) return [];
    const trigger = before.moves.filter(move => move.end !== null).sort((a, b) => (a.end as number) - (b.end as number)).pop();
    if (!trigger) return [];
    return step.moves.map(move => ({
      line: column,
      from: { cylinderId: trigger.cylinderId, level: trigger.direction === 1 ? 1 : 0 },
      to: { cylinderId: move.cylinderId, level: move.direction === 1 ? 0 : 1 },
    }));
  });
}
