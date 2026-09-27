import type { PanelKey } from './firmware/panel';

export type NavScheme = 'arrows' | 'wasd';
export type OkBinding = 'Enter' | 'Space' | 'both' | string;
export type EscBinding = 'Escape' | 'Esc' | 'Q' | 'X' | 'Backspace' | string;

export interface LogoKeyBindings {
  readonly nav: NavScheme;
  readonly ok: string;
  readonly esc: string;
}

export const DEFAULT_KEYBINDINGS: LogoKeyBindings = {
  nav: 'arrows',
  ok: 'Enter',
  esc: 'Esc',
};

const STORAGE_KEY = 'mae_logo_keybindings';

/**
 * Normalizes browser KeyboardEvent.key into a clean, compact label suitable
 * for both storage and hint badge display (e.g. 'Space', 'Shift', 'Esc', 'Q', 'O').
 */
export function normalizeKey(rawKey: string): string {
  if (!rawKey) return '';
  if (rawKey === ' ' || rawKey === 'Spacebar' || rawKey.toLowerCase() === 'space') return 'Space';
  if (rawKey.toLowerCase() === 'escape' || rawKey.toLowerCase() === 'esc') return 'Esc';
  if (rawKey.startsWith('Shift')) return 'Shift';
  if (rawKey.startsWith('Control') || rawKey.toLowerCase() === 'ctrl') return 'Ctrl';
  if (rawKey.startsWith('Alt')) return 'Alt';
  if (rawKey.toLowerCase() === 'enter' || rawKey.toLowerCase() === 'return') return 'Enter';
  if (rawKey.toLowerCase() === 'backspace') return 'Backspace';
  if (rawKey.toLowerCase() === 'tab') return 'Tab';
  if (rawKey.length === 1) return rawKey.toUpperCase();
  return rawKey;
}

export function keysMatch(eventKey: string, targetBinding: string): boolean {
  if (targetBinding === 'both') {
    return keysMatch(eventKey, 'Enter') || keysMatch(eventKey, 'Space');
  }
  const normEvent = normalizeKey(eventKey).toLowerCase();
  const normTarget = normalizeKey(targetBinding).toLowerCase();
  return normEvent === normTarget;
}

export function loadKeyBindings(): LogoKeyBindings {
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null;
    if (!raw) return DEFAULT_KEYBINDINGS;
    const parsed = JSON.parse(raw);
    return {
      nav: parsed.nav === 'wasd' ? 'wasd' : 'arrows',
      ok: typeof parsed.ok === 'string' && parsed.ok ? normalizeKey(parsed.ok) : 'Enter',
      esc: typeof parsed.esc === 'string' && parsed.esc ? normalizeKey(parsed.esc) : 'Esc',
    };
  } catch {
    return DEFAULT_KEYBINDINGS;
  }
}

export function saveKeyBindings(bindings: LogoKeyBindings): void {
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(bindings));
    }
  } catch {
    // Ignore storage quota or access errors in restricted environments
  }
}

/**
 * Maps a keyboard event key string to a LOGO! PanelKey ('up' | 'down' | 'left' | 'right' | 'ok' | 'esc')
 * according to the active keybindings.
 */
export function matchKeybinding(eventKey: string, bindings: LogoKeyBindings): PanelKey | null {
  const k = eventKey.toLowerCase();

  // Navigation
  if (bindings.nav === 'wasd') {
    if (k === 'w' || eventKey === 'ArrowUp') return 'up';
    if (k === 's' || eventKey === 'ArrowDown') return 'down';
    if (k === 'a' || eventKey === 'ArrowLeft') return 'left';
    if (k === 'd' || eventKey === 'ArrowRight') return 'right';
  } else {
    if (eventKey === 'ArrowUp') return 'up';
    if (eventKey === 'ArrowDown') return 'down';
    if (eventKey === 'ArrowLeft') return 'left';
    if (eventKey === 'ArrowRight') return 'right';
  }

  // OK key
  if (keysMatch(eventKey, bindings.ok)) return 'ok';

  // ESC key (Escape key is always preserved as an emergency escape hatch)
  if (eventKey === 'Escape' || keysMatch(eventKey, bindings.esc)) return 'esc';

  return null;
}

export function toggleNav(bindings: LogoKeyBindings): LogoKeyBindings {
  return { ...bindings, nav: bindings.nav === 'arrows' ? 'wasd' : 'arrows' };
}

export function toggleOk(bindings: LogoKeyBindings): LogoKeyBindings {
  return { ...bindings, ok: bindings.ok === 'Enter' ? 'Space' : 'Enter' };
}

export function toggleEsc(bindings: LogoKeyBindings): LogoKeyBindings {
  return { ...bindings, esc: normalizeKey(bindings.esc) === 'Esc' ? 'Q' : 'Esc' };
}

export interface HintStripInfo {
  readonly navHint: string;
  readonly okHint: string;
  readonly escHint: string;
  readonly inputsHint: string;
  readonly fullText: string;
}

export function getHintStrip(bindings: LogoKeyBindings): HintStripInfo {
  const navHint = bindings.nav === 'wasd' ? 'WASD Nav' : '▲▼◄► Nav';
  const okHint = bindings.ok === 'both' ? 'Enter/Space: OK' : `${normalizeKey(bindings.ok)}: OK`;
  const escHint = `${normalizeKey(bindings.esc)}: Back`;
  const inputsHint = '1-8: Inputs';

  return {
    navHint,
    okHint,
    escHint,
    inputsHint,
    fullText: `[${navHint}] [${okHint}] [${escHint}] [${inputsHint}]`,
  };
}
