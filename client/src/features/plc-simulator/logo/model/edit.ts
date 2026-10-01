import {
  BLOCK_SPECS,
  sinkName,
  type BlockParams,
  type BlockType,
  type ConnectorRef,
  type LogoBlock,
  type LogoProgram,
  type NumericParamKey,
  type PinName,
  type SinkTarget,
  type WireIn,
} from '@shared/logo/types';
import { sourcesOf } from '@shared/logo/validate';

/** Where a rewire lands: a sink (by position in `program.sinks`) or one pin of a block. */
export type WireTarget =
  | { readonly kind: 'sink'; readonly index: number }
  /** An output by name: creates its sink on first connection (the firmware's empty `- [ Q1 ]` slot). */
  | { readonly kind: 'output'; readonly target: SinkTarget }
  | { readonly kind: 'pin'; readonly blockId: number; readonly pin: PinName };

/** Drops every block no longer reachable from a sink (the firmware deletes disconnected blocks). */
export function pruneOrphans(program: LogoProgram): LogoProgram {
  const byId = new Map(program.blocks.map((block) => [block.id, block] as const));
  const keep = new Set<number>();
  const walk = (id: number): void => {
    const block = byId.get(id);
    if (!block || keep.has(id)) return;
    keep.add(id);
    sourcesOf(block).forEach(walk);
  };
  for (const sink of program.sinks) if (sink.source.kind === 'block-output') walk(sink.source.blockId);
  return keep.size === program.blocks.length ? program : { ...program, blocks: program.blocks.filter((block) => keep.has(block.id)) };
}

/** Re-points one connector, keeping its inversion, then prunes whatever became disconnected. */
export function rewire(program: LogoProgram, target: WireTarget, ref: ConnectorRef): LogoProgram {
  if (target.kind === 'output') {
    const name = sinkName(target.target);
    const exists = program.sinks.some((sink) => sinkName(sink.target) === name);
    const sinks = exists
      ? program.sinks.map((sink) => (sinkName(sink.target) === name ? { ...sink, source: ref } : sink))
      : [...program.sinks, { target: target.target, source: ref }];
    return pruneOrphans({ ...program, sinks });
  }
  if (target.kind === 'sink') {
    const sinks = program.sinks.map((sink, index) => (index === target.index ? { ...sink, source: ref } : sink));
    return pruneOrphans({ ...program, sinks });
  }
  const blocks = program.blocks.map((block) => {
    if (block.id !== target.blockId) return block;
    const wire: WireIn = { ...block.inputs[target.pin], ref };
    return { ...block, inputs: { ...block.inputs, [target.pin]: wire } };
  });
  return pruneOrphans({ ...program, blocks });
}

/** Toggles negation on one block pin (spec §2.3): connectivity is unchanged, so no pruning is needed. */
export function setInvert(program: LogoProgram, target: WireTarget, invert: boolean): LogoProgram {
  if (target.kind !== 'pin') return program;
  const blocks = program.blocks.map((block) => {
    if (block.id !== target.blockId) return block;
    const current = block.inputs[target.pin];
    if (!current) return block;
    const wire: WireIn = { ...current, invert };
    return { ...block, inputs: { ...block.inputs, [target.pin]: wire } };
  });
  return { ...program, blocks };
}

/** Writes one numeric parameter (range-checked by `compileProgram`). */
export function withParam(program: LogoProgram, blockId: number, key: NumericParamKey, value: number): LogoProgram {
  const blocks = program.blocks.map((block) => {
    if (block.id !== blockId) return block;
    if (key === 'On' || key === 'Off') return { ...block, params: { ...block.params, [key]: value } };
    const current = block.params[key];
    return current ? { ...block, params: { ...block.params, [key]: { base: current.base, value } } } : block;
  });
  return { ...program, blocks };
}

export const nextBlockId = (program: LogoProgram): number => program.blocks.reduce((max, block) => Math.max(max, block.id), 0) + 1;

/** A freshly placed block: open inputs (mandatory ones tied low) and the firmware's default parameters. */
export function defaultBlock(id: number, type: BlockType): LogoBlock {
  const spec = BLOCK_SPECS[type];
  const inputs: Partial<Record<PinName, WireIn>> = {};
  for (const pin of spec.pins) inputs[pin] = { ref: { kind: spec.required.includes(pin) ? 'lo' : 'x' } };
  const params: { -readonly [K in keyof BlockParams]: BlockParams[K] } = {};
  for (const key of spec.timeParams) params[key] = { base: 's', value: key === 'T!' || key === 'T!L' ? 0 : 100 };
  if (spec.countParams.length > 0) {
    params.On = 1;
    params.Off = 0;
  }
  if (type === 'PULSE_RELAY') params.Par = 'RS';
  return { id, type, inputs, params, retentive: false };
}

/** Places a new block and wires its output to `target`; whatever it displaces is pruned. */
export function placeBlock(program: LogoProgram, target: WireTarget, type: BlockType): LogoProgram {
  const id = nextBlockId(program);
  return rewire({ ...program, blocks: [...program.blocks, defaultBlock(id, type)] }, target, { kind: 'block-output', blockId: id });
}
