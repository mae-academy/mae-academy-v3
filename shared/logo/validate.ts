import { measureProgram, MEMORY_LIMITS, type MemoryUsage } from './memory';
import { COUNT_MAX, TIME_MAX } from './time';
import { ADDRESS_SPACE, BLOCK_SPECS, sinkName, type ConnectorRef, type LogoBlock, type LogoProgram } from './types';

export interface LogoDiagnostic {
  readonly severity: 'error' | 'warning';
  readonly message: string;
  readonly blockId?: number;
}

export interface CheckedProgram {
  readonly program: LogoProgram;
  readonly usage: MemoryUsage;
  readonly diagnostics: readonly LogoDiagnostic[];
  /** No errors: the firmware would accept (save) this program. */
  readonly ok: boolean;
}

function refError(ref: ConnectorRef, blocks: ReadonlyMap<number, LogoBlock>): string | null {
  switch (ref.kind) {
    case 'hi':
    case 'lo':
    case 'x':
      return null;
    case 'digital-input':
      return ref.index >= 1 && ref.index <= ADDRESS_SPACE.I ? null : `I${ref.index} is outside I1..I${ADDRESS_SPACE.I}`;
    case 'digital-output':
      return ref.index >= 1 && ref.index <= ADDRESS_SPACE.Q ? null : `Q${ref.index} is outside Q1..Q${ADDRESS_SPACE.Q}`;
    case 'digital-flag':
      return ref.index >= 1 && ref.index <= ADDRESS_SPACE.M ? null : `M${ref.index} is outside M1..M${ADDRESS_SPACE.M}`;
    case 'block-output':
      return blocks.has(ref.blockId) ? null : `B${ref.blockId} does not exist`;
    default: {
      const exhaustive: never = ref;
      return exhaustive;
    }
  }
}

/** Ids of the blocks whose outputs feed this block's inputs. */
export const sourcesOf = (block: LogoBlock): number[] =>
  BLOCK_SPECS[block.type].pins.flatMap((pin) => {
    const ref = block.inputs[pin]?.ref;
    return ref?.kind === 'block-output' ? [ref.blockId] : [];
  });

/**
 * Validates a program the way the firmware does before it saves one (spec §2.3): fully wired, no
 * same-cycle feedback, every block reachable from an output, inside the §3.1 memory budget. Used by
 * the front panel to gate edits and by the engine to refuse a program before it runs.
 */
export function checkProgram(program: LogoProgram): CheckedProgram {
  const diagnostics: LogoDiagnostic[] = [];
  const error = (message: string, blockId?: number): void => {
    diagnostics.push({ severity: 'error', message, blockId });
  };
  const byId = new Map<number, LogoBlock>();

  for (const block of program.blocks) {
    if (!Number.isInteger(block.id) || block.id < 1) error(`Invalid block number ${block.id}`);
    else if (byId.has(block.id)) error(`Duplicate block number B${block.id}`, block.id);
    else byId.set(block.id, block);
  }

  for (const block of Array.from(byId.values())) {
    const spec = BLOCK_SPECS[block.type];
    const name = `B${block.id} (${spec.title})`;
    for (const pin of Object.keys(block.inputs)) {
      if (!spec.pins.some((known) => known === pin)) error(`${name} has no input ${pin}`, block.id);
    }
    for (const pin of spec.pins) {
      const wire = block.inputs[pin];
      if (!wire) {
        error(`${name}: input ${pin} is not wired`, block.id);
        continue;
      }
      if (wire.ref.kind === 'x' && spec.required.includes(pin)) error(`${name}: input ${pin} may not be left open`, block.id);
      if (wire.ref.kind === 'block-output' && wire.ref.blockId === block.id) error(`${name} reads its own output`, block.id);
      const problem = refError(wire.ref, byId);
      if (problem) error(`${name}: ${problem}`, block.id);
    }
    for (const key of spec.timeParams) {
      const time = block.params[key];
      if (!time) error(`${name}: parameter ${key} is missing`, block.id);
      else if (!Number.isInteger(time.value) || time.value < 0 || time.value > TIME_MAX[time.base]) error(`${name}: ${key} is out of range`, block.id);
    }
    for (const key of spec.countParams) {
      const value = block.params[key];
      if (value === undefined) error(`${name}: parameter ${key} is missing`, block.id);
      else if (!Number.isInteger(value) || value < 0 || value > COUNT_MAX) error(`${name}: ${key} is out of range`, block.id);
    }
  }

  const targets = new Set<string>();
  for (const sink of program.sinks) {
    const target = sinkName(sink.target);
    const limit = sink.target.kind === 'digital-output' ? ADDRESS_SPACE.Q : ADDRESS_SPACE.M;
    if (sink.target.index < 1 || sink.target.index > limit) error(`${target} does not exist`);
    // One connector, one driver (spec §2.3 rule 2).
    if (targets.has(target)) error(`${target} is driven more than once`);
    targets.add(target);
    const problem = refError(sink.source, byId);
    if (problem) error(`${target}: ${problem}`);
  }

  // A same-cycle block loop is illegal and must be broken through a flag.
  const mark = new Map<number, 'visiting' | 'done'>();
  let looped = false;
  const visit = (id: number): void => {
    const state = mark.get(id);
    if (state === 'done') return;
    if (state === 'visiting') {
      if (!looped) error(`Feedback loop through B${id}: break it with a flag (M)`, id);
      looped = true;
      return;
    }
    const block = byId.get(id);
    if (!block) return;
    mark.set(id, 'visiting');
    for (const source of sourcesOf(block)) visit(source);
    mark.set(id, 'done');
  };
  Array.from(byId.keys()).sort((a, b) => a - b).forEach(visit);

  // Blocks live only as part of an output's tree; an orphan means an incomplete program.
  const reachable = new Set<number>();
  const walk = (id: number): void => {
    if (reachable.has(id)) return;
    const block = byId.get(id);
    if (!block) return;
    reachable.add(id);
    sourcesOf(block).forEach(walk);
  };
  for (const sink of program.sinks) if (sink.source.kind === 'block-output') walk(sink.source.blockId);
  for (const id of Array.from(byId.keys())) if (!reachable.has(id)) error(`B${id} is not connected to any output`, id);

  const usage = measureProgram(program.blocks);
  if (usage.bytes > MEMORY_LIMITS.bytes) error(`Program memory exceeded: ${usage.bytes} / ${MEMORY_LIMITS.bytes} bytes`);
  if (usage.blocks > MEMORY_LIMITS.blocks) error(`Too many blocks: ${usage.blocks} / ${MEMORY_LIMITS.blocks}`);
  if (usage.rem > MEMORY_LIMITS.rem) error(`Retentive memory exceeded: ${usage.rem} / ${MEMORY_LIMITS.rem} bytes`);

  return { program, usage, diagnostics, ok: diagnostics.every((d) => d.severity !== 'error') };
}
