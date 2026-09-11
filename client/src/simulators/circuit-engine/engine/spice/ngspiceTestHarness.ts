/**
 * Test-only bootstrap for the vendored ngspice.wasm binary, used by `ngspiceRegression.test.ts` to
 * run real decks through real ngspice rather than asserting on netlist text. This deliberately
 * mirrors `spiceWorker.ts`'s bootstrap step for step (see its comments for why each one is needed —
 * HOME, /proc stubs, the spinit path) since that is the actual production boot sequence; it is not
 * imported by any production code, which keeps its own Worker-hosted bootstrap in spiceWorker.ts.
 *
 * Unlike spiceWorker.ts, this does NOT cache and reuse one module instance across calls: verified
 * directly against this vendored binary (under Node, driving `_main` exactly as spiceWorker.ts
 * does), a SECOND `_main` invocation on the same instance fails with ngspice's own internal
 * "jump to zero" error regardless of whether the first invocation succeeded — not only after a
 * failed run, as spiceWorker.ts's comments assume. Production's `simulate()` already tolerates this
 * (any non-`RawfileError` failure rebuilds the module and retries once), so it still returns correct
 * results, but silently pays a full module reinit on every run after the first one in a session —
 * worth a closer look independent of this fix. Each `runNgspice` call here boots its own fresh
 * instance so every test is hermetic and this reuse quirk cannot cause a false pass or failure.
 */

import { parseSpiceRawFile } from "@/simulators/circuit-engine/engine/spiceRawParser";

interface EmscriptenFS {
  writeFile(path: string, data: string | Uint8Array): void;
  readFile(path: string): Uint8Array;
  mkdir(path: string): void;
  unlink(path: string): void;
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

const NETLIST_PATH = "/sim.cir";
const RAWFILE_PATH = "/out.raw";
const SPINIT = "* ngspice initialization\n";
const SPICE_LIB_DIR = "/usr/local/share/ngspice";
// Resolved relative to this file, not process.cwd(), so the suite runs the same from any directory.
const NGSPICE_JS_URL = new URL(
  "../../../../../public/spice/ngspice.js",
  import.meta.url
).href;

function mkdirSafe(fs: EmscriptenFS, path: string): void {
  try {
    fs.mkdir(path);
  } catch {
    // Already exists.
  }
}

function describe(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  return typeof cause === "string" ? cause : JSON.stringify(cause);
}

/** Boots one fresh ngspice module instance; see the file doc comment for why this is never cached. */
async function createModule(log: string[]): Promise<NgspiceModule> {
  const mod = (await import(/* @vite-ignore */ NGSPICE_JS_URL)) as {
    default?: NgspiceFactory;
    createNgspiceModule?: NgspiceFactory;
  };
  const factory = mod.default ?? mod.createNgspiceModule;
  if (typeof factory !== "function") {
    throw new Error(
      `ngspice module at ${NGSPICE_JS_URL} did not export a factory function.`
    );
  }

  return factory({
    noInitialRun: true,
    stdin: () => null,
    print: (text: string) => log.push(text),
    printErr: (text: string) => log.push(text),
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
      module.ENV.SPICE_LIB_DIR = SPICE_LIB_DIR;
      for (const directory of [
        "/usr",
        "/usr/local",
        "/usr/local/share",
        SPICE_LIB_DIR,
        `${SPICE_LIB_DIR}/scripts`,
      ]) {
        mkdirSafe(module.FS, directory);
      }
      module.FS.writeFile(`${SPICE_LIB_DIR}/scripts/spinit`, SPINIT);
    },
  });
}

function callMain(module: NgspiceModule, args: string[]): void {
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
}

/**
 * Runs a netlist through the real ngspice.wasm binary — the same one spiceWorker.ts serves in
 * production — and returns its raw output vectors, keyed exactly as `spiceEngine.results` is.
 * Throws with ngspice's own stdout/stderr log on a failed or non-converging run.
 */
export async function runNgspice(
  netlist: string
): Promise<Record<string, number[]>> {
  return (await runNgspiceWithLog(netlist)).vectors;
}

/**
 * `runNgspice`, plus ngspice's stdout/stderr for a run that succeeded — so a test can assert a deck
 * solved cleanly (no "singular matrix" warnings rescued by gmin stepping), not merely eventually.
 */
export async function runNgspiceWithLog(
  netlist: string
): Promise<{ vectors: Record<string, number[]>; log: string }> {
  const log: string[] = [];
  const module = await createModule(log).catch(cause => {
    throw new Error(`Failed to initialize ngspice: ${describe(cause)}`);
  });

  module.FS.writeFile(NETLIST_PATH, netlist);
  callMain(module, ["ngspice", "-b", "-n", "-r", RAWFILE_PATH, NETLIST_PATH]);

  const text = log.join("\n").trim();
  if (!module.FS.analyzePath(RAWFILE_PATH).exists) {
    throw new Error(
      text.length > 0 ? text : "ngspice produced no output for this netlist."
    );
  }

  const bytes = module.FS.readFile(RAWFILE_PATH);
  return { vectors: parseSpiceRawFile(bytes), log: text };
}
