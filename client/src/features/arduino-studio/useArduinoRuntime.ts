import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { compileSketch, type Diagnostic } from "./arduinoCompiler";
import { ArduinoRuntime, type ArduinoSpeed, type HardwareSnapshot } from "./arduinoRuntime";

const MAX_LINES = 1000;

export interface SerialState {
  /** Completed lines (without terminators). */
  lines: string[];
  /** Text after the last newline. */
  partial: string;
}

export const IDLE_SNAPSHOT: HardwareSnapshot = {
  status: "idle",
  pins: Array.from({ length: 20 }, () => ({ mode: "UNSET" as const, level: 0 as const, pwm: null })),
  digitalInputs: [],
  analogInputs: [],
  inputLevels: {},
  analogValues: {},
  txCount: 0,
  rxCount: 0,
  baud: null,
  timeMs: 0,
};

export interface ArduinoStudioRuntime {
  snapshot: HardwareSnapshot;
  serial: SerialState;
  diagnostic: Diagnostic | null;
  runtimeError: string | null;
  run: (source: string) => void;
  pause: () => void;
  reset: () => void;
  setSpeed: (speed: ArduinoSpeed) => void;
  setDigitalInput: (pin: number, level: 0 | 1) => void;
  setAnalogInput: (channel: number, value: number) => void;
  sendSerial: (text: string) => void;
  clearSerial: () => void;
}

export function useArduinoRuntime(): ArduinoStudioRuntime {
  const [snapshot, setSnapshot] = useState<HardwareSnapshot>(IDLE_SNAPSHOT);
  const [serial, setSerial] = useState<SerialState>({ lines: [], partial: "" });
  const [diagnostic, setDiagnostic] = useState<Diagnostic | null>(null);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const pending = useRef("");
  const flushScheduled = useRef(false);
  const speedRef = useRef<ArduinoSpeed>(1);
  const runtimeRef = useRef<ArduinoRuntime | null>(null);

  const flush = useCallback(() => {
    flushScheduled.current = false;
    const chunk = pending.current;
    pending.current = "";
    if (!chunk) return;
    setSerial(prev => {
      const parts = (prev.partial + chunk).split("\n");
      const partial = parts.pop() ?? "";
      const lines = parts.map(l => l.replace(/\r$/, ""));
      const merged = prev.lines.length + lines.length > MAX_LINES ? [...prev.lines, ...lines].slice(-MAX_LINES) : [...prev.lines, ...lines];
      return { lines: merged, partial: partial.length > 4000 ? partial.slice(-4000) : partial };
    });
  }, []);

  const getRuntime = useCallback((): ArduinoRuntime => {
    if (!runtimeRef.current) {
      runtimeRef.current = new ArduinoRuntime({
        onSnapshot: setSnapshot,
        onSerialOut: text => {
          pending.current += text;
          if (pending.current.length > 100_000) pending.current = pending.current.slice(-50_000);
          if (!flushScheduled.current) {
            flushScheduled.current = true;
            requestAnimationFrame(flush);
          }
        },
        onError: setRuntimeError,
      });
      runtimeRef.current.setSpeed(speedRef.current);
    }
    return runtimeRef.current;
  }, [flush]);

  useEffect(
    () => () => {
      runtimeRef.current?.dispose();
      runtimeRef.current = null;
    },
    [],
  );

  const run = useCallback(
    (source: string) => {
      const rt = getRuntime();
      if (rt.currentStatus === "paused") {
        rt.start();
        return;
      }
      const result = compileSketch(source);
      if (!result.ok) {
        setDiagnostic(result.error);
        setRuntimeError(null);
        rt.reset();
        return;
      }
      setDiagnostic(null);
      setRuntimeError(null);
      pending.current = "";
      setSerial({ lines: [], partial: "" });
      rt.load(result.sketch);
      rt.start();
    },
    [getRuntime],
  );

  const pause = useCallback(() => runtimeRef.current?.pause(), []);

  const reset = useCallback(() => {
    runtimeRef.current?.reset();
    pending.current = "";
    setSerial({ lines: [], partial: "" });
    setDiagnostic(null);
    setRuntimeError(null);
  }, []);

  const setSpeed = useCallback(
    (speed: ArduinoSpeed) => {
      speedRef.current = speed;
      runtimeRef.current?.setSpeed(speed);
    },
    [],
  );

  return useMemo(
    () => ({
      snapshot,
      serial,
      diagnostic,
      runtimeError,
      run,
      pause,
      reset,
      setSpeed,
      setDigitalInput: (pin, level) => getRuntime().setDigitalInput(pin, level),
      setAnalogInput: (channel, value) => getRuntime().setAnalogInput(channel, value),
      sendSerial: text => getRuntime().sendSerial(text),
      clearSerial: () => {
        pending.current = "";
        setSerial({ lines: [], partial: "" });
      },
    }),
    [snapshot, serial, diagnostic, runtimeError, run, pause, reset, setSpeed, getRuntime],
  );
}
