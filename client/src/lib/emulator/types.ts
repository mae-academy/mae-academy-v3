/** MAE 8086 Emulator Core contract — headless browser execution only. */
export type FlagName = "ZF" | "SF" | "CF" | "OF" | "PF" | "AF" | "IF" | "DF";

export interface CpuState {
  registers: { ax: number; bx: number; cx: number; dx: number; ah: number; al: number; bh: number; bl: number; ch: number; cl: number; dh: number; dl: number };
  pointers: { si: number; di: number; bp: number; sp: number; ip: number };
  segments: { cs: number; ds: number; es: number; ss: number };
  flags: Record<FlagName, boolean>;
  instructionCount: number;
}

export interface StackCell { address: number; value: number; }
export interface AssemblerDiagnostic { line: number; message: string; source: string; }
export interface ComDataRange { start: number; end: number; label?: string; }
export interface AssembledProgram {
  /** Contiguous COM image bytes. The first byte is loaded at `origin`. */
  bytes: Uint8Array;
  diagnostics: AssemblerDiagnostic[];
  /** Real-mode offsets, not physical addresses, mapped back to source lines. */
  sourceByOffset: Map<number, number>;
  source: string[];
  /** DOS COM entry offset, normally 0100h. */
  origin: number;
  /** First data offset, or the end of the image when no data directives exist. */
  dataOffset: number;
  /** Case-normalized source symbols with their exact COM offsets. */
  symbols: Map<string, number>;
  /** Instruction entry offsets. Data is intentionally excluded. */
  executableOffsets: Set<number>;
  /** HLT / INT 20h offsets; the core uses these as hard execution boundaries. */
  haltOffsets: Set<number>;
  /** Calculated memory areas created by DB and DW directives, including post-HLT data. */
  dataRanges: ComDataRange[];
}
export interface ExecutionTraceEntry { step: number; line: number | null; instruction: string; value: string; }
export interface InterruptPayload { interrupt: number; ah: number; dx: number; al: number; state: CpuState; }

export interface EmulatorCoreEvents {
  onStateChange?: (state: CpuState) => void;
  onInterruptTriggered?: (payload: InterruptPayload) => void;
  onTerminalOutput?: (text: string) => void;
  onTrace?: (entry: ExecutionTraceEntry) => void;
  onError?: (message: string) => void;
}
