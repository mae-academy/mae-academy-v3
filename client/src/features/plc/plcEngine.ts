export type BitAddress = `I${number}.${number}` | `Q${number}.${number}` | `M${number}.${number}` | `V${number}.${number}`;
export type WatchAddress = BitAddress | "AC0" | "AC1" | "AC2" | "AC3" | "VW0" | "VD0" | "T0" | "C0" | `VB${number}` | `VW${number}` | `VD${number}`;
export type Contact = { address: BitAddress; negated?: boolean };
export type OutputInstruction =
  | { kind: "coil"; address: BitAddress }
  | { kind: "ton" | "toff" | "tmr"; address: `T${number}`; presetMs: number }
  | { kind: "ctu" | "ctd" | "ctud"; address: `C${number}`; preset: number }
  | { kind: "mov"; source: string; destination: string; width?: "B" | "W" | "D" }
  | { kind: "logic"; op: "AND-W" | "OR-W" | "XOR-W" | "NOT-W"; args: string[] }
  | { kind: "math"; op: "ADD-W" | "SUB-W" | "MUL-W" | "DIV-W" | "SQRT" | "SIN" | "COS" | "EXP"; args: string[] }
  | { kind: "compare"; op: "==" | ">=" | ">" | "<=" | "<"; left: string; right: string; destination?: BitAddress };

export type PowerNode =
  | { kind: "contact"; id: string; contact: Contact }
  | { kind: "series" | "parallel"; id: string; children: PowerNode[] };
export type LadderRung = { id: string; contacts: Contact[]; parallelBranches?: Contact[][]; power?: PowerNode; output: OutputInstruction };
export type PlcAst = { rungs: LadderRung[] };
export type TimerState = { elapsedMs: number; done: boolean; input: boolean };
export type CounterState = { value: number; done: boolean; previousCu: boolean; previousCd: boolean };
export type PlcDiagnostic = { code: "DIVIDE_BY_ZERO" | "NEGATIVE_SQRT" | "INVALID_ADDRESS"; rungId: string; detail: string };
export type PlcScanResult = { memory: PlcMemory; power: Record<string, boolean>; nodePower: Record<string, boolean>; diagnostics: PlcDiagnostic[] };

export type PlcMemory = {
  inputs: Record<BitAddress, boolean>;
  outputs: Record<BitAddress, boolean>;
  physicalInputs: Record<BitAddress, boolean>;
  physicalOutputs: Record<BitAddress, boolean>;
  markers: Record<BitAddress, boolean>;
  ac: Record<`AC${number}`, number>;
  vw: Record<`VW${number}`, number>;
  vd: Record<`VD${number}`, number>;
  v: Uint8Array;
  timers: Record<`T${number}`, TimerState>;
  counters: Record<`C${number}`, CounterState>;
};

const BIT = /^(I|Q|M|V)(\d+)\.(\d+)$/i;
const NUMBER = /^-?\d+(?:\.\d+)?$/;

const rangeBits = (prefix: "I" | "Q" | "M", count: number): Record<BitAddress, boolean> => {
  const map = {} as Record<BitAddress, boolean>;
  for (let index = 0; index < count; index += 1) {
    const byte = Math.floor(index / 8);
    const bit = index % 8;
    map[`${prefix}${byte}.${bit}` as BitAddress] = false;
  }
  return map;
};

export const initialPlcMemory = (): PlcMemory => ({
  inputs: rangeBits("I", 14),
  outputs: rangeBits("Q", 10),
  physicalInputs: rangeBits("I", 14),
  physicalOutputs: rangeBits("Q", 10),
  markers: rangeBits("M", 64),
  ac: { AC0: 0, AC1: 0, AC2: 0, AC3: 0 },
  vw: { VW0: 0 },
  vd: { VD0: 0 },
  v: new Uint8Array(2048),
  timers: { T0: { elapsedMs: 0, done: false, input: false } },
  counters: { C0: { value: 0, done: false, previousCu: false, previousCd: false } },
});

