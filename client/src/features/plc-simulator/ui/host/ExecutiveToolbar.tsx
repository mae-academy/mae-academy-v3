import {
  BookOpen,
  Check,
  Clipboard,
  Copy,
  Download,
  Pause,
  Play,
  Redo2,
  RotateCcw,
  Trash2,
  Undo2,
  Upload,
} from 'lucide-react';
import { useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { SegmentedControl } from '@/components/common/templates';
import type { ExecutionMode, ScanMetrics } from '../../engine/types';
import { Divider, PANEL, PILL_BUTTON } from '../chrome';
import type { FrameStore } from '../hardware/frame-store';
import { useFrameVersion } from '../hardware/hooks';

export interface ExecutiveToolbarProps {
  mode: ExecutionMode;
  scanMs: number;
  onScanMs: (ms: number) => void;
  onRun: () => void;
  onPause: () => void;
  onStop: () => void;
  onReset?: () => void;
  /** Hides Run / Pause (controllers that are started from their own panel). */
  hideRunControls?: boolean;
  frame?: FrameStore;
  readMetrics?: () => ScanMetrics | null;
  /** Left-most slot, e.g. the hardware / CPU selector and examples dropdown. */
  leading?: ReactNode;
  onUndo?: () => void;
  canUndo?: boolean;
  onRedo?: () => void;
  canRedo?: boolean;
  onCopy?: () => void;
  onPaste?: () => void;
  onDelete?: () => void;
  onExport?: () => void;
  exportTitle?: string;
  /** Called with the chosen file; omit to hide the import button. */
  onImport?: (file: File) => void;
  importTitle?: string;
  importAccept?: string;
  className?: string;
}

export const SPEED_OPTIONS = [
  { label: '0.1x', value: '0.1', scanMs: 500 },
  { label: '0.5x', value: '0.5', scanMs: 100 },
  { label: '1.0x', value: '1.0', scanMs: 50 },
  { label: 'Instant', value: 'instant', scanMs: 5 },
] as const;

export const SCAN_MIN_MS = 5;
export const SCAN_MAX_MS = 500;

/** Scan statistics: refreshed at display rate through the frame store, not once per scan. */
function ScanReadout({ frame, readMetrics }: { frame: FrameStore; readMetrics: () => ScanMetrics | null }) {
  useFrameVersion(frame);
  const metrics = readMetrics();
  if (!metrics) return null;
  return (
    <span aria-label="Scan statistics" className="hidden font-sans text-[11px] font-medium tabular-nums text-slate-500 lg:block dark:text-slate-400">
      {`cycle ${metrics.cycle} · ${metrics.scanTimeMs.toFixed(2)} ms`}
    </span>
  );
}

/** Execution ribbon, laid out exactly like the Arduino Studio header: run controls, tools, speed. */
export function ExecutiveToolbar({
  mode,
  scanMs,
  onScanMs,
  onRun,
  onPause,
  onStop,
  onReset,
  hideRunControls = false,
  frame,
  readMetrics,
  leading,
  onUndo,
  canUndo = false,
  onRedo,
  canRedo = false,
  onCopy,
  onPaste,
  onDelete,
  onExport,
  exportTitle = 'Export program',
  onImport,
  importTitle = 'Import program',
  importAccept,
  className = '',
}: ExecutiveToolbarProps) {
  const running = mode === 'RUN';
  const paused = mode === 'PAUSE';
  const fileInput = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);

  const handleRunClick = (): void => {
    if (running) {
      onPause();
    } else {
      onRun();
    }
  };

  const handleCopy = (): void => {
    if (!onCopy) return;
    onCopy();
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const pick = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    if (file) onImport?.(file);
    event.target.value = '';
  };

  const currentSpeed =
    scanMs <= 10
      ? 'instant'
      : scanMs >= 300
        ? '0.1'
        : scanMs >= 75
          ? '0.5'
          : '1.0';

  const handleSpeedChange = (val: string): void => {
    const matched = SPEED_OPTIONS.find((opt) => opt.value === val);
    if (matched) onScanMs(matched.scanMs);
  };

  return (
    <section className={`${PANEL} w-full shrink-0 font-['Poppins',sans-serif] ${className}`}>
      <div
        role="toolbar"
        aria-label="Execution controls"
        className="scrollbar-none flex w-full flex-nowrap items-center justify-between gap-1.5 overflow-x-auto p-1.5 text-xs"
      >
        <span role="status" aria-label={`Controller mode ${mode}`} className="sr-only">
          {mode}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          {leading}
          {leading !== undefined && <Divider />}

          {/* Dynamic Run/Pause & Reset Control */}
          <div className="flex shrink-0 items-center gap-1">
            {!hideRunControls && (
              <button
                type="button"
                onClick={handleRunClick}
                aria-label={running ? 'Pause' : paused ? 'Resume' : 'Run'}
                title={running ? 'Pause execution' : paused ? 'Resume execution' : 'Run execution'}
                className={`inline-flex h-9 shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap px-3.5 text-xs font-semibold active:scale-[.98] ${paused ? 'brand-pill-active-rev' : 'brand-pill-active'
                  }`}
              >
                {running ? (
                  <Pause className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                ) : (
                  <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                )}
                <span>{running ? 'Pause' : paused ? 'Resume' : 'Run'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={onReset ?? onStop}
              aria-label="Stop"
              title="Reset / Stop execution state"
              className={`${PILL_BUTTON} w-9 px-0`}
            >
              <RotateCcw className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" aria-hidden="true" />
            </button>
          </div>

          <Divider />

          {/* Centered Editor Tool Suite */}
          <div className="flex shrink-0 items-center gap-1">
            {onUndo && (
              <button
                type="button"
                title="Undo (Ctrl+Z)"
                aria-label="Undo"
                onClick={onUndo}
                disabled={!canUndo || running}
                className={`${PILL_BUTTON} w-9 px-0`}
              >
                <Undo2 size={13} aria-hidden="true" />
              </button>
            )}
            {onRedo && (
              <button
                type="button"
                title="Redo (Ctrl+Shift+Z)"
                aria-label="Redo"
                onClick={onRedo}
                disabled={!canRedo || running}
                className={`${PILL_BUTTON} w-9 px-0`}
              >
                <Redo2 size={13} aria-hidden="true" />
              </button>
            )}
            {onCopy && (
              <button
                type="button"
                title={copied ? 'Copied!' : 'Copy code / diagram'}
                aria-label="Copy"
                onClick={handleCopy}
                className={`${PILL_BUTTON} w-9 px-0`}
              >
                {copied ? (
                  <Check size={13} className="text-violet-600 dark:text-violet-400" aria-hidden="true" />
                ) : (
                  <Copy size={13} aria-hidden="true" />
                )}
              </button>
            )}
            {onPaste && (
              <button
                type="button"
                title="Paste from clipboard"
                aria-label="Paste"
                onClick={onPaste}
                disabled={running}
                className={`${PILL_BUTTON} w-9 px-0`}
              >
                <Clipboard size={13} aria-hidden="true" />
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                title="Delete / Clear diagram"
                aria-label="Delete"
                onClick={onDelete}
                disabled={running}
                className={`${PILL_BUTTON} w-9 px-0 hover:text-rose-500 dark:hover:text-rose-400`}
              >
                <Trash2 size={13} aria-hidden="true" />
              </button>
            )}

            {(onImport !== undefined || onExport !== undefined) && <Divider />}

            {onImport !== undefined && (
              <>
                <button
                  type="button"
                  title={importTitle}
                  aria-label="Import"
                  onClick={() => fileInput.current?.click()}
                  disabled={running}
                  className={`${PILL_BUTTON} w-9 px-0`}
                >
                  <Upload size={13} aria-hidden="true" />
                </button>
                <input
                  ref={fileInput}
                  type="file"
                  accept={importAccept}
                  onChange={pick}
                  className="hidden"
                  aria-hidden="true"
                  tabIndex={-1}
                />
              </>
            )}
            {onExport !== undefined && (
              <button
                type="button"
                title={exportTitle}
                aria-label="Export"
                onClick={onExport}
                className={`${PILL_BUTTON} w-9 px-0`}
              >
                <Download size={13} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>

        {/* Far Right: Simulation Speed Selector */}
        <div className="ms-2 flex shrink-0 items-center gap-2">
          {frame && readMetrics && <ScanReadout frame={frame} readMetrics={readMetrics} />}
          <div className="hidden" aria-hidden="false">
            <SegmentedControl<string>
              options={SPEED_OPTIONS.map((option) => ({ label: option.label, value: option.value }))}
              value={currentSpeed}
              onChange={handleSpeedChange}
              size="sm"
              aria-label="Simulation speed"
              className="border-slate-200/80 bg-slate-200/60 dark:border-[#1a1d24] dark:bg-[#13161c]"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
