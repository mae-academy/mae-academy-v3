// @vitest-environment jsdom
/**
 * Verifies the SPICE eager/debounce mechanism used in Home.tsx's "SPICE Accuracy Bridge" section
 * (the `spiceEagerRef` / `requestEagerSpiceRun` / debounce `useEffect` around `runSpiceSimulation`).
 *
 * Home.tsx does not export that logic — it is inline in a ~3000-line component with no existing
 * test harness, and mounting the whole canvas is out of proportion to what changed here. This
 * mirrors the exact pattern from the file line for line (kept in sync via the source references
 * below) so the mechanism itself — not a loose paraphrase of it — gets real, repeatable coverage.
 *
 * What this guards, from the "DMM freezes during Run" bug report:
 *  - A discrete switch/relay toggle must reach the solver with no artificial delay (defect fix).
 *  - An unrelated re-render — the RAF loop advancing `snapshot`/`animationTime` every frame during
 *    Run — must never reset or re-arm the debounce, because it never changes `runSpiceSimulation`'s
 *    identity in the first place (root cause of the original freeze).
 */

import { act, renderHook } from "@testing-library/react";
import { useCallback, useEffect, useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SPICE_DEBOUNCE_MS = 400; // Home.tsx:126

/**
 * Reproduces Home.tsx's `spiceEagerRef` + `requestEagerSpiceRun` (Home.tsx:732-735) and the
 * debounce `useEffect` around `runSpiceSimulation` (Home.tsx:2166-2174).
 */
function useSpiceDebounceHarness(runSpiceSimulation: () => void) {
  const spiceEagerRef = useRef(false);
  const requestEagerSpiceRun = useCallback(() => {
    spiceEagerRef.current = true;
  }, []);

  useEffect(() => {
    const eager = spiceEagerRef.current;
    spiceEagerRef.current = false;
    const timer = window.setTimeout(runSpiceSimulation, eager ? 0 : SPICE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [runSpiceSimulation]);

  return requestEagerSpiceRun;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Home.tsx's SPICE eager/debounce mechanism", () => {
  it("waits the full debounce for an ordinary edit (e.g. a drag)", () => {
    const run = vi.fn();
    renderHook(() => useSpiceDebounceHarness(run));

    act(() => {
      vi.advanceTimersByTime(SPICE_DEBOUNCE_MS - 1);
    });
    expect(run).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("fires immediately (no debounce) for a switch/relay toggle", () => {
    let run = vi.fn();
    const { result, rerender } = renderHook(
      ({ cb }: { cb: () => void }) => useSpiceDebounceHarness(cb),
      { initialProps: { cb: run } }
    );

    // Consume the initial mount's own debounced run so it can't be mistaken for the eager one.
    act(() => {
      vi.advanceTimersByTime(SPICE_DEBOUNCE_MS);
    });
    expect(run).toHaveBeenCalledTimes(1);

    // A toggle: mark eager, then land the state change that gives `runSpiceSimulation` (here, the
    // callback prop) a new identity — exactly what a real `setComponents` from a toggle causes.
    const toggledRun = vi.fn();
    act(() => {
      result.current(); // requestEagerSpiceRun()
    });
    rerender({ cb: toggledRun });

    // No delay needed: the effect re-armed with a 0ms timer, which fires on the very next tick.
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(toggledRun).toHaveBeenCalledTimes(1);
    run = toggledRun;
  });

  it("is never reset or re-armed by a re-render that leaves the callback's identity unchanged", () => {
    // Models the RAF loop: `snapshot`/`animationTime` update every frame, but `runSpiceSimulation`
    // itself only ever gets a new identity from `components`/`wires`/`simulationMode` changing — so
    // a stable callback across many re-renders is exactly what the real component guarantees today.
    const run = vi.fn();
    const stableCallback = () => run();
    const { rerender } = renderHook(() => useSpiceDebounceHarness(stableCallback));

    // Advance partway, then re-render several times "mid-flight" as a 60fps RAF loop would.
    act(() => {
      vi.advanceTimersByTime(SPICE_DEBOUNCE_MS - 50);
    });
    for (let frame = 0; frame < 10; frame += 1) {
      rerender();
    }
    expect(run).not.toHaveBeenCalled(); // still not fired — good, nothing reset the countdown

    act(() => {
      vi.advanceTimersByTime(50);
    });
    // Fires exactly once, on the original schedule — the RAF re-renders neither delayed nor
    // duplicated it. Before the Run/Pause fix, `runSpiceSimulation` depended on the whole
    // `useSpiceEngine()` return object (a new reference every render), so this same sequence would
    // have cleared and restarted the pending timer on every single frame, and `run` would never
    // have fired while re-renders kept arriving faster than SPICE_DEBOUNCE_MS.
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("coalesces a burst of eager toggles into exactly one immediate run", () => {
    const run = vi.fn();
    const { result, rerender } = renderHook(
      ({ cb }: { cb: () => void }) => useSpiceDebounceHarness(cb),
      { initialProps: { cb: vi.fn() } }
    );
    act(() => {
      vi.advanceTimersByTime(SPICE_DEBOUNCE_MS);
    });

    // Rapid toggle, untoggle, toggle — as fast keyboard presses would produce.
    for (let i = 0; i < 3; i += 1) {
      act(() => {
        result.current();
      });
      rerender({ cb: run });
    }

    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(run).toHaveBeenCalledTimes(1);
  });
});
