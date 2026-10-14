import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MascotState } from "@shared/aiTypes";

/** How long the lightbulb stays up. The hook guarantees eureka is never shorter than this. */
export const EUREKA_MS = 1200;
/** Listening falls back to idle after this long without input activity (if nothing was sent). */
export const LISTENING_IDLE_MS = 2500;
/** Talking falls back to idle after this long without a new token. */
export const TALKING_SILENCE_MS = 900;

export interface MascotStateApi {
  /** The derived mascot state; feed it straight into <MaiMascot state={state} />. */
  state: MascotState;
  /** User typed / pasted / attached an image. Debounced: idle again after LISTENING_IDLE_MS. Ignored while a response is in flight. */
  onInputActivity: () => void;
  /** A message was submitted: -> thinking, and starts a new response lifecycle (re-arms the eureka bulb). */
  onSend: () => void;
  /** First streamed token of a response: -> eureka for EUREKA_MS, then talking. Repeated calls in the same response are no-ops. */
  onFirstToken: () => void;
  /** Any streamed token (including the first). Keeps the mascot talking; ~TALKING_SILENCE_MS of silence -> idle. Safe to call before onFirstToken (it then acts as the first token). */
  onToken: () => void;
  /** Stream finished normally: -> idle (deferred until the eureka window has elapsed). */
  onStreamEnd: () => void;
  /** Request/stream failed or was aborted: -> idle immediately. */
  onError: () => void;
  /** Clears all timers and returns to idle. */
  reset: () => void;
}

/**
 * Event-driven mascot state machine. The chat UI only reports events; this hook derives the
 * state: idle -> listening -> thinking -> eureka (1200ms) -> talking -> idle.
 *
 * All handlers are referentially stable (safe inside stream callbacks / effect deps), all timers
 * are cleared on unmount and no state is set after unmount. Contract: call `onSend` once per response.
 */
export function useMascotState(): MascotStateApi {
  const [state, setStateRaw] = useState<MascotState>("idle");
  const stateRef = useRef<MascotState>("idle");
  const mountedRef = useRef(false);
  /** Timer for listening->idle and talking->idle (only one of the two is ever armed). */
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const eurekaTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Current response lifecycle flags. */
  const eurekaFired = useRef(false);
  const eurekaActive = useRef(false);
  const streamEnded = useRef(false);
  const responseActive = useRef(false);

  const setState = useCallback((next: MascotState) => {
    stateRef.current = next;
    if (mountedRef.current) setStateRaw(next);
  }, []);

  const clearSettle = useCallback(() => {
    if (settleTimer.current !== null) {
      clearTimeout(settleTimer.current);
      settleTimer.current = null;
    }
  }, []);

  const clearEureka = useCallback(() => {
    if (eurekaTimer.current !== null) {
      clearTimeout(eurekaTimer.current);
      eurekaTimer.current = null;
    }
    eurekaActive.current = false;
  }, []);

  const armTalkingSilence = useCallback(() => {
    clearSettle();
    settleTimer.current = setTimeout(() => {
      settleTimer.current = null;
      setState("idle");
    }, TALKING_SILENCE_MS);
  }, [clearSettle, setState]);

  const clearAll = useCallback(() => {
    clearSettle();
    clearEureka();
  }, [clearSettle, clearEureka]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearAll();
    };
  }, [clearAll]);

  const onInputActivity = useCallback(() => {
    if (!mountedRef.current) return; // stale stream callbacks after unmount must not arm timers
    // Never interrupt thinking / eureka / talking: the response owns the mascot.
    if (stateRef.current !== "idle" && stateRef.current !== "listening") return;
    setState("listening");
    clearSettle();
    settleTimer.current = setTimeout(() => {
      settleTimer.current = null;
      if (stateRef.current === "listening") setState("idle");
    }, LISTENING_IDLE_MS);
  }, [clearSettle, setState]);

  const onSend = useCallback(() => {
    if (!mountedRef.current) return; // stale stream callbacks after unmount must not arm timers
    clearAll();
    eurekaFired.current = false;
    streamEnded.current = false;
    responseActive.current = true;
    setState("thinking");
  }, [clearAll, setState]);

  const onFirstToken = useCallback(() => {
    if (!mountedRef.current) return; // stale stream callbacks after unmount must not arm timers
    if (eurekaFired.current) return;
    eurekaFired.current = true;
    responseActive.current = true;
    streamEnded.current = false;
    clearAll();
    eurekaActive.current = true;
    setState("eureka");
    eurekaTimer.current = setTimeout(() => {
      eurekaTimer.current = null;
      eurekaActive.current = false;
      if (streamEnded.current || !responseActive.current) {
        setState("idle");
      } else {
        setState("talking");
        armTalkingSilence();
      }
    }, EUREKA_MS);
  }, [clearAll, setState, armTalkingSilence]);

  const onToken = useCallback(() => {
    if (!mountedRef.current) return; // stale stream callbacks after unmount must not arm timers
    if (!eurekaFired.current) {
      onFirstToken();
      return;
    }
    // Late tokens after the end/error of a response, and tokens during the bulb, must not change the state.
    if (!responseActive.current || streamEnded.current || eurekaActive.current) return;
    setState("talking");
    armTalkingSilence();
  }, [onFirstToken, setState, armTalkingSilence]);

  const onStreamEnd = useCallback(() => {
    streamEnded.current = true;
    responseActive.current = false;
    if (eurekaActive.current) return; // let the bulb finish; its timer then settles to idle
    clearSettle();
    setState("idle");
  }, [clearSettle, setState]);

  const onError = useCallback(() => {
    clearAll();
    streamEnded.current = true;
    responseActive.current = false;
    setState("idle");
  }, [clearAll, setState]);

  const reset = useCallback(() => {
    clearAll();
    eurekaFired.current = false;
    streamEnded.current = false;
    responseActive.current = false;
    setState("idle");
  }, [clearAll, setState]);

  return useMemo(
    () => ({ state, onInputActivity, onSend, onFirstToken, onToken, onStreamEnd, onError, reset }),
    [state, onInputActivity, onSend, onFirstToken, onToken, onStreamEnd, onError, reset],
  );
}

export default useMascotState;
