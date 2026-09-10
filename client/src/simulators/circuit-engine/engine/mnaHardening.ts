/**
 * Numerical hardening for Modified Nodal Analysis, independent of the frozen legacy solver
 * (`mnaSolver.ts`, `analogNewtonMna.ts`): GMIN node shunts, scaled-partial-pivoting LU with
 * singularity diagnostics, SPICE3 junction-voltage limiting, and a DC operating-point Newton driver
 * that falls back to GMIN stepping, then source stepping — ngspice's own continuation order.
 */

/** Minimum conductance shunted from every node to ground, in siemens — ngspice's default GMIN. */
export const DEFAULT_GMIN = 1e-12;
/** Smallest pivot accepted, relative to the largest entry of its original row. */
export const DEFAULT_PIVOT_RATIO = 1e-13;
/** kT/q at ngspice's default circuit temperature, 27 °C. */
export const THERMAL_VOLTAGE_27C = 0.0258649;
/**
 * Junction current past which the diode exponential is continued linearly. No discrete device
 * conducts this, so a junction that reaches it is bounded by the clamp, not by the circuit.
 */
export const JUNCTION_CURRENT_CEILING = 1e6;

const GROUND = "0";
const DEFAULT_MAX_ITERATIONS = 100;
const DEFAULT_RELTOL = 1e-3;
const DEFAULT_VNTOL = 1e-6;
const DEFAULT_ABSTOL = 1e-12;
const DEFAULT_SOURCE_STEPS = 10;
/** First rung of the GMIN-stepping ladder, relaxed a decade per rung down to the target GMIN. */
const GMIN_STEP_START = 1e-2;

export class SingularMatrixError extends Error {
  constructor(
    readonly unknownIndex: number,
    readonly unknownLabel: string,
    readonly pivotRatio: number
  ) {
    super(
      `Singular MNA matrix: "${unknownLabel}" is undetermined (pivot ratio ${pivotRatio.toExponential(2)}). ` +
        "A floating node, or a loop of ideal voltage sources and shorts, leaves it unconstrained."
    );
    this.name = "SingularMatrixError";
  }
}

/**
 * Stamps `gmin` from each of the first `nodeCount` unknowns — the node voltages — to ground, i.e.
 * G[i][i] += gmin. A node an open switch has cut loose then keeps a defined (0 V) solution instead
 * of an all-zero row; branch-current rows are left alone, since a shunt there would bend KVL.
 */
export function stampGmin(matrix: number[][], nodeCount: number, gmin: number = DEFAULT_GMIN): void {
  for (let node = 0; node < nodeCount; node += 1) matrix[node][node] += gmin;
}

export interface LuFactorization {
  /** Packed factors: below the diagonal is L (unit diagonal implied); the rest is U. */
  readonly lu: number[][];
  /** Row `i` of the factored matrix is row `permutation[i]` of the input. */
  readonly permutation: number[];
}

export interface LuOptions {
  pivotRatio?: number;
  /** Unknown names for diagnostics, index-aligned with the matrix columns. */
  labels?: readonly string[];
}

/**
 * LU factorization with scaled partial pivoting: each candidate pivot is judged against the largest
 * entry of its own row, so a GMIN-sized row is not mistaken for a zero one next to kilosiemens
 * elsewhere, while MNA's zero-diagonal voltage-source rows are still pivoted through. A pivot below
 * `pivotRatio` of its row throws `SingularMatrixError` naming the undetermined unknown, rather than
 * dividing through and returning garbage.
 */
