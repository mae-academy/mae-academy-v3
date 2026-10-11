import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Diagnostic } from "@shared/code/arduinoTypes";
import { compileSketchRemote } from "@/services/codeClient";
import { IDLE_LCD } from "./arduinoLcd";
import { ArduinoRuntime, type ArduinoSpeed, type HardwareSnapshot } from "./arduinoRuntime";

const MAX_LINES = 1000;

export interface SerialState {
  /** Completed lines (without terminators). */
  lines: string[];
  /** Simulation time (ms) at which each line completed; parallel to `lines`. */
  times: number[];
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
  lcd: IDLE_LCD,
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
  /** HIGH pulse width (us) `pulseIn` measures on an echo pin; null unmounts the sensor. */
  setEchoPulse: (pin: number, us: number | null) => void;
  sendSerial: (text: string) => void;
  setLcdContrast: (value: number) => void;
  clearSerial: () => void;
}

export function useArduinoRuntime(): ArduinoStudioRuntime {
  const [snapshot, setSnapshot] = useState<HardwareSnapshot>(IDLE_SNAPSHOT);
  const [serial, setSerial] = useState<SerialState>({ lines: [], times: [], partial: "" });
  const [diagnostic, setDiagnostic] = useState<Diagnostic | null>(null);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const pending = useRef<{ text: string; t: number }[]>([]);
  const flushScheduled = useRef(false);
  const speedRef = useRef<ArduinoSpeed>(1);
  const runtimeRef = useRef<ArduinoRuntime | null>(null);
  const disposedRef = useRef(false);

  const flush = useCallback(() => {
    flushScheduled.current = false;
    const chunks = pending.current;
    pending.current = [];
    if (chunks.length === 0) return;
    setSerial(prev => {
      let partial = prev.partial;
      const lines = prev.lines.slice();
      const times = prev.times.slice();
      for (const { text, t } of chunks) {
        const parts = (partial + text).split("\n");
        partial = parts.pop() ?? "";
        for (const l of parts) {
          lines.push(l.replace(/\r$/, ""));
          times.push(t);
        }
      }
      const over = lines.length - MAX_LINES;
      return {
        lines: over > 0 ? lines.slice(over) : lines,
        times: over > 0 ? times.slice(over) : times,
        partial: partial.length > 4000 ? partial.slice(-4000) : partial,
      };
    });
  }, []);

  const getRuntime = useCallback((): ArduinoRuntime => {
    if (!runtimeRef.current) {
      runtimeRef.current = new ArduinoRuntime({
        onSnapshot: setSnapshot,
        onSerialOut: (text, t) => {
          pending.current.push({ text, t });
          if (pending.current.length > 5000) pending.current = pending.current.slice(-2500);
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
      disposedRef.current = true;
      runtimeRef.current?.dispose();
      runtimeRef.current = null;
    },
    [],
  );

  const runRequest = useRef(0);
  const run = useCallback(
    (source: string) => {
      const rt = getRuntime();
      if (rt.currentStatus === "paused") {
        rt.start();
        return;
      }
      // The sketch is compiled by the serverless compiler; only the newest Run is honoured when several overlap.
      const request = ++runRequest.current;
      void compileSketchRemote(source)
        .catch((error: unknown) => ({ ok: false as const, error: { line: 1, message: error instanceof Error ? error.message : "The code service could not be reached." } }))
        .then((result) => {
          if (request !== runRequest.current || disposedRef.current) return;
          if (!result.ok) {
            setDiagnostic(result.error);
            setRuntimeError(null);
            rt.reset();
            return;
          }
          setDiagnostic(null);
          setRuntimeError(null);
          pending.current = [];
          setSerial({ lines: [], times: [], partial: "" });
          rt.load(result.sketch);
          rt.start();
        });
    },
    [getRuntime],
  );

  const pause = useCallback(() => runtimeRef.current?.pause(), []);

  const reset = useCallback(() => {
    runRequest.current++; // a compile still in flight must not start the sketch after Reset
    runtimeRef.current?.reset();
    pending.current = [];
    setSerial({ lines: [], times: [], partial: "" });
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
      setEchoPulse: (pin, us) => getRuntime().setEchoPulse(pin, us),
      sendSerial: text => getRuntime().sendSerial(text),
      setLcdContrast: value => getRuntime().setLcdContrast(value),
      clearSerial: () => {
        pending.current = [];
        setSerial({ lines: [], times: [], partial: "" });
      },
    }),
    [snapshot, serial, diagnostic, runtimeError, run, pause, reset, setSpeed, getRuntime],
  );
}
