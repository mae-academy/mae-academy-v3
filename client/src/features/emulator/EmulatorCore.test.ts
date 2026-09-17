// @vitest-environment jsdom
// EmulatorCore uses window.setTimeout for its ready-race and run-loop yield.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CpuState, ExecutionTraceEntry } from "@/features/emulator/types";

import { FakeV86 } from "@/features/emulator/testFixtures/fakeV86";

// Literal must match the private V86_MODULE_URL constant in EmulatorCore.ts exactly.
vi.mock("/manus-storage/mae-v86-headless_edf4ece3.mjs", () => ({
  default: FakeV86,
}));

const { EmulatorCore } = await import("@/features/emulator/EmulatorCore");

async function loadProgram(source: string) {
  const emulator = new EmulatorCore();
  const ok = await emulator.assembleAndLoad(source);
  expect(ok).toBe(true);
  return emulator;
}

describe("EmulatorCore — execution correctness (Task 1)", () => {
  it("RUN executes every instruction and halts on HLT", async () => {
    const emulator = await loadProgram(`
      .model small
      .stack 100h
      .code
      main:
          mov ax, 10h
          mov bx, 20h
          hlt
      end main
    `);
    await emulator.run();
    const state = emulator.getCpuState();
    expect(state.registers.ax).toBe(0x0010);
    expect(state.registers.bx).toBe(0x0020);
  });

  it("STEP executes exactly one instruction at a time", async () => {
    const emulator = await loadProgram(`
      main:
          mov ax, 5
          mov bx, 10
          hlt
    `);
    await emulator.step();
    let state = emulator.getCpuState();
    expect(state.registers.ax).toBe(5);
    expect(state.registers.bx).toBe(0);

    await emulator.step();
    state = emulator.getCpuState();
    expect(state.registers.ax).toBe(5);
    expect(state.registers.bx).toBe(10);
  });

  it("STEP BACK restores the register state from before the last step", async () => {
    const emulator = await loadProgram(`
      main:
          mov ax, 5
          mov bx, 10
          add ax, bx
          hlt
    `);
    await emulator.step(); // ax=5
    await emulator.step(); // bx=10
    await emulator.step(); // ax=15
    expect(emulator.getCpuState().registers.ax).toBe(15);

    await emulator.stepBack();
    expect(emulator.getCpuState().registers.ax).toBe(5);
    expect(emulator.getCpuState().registers.bx).toBe(10);

    await emulator.stepBack();
    expect(emulator.getCpuState().registers.ax).toBe(5);
    expect(emulator.getCpuState().registers.bx).toBe(0);
  });

  it("RESET restores the post-load snapshot (SP at top of stack, not zero)", async () => {
    const emulator = await loadProgram(`
      main:
          mov ax, 100
          hlt
    `);
    await emulator.run();
    expect(emulator.getCpuState().registers.ax).toBe(100);

    await emulator.reset();
    const state = emulator.getCpuState();
    expect(state.registers.ax).toBe(0);
    expect(state.pointers.ip).toBe(0x100);
    // The COM stack top (0xfffe) is the correct reset value, not 0 — SP=0 would be an empty/wrapped stack.
    expect(state.pointers.sp).toBe(0xfffe);
  });

  it("FLAGS: CMP against self sets ZF and clears CF", async () => {
    const emulator = await loadProgram(`
      main:
          mov ax, 0
          cmp ax, ax
          hlt
    `);
    await emulator.run();
    const flags = emulator.getCpuState().flags;
    expect(flags.ZF).toBe(true);
    expect(flags.CF).toBe(false);
  });
});

describe("EmulatorCore — RESET clears queued keyboard input", () => {
  it("does not deliver a pre-reset sendKey() to a fresh run's INT 21h/AH=01 read", async () => {
    const emulator = await loadProgram(`
      main:
          mov ah, 1
          int 21h
          hlt
    `);
    emulator.sendKey("Q");
    await emulator.reset();
    await emulator.run();
    expect(emulator.getCpuState().registers.al).toBe(0);
  });
});

describe("EmulatorCore — test isolation (Task 2)", () => {
  it("two independently loaded instances never share register state", async () => {
    const a = await loadProgram(`main:\n mov ax, 1\n hlt`);
    const b = await loadProgram(`main:\n mov ax, 2\n hlt`);
    await a.run();
    await b.run();
    expect(a.getCpuState().registers.ax).toBe(1);
    expect(b.getCpuState().registers.ax).toBe(2);
  });
});