export const defaultPlcAst = (): PlcAst => ({
  rungs: [
    { id: "rung-1", contacts: [{ address: "I0.0" }], output: { kind: "coil", address: "Q0.0" } },
    { id: "rung-2", contacts: [{ address: "I0.1" }, { address: "I0.2", negated: true }], output: { kind: "ton", address: "T0", presetMs: 1500 } },
    { id: "rung-3", contacts: [{ address: "M0.0" }], output: { kind: "coil", address: "Q0.1" } },
  ],
});

const clone = (memory: PlcMemory): PlcMemory => ({
  inputs: { ...memory.inputs }, outputs: { ...memory.outputs }, physicalInputs: { ...memory.physicalInputs }, physicalOutputs: { ...memory.physicalOutputs }, markers: { ...memory.markers }, ac: { ...memory.ac }, vw: { ...memory.vw }, vd: { ...memory.vd }, v: new Uint8Array(memory.v),
  timers: Object.fromEntries(Object.entries(memory.timers).map(([key, value]) => [key, { ...value }])) as PlcMemory["timers"],
  counters: Object.fromEntries(Object.entries(memory.counters).map(([key, value]) => [key, { ...value }])) as PlcMemory["counters"],
});

export const bitValue = (memory: PlcMemory, address: BitAddress): boolean => {
  const parsed = BIT.exec(address);
  if (!parsed) return false;
  if (parsed[1].toUpperCase() === "V") return Boolean((memory.v[Number(parsed[2])] ?? 0) & (1 << Number(parsed[3])));
  const map = parsed[1].toUpperCase() === "I" ? memory.inputs : parsed[1].toUpperCase() === "Q" ? memory.outputs : memory.markers;
  return Boolean(map[address]);
};

const setBit = (memory: PlcMemory, address: BitAddress, value: boolean) => {
  const parsed = BIT.exec(address);
  if (!parsed) return;
  if (parsed[1].toUpperCase() === "V") { const index = Number(parsed[2]); const mask = 1 << Number(parsed[3]); memory.v[index] = value ? (memory.v[index] | mask) : (memory.v[index] & ~mask); return; }
  const target = parsed[1].toUpperCase() === "Q" ? memory.outputs : parsed[1].toUpperCase() === "M" ? memory.markers : memory.inputs;
  target[address] = value;
};

export const numberValue = (memory: PlcMemory, token: string): number => {
  const upper = token.trim().toUpperCase();
  if (NUMBER.test(upper)) return Number(upper);
  if (/^AC\d+$/.test(upper)) return memory.ac[upper as `AC${number}`] ?? 0;
  if (/^VB\d+$/.test(upper)) return memory.v[Number(upper.slice(2))] ?? 0;
  if (/^VW\d+$/.test(upper)) { const index = Number(upper.slice(2)); return ((memory.v[index] ?? 0) << 8) | (memory.v[index + 1] ?? 0); }
  if (/^VD\d+$/.test(upper)) { const index = Number(upper.slice(2)); return ((((memory.v[index] ?? 0) << 24) >>> 0) | ((memory.v[index + 1] ?? 0) << 16) | ((memory.v[index + 2] ?? 0) << 8) | (memory.v[index + 3] ?? 0)) >>> 0; }
  if (/^T\d+$/.test(upper)) return memory.timers[upper as `T${number}`]?.elapsedMs ?? 0;
  if (/^C\d+$/.test(upper)) return memory.counters[upper as `C${number}`]?.value ?? 0;
  if (BIT.test(upper)) return bitValue(memory, upper as BitAddress) ? 1 : 0;
  return 0;
};

const setNumber = (memory: PlcMemory, address: string, value: number) => {
  const upper = address.toUpperCase();
  if (/^AC\d+$/.test(upper)) memory.ac[upper as `AC${number}`] = value;
  else if (/^VB\d+$/.test(upper)) memory.v[Number(upper.slice(2))] = Math.round(value) & 0xff;
  else if (/^VW\d+$/.test(upper)) { const index = Number(upper.slice(2)); const next = Math.round(value) & 0xffff; memory.v[index] = next >>> 8; memory.v[index + 1] = next & 0xff; memory.vw[upper as `VW${number}`] = next; }
  else if (/^VD\d+$/.test(upper)) { const index = Number(upper.slice(2)); const next = Math.round(value) >>> 0; memory.v[index] = next >>> 24; memory.v[index + 1] = (next >>> 16) & 0xff; memory.v[index + 2] = (next >>> 8) & 0xff; memory.v[index + 3] = next & 0xff; memory.vd[upper as `VD${number}`] = next; }
  else if (BIT.test(upper)) setBit(memory, upper as BitAddress, value !== 0);
};

