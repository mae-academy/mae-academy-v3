/** MAE headless v86 adapter — no upstream UI, only a typed browser-side engine bridge. */
import { assembleMasmSubset, COM_ORIGIN, COM_SEGMENT } from "./assembler";
import type { AssembledProgram, CpuState, EmulatorCoreEvents, ExecutionTraceEntry, InterruptPayload, StackCell } from "./types";

const V86_MODULE_URL = "/manus-storage/mae-v86-headless_edf4ece3.mjs";
const V86_WASM_URL = "/manus-storage/mae-v86-headless_24ce7043.wasm";
const SEABIOS_URL = "/manus-storage/seabios_bf8f5b52.bin";
const VGABIOS_URL = "/manus-storage/vgabios_345f9dcd.bin";
const CODE_SEGMENT = COM_SEGMENT; const PROGRAM_OFFSET = COM_ORIGIN; const STACK_OFFSET = 0xfffe;
const SEGMENT = { ES: 0, CS: 1, SS: 2, DS: 3 } as const;

interface CpuBridge {
  reg32: Int32Array; sreg: Uint16Array; flags: Int32Array; instruction_counter: Uint32Array; instruction_pointer: Int32Array; previous_ip: Int32Array; segment_offsets: Int32Array; segment_limits: Uint32Array; segment_is_null: Uint8Array; protected_mode: Int32Array; is_32: Int32Array; stack_size_32: Int32Array; cpl: Uint8Array; in_hlt: Uint8Array; last_virt_eip: Int32Array; eip_phys: Int32Array;
  get_eflags(): number; update_state_flags(): void; mae_step_instruction(): void;
}
interface HeadlessV86 { v86: { cpu: CpuBridge }; add_listener(event: string, listener: (payload: unknown) => void): void; remove_listener(event: string, listener: (payload: unknown) => void): void; save_state(): Promise<ArrayBuffer>; restore_state(state: ArrayBuffer): Promise<void>; read_memory(offset: number, length: number): Uint8Array; write_memory(data: Uint8Array, offset: number): void; destroy(): Promise<void>; }
type V86Constructor = new (options: Record<string, unknown>) => HeadlessV86;

const word = (value: number) => value & 0xffff;
const hex = (value: number, digits = 4) => `${word(value).toString(16).toUpperCase().padStart(digits, "0")}h`;
const wait = (milliseconds: number) => new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));

export class EmulatorCore {
  private instance: HeadlessV86 | null = null; private program: AssembledProgram | null = null; private initialState: ArrayBuffer | null = null; private snapshots: ArrayBuffer[] = []; private breakpoints = new Set<number>(); private traceStep = 0; private running = false; private halted = false; private pendingKeyboard: number[] = [];
  constructor(private readonly events: EmulatorCoreEvents = {}) {}

  async initialize() {
    if (this.instance) return;
    const module = await import(/* @vite-ignore */ V86_MODULE_URL) as { default: V86Constructor };
    const V86 = module.default;
    const instance = new V86({ autostart: false, disable_jit: true, disable_keyboard: true, disable_mouse: true, disable_speaker: true, memory_size: 16 * 1024 * 1024, vga_memory_size: 2 * 1024 * 1024, bios: { url: SEABIOS_URL }, vga_bios: { url: VGABIOS_URL }, screen: { ansi: false }, serial_console: { type: "none" }, wasm_fn: async (env: WebAssembly.Imports) => { const response = await fetch(V86_WASM_URL); if (!response.ok) throw new Error("Unable to load the MAE v86 engine"); const bytes = await response.arrayBuffer(); const { instance } = await WebAssembly.instantiate(bytes, env); return instance.exports; } });
    await new Promise<void>((resolve, reject) => { const timeout = window.setTimeout(() => reject(new Error("The v86 engine did not initialize in time")), 15000); instance.add_listener("emulator-ready", () => { window.clearTimeout(timeout); resolve(); }); instance.add_listener("download-error", () => { window.clearTimeout(timeout); reject(new Error("A required v86 runtime asset could not be loaded")); }); });
    instance.add_listener("mae-interrupt", (payload) => this.handleInterrupt(payload as [number, number, number]));
    this.instance = instance;
  }

