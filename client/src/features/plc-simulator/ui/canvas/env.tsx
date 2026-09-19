import { createContext, useContext } from 'react';
import type { NetworkId, NodeId } from '../../domain/ast';
import type { HardwareProfile } from '../../domain/hardware';
import type { SymbolMap } from '../../transpiler';
import type { SlotKey } from './operand-slots';

export interface EditingTarget {
  readonly networkId: NetworkId;
  readonly nodeId: NodeId;
  readonly slot: SlotKey;
}

/**
 * Editing environment shared by every symbol label. Passing it through context keeps the symbol
 * components free of prop-drilled callbacks while the drawing code stays separate from the
 * interaction handlers that live in `LadderCanvas`.
 */
export interface LadderEnv {
  readonly profile: HardwareProfile;
  readonly symbols: SymbolMap;
  /** False while a simulation is driving the canvas or the host asked for a read-only view. */
  readonly interactive: boolean;
  readonly editing: EditingTarget | null;
  beginEdit(nodeId: NodeId, slot: SlotKey): void;
  commitEdit(nodeId: NodeId, slot: SlotKey, text: string): void;
  cancelEdit(): void;
  /** Problem with `text` for that slot, or null when acceptable. */
  validate(nodeId: NodeId, slot: SlotKey, text: string): string | null;
}

export const LadderEnvContext = createContext<LadderEnv | null>(null);

export function useLadderEnv(): LadderEnv | null {
  return useContext(LadderEnvContext);
}
