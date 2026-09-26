import {
  executeRemoteC,
  executeRemoteCpp,
  type ExecutionResult as RemoteResult,
} from "@/features/execution-engine/remoteCppEngine";
import { C_EXAMPLES } from "./cExamples";
import { CPP_EXAMPLES } from "./cppExamples";

export type RemoteLanguage = "c" | "cpp";

const MAX_ENTRIES = 64;
const SESSION_STORAGE_KEY = "mae:execution-cache";

interface CacheEntry {
  source: string;
  stdin: string;
  result: RemoteResult;
}

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<RemoteResult>>();

/** cyrb53: fast 53-bit string hash. */
export function hashCode(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let index = 0; index < text.length; index++) {
    const ch = text.charCodeAt(index);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

export const makeCacheKey = (language: RemoteLanguage, code: string, stdin: string) =>
  `${language}:${hashCode(code + stdin)}`;

// ─── Pre-Compiled Benchmark Cache ──────────────────────────────────────────────
// Expected stdout for every canonical C and C++ example.  These are deterministic
// programs (no randomness, no time, no addresses) so the output is stable across
// any conforming compiler.  If the user hits "Run" on an unmodified preset, the
// result is served from this table instantly (0 ms latency, no Wandbox round-trip).

const PRECOMPILED_C_OUTPUTS: Record<string, string> = {
  "c-printf-types":
    `Channel: A | ADC Reading: 1024\nVoltage: 3.30 V | Calibrated: 3.30285 V\nSize of int32_t: 4 bytes | Size of double: 8 bytes\n`,
  "c-switch-state":
    `[SYS] Normal operational loop active.\n`,
  "c-loops-series":
    `Accumulation Series (+5 increments):\nStep 1 -> Subtotal: 5\nStep 2 -> Subtotal: 10\nStep 3 -> Subtotal: 15\nStep 4 -> Subtotal: 20\nStep 5 -> Subtotal: 25\nStep 6 -> Subtotal: 30\nFinal Sum: 30\n`,
  "c-pass-by-pointer":
    `Initial: A = 0x12, B = 0x34\nSwapped: A = 0x34, B = 0x12\n`,
  "c-array-pointer-arithmetic":
    null as unknown as string, // address-dependent output; skip pre-cache
  "c-strings-null-term":
    `Text: MAE Embedded Studio\nComputed Length: 19 chars\n`,
  "c-struct-padding":
    `Node ID: 14\nSampling Rate: 500 Hz\nTemp: 27.8 C\nTotal Struct Size in RAM: 8 bytes\n`,
  "c-dynamic-malloc":
    `heap_array[0] = 11\nheap_array[1] = 22\nheap_array[2] = 33\nheap_array[3] = 44\nHeap memory freed successfully.\n`,
  "c-function-pointers":
    `Executing callback sequence:\n-> CMD: Actuators Engaged.\n-> CMD: Motion Stopped.\n-> CMD: Origin Recalibrated.\n`,
  "c-circular-buffer":
    `Received byte: 0xAA\nReceived byte: 0xBB\nReceived byte: 0xCC\n`,
  "c-bitwise-operations":
    `After SET: 0x05\nStatus: Hardware module busy.\nAfter CLEAR busy: 0x01\nAfter TOGGLE interrupt: 0x21\n`,
  "c-binary-search":
    `Target 8 located at array index: 3\n`,
  "c-bubble-sort":
    `Sorted Sequence:\n2 12 34 45 70 89 \n`,
  "c-lookup-table":
    `Evaluating fast Sine LUT values (0 to 90 degrees):\nAngle  0 deg -> Scaled Sine:   0 / 100\nAngle 15 deg -> Scaled Sine:  26 / 100\nAngle 30 deg -> Scaled Sine:  50 / 100\nAngle 45 deg -> Scaled Sine:  71 / 100\nAngle 60 deg -> Scaled Sine:  87 / 100\nAngle 75 deg -> Scaled Sine:  97 / 100\nAngle 90 deg -> Scaled Sine: 100 / 100\n`,
  "c-union-type-punning":
    null as unknown as string, // endianness-dependent; skip pre-cache
};

const PRECOMPILED_CPP_OUTPUTS: Record<string, string> = {
  "cpp-io-types":
    `Module: Telemetry | Channel: 4\nCalibrated Voltage: 3.31 V\nStatus Flag: true\n`,
  "cpp-switch-logic":
    `[SYS] Non-critical warning detected!\n`,
  "cpp-loops-series":
    `Geometric Series (x2):\n1, 2, 4, 8, 16, 32, 64, 128\nTotal Accumulation: 255\n`,
  "cpp-pass-by-ref":
    `Before Swap: A=170, B=85\nAfter Swap:  A=85, B=170\n`,
  "cpp-pointers-arrays":
    null as unknown as string, // address-dependent output; skip pre-cache
  "cpp-vector-filtering":
    `Filtered Samples count: 4\nValues: 540 890 310 1015 \n`,
  "cpp-struct-telemetry":
    `Sensor [101] -> Temp: 24.5 C | Humidity: 55.2% | Status: NOMINAL\nSensor [102] -> Temp: -99 C | Humidity: 0% | Status: ERR\n`,
  "cpp-oop-bank":
    `Holder: Mohammad | Balance: $120\n`,
  "cpp-inheritance-polymorphism":
    `[Relay] Coil energized -> Contacts closed.\n[Buzzer] Beep tone emitted at 2.4 kHz.\n`,
  "cpp-templates-math":
    `Clamped Int:   100\nClamped Float: 3.45\n`,
  "cpp-map-dictionary":
    `System Fault Telemetry Log:\nFault Code [CRC_ERROR] -> Count: 1\nFault Code [TIMEOUT] -> Count: 2\nFault Code [VOLTAGE_DROP] -> Count: 1\n`,
  "cpp-stack-lifo":
    `Call Stack unwinding (LIFO):\nReturn to: 0x2080\nReturn to: 0x1040\nReturn to: 0x1000\n`,
  "cpp-binary-search":
    `Target 63 found at index: 5\n`,
  "cpp-bubble-sort":
    `Sorted Array:\n11 12 22 25 64 \n`,
  "cpp-bitwise-flags":
    `Reg State: 0b00000011\nIs TX active? NO\nAfter Error Toggle: 0b00001011\n`,
};

function seedPrecompiledResults(): void {
  for (const example of C_EXAMPLES) {
    const stdout = PRECOMPILED_C_OUTPUTS[example.id];
    if (stdout == null) continue;
    const key = makeCacheKey("c", example.code, "");
    cache.set(key, {
      source: example.code,
      stdin: "",
      result: { stdout, stderr: "", exitCode: 0, success: true },
    });
  }
  for (const example of CPP_EXAMPLES) {
    const stdout = PRECOMPILED_CPP_OUTPUTS[example.id];
    if (stdout == null) continue;
    const key = makeCacheKey("cpp", example.code, "");
    cache.set(key, {
      source: example.code,
      stdin: "",
      result: { stdout, stderr: "", exitCode: 0, success: true },
    });
  }
}

// ─── SessionStorage Persistence ────────────────────────────────────────────────

function persistToSessionStorage(): void {
  try {
    const entries = Array.from(cache.entries()).slice(-MAX_ENTRIES);
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Over quota or SSR — silently drop.
  }
}

function restoreFromSessionStorage(): void {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return;
    const entries = JSON.parse(raw) as Array<[string, CacheEntry]>;
    for (const [key, entry] of entries) {
      if (!cache.has(key)) cache.set(key, entry);
    }
  } catch {
    // Corrupted — ignore.
  }
}