export function luFactorize(
  matrix: readonly (readonly number[])[],
  options: LuOptions = {}
): LuFactorization {
  const size = matrix.length;
  const pivotRatio = options.pivotRatio ?? DEFAULT_PIVOT_RATIO;
  const label = (index: number) => options.labels?.[index] ?? `x${index}`;
  const lu = matrix.map(row => {
    if (row.length !== size) {
      throw new RangeError(`MNA matrix must be square: a row has ${row.length} of ${size} entries.`);
    }
    return row.slice();
  });
  const permutation = Array.from({ length: size }, (_, index) => index);
  const scale = lu.map((row, index) => {
    const largest = row.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
    if (!Number.isFinite(largest)) {
      throw new RangeError(`MNA row for "${label(index)}" contains a non-finite entry.`);
    }
    if (largest === 0) throw new SingularMatrixError(index, label(index), 0);
    return largest;
  });

  for (let column = 0; column < size; column += 1) {
    let pivotRow = column;
    let best = -1;
    for (let row = column; row < size; row += 1) {
      const ratio = Math.abs(lu[row][column]) / scale[row];
      if (ratio > best) {
        best = ratio;
        pivotRow = row;
      }
    }
    if (!(best >= pivotRatio)) throw new SingularMatrixError(column, label(column), Math.max(0, best));
    if (pivotRow !== column) {
      [lu[column], lu[pivotRow]] = [lu[pivotRow], lu[column]];
      [scale[column], scale[pivotRow]] = [scale[pivotRow], scale[column]];
      [permutation[column], permutation[pivotRow]] = [permutation[pivotRow], permutation[column]];
    }
    const pivot = lu[column][column];
    for (let row = column + 1; row < size; row += 1) {
      const factor = lu[row][column] / pivot;
      lu[row][column] = factor;
      if (factor === 0) continue;
      for (let k = column + 1; k < size; k += 1) lu[row][k] -= factor * lu[column][k];
    }
  }
  return { lu, permutation };
}

/** Solves A·x = b from `luFactorize(A)`: forward substitution through L, back through U. */
export function luSolve({ lu, permutation }: LuFactorization, rhs: readonly number[]): number[] {
  const size = lu.length;
  if (rhs.length !== size) {
    throw new RangeError(`Right-hand side has ${rhs.length} entries for a ${size}×${size} system.`);
  }
  const x = permutation.map(row => rhs[row]);
  for (let row = 1; row < size; row += 1) {
    let sum = x[row];
    for (let k = 0; k < row; k += 1) sum -= lu[row][k] * x[k];
    x[row] = sum;
  }
  for (let row = size - 1; row >= 0; row -= 1) {
    let sum = x[row];
    for (let k = row + 1; k < size; k += 1) sum -= lu[row][k] * x[k];
    x[row] = sum / lu[row][row];
  }
  return x;
}

/** SPICE3 critical voltage: past it a junction's exponential is steep enough to need step limiting. */
export function criticalVoltage(emissionThermalVoltage: number, saturationCurrent: number): number {
  return emissionThermalVoltage * Math.log(emissionThermalVoltage / (Math.SQRT2 * saturationCurrent));
}

/**
 * SPICE3 `pnjlim`: once a junction is forward-biased past `vCrit`, a Newton step across it becomes a
 * logarithmic increment, so exp(V/N·Vt) can neither overflow nor overshoot the root.
 */
export function limitJunctionVoltage(
  vNew: number,
  vOld: number,
  emissionThermalVoltage: number,
  vCrit: number
): { voltage: number; limited: boolean } {
  if (vNew > vCrit && Math.abs(vNew - vOld) > 2 * emissionThermalVoltage) {
    if (vOld > 0) {
      const argument = 1 + (vNew - vOld) / emissionThermalVoltage;
      return {
        voltage: argument > 0 ? vOld + emissionThermalVoltage * Math.log(argument) : vCrit,
        limited: true,
      };
    }
    return { voltage: emissionThermalVoltage * Math.log(vNew / emissionThermalVoltage), limited: true };
  }
  return { voltage: vNew, limited: false };
}

export type HardenedElement =
  | { kind: "resistor"; id: string; a: string; b: string; resistance: number }
  | {
      kind: "switch";
      id: string;
      a: string;
      b: string;
      closed: boolean;
      onResistance: number;
      offResistance: number;
    }
  | { kind: "voltage-source"; id: string; positive: string; negative: string; voltage: number }
  /** Positive current flows from `from`, through the source, into `to`. */
  | { kind: "current-source"; id: string; from: string; to: string; current: number }
  | {
      kind: "diode";
      id: string;
      anode: string;
      cathode: string;
      saturationCurrent: number;
      emission: number;
      seriesResistance?: number;
    };