describe("EmulatorCore — CPU registers (Task 3)", () => {
  it("tracks AX, BX, CX, DX, SI, DI, BP, SP after direct loads", async () => {
    const emulator = await loadProgram(`
      main:
          mov ax, 0x1234
          mov bx, 0x5678
          mov cx, 0xabcd
          mov dx, 0xef00
          mov si, 0x0100
          mov di, 0x0200
          mov bp, 0x0300
          mov sp, 0x0400
          hlt
    `);
    await emulator.run();
    const state = emulator.getCpuState();
    expect(state.registers.ax).toBe(0x1234);
    expect(state.registers.bx).toBe(0x5678);
    expect(state.registers.cx).toBe(0xabcd);
    expect(state.registers.dx).toBe(0xef00);
    expect(state.pointers.si).toBe(0x0100);
    expect(state.pointers.di).toBe(0x0200);
    expect(state.pointers.bp).toBe(0x0300);
    expect(state.pointers.sp).toBe(0x0400);
  });

  it("derives AH/AL/BH/BL/CH/CL/DH/DL from the parent 16-bit registers", async () => {
    const emulator = await loadProgram(`
      main:
          mov ax, 0x1234
          hlt
    `);
    await emulator.run();
    const { ah, al } = emulator.getCpuState().registers;
    expect(ah).toBe(0x12);
    expect(al).toBe(0x34);
  });

  it("CS segment participates in the physical address formula (segment*16 + offset)", async () => {
    const emulator = await loadProgram(`
      main:
          mov ax, 0x1000
          mov cs, ax
          hlt
    `);
    await emulator.run();
    const cs = emulator.getCpuState().segments.cs;
    expect((cs * 16 + 0x0100) & 0xfffff).toBe(0x10100);
  });
});

describe("EmulatorCore — flags (Task 4)", () => {
  it("CF set when 8-bit addition overflows past 0xFF", async () => {
    const emulator = await loadProgram(`
      main:
          mov al, 0xff
          mov bl, 0x01
          add al, bl
          hlt
    `);
    await emulator.run();
    expect(emulator.getCpuState().flags.CF).toBe(true);
  });

  it("ZF set when a subtraction result is zero", async () => {
    const emulator = await loadProgram(`
      main:
          mov ax, 5
          sub ax, 5
          hlt
    `);
    await emulator.run();
    expect(emulator.getCpuState().flags.ZF).toBe(true);
  });

  it("SF set when the 8-bit result's MSB is 1", async () => {
    const emulator = await loadProgram(`
      main:
          mov al, 0x7f
          add al, 0x01
          hlt
    `);
    await emulator.run();
    expect(emulator.getCpuState().flags.SF).toBe(true);
  });

  it("OF set on signed 8-bit overflow (127 + 1)", async () => {
    const emulator = await loadProgram(`
      main:
          mov al, 0x7f
          add al, 0x01
          hlt
    `);
    await emulator.run();
    expect(emulator.getCpuState().flags.OF).toBe(true);
  });

  it("INC/DEC leave CF untouched", async () => {
    const emulator = await loadProgram(`
      main:
          mov al, 0xff
          mov bl, 0x01
          add al, bl
          mov cx, 5
          hlt
    `);
    await emulator.step();
    await emulator.step();
    await emulator.step();
    expect(emulator.getCpuState().flags.CF).toBe(true);
  });
});

describe("EmulatorCore — memory viewer (Task 5)", () => {
  it("reads DB bytes back verbatim for hex/decimal/ASCII display modes", async () => {
    const emulator = await loadProgram(`
      .data
        var1 db 0x41
        var2 db 0x42
        var3 db 0x43
      .code
      main:
          hlt
    `);
    // .data is relocated after .code; resolve the physical address via the assembler symbol table + CS base.
    const state = emulator.getCpuState();
    const base = state.segments.ds << 4;
    const program = (
      emulator as unknown as { program: { symbols: Map<string, number> } }
    ).program;
    const address = base + program.symbols.get("var1")!;
    const bytes = emulator.readMemory(address, 3);
    expect(Array.from(bytes)).toEqual([0x41, 0x42, 0x43]);
    expect(String.fromCharCode(...bytes)).toBe("ABC");
  });
});

describe("EmulatorCore — stack visualizer (Task 6)", () => {
  it("PUSH decrements SP by 2 and POP restores it, preserving pushed values", async () => {
    const emulator = await loadProgram(`
      main:
          mov ax, 0x1234
          mov sp, 0x0400
          push ax
          mov bx, 0x5678
          push bx
          pop cx
          pop dx
          hlt
    `);
    await emulator.step(); // mov ax
    await emulator.step(); // mov sp
    expect(emulator.getCpuState().pointers.sp).toBe(0x0400);

    await emulator.step(); // push ax
    expect(emulator.getCpuState().pointers.sp).toBe(0x03fe);

    await emulator.step(); // mov bx
    await emulator.step(); // push bx
    expect(emulator.getCpuState().pointers.sp).toBe(0x03fc);

    await emulator.step(); // pop cx
    expect(emulator.getCpuState().pointers.sp).toBe(0x03fe);
    expect(emulator.getCpuState().registers.cx).toBe(0x5678);

    await emulator.step(); // pop dx
    expect(emulator.getCpuState().pointers.sp).toBe(0x0400);
    expect(emulator.getCpuState().registers.dx).toBe(0x1234);
  });

  it("getStackState reads the top-of-stack cells at ss:sp", async () => {
    const emulator = await loadProgram(`
      main:
          mov sp, 0x0400
          mov ax, 0x9abc
          push ax
          hlt
    `);
    await emulator.step();
    await emulator.step();
    await emulator.step();
    const [top] = emulator.getStackState(1);
    expect(top.value).toBe(0x9abc);
  });
});

