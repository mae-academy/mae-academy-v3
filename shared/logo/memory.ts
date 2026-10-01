import type { BlockType, LogoBlock } from './types';

/** Hard resource limits of the 0BA4 (spec §3.1). */
export const MEMORY_LIMITS = { bytes: 2000, blocks: 130, rem: 60 } as const;

export interface MemoryUsage {
  readonly bytes: number;
  readonly blocks: number;
  readonly rem: number;
}

/** Program-memory bytes and retentive bytes per block (spec §3.1 cost table). */
export const BLOCK_COSTS: Readonly<Record<BlockType, { readonly bytes: number; readonly rem: number }>> = {
  AND: { bytes: 12, rem: 0 },
  AND_EDGE: { bytes: 12, rem: 0 },
  NAND: { bytes: 12, rem: 0 },
  NAND_EDGE: { bytes: 12, rem: 0 },
  OR: { bytes: 12, rem: 0 },
  NOR: { bytes: 12, rem: 0 },
  XOR: { bytes: 8, rem: 0 },
  NOT: { bytes: 4, rem: 0 },
  ON_DELAY: { bytes: 8, rem: 3 },
  OFF_DELAY: { bytes: 12, rem: 3 },
  ON_OFF_DELAY: { bytes: 12, rem: 3 },
  RETENTIVE_ON_DELAY: { bytes: 12, rem: 3 },
  WIPING_RELAY: { bytes: 8, rem: 3 },
  PULSE_GENERATOR: { bytes: 12, rem: 3 },
  STAIRWAY: { bytes: 12, rem: 3 },
  UP_DOWN_COUNTER: { bytes: 24, rem: 5 },
  LATCHING_RELAY: { bytes: 8, rem: 1 },
  PULSE_RELAY: { bytes: 12, rem: 1 },
};

/** REM is only consumed when retentivity is enabled on the block. */
export function blockCost(type: BlockType, retentive: boolean): MemoryUsage {
  const cost = BLOCK_COSTS[type];
  return { bytes: cost.bytes, blocks: 1, rem: retentive ? cost.rem : 0 };
}

export function measureProgram(blocks: readonly LogoBlock[]): MemoryUsage {
  return blocks.reduce<MemoryUsage>(
    (sum, block) => {
      const cost = blockCost(block.type, block.retentive);
      return { bytes: sum.bytes + cost.bytes, blocks: sum.blocks + 1, rem: sum.rem + cost.rem };
    },
    { bytes: 0, blocks: 0, rem: 0 },
  );
}

export const freeMemory = (usage: MemoryUsage): MemoryUsage => ({
  bytes: MEMORY_LIMITS.bytes - usage.bytes,
  blocks: MEMORY_LIMITS.blocks - usage.blocks,
  rem: MEMORY_LIMITS.rem - usage.rem,
});

export const withinLimits = (usage: MemoryUsage): boolean =>
  usage.bytes <= MEMORY_LIMITS.bytes && usage.blocks <= MEMORY_LIMITS.blocks && usage.rem <= MEMORY_LIMITS.rem;

/** Firmware picker rule: a block is offered only if both memory pools can still afford it. */
export function canAddBlock(usage: MemoryUsage, type: BlockType, retentive: boolean): boolean {
  const cost = blockCost(type, retentive);
  return withinLimits({ bytes: usage.bytes + cost.bytes, blocks: usage.blocks + 1, rem: usage.rem + cost.rem });
}
