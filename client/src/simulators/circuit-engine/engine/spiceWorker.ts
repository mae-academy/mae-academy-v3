/// Web Worker hosting ngspice-wasm. Runs a netlist in batch mode and returns its output vectors.

import { parseSpiceRawFile } from "@/simulators/circuit-engine/engine/spiceRawParser";

export interface SpiceRequest {
  type: "RUN_SIMULATION";
  payload: { netlist: string };
  /** Optional correlation id; echoed back on the response so stale results can be discarded. */
  id?: string;
}

export interface SpiceResponse {
  type: "SUCCESS" | "ERROR";
  payload: { vectors?: Record<string, number[]>; error?: string };
  id?: string;
}

// `lib` is dom-only in this project, so the worker globals are not typed. Cast once rather than
// pulling in `lib.webworker`, which collides with `lib.dom` in the same program.
const ctx = globalThis as unknown as {
  postMessage(message: SpiceResponse): void;
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<SpiceRequest>) => void
  ): void;
};

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

/** stdout + stderr of the current run; ngspice reports parse and convergence errors here. */
let runLog: string[] = [];

let modulePromise: Promise<NgspiceModule> | null = null;
/** Serializes requests so two runs can never interleave inside one wasm instance. */
let queue: Promise<unknown> = Promise.resolve();

function mkdirSafe(fs: EmscriptenFS, path: string): void {
  try {
    fs.mkdir(path);
  } catch {
    // Already exists.
  }
}

async function createModule(): Promise<NgspiceModule> {
  // ngspice.js is a 7 MB vendored asset in `public/`, deliberately outside the bundle graph. It is
  // fetched and imported through a blob URL rather than `import(url)`: Vite's dev server rejects a
  // module request for anything under `public/` ("can only be referenced via HTML tags"), and this
  // path behaves identically in dev and in a production build.
  const url = `${import.meta.env.BASE_URL}spice/ngspice.js`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Could not fetch ${url}: ${response.status} ${response.statusText}`
    );
  }

  const blobUrl = URL.createObjectURL(
    new Blob([await response.text()], { type: "text/javascript" })
  );
  let mod: { default?: NgspiceFactory; createNgspiceModule?: NgspiceFactory };
  try {
    mod = await import(/* @vite-ignore */ blobUrl);
  } finally {
    URL.revokeObjectURL(blobUrl);
  }

  const factory = mod.default ?? mod.createNgspiceModule;
  if (typeof factory !== "function") {
    throw new Error(
      `ngspice module at ${url} did not export a factory function.`
    );
  }

  const options: Record<string, unknown> = {
    noInitialRun: true,
    stdin: () => null,
    print: (text: string) => runLog.push(text),
    printErr: (text: string) => runLog.push(text),
    // Emscripten invokes preRun with the Module itself, before initRuntime.
    preRun: (module: NgspiceModule) => {
      // ngspice aborts at startup without HOME, a spinit file and readable /proc entries.
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
      // ngspice warns on every run if it cannot find the system spinit, which it looks for at
      // $SPICE_LIB_DIR/scripts/spinit. `-n` does not suppress this: that flag governs the user's
      // .spiceinit, a different file. Verified empirically — the `scripts` segment is required.
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
  };

  return factory(options);
}

function ensureModule(): Promise<NgspiceModule> {
  modulePromise ??= createModule().catch(cause => {
    modulePromise = null;
    throw new Error(`Failed to initialize ngspice: ${describe(cause)}`);
  });
  return modulePromise;
}

function describe(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  return typeof cause === "string" ? cause : JSON.stringify(cause);
}

/** Marshals argv onto the wasm stack and calls `main`. There is no `_malloc` in this build. */
function callMain(module: NgspiceModule, args: string[]): void {
  const stack = module.stackSave();
  try {
    const argv = module.stackAlloc((args.length + 1) * 4);
    args.forEach((arg, index) => {
      const size = module.lengthBytesUTF8(arg) + 1;
      const pointer = module.stackAlloc(size);
      module.stringToUTF8(arg, pointer, size);
      // Re-read HEAPU32 each time: ALLOW_MEMORY_GROWTH detaches the previous view.
      module.HEAPU32[(argv >> 2) + index] = pointer;
    });
    module.HEAPU32[(argv >> 2) + args.length] = 0;
    module._main(args.length, argv);
  } catch (cause) {
    // NO_EXIT_RUNTIME leaves ABORT unset but always throws ExitStatus when main() returns, so a
    // normal ngspice exit lands here. Anything else is a genuine failure.
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

/** Thrown when the rawfile itself is malformed — deterministic, so it must not trigger a retry. */
class RawfileError extends Error {}

function runNetlist(
  module: NgspiceModule,
  netlist: string
): Record<string, number[]> {
  runLog = [];

  // Never let a previous run's rawfile be mistaken for this run's output.
  if (module.FS.analyzePath(RAWFILE_PATH).exists)
    module.FS.unlink(RAWFILE_PATH);
  module.FS.writeFile(NETLIST_PATH, netlist);

  // -n skips the user's .spiceinit, which we never provide.
  callMain(module, ["ngspice", "-b", "-n", "-r", RAWFILE_PATH, NETLIST_PATH]);

  if (!module.FS.analyzePath(RAWFILE_PATH).exists) {
    const log = runLog.join("\n").trim();
    throw new Error(
      log.length > 0 ? log : "ngspice produced no output for this netlist."
    );
  }

  const bytes = module.FS.readFile(RAWFILE_PATH);
  try {
    return parseSpiceRawFile(bytes);
  } catch (cause) {
    throw new RawfileError(describe(cause));
  }
}

async function simulate(netlist: string): Promise<Record<string, number[]>> {
  try {
    return runNetlist(await ensureModule(), netlist);
  } catch (cause) {
    if (cause instanceof RawfileError) throw cause;
    // ngspice's main() is a one-shot CLI entry point, so a failed run may have left its C globals
    // in an unusable state. Rebuild the instance and give the netlist exactly one more chance.
    modulePromise = null;
    return runNetlist(await ensureModule(), netlist);
  }
}

ctx.addEventListener("message", (event: MessageEvent<SpiceRequest>) => {
  const request = event.data;
  if (request?.type !== "RUN_SIMULATION") return;

  queue = queue.then(async () => {
    try {
      const vectors = await simulate(request.payload.netlist);
      ctx.postMessage({
        type: "SUCCESS",
        payload: { vectors },
        id: request.id,
      });
    } catch (cause) {
      ctx.postMessage({
        type: "ERROR",
        payload: { error: describe(cause) },
        id: request.id,
      });
    }
  });
});
