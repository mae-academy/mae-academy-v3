import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { Network } from '../../domain/ast';
import type { HardwareProfile } from '../../domain/hardware';
import type { CompiledProgram } from '../../engine/compiler';
import type { RuntimeOptions } from '../../engine/plc-runtime';
import type { ScanMetrics } from '../../engine/types';
import { exportMicroWin, type ExportFile, type SymbolMap } from '../../transpiler';
import type { SimulationStore } from '../canvas/simulation';
import { usePlcEditorState, type PlcEditor } from '../canvas/usePlcEditorState';
import type { ModeSwitchPosition } from '../hardware/S7200Hardware';
import type { LcdEffect, LcdSnapshot } from '../hardware/lcd-fsm';
import { bitAddress } from '../hardware/virtual-field';
import { collectParams, toLcdParam, toProgram, validateForProfile, type ProfileIssue } from './program';
import { createSession, type HostSession, type HostStatus } from './session';

export interface PlcHostOptions {
  /** Overrides for the runtime (clock and scheduler are injected by tests). */
  readonly runtimeOptions?: Partial<RuntimeOptions>;
  readonly initialScanMs?: number;
  readonly symbols?: SymbolMap;
  /**
   * Claims a preset written from the LOGO! keypad before it is applied to the ladder. Environments
   * whose program is not ladder (the FBD editor) update their own source here and return true.
   */
  readonly presetSink?: (instance: string, value: number) => boolean;
}

export interface PlcHost {
  readonly profile: HardwareProfile;
  readonly editor: PlcEditor;
  readonly session: HostSession;
  readonly status: HostStatus;
  /** Set while the controller is not in STOP, so the canvas shows power flow and locks editing. */
  readonly simulation: SimulationStore | null;
  readonly issues: readonly ProfileIssue[];
  readonly scanMs: number;
  setScanMs(ms: number): void;
  readonly switchPosition: ModeSwitchPosition;
  setSwitchPosition(position: ModeSwitchPosition): void;
  readonly notice: string | null;
  dismissNotice(): void;
  run(): boolean;
  pause(): void;
  stop(): void;
  step(): void;
  readMetrics(): ScanMetrics | null;
  /** LOGO! front-panel bridge. */
  readonly lcd: {
    getSnapshot(): LcdSnapshot;
    perform(effect: LcdEffect): void;
  };
  exportMicroWin(): ExportFile;
}

/**
 * Binds the editor, the runtime and the virtual hardware together for one hardware profile.
 *
 * The three rules that matter: a program is (re)compiled only on the way into RUN or while running
 * (so editing in STOP never disturbs a live controller); the canvas is handed the simulation only
 * while the controller is not in STOP; and everything the UI reads at high frequency goes through
 * per-element subscriptions or the frame store, never through this hook's state.
 */
