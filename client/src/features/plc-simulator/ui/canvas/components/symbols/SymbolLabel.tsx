import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import type { NodeId } from '../../../../domain/ast';
import { useLadderEnv } from '../../env';
import type { SlotKey } from '../../operand-slots';
import { CANVAS_FONT_FAMILY, TEXT_ADDRESS, TEXT_LIVE, TEXT_PIN, TEXT_TAG } from './theme';

export type LabelTone = 'address' | 'tag' | 'pin' | 'value';

const TONE: Readonly<Record<LabelTone, { className: string; size: number; weight: number }>> = {
  address: { className: `font-sans ${TEXT_ADDRESS}`, size: 12, weight: 600 },
  tag: { className: `font-sans ${TEXT_TAG}`, size: 10, weight: 400 },
  pin: { className: `font-sans ${TEXT_PIN}`, size: 10, weight: 500 },
  value: { className: `font-sans ${TEXT_LIVE}`, size: 10, weight: 600 },
};

export interface SymbolLabelProps {
  nodeId: NodeId;
  /** When set (and the canvas is interactive) double-clicking the text edits this operand slot. */
  slot?: SlotKey;
  x: number;
  y: number;
  text: string;
  tone: LabelTone;
  anchor?: 'start' | 'middle' | 'end';
}

const EDITOR_WIDTH = 96;
const EDITOR_HEIGHT = 46;

export function SymbolLabel({ nodeId, slot, x, y, text, tone, anchor = 'middle' }: SymbolLabelProps) {
  const env = useLadderEnv();
  const style = TONE[tone];
  const editable = env !== null && env.interactive && slot !== undefined;
  const editing = editable && env.editing?.nodeId === nodeId && env.editing.slot === slot;

  if (editing && env && slot !== undefined) {
    const left = anchor === 'middle' ? x - EDITOR_WIDTH / 2 : anchor === 'start' ? x - 2 : x - EDITOR_WIDTH + 2;
    return (
      <foreignObject x={left} y={y - 18} width={EDITOR_WIDTH} height={EDITOR_HEIGHT}>
        <AddressEditor
          initial={text}
          validate={(value) => env.validate(nodeId, slot, value)}
          onCommit={(value) => env.commitEdit(nodeId, slot, value)}
          onCancel={env.cancelEdit}
        />
      </foreignObject>
    );
  }

  return (
    <text
      x={x}
      y={y}
      textAnchor={anchor}
      fontFamily={CANVAS_FONT_FAMILY}
      fontSize={style.size}
      fontWeight={style.weight}
      className={`${style.className} select-none ${editable ? 'cursor-text' : ''}`}
      onDoubleClick={
        editable && env && slot !== undefined
          ? (event) => {
              event.stopPropagation();
              env.beginEdit(nodeId, slot);
            }
          : undefined
      }
    >
      {editable && <title>Double-click to edit</title>}
      {text}
    </text>
  );
}

interface AddressEditorProps {
  initial: string;
  validate: (value: string) => string | null;
  onCommit: (value: string) => void;
  onCancel: () => void;
}

/** Inline operand editor: validates on every keystroke against the active hardware profile. */
function AddressEditor({ initial, validate, onCommit, onCancel }: AddressEditorProps) {
  const [value, setValue] = useState(initial);
  const inputRef = useRef<HTMLInputElement>(null);
  const finished = useRef(false);
  const errorId = useId();
  const error = validate(value);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const finish = (commit: boolean): void => {
    if (finished.current) return;
    finished.current = true;
    if (commit && error === null && value.trim() !== initial) onCommit(value);
    else onCancel();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    event.stopPropagation(); // Delete / arrows must edit the text, not the ladder
    if (event.key === 'Enter') {
      event.preventDefault();
      if (error === null) finish(true);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      finish(false);
    }
  };

  return (
    <div className="flex flex-col gap-0.5" onClick={(event) => event.stopPropagation()}>
      <input
        ref={inputRef}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => finish(error === null)}
        aria-label="Operand"
        aria-invalid={error !== null}
        aria-describedby={error !== null ? errorId : undefined}
        spellCheck={false}
        autoComplete="off"
        className={`h-6 w-full rounded border px-1.5 font-sans text-xs outline-none bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100 ${
          error === null ? 'border-sky-500 focus:ring-1 focus:ring-sky-500' : 'border-red-500 focus:ring-1 focus:ring-red-500'
        }`}
      />
      {error !== null && (
        <span id={errorId} role="alert" className="rounded bg-red-600 px-1 text-[9px] leading-tight text-white">
          {error}
        </span>
      )}
    </div>
  );
}
