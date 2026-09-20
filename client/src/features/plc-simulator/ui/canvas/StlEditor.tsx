import { Code } from 'lucide-react';
import { useId, useMemo, useRef, type ReactNode } from 'react';
import Editor from 'react-simple-code-editor';
import type { TranspileDiagnostic } from '../../transpiler';
import { PANEL, WindowBar } from '../chrome';

export interface StlEditorProps {
  text: string;
  diagnostics: readonly TranspileDiagnostic[];
  /** The text has been edited and will replace the ladder when switching back. */
  dirty: boolean;
  notice: string | null;
  onChange: (text: string) => void;
  onDiscard: () => void;
  trailing?: ReactNode;
}

/** Offset of the start of 1-based `line` within `text`. */
function lineOffset(text: string, line: number): number {
  let offset = 0;
  for (let i = 1; i < line; i++) {
    const next = text.indexOf('\n', offset);
    if (next === -1) return text.length;
    offset = next + 1;
  }
  return offset;
}

// ---- highlighting (shares Code Studio's assembler-token-* classes) -----------------------------

const TOKEN_RE = /(\/\/.*$)|(\b(?:NETWORK|TITLE|END_NETWORK)\b)|(\b[IQMVSTC]{1,2}[BWD]?\d+(?:\.\d+)?\b)|(\b\d[\w.#]*)|([A-Za-z_=][\w=]*)/g;
const MNEMONICS = new Set([
  'LD', 'LDN', 'A', 'AN', 'O', 'ON', 'ALD', 'OLD', 'LPS', 'LRD', 'LPP', 'NOT', 'EU', 'ED', 'S', 'R', 'SI', 'RI', 'TON', 'TOF', 'TONR',
  'CTU', 'CTD', 'CTUD', 'MOVB', 'MOVW', 'MOVD', 'MOVR', '+I', '-I', '*I', '/I', '+D', '-D', '*D', '/D', '+R', '-R', '*R', '/R', 'SQRT', 'SIN',
  'ANDW', 'ORW', 'XORW', 'LDB=', 'LDW=', 'LDD=', 'LDR=', 'AW=', 'OW=', 'MCR', 'MCRE', 'END', '=',
]);

/** Line-by-line tokenizer; each line keeps a fixed height so the gutter never drifts out of step. */
function highlightStl(source: string): ReactNode {
  return source.split('\n').map((line, index) => {
    const re = new RegExp(TOKEN_RE.source, 'g');
    const parts: ReactNode[] = [];
    let last = 0;
    for (let m = re.exec(line); m !== null; m = re.exec(line)) {
      if (m.index > last) parts.push(line.slice(last, m.index));
      const text = m[0];
      let cls: string | undefined;
      if (m[1]) cls = 'assembler-token-comment';
      else if (m[2]) cls = 'assembler-token-directive';
      else if (m[3]) cls = 'assembler-token-register';
      else if (m[4]) cls = 'assembler-token-number';
      else if (MNEMONICS.has(text.toUpperCase())) cls = 'assembler-token-instruction';
      parts.push(
        cls ? (
          <span key={m.index} className={cls}>
            {text}
          </span>
        ) : (
          text
        ),
      );
      last = m.index + text.length;
    }
    if (last < line.length) parts.push(line.slice(last));
    return (
      <div key={index} className="h-7 whitespace-pre pe-3 font-mono text-[12px] leading-7">
        {parts.length === 0 ? '\u00A0' : parts}
      </div>
    );
  });
}

/** STL / IL source in the Code Studio window: traffic-light bar, line gutter, syntax colours. */
export function StlEditor({ text, diagnostics, dirty, notice, onChange, onDiscard, trailing }: StlEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const textareaId = useId();

  const lineCount = useMemo(() => text.split('\n').length, [text]);
  const severityByLine = useMemo(() => {
    const map = new Map<number, 'error' | 'warning'>();
    for (const d of diagnostics) {
      if (d.line === undefined) continue;
      if (map.get(d.line) !== 'error') map.set(d.line, d.severity);
    }
    return map;
  }, [diagnostics]);

  const errors = diagnostics.filter((d) => d.severity === 'error').length;

  const jumpTo = (d: TranspileDiagnostic): void => {
    const area = editorRef.current?.querySelector('textarea');
    if (!area || d.line === undefined) return;
    const start = lineOffset(text, d.line);
    const end = text.indexOf('\n', start);
    area.focus();
    area.setSelectionRange(start, end === -1 ? text.length : end);
  };

  return (
    <section className={`${PANEL} h-full min-h-[320px]`}>
      <WindowBar
        icon={<Code className="h-3.5 w-3.5" />}
        title="program.awl"
        trailing={
          <div className="flex items-center gap-2">
            {trailing}
            <span className="hidden text-xs text-slate-500 sm:inline dark:text-slate-400">
              {lineCount} lines
            </span>
          </div>
        }
      />

      {notice !== null && (
        <div role="alert" className="shrink-0 border-b border-red-500/30 bg-red-500/10 px-3 py-1.5 font-mono text-[11.5px] text-red-700 dark:text-red-400">
          {notice}
        </div>
      )}

      <label htmlFor={textareaId} className="sr-only">
        Instruction list (STL) source
      </label>
      <div ref={editorRef} dir="ltr" className="relative min-h-0 flex-1 select-text overflow-auto bg-[#f8fbff] dark:bg-[#07080a]">
        <div className="flex min-h-full min-w-max">
          <div
            aria-hidden="true"
            className="sticky start-0 z-10 w-13 shrink-0 select-none border-e border-slate-200 bg-slate-100/80 py-2 font-mono text-[12px] leading-7 dark:border-[#1a1d24] dark:bg-[#090a0d]/90"
          >
            {Array.from({ length: lineCount }, (_, i) => {
              const severity = severityByLine.get(i + 1);
              return (
                <div
                  key={i}
                  className={`h-7 pe-2.5 text-end tabular-nums ${
                    severity === 'error'
                      ? 'bg-rose-500/20 font-medium text-rose-600 dark:text-rose-300'
                      : severity === 'warning'
                        ? 'bg-amber-500/20 font-medium text-amber-700 dark:text-amber-300'
                        : 'text-slate-400 dark:text-slate-500'
                  }`}
                >
                  {String(i + 1).padStart(2, '0')}
                </div>
              );
            })}
          </div>
          <div className="relative min-w-0 flex-1">
            <Editor
              value={text}
              onValueChange={onChange}
              highlight={highlightStl}
              padding={8}
              tabSize={2}
              textareaId={textareaId}
              style={{
                minHeight: '100%',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                fontSize: 12.5,
                lineHeight: '1.75rem',
                whiteSpace: 'pre',
                position: 'relative',
                zIndex: 1,
                fontWeight: 400,
              }}
              textareaClassName="!ps-3 !outline-none !caret-violet-500 !font-normal"
            />
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-between border-t border-slate-200 bg-slate-50 px-3 py-1.5 text-[11.5px] text-slate-600 dark:border-[#1a1d24] dark:bg-[#0d0f12] dark:text-slate-300">
        <span aria-live="polite">
          {errors > 0
            ? `${errors} error${errors === 1 ? '' : 's'}: fix them to return to ladder`
            : dirty
              ? 'Valid. Switching to LAD will rebuild the ladder from this text.'
              : 'Read-only view of the current ladder. Edit to change it.'}
        </span>
        {dirty && (
          <button type="button" onClick={onDiscard} className="rounded px-2 py-0.5 font-medium underline hover:bg-slate-200/60 dark:hover:bg-[#13161c]">
            Discard changes
          </button>
        )}
      </div>

      {diagnostics.length > 0 && (
        <ul aria-label="STL diagnostics" className="max-h-32 shrink-0 overflow-y-auto border-t border-slate-200 text-xs dark:border-[#1a1d24]">
          {diagnostics.map((d, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => jumpTo(d)}
                disabled={d.line === undefined}
                className="flex w-full items-baseline gap-2 px-3 py-1 text-left hover:bg-slate-100 disabled:cursor-default dark:hover:bg-[#13161c]"
              >
                <span className={d.severity === 'error' ? 'font-semibold text-rose-600' : 'font-semibold text-amber-600'}>{d.severity}</span>
                {d.line !== undefined && (
                  <span className="font-mono text-slate-500">
                    {d.line}:{d.column ?? 1}
                  </span>
                )}
                <span>{d.message}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
