/**
 * Verifies spiceWorker.ts's `extractWasmModule` — the piece that lets every simulation get a fresh
 * ngspice instance (required: see spiceWorker.ts's "jump to zero" comment) without re-decoding and
 * recompiling the vendored ~5.3 MB wasm binary on every single circuit edit.
 *
 * Imports spiceWorker.ts under plain Node (not jsdom): its top-level `ctx.addEventListener(...)`
 * is guarded to skip registration when `addEventListener` doesn't exist on `globalThis`, which is
 * true here and true in no real Worker — this only exists so the module is safely importable for
 * its other exports. jsdom was tried first, but its `import.meta.url` for a test file resolves to
 * an internal Vite dev-server URL rather than a real `file:` path, and Node's dynamic `import()`
 * needs the latter (see the `file:` URL note just below).
 *
 * This cannot drive spiceWorker.ts's own `loadGlue` end to end: it loads via a `blob:` URL, which
 * Node's ESM loader does not support for dynamic `import()` (verified directly — only file, data
 * and node schemes are). So this obtains the same factory independently, the way
 * ngspiceRegression.test.ts's harness does (a `file:` URL import of the identical vendored asset),
 * and feeds it the real, exported `extractWasmModule` from spiceWorker.ts — the actual code that
 * ships, not a reimplementation of it.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { extractWasmModule } from "@/simulators/circuit-engine/engine/spiceWorker";
import { parseSpiceRawFile } from "@/simulators/circuit-engine/engine/spiceRawParser";

const NGSPICE_JS_URL = new URL(
  "../../../../public/spice/ngspice.js",
  import.meta.url
).href;

interface EmscriptenFS {
  writeFile(path: string, data: string | Uint8Array): void;
  readFile(path: string): Uint8Array;
  mkdir(path: string): void;
  analyzePath(path: string): { exists: boolean };
}

interface NgspiceModule {
  FS: EmscriptenFS;
  ENV: Record<string, string>;
  HEAPU32: Uint32Array;
  ExitStatus: new (status: number) => { name: string; status: number };
  stackSave(): number;
  stackRestore(pointer: number): void;
  stackAlloc(size: number): number;
  stringToUTF8(str: string, outPtr: number, maxBytes: number): void;
  lengthBytesUTF8(str: string): number;
  _main(argc: number, argv: number): number;
}

type NgspiceFactory = (
  options: Record<string, unknown>
) => Promise<NgspiceModule>;

function mkdirSafe(fs: EmscriptenFS, path: string): void {
  try {
    fs.mkdir(path);
  } catch {
    // Already exists.
  }
}

async function loadFactoryAndSource(): Promise<{
  factory: NgspiceFactory;
  sourceText: string;
}> {
  // Reads the same way ngspice.js's own Node-environment branch does (fs.readFileSync), rather
  // than fetch: Node's fetch support for `file:` URLs is newer and more version-dependent.
  const sourceText = readFileSync(fileURLToPath(NGSPICE_JS_URL), "utf8");
  const mod = (await import(/* @vite-ignore */ NGSPICE_JS_URL)) as {
    default?: NgspiceFactory;
  };
  if (typeof mod.default !== "function") {
    throw new Error("ngspice.js did not export a factory function.");
  }
  return { factory: mod.default, sourceText };
}

