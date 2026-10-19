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

/** Serializes requests so two runs can never build competing module instances concurrently. */
let queue: Promise<unknown> = Promise.resolve();

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

/**
 * The vendored ngspice.js glue: an Emscripten MODULARIZE build, fetched and parsed exactly once and
 * cached — its exported factory can be called any number of times afterward to produce independent
 * module instances, which is exactly what every simulation needs (see `createModule`).
 */
interface NgspiceGlue {
  factory: NgspiceFactory;
  /** Kept only long enough for `ensureWasmModule` to pull the embedded binary out of it. */
  sourceText: string;
}

let gluePromise: Promise<NgspiceGlue> | null = null;

async function loadGlue(): Promise<NgspiceGlue> {
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
  const sourceText = await response.text();

  let mod: { default?: NgspiceFactory; createNgspiceModule?: NgspiceFactory };
  if (import.meta.env.PROD) {
    // The production CSP has no `blob:` in script-src, so a blob import is refused there; the same-origin file is allowed.
    mod = await import(/* @vite-ignore */ new URL(url, self.location.href).href);
  } else {
    const blobUrl = URL.createObjectURL(
      new Blob([sourceText], { type: "text/javascript" })
    );
    try {
      mod = await import(/* @vite-ignore */ blobUrl);
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  }

  const factory = mod.default ?? mod.createNgspiceModule;
  if (typeof factory !== "function") {
    throw new Error(
      `ngspice module at ${url} did not export a factory function.`
    );
  }
  return { factory, sourceText };
}

function ensureGlue(): Promise<NgspiceGlue> {
  gluePromise ??= loadGlue().catch(cause => {
    gluePromise = null;
    throw new Error(`Failed to load ngspice: ${describe(cause)}`);
  });
  return gluePromise;
}

/**
 * ngspice's `main()` cannot safely run twice on one module instance: even a run that completed
 * cleanly leaves a second `_main` call on the same instance aborting with ngspice's own "jump to
 * zero" internal error — verified directly against this binary, not only after a failed run as one
 * might assume. So every simulation below gets a brand-new instance (`createModule`).
 *
 * Naively, that means re-paying the cost of decoding and compiling this build's ~5.3 MB wasm binary
 * on every single circuit edit — the dominant cost of building an instance by an order of magnitude
 * (verified: ~100ms decode + compile vs ~10ms to instantiate from an already-compiled
 * `WebAssembly.Module`). `ngspice.js` inlines that binary as a base64 literal (an Emscripten
 * `SINGLE_FILE` build) rather than serving a separate `.wasm` file, so this extracts and compiles it
 * exactly once and reuses the compiled `WebAssembly.Module` for every later instance via
 * Emscripten's `instantiateWasm` hook — the documented, supported way for an embedder to take over
 * instantiation. Compiling a `WebAssembly.Module` produces immutable, shareable bytecode only; each
 * `WebAssembly.instantiate` call off it still gets its own fresh linear memory and globals, so this
 * changes nothing about every run getting a fully isolated instance.
 *
 * This depends on ngspice.js's current internal layout, which is not part of its public contract —
 * a future rebuild of the vendored asset could change it. Failure here is caught and treated as
 * merely "unavailable", in which case `createModule` falls back to the glue's own default (slower,
 * always-correct) instantiation path rather than breaking simulation outright.
 */
// Exported so ngspiceWasmCaching.test.ts can verify this extracts a real, working compiled module
// straight from the vendored asset, without needing spiceWorker.ts's blob-URL loading (untestable
// under Node/vitest: dynamic `import()` of a `blob:` URL has no Node ESM loader support).
export async function extractWasmModule(
  sourceText: string
): Promise<WebAssembly.Module | null> {
  const match =
    /findWasmBinary\(\)\{return base64Decode\("([A-Za-z0-9+/=]+)"\)\}/.exec(
      sourceText
    );
  if (!match) return null;
  const binary = atob(match[1]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return WebAssembly.compile(bytes);
}

// Never rejects: a failed extraction/compile memoizes to `null` (permanently falling back to the
// default path) rather than being retried, and failing, on every single future simulation.
let wasmModulePromise: Promise<WebAssembly.Module | null> | null = null;

function ensureWasmModule(sourceText: string): Promise<WebAssembly.Module | null> {
  wasmModulePromise ??= extractWasmModule(sourceText).catch(() => null);
  return wasmModulePromise;
}

/** A fresh ngspice instance plus the stdout/stderr log its print hooks fill during its one run. */
interface ModuleSession {
  module: NgspiceModule;
  log: string[];
}

async function createModule(): Promise<ModuleSession> {
  const { factory, sourceText } = await ensureGlue();
  const wasmModule = await ensureWasmModule(sourceText);
  const log: string[] = [];

  const options: Record<string, unknown> = {
    noInitialRun: true,
    stdin: () => null,
    print: (text: string) => log.push(text),
    printErr: (text: string) => log.push(text),
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
      // Signals "asynchronous — call successCallback later" per Emscripten's instantiateWasm
      // contract, rather than an already-resolved exports object.
      return {};
    };
  }

  return { module: await factory(options), log };
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
  session: ModuleSession,
  netlist: string
): Record<string, number[]> {
  const { module, log } = session;

  // A fresh instance's FS starts empty, so unlike a reused one there is never a stale rawfile to
  // clear first — see the "jump to zero" note above for why every session is fresh.
  module.FS.writeFile(NETLIST_PATH, netlist);

  // -n skips the user's .spiceinit, which we never provide.
  callMain(module, ["ngspice", "-b", "-n", "-r", RAWFILE_PATH, NETLIST_PATH]);

  if (!module.FS.analyzePath(RAWFILE_PATH).exists) {
    const text = log.join("\n").trim();
    throw new Error(
      text.length > 0 ? text : "ngspice produced no output for this netlist."
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
    return runNetlist(await createModule(), netlist);
  } catch (cause) {
    if (cause instanceof RawfileError) throw cause;
    // A brand-new instance failing on its first (and only) run points at the caches above, not at
    // ngspice's one-shot main() — clear them and give the netlist exactly one more chance against a
    // fully clean load.
    gluePromise = null;
    wasmModulePromise = null;
    return runNetlist(await createModule(), netlist);
  }
}

// Guarded so this module can be imported for its exports (e.g. by spiceWorkerWasmCache.test.ts)
// outside an actual Worker, where `addEventListener` does not exist on `globalThis`; real Workers
// always have it, so this changes nothing about production behavior.
if (typeof ctx.addEventListener === "function") {
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
}