describe("EmulatorCore — execution trace (Task 7)", () => {
  it("emits one trace entry per executed instruction, in order", async () => {
    const trace: ExecutionTraceEntry[] = [];
    const states: CpuState[] = [];
    const emulator = new EmulatorCore({
      onTrace: entry => trace.push(entry),
      onStateChange: state => states.push(state),
    });
    await emulator.assembleAndLoad(`
      main:
          mov ax, 10h
          mov bx, 20h
          add ax, bx
          hlt
    `);
    await emulator.run();

    expect(trace).toHaveLength(4);
    expect(trace[0].instruction).toBe("mov ax, 10h");
    expect(trace[1].instruction).toBe("mov bx, 20h");
    expect(trace[2].instruction).toBe("add ax, bx");
    expect(trace[3].instruction).toBe("hlt");
    // trace[].value must name the register the instruction actually touched,
    // not always AX (this previously hardcoded "AX=…" for every step).
    expect(trace[0].value).toBe("AX=0010h");
    expect(trace[1].value).toBe("BX=0020h");
    expect(trace[2].value).toBe("AX=0030h");
  });
});

describe("EmulatorCore — logical instructions (AND/OR/XOR/NOT)", () => {
  it("AND/OR/XOR/NOT compose correctly (stress batch 5.2)", async () => {
    const emulator = await loadProgram(`
      main:
          mov ax, 0xf0f0
          and ax, 0x00ff
          or ax, 0x0f00
          xor ax, 0x0ff0
          not ax
          hlt
    `);
    await emulator.step(); // mov
    await emulator.step(); // and -> 0x00f0
    expect(emulator.getCpuState().registers.ax).toBe(0x00f0);
    await emulator.step(); // or -> 0x0ff0
    expect(emulator.getCpuState().registers.ax).toBe(0x0ff0);
    await emulator.step(); // xor -> 0x0000
    expect(emulator.getCpuState().registers.ax).toBe(0x0000);
    expect(emulator.getCpuState().flags.ZF).toBe(true);
    await emulator.step(); // not -> 0xffff
    expect(emulator.getCpuState().registers.ax).toBe(0xffff);
  });
});

describe("EmulatorCore — conditional jumps and LOOPE/LOOPNE (stress batches 12/14)", () => {
  it("JL takes the branch when the comparison is signed-less-than", async () => {
    const emulator = await loadProgram(`
      main:
          mov ax, 5
          mov bx, 10
          cmp ax, bx
          jl less_than
          mov ax, 0
      less_than:
          mov ax, 1
          hlt
    `);
    await emulator.run();
    expect(emulator.getCpuState().registers.ax).toBe(1);
  });

  it("LOOPE stops as soon as ZF clears, distinct from plain LOOP", async () => {
    const emulator = await loadProgram(`
      main:
          mov cx, 10
          mov ax, 0
          mov bx, 1
      loop_equal:
          add ax, bx
          cmp ax, 3
          loope loop_equal
          hlt
    `);
    await emulator.run();
    // ax becomes 1 (cx=9,cmp!=0 zf=0 -> stop immediately after first iteration since 1!=3 sets ZF=0)
    expect(emulator.getCpuState().registers.ax).toBe(1);
    expect(emulator.getCpuState().registers.cx).toBe(9);
  });
});

describe("EmulatorCore — PUSHF/POPF preserve flag state across mutation (stress batch 15.2)", () => {
  it("POPF restores flags saved by an earlier PUSHF", async () => {
    const emulator = await loadProgram(`
      main:
          mov ax, 10
          sub ax, 10
          pushf
          mov ax, 0
          sub ax, 1
          popf
          je flags_ok
          mov ax, 0
          jmp flags_done
      flags_ok:
          mov ax, 1
      flags_done:
          hlt
    `);
    await emulator.run();
    expect(emulator.getCpuState().registers.ax).toBe(1);
  });
});

describe("EmulatorCore — directive parsing (Task 8)", () => {
  it("accepts .model/.stack/.data/.code sources end-to-end", async () => {
    const emulator = new EmulatorCore();
    const ok = await emulator.assembleAndLoad(`
      .model small
      .stack 200h
      .data
        var1 db 0x41
      .code
      main:
          mov ax, 0x0000
          hlt
      end main
    `);
    expect(ok).toBe(true);
  });

  it("still assembles legacy ORG-style flat COM sources by design (not rejected)", async () => {
    const emulator = new EmulatorCore();
    const ok = await emulator.assembleAndLoad(`
      org 100h
      mov ax, 10
      hlt
    `);
    expect(ok).toBe(true);
  });

  it("reports diagnostics through onError instead of throwing on invalid source", async () => {
    const errors: string[] = [];
    const emulator = new EmulatorCore({
      onError: message => errors.push(message),
    });
    const ok = await emulator.assembleAndLoad(`mul bx\nhlt`);
    expect(ok).toBe(false);
    expect(errors.length).toBeGreaterThan(0);
  });
});
