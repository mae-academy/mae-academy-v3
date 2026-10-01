import { checkProgram, sourcesOf, type CheckedProgram } from '../../../../shared/logo/validate';
import type { LogoBlock, LogoProgram } from '../../../../shared/logo/types';

export interface CompiledProgram extends CheckedProgram {
  /** Blocks in dependency order: every block evaluates after the blocks it reads. */
  readonly order: readonly LogoBlock[];
}

/** Validates the program, then fixes the scan cycle's evaluation order (dependencies first). */
export function compileProgram(program: LogoProgram): CompiledProgram {
  const checked = checkProgram(program);
  const byId = new Map(program.blocks.map((block) => [block.id, block] as const));
  const order: LogoBlock[] = [];
  const mark = new Set<number>();
  const visit = (id: number): void => {
    const block = byId.get(id);
    if (!block || mark.has(id)) return; // a same-cycle loop is already an error in `checked`
    mark.add(id);
    for (const source of sourcesOf(block)) visit(source);
    order.push(block);
  };
  Array.from(byId.keys()).sort((a, b) => a - b).forEach(visit);
  return { ...checked, order };
}
