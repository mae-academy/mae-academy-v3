# v86 Headless Integration Findings

## Sources inspected

The analysis used the user-supplied [`copy/v86`](https://github.com/copy/v86) repository at commit `f3d4472`, its public TypeScript declaration, the official serial and save/restore examples, and the repository license.

## Confirmed public capabilities

The documented `V86` API can run and stop emulation, save and restore whole-machine snapshots, return an instruction counter, read and write raw memory, and emit serial-port output events. The official examples demonstrate state snapshots and a screenless serial output path. Those public APIs are adequate for **reset**, **memory reads**, **snapshot-based reverse stepping**, and a custom terminal based on serial output.

The build system explicitly supports `build/libv86.mjs` as an ESM browser library and `build/v86.wasm` as its WebAssembly engine. The upstream project is released under the BSD 2-Clause license; redistributed binary artifacts must retain the copyright notice and disclaimer.

The repository documents an official `v86` npm package for bundler-based Vite, React, Next.js, and Webpack usage. The installed official package is version `0.5.432+gf3d4472`; it includes `libv86.mjs`, `v86.wasm`, debug variants, and the TypeScript declaration, but it does not include BIOS ROMs. The reviewed SeaBIOS and VGA BIOS assets have therefore been staged as project-managed static assets with retained attribution requirements.

## Required adapter changes

The published TypeScript definition does **not** expose a single-instruction step API, typed register access, or software-interrupt interception. The implementation must therefore use a small, documented fork of the headless engine that adds a narrow debug bridge, rather than importing any upstream UI. The bridge must expose: one-instruction execution; normalized 16-bit register and flag snapshots; and an `INT 10h`/`INT 21h` event callback. Its source changes should be isolated, reviewed at each upstream refresh, and copied into the attribution notice.

The limitation is confirmed by the upstream source: a normal browser tick invokes `cpu.main_loop()` rather than a public single-instruction routine. The debug bundle exposes the same loop and has no implementation for `debug_interrupt`. Consequently, stopping based on the instruction counter cannot guarantee exactly one instruction and must not be presented as a valid `step()` implementation.

The core can read memory through the public `read_memory` API. v86’s internal CPU has `reg32`, `sreg`, `flags`, and instruction-counter views, but relying on them directly from React would be an unstable internal coupling. The wrapper should receive those values only through the added bridge.

## Architecture decision

The emulator will remain entirely client-side. A dedicated browser worker owns the headless engine and receives assembly, run, step, reset, breakpoint, memory, stack, and keyboard messages. A main-thread `EmulatorCore` facade provides the typed API consumed by React. All execution traffic is message-based so continuous execution cannot block rendering.

The official repository lists Rust with `wasm32-unknown-unknown`, a compatible clang toolchain, Java/Closure Compiler, and Node.js as build prerequisites for a maintained fork. This sandbox does not currently include Rust or the WebAssembly target; a reproducible fork build must add those prerequisites before the bridge can produce a replacement ESM and WASM pair.

## Assembly scope

v86 consumes machine code, not MASM source. A full MASM-compatible compiler is a separate large project and is not included in v86. The first integration must therefore declare a supported educational subset and produce source-line metadata for breakpoints. The subset can grow safely only after instruction-level tests are added.
