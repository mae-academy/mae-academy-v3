import type { Point } from "../../control/circuitPhase1";
import { PART, loadElements, placeHChain, placeVChain } from "./layout";
import { SchematicBuilder, type SchematicDocument } from "./netlist";

export type AcSchematicPhase = "single" | "three";
export type AcSchematicMode = "unidirectional" | "bidirectional";
export type AcSchematicLoad = "R" | "RL";
export type AcSchematicConnection = "star-3w" | "star-4w" | "delta";
/** Bidirectional switch realisation: two inverse-parallel thyristors (default, same layout as the unidirectional diode branch) or a single TRIAC. */
export type AcSwitchDevice = "triac" | "thyristor-pair";

interface SwitchIds { main: string; second: string;}

/**
 * One line switch between `in` (cx - 100) and `out` (cx + 100) at row `cy`.
 * Unidirectional = thyristor + antiparallel diode; bidirectional = TRIAC or inverse-parallel thyristors.
 */
function placeLineSwitch(b: SchematicBuilder, mode: AcSchematicMode, device: AcSwitchDevice, cx: number, cy: number, ids: SwitchIds): { in: Point; out: Point } {
  const input = { x: cx - 100, y: cy };
  const output = { x: cx + 100, y: cy };
  if (mode === "bidirectional" && device === "triac") {
    const tr = b.place("triac", ids.main, cx, cy, {});
    b.wire(input, tr.a);
    b.wire(tr.b, output);
    return { in: input, out: output };
  }
  const main = b.place("thyristor", ids.main, cx, cy, {});
  b.wire(input, main.a);
  b.wire(main.k, output);
  // parallel branch above, conducting in the opposite direction (anode on the output side)
  const branchY = cy - 80;
  const back = mode === "unidirectional"
    ? b.place("diode", ids.second, cx, branchY, { rotation: 180 })
    : b.place("thyristor", ids.second, cx, branchY, { rotation: 180});
  b.wire(input, [input.x, branchY], back.k);
  b.wire(back.a, [output.x, branchY], output);
  return { in: input, out: output };
}

export function buildAcControllerCircuit(
  phase: AcSchematicPhase,
  mode: AcSchematicMode,
  loadType: AcSchematicLoad,
  connection: AcSchematicConnection = "star-3w",
  device?: AcSwitchDevice,
): SchematicDocument {
  const b = new SchematicBuilder();
  const elements = loadElements(loadType);
  const count = elements.length;

  if (phase === "single") {
    const top = 160;
    const loadX = 460;
    const sw = placeLineSwitch(b, mode, device ?? "thyristor-pair", 240, top, mode === "unidirectional"
      ? { main: "T1", second: "D1" }
      : device === "triac" ? { main: "TR1", second: "" } : { main: "T1", second: "T2" });
    b.place("acSource", "vs", 60, 220, { label: "vs" });
    b.wire([60, top], sw.in);
    b.wire(sw.out, [loadX, top]);
    const chain = placeVChain(b, loadX, top, elements);
    const returnY = Math.max(chain.bottom.y, 280);
    b.wire(chain.bottom, [loadX, returnY]);
    b.wire([60, 280], [60, returnY], [loadX, returnY]);
    b.place("ground", "GND", 60, returnY, { label: null });
  } else {
    const delta = connection === "delta";
    const pitch = delta ? Math.max(220, count * PART + 100) : 220;
    const rows = [160, 160 + pitch, 160 + 2 * pitch];
    const names = ["a", "b", "c"];
    const returnY = rows[2] + 100;
    const switchDevice = device ?? "thyristor-pair";
    const ids: SwitchIds[] = mode === "unidirectional"
      ? [1, 3, 5].map((n) => ({ main: `T${n}`, second: `D${n}` }))
      : switchDevice === "triac"
        ? [1, 2, 3].map((n) => ({ main: `TR${n}`, second: "" }))
        : [[1, 4], [3, 6], [5, 2]].map(([n, m]) => ({ main: `T${n}`, second: `T${m}` }));

    const outs = rows.map((y, index) => {
      b.place("acSource", `v${names[index]}`, 100, y, { rotation: 90, label: `v${names[index]}` });
      const sw = placeLineSwitch(b, mode, switchDevice, 300, y, ids[index]);
      b.wire([160, y], sw.in);
      return sw.out;
    });
    b.wire([40, rows[0]], [40, returnY]);
    b.place("ground", "GND", 40, returnY, { label: null });

    if (!delta) {
      const chainLeft = 440;
      const starX = chainLeft + count * PART + 40;
      outs.forEach((out, index) => {
        const chain = placeHChain(b, chainLeft, rows[index], loadElements(loadType, names[index]));
        b.wire(out, chain.top);
        b.wire(chain.bottom, [starX, rows[index]]);
      });
      if (connection === "star-4w") b.wire([starX, rows[0]], [starX, returnY], [40, returnY]);
      else b.wire([starX, rows[0]], [starX, rows[2]]);
    } else {
      const columns = [500, 620, 740];
      // load between lines: a-b, b-c, c-a
      const spans: Array<[number, number, string]> = [[rows[0], rows[1], "ab"], [rows[1], rows[2], "bc"], [rows[0], rows[2], "ca"]];
      spans.forEach(([from, to, suffix], index) => {
        const chain = placeVChain(b, columns[index], from, loadElements(loadType, suffix));
        b.wire(chain.bottom, [columns[index], to]);
      });
      b.wire(outs[0], [columns[2], rows[0]]);
      b.wire(outs[1], [columns[1], rows[1]]);
      b.wire(outs[2], [columns[2], rows[2]]);
    }
  }

  const control = mode === "unidirectional" ? "Unidirectional" : "Bidirectional";
  const shape = phase === "single" ? "1-Φ" : `3-Φ ${connection === "delta" ? "Delta" : connection === "star-4w" ? "Star (4-wire)" : "Star (3-wire)"}`;
  return b.build(`${shape} ${control} AC Voltage Controller · ${loadType}`);
}