  async assembleAndLoad(code: string): Promise<boolean> {
    await this.initialize(); const program = assembleMasmSubset(code);
    if (program.diagnostics.length) { this.events.onError?.(program.diagnostics.map((diagnostic) => `L${diagnostic.line}: ${diagnostic.message}`).join("\n")); return false; }
    const cpu = this.cpu(); cpu.reg32.fill(0); cpu.sreg.fill(0); cpu.segment_offsets.fill(0); cpu.segment_limits.fill(0xffff); cpu.segment_is_null.fill(0); cpu.protected_mode[0] = 0; cpu.is_32[0] = 0; cpu.stack_size_32[0] = 0; cpu.cpl[0] = 0; cpu.flags[0] = 0x202; cpu.in_hlt[0] = 0;
    // DOS COM flat model: every real-mode segment shares one PSP-relative base.
    this.setSegment(cpu, SEGMENT.CS, CODE_SEGMENT); this.setSegment(cpu, SEGMENT.DS, CODE_SEGMENT); this.setSegment(cpu, SEGMENT.ES, CODE_SEGMENT); this.setSegment(cpu, SEGMENT.SS, CODE_SEGMENT);
    cpu.reg32[4] = STACK_OFFSET; cpu.instruction_pointer[0] = (CODE_SEGMENT << 4) + program.origin; cpu.previous_ip[0] = cpu.instruction_pointer[0]; cpu.last_virt_eip[0] = -1; cpu.eip_phys[0] = 0; cpu.update_state_flags();
    this.instance!.write_memory(program.bytes, (CODE_SEGMENT << 4) + program.origin); this.program = program; this.snapshots = []; this.traceStep = 0; this.halted = false; this.initialState = await this.instance!.save_state(); this.emitState(); return true;
  }

  async run() { if (!this.program) throw new Error("Assemble a program before running it"); this.running = true; let budget = 0; while (this.running && !this.halted) { const line = this.currentLine(); if ((line === null && budget > 0) || (line !== null && this.breakpoints.has(line) && budget > 0)) break; if (budget >= 2048) { this.events.onError?.("Execution stopped after 2048 instructions outside the mapped source range"); break; } await this.step(); budget++; if (budget % 24 === 0) await wait(0); } this.running = false; }
  stop() { this.running = false; }
  async step() { if (!this.program || this.halted) return; const before = this.getCpuState(); if (!this.program.executableOffsets.has(before.pointers.ip)) { this.halted = true; this.running = false; this.events.onError?.("Execution entered an unmapped data region"); return; } this.snapshots.push(await this.instance!.save_state()); if (this.snapshots.length > 96) this.snapshots.shift(); const line = this.currentLine(); const stopOffset = this.program.haltOffsets.has(before.pointers.ip); this.cpu().mae_step_instruction(); this.traceStep++; if (stopOffset || this.cpu().in_hlt[0] !== 0) { this.halted = true; this.running = false; } const state = this.getCpuState(); const instruction = line ? this.program.source[line - 1].trim() : "—"; const entry: ExecutionTraceEntry = { step: this.traceStep, line, instruction, value: `AX=${hex(state.registers.ax)}` }; this.events.onTrace?.(entry); this.emitState(); }
  async stepBack() { const snapshot = this.snapshots.pop(); if (!snapshot || !this.instance) return; this.running = false; await this.instance.restore_state(snapshot); await wait(0); this.traceStep = Math.max(0, this.traceStep - 1); this.halted = false; this.emitState(); }
  async reset() { if (!this.initialState || !this.instance) return; this.running = false; await this.instance.restore_state(this.initialState.slice(0)); this.snapshots = []; this.traceStep = 0; this.halted = false; this.emitState(); }
  setBreakpoint(lineNumber: number) { this.breakpoints.add(lineNumber); }
  clearBreakpoint(lineNumber: number) { this.breakpoints.delete(lineNumber); }
  sendKey(text: string) { this.pendingKeyboard.push(...Array.from(text).map((character) => character.charCodeAt(0) & 0xff)); }
  readMemory(startAddress: number, length: number) { return this.instance?.read_memory(startAddress >>> 0, Math.max(0, length)).slice() ?? new Uint8Array(); }
  getStackState(length = 10): StackCell[] { const state = this.getCpuState(); const start = (state.segments.ss << 4) + state.pointers.sp; const memory = this.readMemory(start, length * 2); return Array.from({ length }, (_, index) => ({ address: start + index * 2, value: (memory[index * 2] ?? 0) | ((memory[index * 2 + 1] ?? 0) << 8) })); }
  getCpuState(): CpuState { const cpu = this.cpu(); const ax = word(cpu.reg32[0]), cx = word(cpu.reg32[1]), dx = word(cpu.reg32[2]), bx = word(cpu.reg32[3]); const flags = cpu.get_eflags(); const csBase = cpu.segment_offsets[SEGMENT.CS] >>> 0; return { registers: { ax, bx, cx, dx, ah: ax >> 8, al: ax & 0xff, bh: bx >> 8, bl: bx & 0xff, ch: cx >> 8, cl: cx & 0xff, dh: dx >> 8, dl: dx & 0xff }, pointers: { si: word(cpu.reg32[6]), di: word(cpu.reg32[7]), bp: word(cpu.reg32[5]), sp: word(cpu.reg32[4]), ip: word((cpu.instruction_pointer[0] >>> 0) - csBase) }, segments: { cs: word(cpu.sreg[SEGMENT.CS]), ds: word(cpu.sreg[SEGMENT.DS]), es: word(cpu.sreg[SEGMENT.ES]), ss: word(cpu.sreg[SEGMENT.SS]) }, flags: { CF: Boolean(flags & 0x001), PF: Boolean(flags & 0x004), AF: Boolean(flags & 0x010), ZF: Boolean(flags & 0x040), SF: Boolean(flags & 0x080), IF: Boolean(flags & 0x200), DF: Boolean(flags & 0x400), OF: Boolean(flags & 0x800) }, instructionCount: cpu.instruction_counter[0] >>> 0 }; }
  async dispose() { this.running = false; await this.instance?.destroy(); this.instance = null; }

