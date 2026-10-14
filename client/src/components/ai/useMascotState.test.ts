// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EUREKA_MS, LISTENING_IDLE_MS, TALKING_SILENCE_MS, useMascotState } from './useMascotState';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const tick = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

describe('useMascotState', () => {
  it('starts idle', () => {
    const { result } = renderHook(() => useMascotState());
    expect(result.current.state).toBe('idle');
  });

  it('listens on input activity and debounces back to idle', () => {
    const { result } = renderHook(() => useMascotState());
    act(() => result.current.onInputActivity());
    expect(result.current.state).toBe('listening');
    tick(LISTENING_IDLE_MS - 500);
    act(() => result.current.onInputActivity()); // keystroke re-arms the debounce
    tick(LISTENING_IDLE_MS - 1);
    expect(result.current.state).toBe('listening');
    tick(1);
    expect(result.current.state).toBe('idle');
  });

  it('is thinking from send until the first token', () => {
    const { result } = renderHook(() => useMascotState());
    act(() => result.current.onInputActivity());
    act(() => result.current.onSend());
    expect(result.current.state).toBe('thinking');
    tick(30_000);
    expect(result.current.state).toBe('thinking'); // no timeout while waiting on the model
    act(() => result.current.onInputActivity());
    expect(result.current.state).toBe('thinking'); // typing does not hijack the response
  });

  it('shows eureka for exactly 1200ms and then talks, never skipping the bulb', () => {
    const { result } = renderHook(() => useMascotState());
    act(() => result.current.onSend());
    act(() => result.current.onFirstToken());
    expect(result.current.state).toBe('eureka');
    act(() => result.current.onToken()); // tokens during the bulb do not cut it short
    tick(EUREKA_MS - 1);
    expect(result.current.state).toBe('eureka');
    tick(1);
    expect(result.current.state).toBe('talking');
  });

  it('refreshes talking on tokens and goes idle after the silence window', () => {
    const { result } = renderHook(() => useMascotState());
    act(() => result.current.onSend());
    act(() => result.current.onFirstToken());
    tick(EUREKA_MS);
    expect(result.current.state).toBe('talking');
    tick(TALKING_SILENCE_MS - 100);
    act(() => result.current.onToken());
    tick(TALKING_SILENCE_MS - 100);
    expect(result.current.state).toBe('talking');
    tick(100);
    expect(result.current.state).toBe('idle');
    act(() => result.current.onToken()); // stream resumes after a pause
    expect(result.current.state).toBe('talking');
  });

  it('does not retrigger eureka on a second onFirstToken', () => {
    const { result } = renderHook(() => useMascotState());
    act(() => result.current.onSend());
    act(() => result.current.onFirstToken());
    tick(EUREKA_MS);
    expect(result.current.state).toBe('talking');
    act(() => result.current.onFirstToken());
    expect(result.current.state).toBe('talking');
    // duplicate call mid-bulb must not extend it either
    act(() => result.current.onSend());
    act(() => result.current.onFirstToken());
    tick(600);
    act(() => result.current.onFirstToken());
    tick(600);
    expect(result.current.state).toBe('talking');
  });

  it('treats onToken before onFirstToken as the first token', () => {
    const { result } = renderHook(() => useMascotState());
    act(() => result.current.onSend());
    act(() => result.current.onToken());
    expect(result.current.state).toBe('eureka');
  });

  it('defers onStreamEnd until the eureka window has passed', () => {
    const { result } = renderHook(() => useMascotState());
    act(() => result.current.onSend());
    act(() => result.current.onFirstToken());
    tick(300);
    act(() => result.current.onStreamEnd());
    expect(result.current.state).toBe('eureka');
    tick(EUREKA_MS - 300);
    expect(result.current.state).toBe('idle');
  });

  it('onStreamEnd after talking goes idle immediately, and late tokens are ignored', () => {
    const { result } = renderHook(() => useMascotState());
    act(() => result.current.onSend());
    act(() => result.current.onFirstToken());
    tick(EUREKA_MS);
    act(() => result.current.onStreamEnd());
    expect(result.current.state).toBe('idle');
    act(() => result.current.onToken());
    expect(result.current.state).toBe('idle');
  });

  it('onStreamEnd without any token (empty answer) leaves thinking', () => {
    const { result } = renderHook(() => useMascotState());
    act(() => result.current.onSend());
    act(() => result.current.onStreamEnd());
    expect(result.current.state).toBe('idle');
  });

  it('onError goes idle immediately, even mid-eureka, and cancels pending timers', () => {
    const { result } = renderHook(() => useMascotState());
    act(() => result.current.onSend());
    act(() => result.current.onFirstToken());
    tick(200);
    act(() => result.current.onError());
    expect(result.current.state).toBe('idle');
    tick(5000);
    expect(result.current.state).toBe('idle');
    act(() => result.current.onSend());
    act(() => result.current.onError());
    expect(result.current.state).toBe('idle');
  });

  it('a new send re-arms the bulb for the next response', () => {
    const { result } = renderHook(() => useMascotState());
    for (let i = 0; i < 2; i++) {
      act(() => result.current.onSend());
      expect(result.current.state).toBe('thinking');
      act(() => result.current.onFirstToken());
      expect(result.current.state).toBe('eureka');
      tick(EUREKA_MS);
      act(() => result.current.onStreamEnd());
      expect(result.current.state).toBe('idle');
    }
  });

  it('reset clears all timers', () => {
    const { result } = renderHook(() => useMascotState());
    act(() => result.current.onSend());
    act(() => result.current.onFirstToken());
    act(() => result.current.reset());
    expect(result.current.state).toBe('idle');
    expect(vi.getTimerCount()).toBe(0);
    act(() => result.current.onInputActivity());
    act(() => result.current.reset());
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps handlers referentially stable across state changes', () => {
    const { result } = renderHook(() => useMascotState());
    const before = { ...result.current };
    act(() => result.current.onSend());
    act(() => result.current.onFirstToken());
    tick(EUREKA_MS);
    for (const k of ['onInputActivity', 'onSend', 'onFirstToken', 'onToken', 'onStreamEnd', 'onError', 'reset'] as const) {
      expect(result.current[k]).toBe(before[k]);
    }
  });

  it('clears every timer on unmount and never sets state afterwards', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result, unmount } = renderHook(() => useMascotState());
    const api = result.current;
    act(() => api.onSend());
    act(() => api.onFirstToken());
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    // handlers captured by a stale stream callback must be harmless
    expect(() => {
      api.onToken();
      api.onStreamEnd();
      api.onInputActivity();
    }).not.toThrow();
    vi.advanceTimersByTime(10_000);
    unmount();
    expect(err).not.toHaveBeenCalled();
    err.mockRestore();
  });
});