/** Boots one ngspice instance, optionally reusing a precompiled module, and runs one netlist. */
async function bootAndRun(
  factory: NgspiceFactory,
  netlist: string,
  wasmModule: WebAssembly.Module | null
): Promise<{ vNode2: number; bootMs: number }> {
  const options: Record<string, unknown> = {
    noInitialRun: true,
    stdin: () => null,
    print: () => {},
    printErr: () => {},
    preRun: (module: NgspiceModule) => {
      module.ENV = module.ENV ?? {};
      module.ENV.HOME = "/";
      mkdirSafe(module.FS, "/proc");
      module.FS.writeFile(
        "/proc/meminfo",
        "MemTotal: 16400000 kB\nMemFree: 16000000 kB\n"
      );
      mkdirSafe(module.FS, "/proc/self");
      module.FS.writeFile(
        "/proc/self/statm",
        "100000 50000 10000 5000 0 0 0\n"
      );
      module.ENV.SPICE_LIB_DIR = "/usr/local/share/ngspice";
      for (const directory of [
        "/usr",
        "/usr/local",
        "/usr/local/share",
        "/usr/local/share/ngspice",
        "/usr/local/share/ngspice/scripts",
      ]) {
        mkdirSafe(module.FS, directory);
      }
      module.FS.writeFile(
        "/usr/local/share/ngspice/scripts/spinit",
        "* init\n"
      );
    },
  };

  // The exact hook spiceWorker.ts installs when `extractWasmModule` succeeds.
  if (wasmModule) {
    options.instantiateWasm = (
      imports: WebAssembly.Imports,
      successCallback: (
        instance: WebAssembly.Instance,
        module: WebAssembly.Module
      ) => void
    ) => {
      WebAssembly.instantiate(wasmModule, imports).then(instance =>
        successCallback(instance, wasmModule)
      );
      return {};
    };
  }

  const bootStart = performance.now();
  const module = await factory(options);
  const bootMs = performance.now() - bootStart;

  module.FS.writeFile("/sim.cir", netlist);
  const args = ["ngspice", "-b", "-n", "-r", "/out.raw", "/sim.cir"];
  const stack = module.stackSave();
  try {
    const argv = module.stackAlloc((args.length + 1) * 4);
    args.forEach((arg, index) => {
      const size = module.lengthBytesUTF8(arg) + 1;
      const pointer = module.stackAlloc(size);
      module.stringToUTF8(arg, pointer, size);
      module.HEAPU32[(argv >> 2) + index] = pointer;
    });
    module.HEAPU32[(argv >> 2) + args.length] = 0;
    module._main(args.length, argv);
  } catch (cause) {
    const isExit =
      cause instanceof module.ExitStatus ||
      (typeof cause === "object" &&
        cause !== null &&
        (cause as { name?: string }).name === "ExitStatus");
    if (!isExit) throw cause;
  } finally {
    module.stackRestore(stack);
  }

  if (!module.FS.analyzePath("/out.raw").exists) {
    throw new Error("ngspice produced no rawfile for this netlist.");
  }
  const vectors = parseSpiceRawFile(module.FS.readFile("/out.raw"));
  const vNode2 = vectors["v(n2)"]?.at(-1);
  if (vNode2 === undefined) throw new Error("Could not find v(n2) in the rawfile.");
  return { vNode2, bootMs };
}

// A 5 V / 220 Ω / 780 Ω divider: v(n2) = 5 * 780 / 1000 = 3.9 V, distinct from either resistor's
// value so a wiring mistake in this test's own deck would be obvious.
const DECK = "cache test\nV1 n1 0 DC 5\nR1 n1 n2 220\nR2 n2 0 780\n.op\n.end\n";

describe("spiceWorker's cached-compiled-module optimization", () => {
  it("extracts a real, working WebAssembly.Module from the vendored asset", async () => {
    const { sourceText } = await loadFactoryAndSource();
    const wasmModule = await extractWasmModule(sourceText);
    expect(wasmModule).toBeInstanceOf(WebAssembly.Module);
  });

  it("returns null instead of throwing when the expected layout isn't found", async () => {
    await expect(
      extractWasmModule("this is not ngspice.js at all")
    ).resolves.toBeNull();
  });

  it(
    "reuses one compiled module correctly across multiple independent instances",
    async () => {
      const { factory, sourceText } = await loadFactoryAndSource();
      const wasmModule = await extractWasmModule(sourceText);
      expect(wasmModule).not.toBeNull();

      // Two separate `factory()` calls off the same compiled module, exactly as spiceWorker.ts's
      // `createModule` does for two separate simulations — each must be a fully independent,
      // correctly-isolated instance despite sharing the compiled bytecode.
      const first = await bootAndRun(factory, DECK, wasmModule);
      const second = await bootAndRun(factory, DECK, wasmModule);
      expect(first.vNode2).toBeCloseTo(3.9, 6);
      expect(second.vNode2).toBeCloseTo(3.9, 6);
    },
    20_000
  );

  it(
    "boots a fresh instance markedly faster once the module is cached",
    async () => {
      const { factory, sourceText } = await loadFactoryAndSource();

      // Cold: the glue's own default instantiation path, decoding and compiling from scratch.
      const cold = await bootAndRun(factory, DECK, null);
      expect(cold.vNode2).toBeCloseTo(3.9, 6);

      const wasmModule = await extractWasmModule(sourceText);
      expect(wasmModule).not.toBeNull();

      // Warm: the cached-module path a second (and third) simulation actually takes in production.
      const warm = await bootAndRun(factory, DECK, wasmModule);
      expect(warm.vNode2).toBeCloseTo(3.9, 6);

      // A large margin under the ~10x measured locally: this only needs to prove the optimization
      // is real, not pin down an exact ratio that could vary across machines.
      expect(warm.bootMs).toBeLessThan(cold.bootMs / 2);
    },
    20_000
  );
});
