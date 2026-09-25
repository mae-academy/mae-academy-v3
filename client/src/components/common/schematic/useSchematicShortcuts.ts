import { useEffect, useRef } from 'react';

export type SchematicShortcutAction =
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'copy' }
  | { type: 'cut' }
  | { type: 'paste' }
  | { type: 'delete' }
  | { type: 'escape' }
  | { type: 'rotate' }
  | { type: 'flip'; axis: 'h' | 'v' }
  | { type: 'text' }
  | { type: 'wireHint' }
  | { type: 'nudge'; dx: number; dy: number };

export interface ShortcutKeyInput {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

/** Single canonical key map for every schematic studio. */
export function resolveSchematicShortcut(event: ShortcutKeyInput, step: number): SchematicShortcutAction | null {
  const key = event.key.toLowerCase();
  const mod = event.ctrlKey || event.metaKey;
  if (mod) {
    if (key === 'z') return event.shiftKey ? { type: 'redo' } : { type: 'undo' };
    if (key === 'y') return { type: 'redo' };
    if (key === 'c') return { type: 'copy' };
    if (key === 'x') return { type: 'cut' };
    if (key === 'v') return { type: 'paste' };
    return null;
  }
  if (event.altKey) return null;
  if (event.key === 'Delete' || event.key === 'Backspace') return { type: 'delete' };
  if (event.key === 'Escape') return { type: 'escape' };
  if (event.key === ' ' || event.key === 'Spacebar') return { type: 'rotate' };
  if (key === 'h') return { type: 'flip', axis: 'h' };
  if (key === 'v') return { type: 'flip', axis: 'v' };
  if (key === 't') return { type: 'text' };
  if (key === 'w') return { type: 'wireHint' };
  const distance = event.shiftKey ? step * 5 : step;
  switch (event.key) {
    case 'ArrowLeft': return { type: 'nudge', dx: -distance, dy: 0 };
    case 'ArrowRight': return { type: 'nudge', dx: distance, dy: 0 };
    case 'ArrowUp': return { type: 'nudge', dx: 0, dy: -distance };
    case 'ArrowDown': return { type: 'nudge', dx: 0, dy: distance };
    default: return null;
  }
}

export function isTextEntryElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable;
}

export interface SchematicShortcutHandlers {
  step: number;
  /** Returns true when the action was applicable (the default browser action is then suppressed). */
  onAction: (action: SchematicShortcutAction) => boolean;
  /** Studio hook for keys the shared map does not own (e.g. logic-input hotkeys). */
  onUnhandledKey?: (event: KeyboardEvent) => void;
}

export function useSchematicShortcuts(handlers: SchematicShortcutHandlers): void {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTextEntryElement(event.target)) return;
      const { step, onAction, onUnhandledKey } = handlersRef.current;
      const action = resolveSchematicShortcut(event, step);
      if (action && onAction(action)) {
        event.preventDefault();
        return;
      }
      if (action?.type === 'rotate') {
        event.preventDefault();
        return;
      }
      // Inapplicable shared actions fall through to the studio.
      onUnhandledKey?.(event);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}
