import { Code } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CodeEditor, type CodeEditorHandle } from '@/components/code-editor/CodeEditor';
import { stlLanguage } from '@/components/code-editor/languages';
import { registerUnifiedMonacoThemes } from '@/lib/monacoTheme';
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
  theme?: string;
  beforeMount?: (monaco: any) => void;
}

/** STL / IL source in the Code Studio window: traffic-light bar, line gutter, syntax colours. */
export function StlEditor({
  text,
  diagnostics,
  dirty,
  notice,
  onChange,
  onDiscard,
  trailing,
  theme,
  beforeMount,
}: StlEditorProps) {
  const editorRef = useRef<CodeEditorHandle>(null);
  const [activeLine, setActiveLine] = useState<number>(1);

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

  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).monaco) {
      registerUnifiedMonacoThemes((window as any).monaco);
      beforeMount?.((window as any).monaco);
    }
    if (typeof document !== 'undefined' && 'fonts' in document) {
      document.fonts.ready.then(() => {
        if (typeof window !== 'undefined' && (window as any).monaco) {
          (window as any).monaco.editor?.remeasureFonts();
        }
      });
    }
  }, [beforeMount]);

  const jumpTo = (d: TranspileDiagnostic): void => {
    if (d.line === undefined) return;
    editorRef.current?.focusLine(d.line);
    setActiveLine(d.line);
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
        <div role="alert" className="shrink-0 border-b border-red-500/30 bg-red-500/10 px-3 py-1.5 font-sans text-[11.5px] text-red-700 dark:text-red-400">
          {notice}
        </div>
      )}

      <CodeEditor
        ref={editorRef}
        value={text}
        onChange={onChange}
        language={stlLanguage}
        activeLine={activeLine}
        onCursorLine={setActiveLine}
        lineSeverity={severityByLine}
        ariaLabel="Instruction list (STL) source"
      />

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
                <span className={d.severity === 'error' ? 'font-semibold text-rose-600' : 'font-semibold text-sky-600 dark:text-sky-400'}>{d.severity}</span>
                {d.line !== undefined && (
                  <span className="font-sans tabular-nums text-slate-500">
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
