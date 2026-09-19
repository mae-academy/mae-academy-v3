/**
 * Bidirectional LAD <-> Siemens S7-200 STL (AWL) transpiler.
 *
 *   ladToIl(networks)                -> STL source text
 *   ilToLad(source, profile)         -> reconstructed LAD networks
 *   exportMicroWin(networks, ...)    -> STEP 7-Micro/WIN .awl (+ optional .sym)
 *
 * Pure TypeScript with no DOM access, so the whole module can be moved into the simulation worker.
 */

export {
  DEFAULT_FORMAT,
  formatIl,
  formatIlLine,
  ladToIl,
  ladToIlNetworks,
  type FormatOptions,
  type IlLine,
  type IlNetwork,
} from './lad-to-il';

export { ilToLad } from './il-to-lad';

export {
  DEFAULT_EXPORT_OPTIONS,
  exportMicroWin,
  type ExportFile,
  type ExportOptions,
} from './microwin-exporter';

export { tokenize, type NetworkBlock, type Token, type TokenizeOutput } from './tokenizer';

export {
  LOGIC_STACK_DEPTH,
  timerResolution,
  type SymbolEntry,
  type SymbolMap,
  type TranspileCode,
  type TranspileDiagnostic,
  type TranspileResult,
  type TranspileSeverity,
} from './types';