export function usePlcHost(
  profile: HardwareProfile,
  initialNetworks: readonly Network[],
  options: PlcHostOptions = {},
): PlcHost {
  const editor = usePlcEditorState(profile, initialNetworks);
  const { networks } = editor;
  const latest = useRef(networks);
  latest.current = networks;
  const editorActions = useRef(editor.actions);
  editorActions.current = editor.actions;
  const presetSink = useRef(options.presetSink);
  presetSink.current = options.presetSink;

  const initialScan = options.initialScanMs ?? 20;
  const session = useMemo(
    () => createSession(profile, networks, { targetScanMs: initialScan, ...options.runtimeOptions }),
    // one session per profile; the program is (re)loaded explicitly, never through this dependency
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [profile],
  );
  const { runtime, memory, field } = session;

  useEffect(() => () => runtime.stop(), [runtime]);

  const status = useSyncExternalStore(session.status.subscribe, session.status.getSnapshot, session.status.getSnapshot);

  const [notice, setNotice] = useState<string | null>(null);
  const [scanMs, setScanMsState] = useState(initialScan);
  const [switchPosition, setSwitchState] = useState<ModeSwitchPosition>('TERM');
  const switchRef = useRef(switchPosition);

  // ---- program loading --------------------------------------------------------------------

  const loaded = useRef<readonly Network[] | null>(null);
  const load = useCallback((): CompiledProgram => {
    loaded.current = latest.current;
    return runtime.loadProgram(toProgram(latest.current, profile));
  }, [runtime, profile]);

  // Edits made while the controller is running (e.g. a preset changed from the LCD) go live at once.
  useEffect(() => {
    if (runtime.mode !== 'STOP' && loaded.current !== networks) load();
  }, [networks, runtime, load]);

  const issues = useMemo(() => validateForProfile(networks, profile), [networks, profile]);

  // ---- executive controls -----------------------------------------------------------------

  const guard = useCallback((): boolean => {
    if (switchRef.current === 'STOP') {
      setNotice('The mode switch is in STOP. Move it to TERM or RUN first.');
      return false;
    }
    return true;
  }, []);

  const ready = useCallback((): boolean => {
    if (runtime.mode !== 'STOP') return true;
    const compiled = load();
    if (compiled.ok) return true;
    const errors = compiled.diagnostics.filter((d) => d.severity === 'error').length;
    setNotice(`The program has ${errors} error${errors === 1 ? '' : 's'}; fix ${errors === 1 ? 'it' : 'them'} before running.`);
    return false;
  }, [runtime, load]);

  const run = useCallback((): boolean => {
    if (!guard() || !ready()) return false;
    setNotice(null);
    return runtime.run();
  }, [guard, ready, runtime]);

  const stop = useCallback((): void => runtime.stop(), [runtime]);
  const pause = useCallback((): void => runtime.pause(), [runtime]);

  const step = useCallback((): void => {
    if (!guard() || !ready()) return;
    setNotice(null);
    runtime.step();
  }, [guard, ready, runtime]);

  const setScanMs = useCallback(
    (ms: number): void => {
      setScanMsState(ms);
      runtime.setTargetScanMs(ms);
    },
    [runtime],
  );

  const setSwitchPosition = useCallback(
    (position: ModeSwitchPosition): void => {
      switchRef.current = position;
      setSwitchState(position);
      if (position === 'STOP') runtime.stop();
      else if (position === 'RUN' && runtime.mode !== 'RUN') {
        if (ready()) {
          setNotice(null);
          runtime.run();
        }
      }
    },
    [runtime, ready],
  );

  // ---- LOGO! front panel ------------------------------------------------------------------

  const commitPreset = useCallback(
    (instance: string, value: number): void => {
      const source = collectParams(latest.current).find((entry) => entry.node.instance === instance);
      if (!source) return;
      if (source.operand.kind === 'address') {
        // The preset lives in a data word: write it, exactly like a real controller's setpoint.
        try {
          memory.write(source.operand.address, value);
        } catch {
          setNotice(`Cannot write ${source.operand.address}`);
        }
        return;
      }
      // A constant is part of the program, so it is edited there and goes live via the reload effect.
      if (presetSink.current?.(instance, value)) return;
      editorActions.current.setSlot(source.networkId, source.node.id, source.slot, String(value));
    },
    [memory],
  );

  const lcd = useMemo(
    () => ({
      getSnapshot(): LcdSnapshot {
        const inputBits = profile.memory.I?.bitCount ?? 0;
        const outputBits = profile.memory.Q?.bitCount ?? 0;
        const current = latest.current;
        return {
          mode: runtime.mode,
          inputs: Array.from({ length: inputBits }, (_, i) => memory.readBit(bitAddress('I', i))),
          outputs: Array.from({ length: outputBits }, (_, i) => memory.readBit(bitAddress('Q', i))),
          params: collectParams(current).map((source) => toLcdParam(source, memory)),
          program: { networks: current.length, blocks: current.reduce((total, n) => total + n.nodes.length, 0) },
          scanMs: runtime.scanPeriodMs,
        };
      },
      perform(effect: LcdEffect): void {
        if (effect.type === 'run') run();
        else if (effect.type === 'stop') stop();
        else commitPreset(effect.instance, effect.value);
      },
    }),
    [profile, memory, runtime, run, stop, commitPreset],
  );

  const export_ = useCallback(
    (): ExportFile =>
      exportMicroWin(latest.current, profile, options.symbols, { fileName: `${profile.id.toLowerCase()}.awl` }),
    [profile, options.symbols],
  );

  // Inputs held by the previous session must not leak into a new one.
  useEffect(() => () => field.clearInputs(), [field]);

  return {
    profile,
    editor,
    session,
    status,
    simulation: status.mode === 'STOP' ? null : session.store,
    issues,
    scanMs,
    setScanMs,
    switchPosition,
    setSwitchPosition,
    notice,
    dismissNotice: () => setNotice(null),
    run,
    pause,
    stop,
    step,
    readMetrics: () => runtime.metrics,
    lcd,
    exportMicroWin: export_,
  };
}