const evaluateContacts = (memory: PlcMemory, contacts: Contact[]) => contacts.every((contact) => contact.negated ? !bitValue(memory, contact.address) : bitValue(memory, contact.address));
const branchNode = (rungId: string, branchId: string, contacts: Contact[]): PowerNode => ({ kind: "series", id: `${rungId}:${branchId}`, children: contacts.map((contact, index) => ({ kind: "contact", id: `${rungId}:${branchId}:contact-${index}`, contact })) });

export const compileLadderProgram = (ast: PlcAst): PlcAst => ({
  rungs: ast.rungs.map((rung) => rung.power ? rung : {
    ...rung,
    power: {
      kind: "parallel",
      id: `${rung.id}:power`,
      children: [branchNode(rung.id, "main", rung.contacts), ...(rung.parallelBranches ?? []).map((branch, index) => branchNode(rung.id, `parallel-${index}`, branch))],
    },
  }),
});

const evaluatePowerNode = (memory: PlcMemory, node: PowerNode, nodePower: Record<string, boolean>): boolean => {
  const value = node.kind === "contact"
    ? (node.contact.negated ? !bitValue(memory, node.contact.address) : bitValue(memory, node.contact.address))
    : node.kind === "series"
      ? node.children.every((child) => evaluatePowerNode(memory, child, nodePower))
      : node.children.some((child) => evaluatePowerNode(memory, child, nodePower));
  nodePower[node.id] = value;
  return value;
};

const evaluateRung = (memory: PlcMemory, rung: LadderRung, nodePower: Record<string, boolean>) => rung.power ? evaluatePowerNode(memory, rung.power, nodePower) : evaluateContacts(memory, rung.contacts) || Boolean(rung.parallelBranches?.some((branch) => evaluateContacts(memory, branch)));

const ensureTimer = (memory: PlcMemory, address: `T${number}`) => (memory.timers[address] ??= { elapsedMs: 0, done: false, input: false });
const ensureCounter = (memory: PlcMemory, address: `C${number}`) => (memory.counters[address] ??= { value: 0, done: false, previousCu: false, previousCd: false });

