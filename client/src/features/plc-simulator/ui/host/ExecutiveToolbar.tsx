import { Download, Pause, Play, Square, StepForward, Upload } from 'lucide-react';
import { useRef, type ChangeEvent, type ReactNode } from 'react';
import { Slider } from '@/components/ui/slider';
import type { ExecutionMode, ScanMetrics } from '../../engine/types';
import { Divider, ICON_PILL_BUTTON, PANEL, PILL_BUTTON } from '../chrome';
import type { FrameStore } from '../hardware/frame-store';
import { useFrameVersion } from '../hardware/hooks';

export interface ExecutiveToolbarProps {
  mode: ExecutionMode;
  scanMs: number;
  onScanMs: (ms: number) => void;
  onRun: () => void;
  onPause: () => void;
  onStop: () => void;
  onStep: () => void;
  frame: FrameStore;
  readMetrics: () => ScanMetrics | null;
  /** Left-most slot, e.g. the hardware selector. */
  leading?: ReactNode;
  onExport: () => void;
  exportTitle?: string;
  /** Called with the chosen file; omit to hide the import button. */
  onImport?: (file: File) => void;
  importTitle?: string;
  importAccept?: string;
  className?: string;
}

export const SCAN_MIN_MS = 20;
export const SCAN_MAX_MS = 500;

const MODE_DOT: Readonly<Record<ExecutionMode, string>> = {
  RUN: 'bg-emerald-500 animate-pulse',
  STOP: 'bg-slate-400',
  PAUSE: 'bg-amber-400',
  SINGLE_STEP: 'bg-sky-500',
};

/** Scan statistics: refreshed at display rate through the frame store, not once per scan. */
function ScanReadout({ frame, readMetrics }: { frame: FrameStore; readMetrics: () => ScanMetrics | null }) {
  useFrameVersion(frame);
  const metrics = readMetrics();
  return (
    <output aria-label="Scan statistics" className="hidden font-mono text-[11px] tabular-nums text-slate-500 lg:block dark:text-slate-400">
      {metrics ? `cycle ${metrics.cycle} · ${metrics.scanTimeMs.toFixed(2)} ms (avg ${metrics.avgScanMs.toFixed(2)})` : 'no scans yet'}
    </output>
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
  onStep,
  frame,
  readMetrics,
  leading,
  onExport,
  exportTitle = 'Export program',
  onImport,
  importTitle = 'Import program',
  importAccept,
  className = '',
}: ExecutiveToolbarProps) {
  const running = mode === 'RUN';
  const fileInput = useRef<HTMLInputElement>(null);

  const pick = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    if (file) onImport?.(file);
    event.target.value = '';
  };

  return (
    <section className={`${PANEL} w-full shrink-0 ${className}`}>
      <div
        role="toolbar"
        aria-label="Execution controls"
        className="scrollbar-none flex w-full flex-nowrap items-center justify-between gap-1.5 overflow-x-auto p-1.5 text-xs"
      >
        <div className="flex shrink-0 items-center gap-1">
          {leading}
          {leading !== undefined && <Divider />}

          <span
            role="status"
            className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full border border-slate-200/80 bg-slate-200/60 px-3 text-[11px] font-bold tracking-wide text-slate-700 dark:border-[#1a1d24] dark:bg-[#13161c] dark:text-slate-300"
          >
            <span aria-hidden="true" className={`h-2 w-2 rounded-full ${MODE_DOT[mode]}`} />
            {mode === 'SINGLE_STEP' ? 'STEP' : mode}
          </span>

          <button
            type="button"
            onClick={onRun}
            disabled={running}
            aria-label="Run"
            title="Run the program"
            className="brand-pill-active inline-flex h-9 shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap px-3.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" /> <span>Run</span>
          </button>
          <button type="button" onClick={onPause} disabled={!running} aria-label="Pause" title="Pause execution" className={`${PILL_BUTTON} px-3`}>
            <Pause className="h-3.5 w-3.5 fill-current text-slate-500 dark:text-slate-400" aria-hidden="true" /> Pause
          </button>
          <button type="button" onClick={onStop} disabled={mode === 'STOP'} aria-label="Stop" title="Stop and return to programming" className={`${PILL_BUTTON} px-3`}>
            <Square className="h-3.5 w-3.5 fill-current text-rose-500" aria-hidden="true" /> Stop
          </button>
          <button type="button" onClick={onStep} disabled={running} aria-label="Single step" title="Execute exactly one scan" className={`${PILL_BUTTON} px-3`}>
            <StepForward className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" aria-hidden="true" /> Step
          </button>

          <Divider />

          {onImport !== undefined && (
            <>
              <button type="button" title={importTitle} aria-label="Import" onClick={() => fileInput.current?.click()} className={ICON_PILL_BUTTON}>
                <Upload size={13} aria-hidden="true" />
              </button>
              <input ref={fileInput} type="file" accept={importAccept} onChange={pick} className="hidden" aria-hidden="true" tabIndex={-1} />
            </>
          )}
          <button type="button" title={exportTitle} aria-label="Export" onClick={onExport} className={ICON_PILL_BUTTON}>
            <Download size={13} aria-hidden="true" />
          </button>
        </div>

        <div className="ms-2 flex shrink-0 items-center gap-3">
          <ScanReadout frame={frame} readMetrics={readMetrics} />
          <div className="flex items-center gap-2 rounded-full border border-slate-200/80 bg-slate-200/60 px-3 py-2 dark:border-[#1a1d24] dark:bg-[#13161c]">
            <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">Scan</span>
            <Slider
              thumbLabel="Scan cycle time"
              min={SCAN_MIN_MS}
              max={SCAN_MAX_MS}
              step={10}
              value={[scanMs]}
              onValueChange={([next]) => next !== undefined && onScanMs(next)}
              className="w-28"
            />
            <span className="w-14 text-end font-mono text-[11px] tabular-nums text-slate-700 dark:text-slate-300">{scanMs} ms</span>
          </div>
        </div>
      </div>
    </section>
  );
}
