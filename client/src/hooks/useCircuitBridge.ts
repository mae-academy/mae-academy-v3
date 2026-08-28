import { type RefObject, useCallback, useEffect, useMemo, useState } from "react";

export type NativeScope = {
  label: string;
  speed: number;
  showV: boolean;
  showI: boolean;
  showFFT: boolean;
  showRMS: boolean;
  showAverage: boolean;
  showDuty: boolean;
  showFreq: boolean;
  showScale: boolean;
  showPeak: boolean;
  showNegativePeak: boolean;
  plotXY: boolean;
  manual: boolean;
  samples: number[];
};

export type CircuitScopeSnapshot = { time: number; scopes: NativeScope[] };

type NativeCircuitBridge = {
  command: (menu: string, item: string) => void;
  reset: () => void;
  runStop: () => void;
  dumpCircuit: () => string;
  scopeState: () => string;
  scopeOption: (option: string, enabled: boolean) => void;
  scopeLabel: (label: string) => void;
  scopeSpeed: (speed: number) => void;
  scopeManual: (manual: boolean, value: number) => void;
  externalScopeMode: (enabled: boolean) => void;
};

declare global {
  interface Window { maeCircuitBridge?: NativeCircuitBridge }
}

const emptyScope: CircuitScopeSnapshot = { time: 0, scopes: [] };

export function useCircuitBridge(frameRef: RefObject<HTMLIFrameElement | null>, reloadKey: string) {
  const [ready, setReady] = useState(false);
  const [scope, setScope] = useState<CircuitScopeSnapshot>(emptyScope);

  const native = useCallback(() => frameRef.current?.contentWindow?.maeCircuitBridge ?? null, [frameRef]);

  useEffect(() => {
    setReady(false);
    setScope(emptyScope);
    let enabled = false;
    const poll = window.setInterval(() => {
      const engine = native();
      if (!engine) return;
      if (!enabled) {
        engine.externalScopeMode(true);
        enabled = true;
        setReady(true);
      }
      try {
        setScope(JSON.parse(engine.scopeState()) as CircuitScopeSnapshot);
      } catch {
        // The GWT engine can briefly return an incomplete payload while loading a new circuit.
      }
    }, 180);
    return () => window.clearInterval(poll);
  }, [native, reloadKey]);

  const command = useCallback((menu: string, item: string) => native()?.command(menu, item), [native]);
  const reset = useCallback(() => native()?.reset(), [native]);
  const runStop = useCallback(() => native()?.runStop(), [native]);
  const setOption = useCallback((option: string, enabled: boolean) => native()?.scopeOption(option, enabled), [native]);
  const setLabel = useCallback((label: string) => native()?.scopeLabel(label), [native]);
  const setSpeed = useCallback((speed: number) => native()?.scopeSpeed(speed), [native]);
  const setManual = useCallback((manual: boolean, value: number) => native()?.scopeManual(manual, value), [native]);

  return useMemo(() => ({ ready, scope, command, reset, runStop, setOption, setLabel, setSpeed, setManual }), [ready, scope, command, reset, runStop, setOption, setLabel, setSpeed, setManual]);
}