export interface DcSolveOptions {
  /** Node-to-ground shunt and junction GMIN, in siemens; 0 disables both. */
  gmin?: number;
  thermalVoltage?: number;
  maxIterations?: number;
  reltol?: number;
  vntol?: number;
  abstol?: number;
  sourceSteps?: number;
}

export type DcStrategy = "newton" | "gmin-stepping" | "source-stepping";

export interface DcOperatingPoint {
  converged: boolean;
  /** Continuation that reached the answer; `null` when none did (values are then the last iterate). */
  strategy: DcStrategy | null;
  iterations: number;
  nodeVoltages: Record<string, number>;
  /** Voltage-source currents into the + terminal (SPICE sign); diode currents anode → cathode. */
  branchCurrents: Record<string, number>;
  /** Junctions biased past `JUNCTION_CURRENT_CEILING`: their current is set by the clamp, i.e. unbounded. */
  clampedJunctions: string[];
}

interface Junction {
  id: string;
  anode: number;
  cathode: number;
  saturationCurrent: number;
  nVt: number;
  vCrit: number;
  vKnee: number;
}

interface NewtonState {
  x: number[];
  vd: number[];
}

function conductanceOf(resistance: number, id: string): number {
  if (!(resistance > 0) || !Number.isFinite(resistance)) {
    throw new RangeError(`${id}: resistance must be positive and finite, got ${resistance} Ω.`);
  }
  return 1 / resistance;
}

/** Shockley current with GMIN in parallel, continued linearly past `vKnee` so it stays finite. */
function junctionAt(junction: Junction, voltage: number, gmin: number): { current: number; conductance: number } {
  const { saturationCurrent: is, nVt, vKnee } = junction;
  if (voltage > vKnee) {
    const knee = Math.exp(vKnee / nVt);
    const slope = (is * knee) / nVt;
    return { current: is * (knee - 1) + slope * (voltage - vKnee) + gmin * voltage, conductance: slope + gmin };
  }
  const exponential = Math.exp(voltage / nVt);
  return { current: is * (exponential - 1) + gmin * voltage, conductance: (is * exponential) / nVt + gmin };
}

/**
 * DC operating point by Newton-Raphson on the MNA system, with a GMIN shunt on every node and pnjlim
 * on every junction. Plain Newton first; on failure, GMIN stepping (a large shunt relaxed a decade at
 * a time); then source stepping (supplies ramped from 10 % to 100 %). A structurally singular system
 * — a loop of ideal voltage sources — throws `SingularMatrixError` instead of returning garbage.
 */