function executeOutput(memory: PlcMemory, output: OutputInstruction, power: boolean, deltaMs: number, rungId: string, diagnostics: PlcDiagnostic[]) {
  if (output.kind === "coil") {
    setBit(memory, output.address, power);
    return;
  }
  if (output.kind === "ton" || output.kind === "toff" || output.kind === "tmr") {
    const timer = ensureTimer(memory, output.address);
    if (output.kind === "ton") {
      timer.elapsedMs = power ? Math.min(timer.elapsedMs + deltaMs, output.presetMs) : 0;
      timer.done = timer.elapsedMs >= output.presetMs;
    } else if (output.kind === "toff") {
      if (power) { timer.elapsedMs = output.presetMs; timer.done = true; }
      else { timer.elapsedMs = Math.max(0, timer.elapsedMs - deltaMs); timer.done = timer.elapsedMs > 0; }
    } else if (power) {
      timer.elapsedMs = Math.min(timer.elapsedMs + deltaMs, output.presetMs);
      timer.done = timer.elapsedMs >= output.presetMs;
    }
    timer.input = power;
    setBit(memory, "M0.0", timer.done);
    return;
  }
  if (output.kind === "ctu" || output.kind === "ctd" || output.kind === "ctud") {
    const counter = ensureCounter(memory, output.address);
    if (output.kind === "ctu" && power && !counter.previousCu) counter.value += 1;
    if (output.kind === "ctd" && power && !counter.previousCd) counter.value -= 1;
    if (output.kind === "ctud" && power && !counter.previousCu) counter.value += 1;
    counter.done = output.kind === "ctd" ? counter.value <= output.preset : counter.value >= output.preset;
    counter.previousCu = power; counter.previousCd = power;
    return;
  }
  if (!power) return;
  if (output.kind === "mov") {
    setNumber(memory, output.destination, numberValue(memory, output.source));
  } else if (output.kind === "logic") {
    const [left, right, destination] = output.args;
    const a = Math.trunc(numberValue(memory, left));
    const b = Math.trunc(numberValue(memory, right));
    const value = output.op === "AND-W" ? a & b : output.op === "OR-W" ? a | b : output.op === "XOR-W" ? a ^ b : ~a;
    setNumber(memory, destination ?? (output.op === "NOT-W" ? right : right), value);
  } else if (output.kind === "math") {
    const [left, right, destination] = output.args;
    const a = numberValue(memory, left);
    const b = numberValue(memory, right);
    if (output.op === "DIV-W" && b === 0) { diagnostics.push({ code: "DIVIDE_BY_ZERO", rungId, detail: `${left} ÷ ${right}` }); return; }
    if (output.op === "SQRT" && a < 0) { diagnostics.push({ code: "NEGATIVE_SQRT", rungId, detail: `SQRT ${left}` }); return; }
    const value = output.op === "ADD-W" ? a + b : output.op === "SUB-W" ? a - b : output.op === "MUL-W" ? a * b : output.op === "DIV-W" ? a / b : output.op === "SQRT" ? Math.sqrt(a) : output.op === "SIN" ? Math.sin(a) : output.op === "COS" ? Math.cos(a) : Math.exp(a);
    setNumber(memory, destination ?? right, value);
  } else if (output.kind === "compare") {
    const a = numberValue(memory, output.left); const b = numberValue(memory, output.right);
    const result = output.op === "==" ? a === b : output.op === ">=" ? a >= b : output.op === ">" ? a > b : output.op === "<=" ? a <= b : a < b;
    if (output.destination) setBit(memory, output.destination, result);
  }
}

export const scanCycle = (memory: PlcMemory, ast: PlcAst, deltaMs = 100): PlcScanResult => {
  const next = clone(memory);
  next.inputs = { ...next.physicalInputs };
  const power: Record<string, boolean> = {};
  const nodePower: Record<string, boolean> = {};
  const diagnostics: PlcDiagnostic[] = [];
  const program = compileLadderProgram(ast);
  program.rungs.forEach((rung) => {
    const energized = evaluateRung(next, rung, nodePower);
    power[rung.id] = energized;
    executeOutput(next, rung.output, energized, deltaMs, rung.id, diagnostics);
  });
  next.physicalOutputs = { ...next.outputs };
  return { memory: next, power, nodePower, diagnostics };
};

const coilToIl = (output: OutputInstruction): string => {
  if (output.kind === "coil") return `= ${output.address}`;
  if (output.kind === "ton" || output.kind === "toff" || output.kind === "tmr") return `${output.kind.toUpperCase()} ${output.address}, ${output.presetMs}`;
  if (output.kind === "ctu" || output.kind === "ctd" || output.kind === "ctud") return `${output.kind.toUpperCase()} ${output.address}, ${output.preset}`;
  if (output.kind === "mov") return `MOV-${output.width ?? "W"} ${output.source}, ${output.destination}`;
  if (output.kind === "logic") return `${output.op} ${output.args.join(", ")}`;
  if (output.kind === "math") return `${output.op} ${output.args.join(", ")}`;
  if (output.kind === "compare") return `${output.op} ${output.left}, ${output.right}${output.destination ? `, ${output.destination}` : ""}`;
  return "";
};

export const astToIl = (ast: PlcAst): string => ast.rungs.flatMap((rung) => {
  const lines = rung.contacts.map((contact, index) => `${index === 0 ? (contact.negated ? "LDN" : "LD") : (contact.negated ? "ANDN" : "AND")} ${contact.address}`);
  rung.parallelBranches?.forEach((branch) => branch.forEach((contact, index) => lines.push(`${index === 0 ? (contact.negated ? "ORN" : "OR") : (contact.negated ? "ANDN" : "AND")} ${contact.address}`)));
  return [...lines, coilToIl(rung.output), ""];
}).join("\n").trim();

