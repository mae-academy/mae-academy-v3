import { z } from 'zod';
import { BLOCK_SPECS, type BlockType } from '../../../shared/logo/types';

/** Hard request limits: every array is bounded so a payload cannot exhaust memory or CPU. */
export const LOGO_LIMITS = {
  maxBlocks: 256,
  maxSinks: 64,
  maxOps: 16,
  maxScansPerOp: 64,
  maxStateBlocks: 256,
} as const;

const int = z.number().int().finite();
const finite = z.number().finite();
const bit = z.union([z.literal(0), z.literal(1)]);

const connector = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('hi') }),
  z.object({ kind: z.literal('lo') }),
  z.object({ kind: z.literal('x') }),
  z.object({ kind: z.literal('digital-input'), index: int.min(1).max(1024) }),
  z.object({ kind: z.literal('digital-output'), index: int.min(1).max(1024) }),
  z.object({ kind: z.literal('digital-flag'), index: int.min(1).max(1024) }),
  z.object({ kind: z.literal('block-output'), blockId: int.min(1).max(1_000_000) }),
]);

const wire = z.object({ ref: connector, invert: z.boolean().optional() });
const pin = z.enum(['1', '2', '3', '4', 'Trg', 'S', 'R', 'En', 'Inv', 'Cnt', 'Dir']);
const time = z.object({ base: z.enum(['s', 'm', 'h']), value: int.min(0).max(1_000_000) });
const count = int.min(0).max(1_000_000);

const blockType = z.enum(Object.keys(BLOCK_SPECS) as [BlockType, ...BlockType[]]);

const block = z.object({
  id: int.min(1).max(1_000_000),
  type: blockType,
  inputs: z.partialRecord(pin, wire),
  params: z.object({
    T: time.optional(),
    TH: time.optional(),
    TL: time.optional(),
    'T!': time.optional(),
    'T!L': time.optional(),
    On: count.optional(),
    Off: count.optional(),
    Par: z.enum(['RS', 'SR']).optional(),
  }),
  retentive: z.boolean(),
  protected: z.boolean().optional(),
});

export const LogoProgramSchema = z.object({
  name: z.string().max(64),
  blocks: z.array(block).max(LOGO_LIMITS.maxBlocks),
  sinks: z
    .array(
      z.object({
        target: z.discriminatedUnion('kind', [
          z.object({ kind: z.literal('digital-output'), index: int.min(1).max(1024) }),
          z.object({ kind: z.literal('digital-flag'), index: int.min(1).max(1024) }),
        ]),
        source: connector,
      }),
    )
    .max(LOGO_LIMITS.maxSinks),
});

const bits = (length: number) => z.string().regex(new RegExp(`^[01]{${length}}$`), `expected ${length} bits`);

export const LogoStateSchema = z.object({
  b: z.array(z.tuple([int.min(1), bit, finite.min(0), int.min(0).max(8), int.min(0).max(1_000_000), int.min(0).max(0xff)])).max(LOGO_LIMITS.maxStateBlocks),
  i: bits(24),
  q: bits(16),
  m: bits(24),
  c: int.min(0),
  t: finite.min(0).nullable(),
  dt: finite.min(0),
  run: bit,
});

const op = z.discriminatedUnion('t', [
  z.object({ t: z.literal('start') }),
  z.object({ t: z.literal('stop') }),
  z.object({ t: z.literal('resync') }),
  z.object({ t: z.literal('powerLoss') }),
  z.object({ t: z.literal('clearAll') }),
  z.object({ t: z.literal('load'), keep: z.boolean() }),
  z.object({ t: z.literal('scan'), at: z.array(finite.min(0)).min(1).max(LOGO_LIMITS.maxScansPerOp), inputs: bits(24) }),
]);

export const LogoEvaluateRequestSchema = z.object({
  v: z.literal(1),
  program: LogoProgramSchema,
  st: LogoStateSchema,
  ops: z.array(op).max(LOGO_LIMITS.maxOps),
});
