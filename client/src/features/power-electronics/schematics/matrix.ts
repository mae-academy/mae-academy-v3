import { buildAcControllerCircuit, buildChopperCircuit, buildInverterCircuit, buildRectifierCircuit, type SchematicDocument } from "./index";

/** Every schematic the four studios can produce, including all device and wiring variants. */
export function allSchematics(): Array<{ name: string; doc: SchematicDocument }> {
  const out: Array<{ name: string; doc: SchematicDocument }> = [];
  const add = (name: string, build: () => SchematicDocument) => out.push({ name, doc: build() });

  const shapes = [["single", "half-wave"], ["single", "bridge"], ["single", "center-tapped"], ["three", "half-wave"], ["three", "bridge"]] as const;
  for (const [phase, shape] of shapes) for (const load of ["R", "RL", "RC", "RLC", "RLE"] as const) for (const controlled of [false, true]) for (const fwd of [false, true]) {
    add(`rectifier ${phase} ${shape} ${load} ctl=${controlled} fwd=${fwd}`, () => buildRectifierCircuit(phase, shape, load, fwd, controlled));
  }
  for (const [phase, topology] of [["single", "half-bridge"], ["single", "full-bridge"], ["three", "full-bridge"]] as const) for (const load of ["R", "RL", "RLE"] as const) {
    add(`inverter ${phase} ${topology} ${load}`, () => buildInverterCircuit(phase, topology, load));
  }
  for (const mode of ["unidirectional", "bidirectional"] as const) for (const load of ["R", "RL"] as const) for (const device of ["triac", "thyristor-pair"] as const) {
    add(`ac single ${mode} ${load} ${device}`, () => buildAcControllerCircuit("single", mode, load, "star-3w", device));
    for (const connection of ["star-3w", "star-4w", "delta"] as const) add(`ac three ${connection} ${mode} ${load} ${device}`, () => buildAcControllerCircuit("three", mode, load, connection, device));
  }
  for (const type of ["buck", "boost", "buck-boost"] as const) for (const klass of ["A", "B", "C", "D", "E"] as const) for (const load of ["R", "RL", "RLE"] as const) {
    add(`chopper ${type} ${klass} ${load}`, () => buildChopperCircuit(type, klass, load));
  }
  return out;
}