const parseOutput = (line: string): OutputInstruction | null => {
  const [op, ...rest] = line.trim().replace(/,/g, " ").split(/\s+/);
  const upper = op.toUpperCase(); const args = rest.map((value) => value.toUpperCase());
  if (upper === "=" && args[0] && BIT.test(args[0])) return { kind: "coil", address: args[0] as BitAddress };
  if (["TON", "TOFF", "TMR"].includes(upper) && args[0]) return { kind: upper.toLowerCase() as "ton" | "toff" | "tmr", address: args[0] as `T${number}`, presetMs: Number(args[1] ?? 1000) };
  if (["CTU", "CTD", "CTUD"].includes(upper) && args[0]) return { kind: upper.toLowerCase() as "ctu" | "ctd" | "ctud", address: args[0] as `C${number}`, preset: Number(args[1] ?? 1) };
  if (/^MOV(?:-[BWD])?$/.test(upper) && args.length >= 2) return { kind: "mov", source: args[0], destination: args[1], width: (upper.split("-")[1] ?? "W") as "B" | "W" | "D" };
  if (["AND-W", "OR-W", "XOR-W", "NOT-W"].includes(upper)) return { kind: "logic", op: upper as "AND-W" | "OR-W" | "XOR-W" | "NOT-W", args };
  if (["ADD-W", "SUB-W", "MUL-W", "DIV-W", "SQRT", "SIN", "COS", "EXP"].includes(upper)) return { kind: "math", op: upper as OutputInstruction & { kind: "math" } extends { op: infer Operation } ? Operation : never, args } as OutputInstruction;
  if (["==", ">=", ">", "<=", "<"].includes(upper) && args.length >= 2) return { kind: "compare", op: upper as "==" | ">=" | ">" | "<=" | "<", left: args[0], right: args[1], destination: args[2] as BitAddress | undefined };
  return null;
};

export const ilToAst = (source: string): { ast: PlcAst; errors: string[] } => {
  const groups = source.split(/\n\s*\n/).map((block) => block.split("\n").map((line) => line.trim()).filter(Boolean)).filter((block) => block.length);
  const errors: string[] = [];
  const rungs: LadderRung[] = [];
  groups.forEach((lines, index) => {
    const contacts: Contact[] = [];
    const parallelBranches: Contact[][] = [];
    let activeBranch = contacts;
    let output: OutputInstruction | null = null;
    lines.forEach((line, lineIndex) => {
      const [instruction, operand] = line.split(/\s+/, 2);
      const op = instruction.toUpperCase();
      if (["LD", "LDN", "AND", "ANDN", "OR", "ORN"].includes(op)) {
        if (!operand || !BIT.test(operand.toUpperCase())) errors.push(`Rung ${index + 1}: ${op} requires a valid I/Q/M bit address.`);
        else {
          if (op === "OR" || op === "ORN") { activeBranch = []; parallelBranches.push(activeBranch); }
          activeBranch.push({ address: operand.toUpperCase() as BitAddress, negated: op.endsWith("N") });
        }
      } else {
        const parsed = parseOutput(line);
        if (!parsed) errors.push(`Rung ${index + 1}: unsupported instruction "${line}".`);
        else output = parsed;
      }
      if (lineIndex === 0 && !["LD", "LDN"].includes(op)) errors.push(`Rung ${index + 1}: must begin with LD or LDN.`);
    });
    if (!output) errors.push(`Rung ${index + 1}: requires a coil, timer, counter, comparator, or data instruction.`);
    else rungs.push({ id: `il-rung-${index + 1}`, contacts, parallelBranches: parallelBranches.length ? parallelBranches : undefined, output });
  });
  return { ast: { rungs }, errors };
};

export const watchValue = (memory: PlcMemory, address: WatchAddress): number | boolean => {
  if (BIT.test(address)) return bitValue(memory, address as BitAddress);
  return numberValue(memory, address);
};

export const setWatchValue = (memory: PlcMemory, address: WatchAddress, value: number | boolean): PlcMemory => {
  const next = clone(memory);
  if (BIT.test(address)) {
    setBit(next, address as BitAddress, Boolean(value));
    if (address.toUpperCase().startsWith("I")) next.physicalInputs[address as BitAddress] = Boolean(value);
  }
  else setNumber(next, address, Number(value));
  return next;
};