export function solveDcOperatingPoint(
  elements: readonly HardenedElement[],
  options: DcSolveOptions = {}
): DcOperatingPoint {
  const gmin = options.gmin ?? DEFAULT_GMIN;
  const vt = options.thermalVoltage ?? THERMAL_VOLTAGE_27C;
  const maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  const reltol = options.reltol ?? DEFAULT_RELTOL;
  const vntol = options.vntol ?? DEFAULT_VNTOL;
  const abstol = options.abstol ?? DEFAULT_ABSTOL;
  const sourceSteps = Math.max(1, Math.floor(options.sourceSteps ?? DEFAULT_SOURCE_STEPS));

  // Series resistance becomes a resistor onto an internal node, as SPICE expands a diode's RS.
  const branches: Array<{ a: string; b: string; g: number }> = [];
  const sources: Array<{ id: string; positive: string; negative: string; voltage: number }> = [];
  const currents: Array<{ from: string; to: string; current: number }> = [];
  const diodes: Array<{ id: string; anode: string; cathode: string; is: number; emission: number }> = [];
  const internalNets = new Set<string>();
  for (const element of elements) {
    switch (element.kind) {
      case "resistor":
        branches.push({ a: element.a, b: element.b, g: conductanceOf(element.resistance, element.id) });
        break;
      case "switch":
        branches.push({
          a: element.a,
          b: element.b,
          g: conductanceOf(element.closed ? element.onResistance : element.offResistance, element.id),
        });
        break;
      case "voltage-source":
        sources.push(element);
        break;
      case "current-source":
        currents.push(element);
        break;
      case "diode": {
        if (!(element.saturationCurrent > 0) || !(element.emission > 0)) {
          throw new RangeError(`${element.id}: saturation current and emission must be positive.`);
        }
        let anode = element.anode;
        const rs = element.seriesResistance ?? 0;
        if (rs > 0) {
          anode = `${element.id}#junction`;
          internalNets.add(anode);
          branches.push({ a: element.anode, b: anode, g: conductanceOf(rs, element.id) });
        }
        diodes.push({ id: element.id, anode, cathode: element.cathode, is: element.saturationCurrent, emission: element.emission });
        break;
      }
    }
  }

  const nodeIndex = new Map<string, number>();
  const labels: string[] = [];
  const register = (net: string) => {
    if (net !== GROUND && !nodeIndex.has(net)) {
      nodeIndex.set(net, labels.length);
      labels.push(net);
    }
  };
  branches.forEach(branch => { register(branch.a); register(branch.b); });
  sources.forEach(source => { register(source.positive); register(source.negative); });
  currents.forEach(current => { register(current.from); register(current.to); });
  diodes.forEach(diode => { register(diode.anode); register(diode.cathode); });
  const nodeCount = labels.length;
  sources.forEach(source => labels.push(`i(${source.id})`));
  const size = labels.length;
  const indexOf = (net: string) => (net === GROUND ? -1 : (nodeIndex.get(net) ?? -1));

  const conductances = branches.map(branch => ({ a: indexOf(branch.a), b: indexOf(branch.b), g: branch.g }));
  const voltageStamps = sources.map(source => ({ p: indexOf(source.positive), n: indexOf(source.negative), voltage: source.voltage }));
  const currentStamps = currents.map(current => ({ from: indexOf(current.from), to: indexOf(current.to), current: current.current }));
  const junctions: Junction[] = diodes.map(diode => {
    const nVt = diode.emission * vt;
    return {
      id: diode.id,
      anode: indexOf(diode.anode),
      cathode: indexOf(diode.cathode),
      saturationCurrent: diode.is,
      nVt,
      vCrit: criticalVoltage(nVt, diode.is),
      vKnee: nVt * Math.log(JUNCTION_CURRENT_CEILING / diode.is + 1),
    };
  });
  const at = (x: readonly number[], index: number) => (index < 0 ? 0 : x[index]);

  const newton = (start: NewtonState, sourceScale: number, shunt: number) => {
    let x = start.x.slice();
    const vd = start.vd.slice();
    for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
      const matrix = Array.from({ length: size }, () => new Array<number>(size).fill(0));
      const rhs = new Array<number>(size).fill(0);
      const add = (row: number, column: number, value: number) => {
        if (row >= 0 && column >= 0) matrix[row][column] += value;
      };
      const conduct = (a: number, b: number, g: number) => {
        add(a, a, g); add(b, b, g); add(a, b, -g); add(b, a, -g);
      };
      for (const { a, b, g } of conductances) conduct(a, b, g);
      voltageStamps.forEach(({ p, n, voltage }, k) => {
        const branch = nodeCount + k;
        add(p, branch, 1); add(n, branch, -1); add(branch, p, 1); add(branch, n, -1);
        rhs[branch] = voltage * sourceScale;
      });
      for (const { from, to, current } of currentStamps) {
        if (from >= 0) rhs[from] -= current * sourceScale;
        if (to >= 0) rhs[to] += current * sourceScale;
      }
      const companions = junctions.map((junction, k) => junctionAt(junction, vd[k], gmin));
      junctions.forEach((junction, k) => {
        const { current, conductance } = companions[k];
        const equivalent = current - conductance * vd[k];
        conduct(junction.anode, junction.cathode, conductance);
        if (junction.anode >= 0) rhs[junction.anode] -= equivalent;
        if (junction.cathode >= 0) rhs[junction.cathode] += equivalent;
      });
      stampGmin(matrix, nodeCount, shunt);
      const next = luSolve(luFactorize(matrix, { labels }), rhs);
      if (!next.every(Number.isFinite)) return { converged: false, iterations: iteration, state: { x, vd } };

      let converged = iteration > 1;
      for (let i = 0; i < size && converged; i += 1) {
        const floor = i < nodeCount ? vntol : abstol;
        if (!(Math.abs(next[i] - x[i]) <= reltol * Math.max(Math.abs(next[i]), Math.abs(x[i])) + floor)) {
          converged = false;
        }
      }
      junctions.forEach((junction, k) => {
        const vNew = at(next, junction.anode) - at(next, junction.cathode);
        // SPICE's device test: the linearization's prediction at vNew must match the true current there.
        const predicted = companions[k].current + companions[k].conductance * (vNew - vd[k]);
        const actual = junctionAt(junction, vNew, gmin).current;
        const limited = limitJunctionVoltage(vNew, vd[k], junction.nVt, junction.vCrit);
        const tolerance = reltol * Math.max(Math.abs(actual), Math.abs(predicted)) + abstol;
        if (limited.limited || !(Math.abs(actual - predicted) <= tolerance)) converged = false;
        vd[k] = limited.voltage;
      });
      x = next;
      if (converged) return { converged: true, iterations: iteration, state: { x, vd } };
    }
    return { converged: false, iterations: maxIterations, state: { x, vd } };
  };

  let iterations = 0;
  const finish = (strategy: DcStrategy | null, state: NewtonState): DcOperatingPoint => {
    const nodeVoltages: Record<string, number> = { [GROUND]: 0 };
    nodeIndex.forEach((index, net) => {
      if (!internalNets.has(net)) nodeVoltages[net] = state.x[index];
    });
    const branchCurrents: Record<string, number> = {};
    sources.forEach((source, k) => { branchCurrents[source.id] = state.x[nodeCount + k]; });
    const clampedJunctions: string[] = [];
    junctions.forEach(junction => {
      const bias = at(state.x, junction.anode) - at(state.x, junction.cathode);
      branchCurrents[junction.id] = junctionAt(junction, bias, 0).current;
      if (bias > junction.vKnee) clampedJunctions.push(junction.id);
    });
    return { converged: strategy !== null, strategy, iterations, nodeVoltages, branchCurrents, clampedJunctions };
  };
  if (size === 0) return finish("newton", { x: [], vd: [] });

  const cold: NewtonState = { x: new Array<number>(size).fill(0), vd: junctions.map(junction => junction.vCrit) };
  const plain = newton(cold, 1, gmin);
  iterations += plain.iterations;
  if (plain.converged) return finish("newton", plain.state);

  let state = cold;
  let ladderHeld = true;
  const ladder: number[] = [];
  for (let shunt = GMIN_STEP_START; shunt > gmin * 1.000001 && shunt >= 1e-15; shunt /= 10) ladder.push(shunt);
  ladder.push(gmin);
  for (const shunt of ladder) {
    const rung = newton(state, 1, shunt);
    iterations += rung.iterations;
    if (!rung.converged) { ladderHeld = false; break; }
    state = rung.state;
  }
  if (ladderHeld) return finish("gmin-stepping", state);

  state = { x: new Array<number>(size).fill(0), vd: new Array<number>(junctions.length).fill(0) };
  for (let step = 1; step <= sourceSteps; step += 1) {
    const rung = newton(state, step / sourceSteps, gmin);
    iterations += rung.iterations;
    state = rung.state;
    if (!rung.converged) return finish(null, state);
  }
  return finish("source-stepping", state);
}