  private cpu() { if (!this.instance) throw new Error("The emulator core has not initialized"); return this.instance.v86.cpu; }
  private setSegment(cpu: CpuBridge, index: number, value: number) { cpu.sreg[index] = value; cpu.segment_offsets[index] = value << 4; cpu.segment_limits[index] = 0xffff; cpu.segment_is_null[index] = 0; }
  private currentLine() { if (!this.program) return null; return this.program.sourceByOffset.get(this.getCpuState().pointers.ip) ?? null; }
  private emitState() { this.events.onStateChange?.(this.getCpuState()); }
  private handleInterrupt([interrupt, ah, dx]: [number, number, number]) { const state = this.getCpuState(); const payload: InterruptPayload = { interrupt, ah, dx, al: state.registers.al, state }; this.events.onInterruptTriggered?.(payload); if (interrupt === 0x10 && ah === 0x0e) this.events.onTerminalOutput?.(String.fromCharCode(state.registers.al)); if (interrupt === 0x21 && ah === 0x02) this.events.onTerminalOutput?.(String.fromCharCode(state.registers.dl)); if (interrupt === 0x21 && (ah === 0x01 || ah === 0x08)) { const key = this.pendingKeyboard.shift() ?? 0; const cpu = this.cpu(); cpu.reg32[0] = (cpu.reg32[0] & 0xffffff00) | key; if (ah === 0x01 && key) this.events.onTerminalOutput?.(String.fromCharCode(key)); } if (interrupt === 0x21 && ah === 0x09) { const start = (state.segments.ds << 4) + dx; const characters: string[] = []; for (const byte of Array.from(this.readMemory(start, 512))) { if (byte === 0x24) break; characters.push(String.fromCharCode(byte)); } this.events.onTerminalOutput?.(characters.join("")); } if (interrupt === 0x21 && ah === 0x4c) { this.halted = true; this.running = false; } }
}