// Seed caches on module load.
seedPrecompiledResults();
restoreFromSessionStorage();

// ─── Cache API ─────────────────────────────────────────────────────────────────

/** LRU read: a hit is re-inserted so it becomes the most recently used entry. */
export function peekCachedRun(
  language: RemoteLanguage,
  code: string,
  stdin = ""
): RemoteResult | null {
  const key = makeCacheKey(language, code, stdin);
  const entry = cache.get(key);
  // The stored source guards against the (astronomically unlikely) hash collision.
  if (!entry || entry.source !== code || entry.stdin !== stdin) return null;
  cache.delete(key);
  cache.set(key, entry);
  return entry.result;
}

/** Cached remote run; concurrent identical requests (e.g. pre-warm then Run) share one fetch. */
export function runRemoteCached(
  language: RemoteLanguage,
  code: string,
  stdin = ""
): Promise<RemoteResult> {
  const hit = peekCachedRun(language, code, stdin);
  if (hit) return Promise.resolve(hit);

  const key = makeCacheKey(language, code, stdin);
  const pending = inFlight.get(key);
  if (pending) return pending;

  const executor = language === "cpp" ? executeRemoteCpp : executeRemoteC;
  const request = executor(code, stdin)
    .then(result => {
      // Transport failures are transient; only real compile/run outcomes are cached.
      if (!result.error) {
        cache.set(key, { source: code, stdin, result });
        if (cache.size > MAX_ENTRIES) {
          const oldest = cache.keys().next().value;
          if (oldest !== undefined) cache.delete(oldest);
        }
        persistToSessionStorage();
      }
      return result;
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, request);
  return request;
}

/** Fire-and-forget background compile so a later Run is served from memory. */
export function prewarmRemote(language: string, code: string): void {
  if (language !== "c" && language !== "cpp") return;
  if (!code.trim() || peekCachedRun(language, code)) return;
  void runRemoteCached(language, code).catch(() => undefined);
}

export function clearExecutionCache(): void {
  cache.clear();
  inFlight.clear();
  try {
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // SSR safety.
  }
}
