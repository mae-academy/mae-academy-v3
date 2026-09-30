import type { HardwareProfile } from '../../domain/hardware';
import { MemoryMap } from '../../domain/memory';
import { RemoteRuntime, type RemoteRuntimeOptions } from '../../remote/remote-runtime';
import type { PlcRuntimePort } from '../../remote/runtime-port';
import type { Diagnostic, ExecutionMode } from '../../engine/types';
import type { SimulationStore } from '../canvas/simulation';
import { createSimulationStore } from '../canvas/simulation';
import { createFrameStore, type FrameStore } from '../hardware/frame-store';
import { VirtualField } from '../hardware/virtual-field';
import type { Network } from '../../domain/ast';
import { toProgram } from './program';

export interface HostStatus {
  readonly mode: ExecutionMode;
  /** The last scan reported an error (drives the SF LED). */
  readonly fault: boolean;
  readonly programOk: boolean;
  /** Most recent distinct diagnostics, newest last. */
  readonly diagnostics: readonly Diagnostic[];
}

export interface HostStatusStore {
  subscribe(listener: () => void): () => void;
  getSnapshot(): HostStatus;
}

const MAX_DIAGNOSTICS = 20;
const sameDiagnostic = (a: Diagnostic, b: Diagnostic): boolean =>
  a.code === b.code && a.nodeId === b.nodeId && a.networkId === b.networkId && a.message === b.message;

/**
 * Low-frequency runtime state (mode, fault, compile status). It republishes its snapshot only when
 * one of those fields really changes, so a controller scanning at 50 Hz does not re-render the
 * toolbar or the hardware chassis on every scan.
 */
function createHostStatus(runtime: PlcRuntimePort): HostStatusStore {
  let snapshot: HostStatus = { mode: runtime.mode, fault: false, programOk: runtime.compiled.ok, diagnostics: [] };
  const listeners = new Set<() => void>();

  const publish = (next: Partial<HostStatus>): void => {
    const merged = { ...snapshot, ...next };
    const changed =
      merged.mode !== snapshot.mode ||
      merged.fault !== snapshot.fault ||
      merged.programOk !== snapshot.programOk ||
      merged.diagnostics !== snapshot.diagnostics;
    if (!changed) return;
    snapshot = merged;
    listeners.forEach((listener) => listener());
  };

  runtime.subscribe((event) => {
    switch (event.type) {
      case 'mode':
        publish({
          mode: event.mode,
          ...(event.mode === 'STOP' ? { fault: false } : {}),
          // a fresh start begins with a clean diagnostic list
          ...(event.previous === 'STOP' ? { diagnostics: [] } : {}),
        });
        break;
      case 'scan':
        publish({ fault: event.report.diagnostics.some((d) => d.severity === 'error') });
        break;
      case 'diagnostic': {
        if (snapshot.diagnostics.some((d) => sameDiagnostic(d, event.diagnostic))) break;
        publish({ diagnostics: [...snapshot.diagnostics, event.diagnostic].slice(-MAX_DIAGNOSTICS) });
        break;
      }
      case 'program':
        publish({ programOk: runtime.compiled.ok });
        break;
      case 'reset':
        publish({ mode: 'STOP', fault: false, diagnostics: [] });
        break;
    }
  });

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
  };
}

/** Everything that exists once per selected hardware profile. Switching profiles builds a new one. */
export interface HostSession {
  readonly profile: HardwareProfile;
  readonly memory: MemoryMap;
  readonly field: VirtualField;
  readonly runtime: PlcRuntimePort;
  readonly store: SimulationStore;
  /** Paces the LCD and scan readouts at display rate. */
  readonly frame: FrameStore;
  readonly status: HostStatusStore;
}

export function createSession(
  profile: HardwareProfile,
  networks: readonly Network[],
  runtimeOptions: RemoteRuntimeOptions = {},
): HostSession {
  const memory = new MemoryMap(profile);
  const field = new VirtualField(profile.memory.I?.bitCount ?? 0, profile.memory.Q?.bitCount ?? 0);
  const program = toProgram(networks, profile);
  const runtime = new RemoteRuntime(memory, program, { fieldIo: field, ...runtimeOptions });
  // A flipped switch shows on the LED and contacts at once; the controller reacts on the next batch.
  field.subscribe(() => {
    if (runtime.mode !== 'STOP') runtime.syncInputs();
  });
  const store = createSimulationStore(runtime); // also switches FlowTrace on
  const frame = createFrameStore((notify) => {
    const offMemory = memory.subscribe(notify);
    const offRuntime = runtime.subscribe(notify);
    const offField = field.subscribe(notify);
    return () => {
      offMemory();
      offRuntime();
      offField();
    };
  });
  return { profile, memory, field, runtime, store, frame, status: createHostStatus(runtime) };
}
