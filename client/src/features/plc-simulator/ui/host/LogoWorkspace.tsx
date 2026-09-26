import { BookOpen, ChevronDown, Factory, Workflow } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { SegmentedControl, StudioCard } from '@/components/common/templates';
import { MEMORY_LIMITS } from '../../logo/engine/memory';
import type { DeviceClass } from '../../logo/hardware/devices';
import { parseProgram, serializeProgram } from '../../logo/persist';
import { isScenarioId, SCENARIO_GROUPS, SCENARIO_LIST, SCENARIOS, type ScenarioId } from '../../logo/scenarios';
import { FbdViewer } from '../../logo/ui/FbdViewer';
import { LogoManual } from '../../logo/ui/LogoManual';
import { LogoBench } from '../../logo/ui/LogoBench';
import { useLogoBench } from '../../logo/ui/useLogoBench';
import { PILL_BUTTON } from '../chrome';
import { NoticeBanner } from './Banners';
import { downloadText } from './download';
import { ExecutiveToolbar } from './ExecutiveToolbar';
import type { PlcHostOptions } from './usePlcHost';

export interface LogoWorkspaceProps {
  active: boolean;
  initialScenario?: ScenarioId;
  initialDevice?: DeviceClass;
  /** Scheduler and clock overrides; tests drive the scan loop by hand through these. */
  runtimeOptions?: PlcHostOptions['runtimeOptions'];
}

const DEVICE_OPTIONS = [
  { label: '230V AC', value: '230RC' },
  { label: '24V DC', value: '12/24RC' },
] as const satisfies readonly { label: string; value: DeviceClass }[];

/**
 * SIMATIC LOGO! 0BA4 environment: an interactive electrical bench instead of an editor. The circuit
 * program comes from the application picker (or an imported file) and is inspected / tuned on the
 * device itself, through its LCD and six-key keypad, exactly as on the real unit.
 */
export function LogoWorkspace({ active, initialScenario = 'stairway', initialDevice, runtimeOptions }: LogoWorkspaceProps) {
  const { controller } = useLogoBench({
    scenario: initialScenario,
    device: initialDevice,
    scheduler: runtimeOptions?.scheduler,
    clock: runtimeOptions?.clock,
  });
  const [importError, setImportError] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [fbdOpen, setFbdOpen] = useState(true);

  // A hidden tab must not keep scanning behind the user's back.
  useEffect(() => {
    if (!active) controller.stop();
  }, [active, controller]);

  const scenario = SCENARIOS[controller.scenario];
  const spec = controller.device;
  const program = controller.program;

  const exportProgram = useCallback(() => {
    downloadText(`${(program.name || 'logo').toLowerCase()}.logo.json`, serializeProgram(program), 'application/json');
    toast.success('Circuit program exported');
  }, [program]);

  const importFile = useCallback(
    async (file: File): Promise<void> => {
      const parsed = parseProgram(await file.text());
      if (!parsed.ok) {
        setImportError(`${file.name}: ${parsed.reason}`);
        toast.error('Import failed');
        return;
      }
      const errors = controller.importProgram(parsed.program).filter((d) => d.severity === 'error');
      if (errors.length > 0) {
        setImportError(`${file.name}: ${errors[0]?.message ?? 'program rejected'}`);
        toast.error('LOGO! rejected the program');
        return;
      }
      setImportError(null);
      toast.success(`Loaded ${file.name} into LOGO! memory`);
    },
    [controller],
  );

  const handleReset = useCallback(() => {
    controller.reset();
    toast.info('LOGO! memory reset');
  }, [controller]);

  const usage = controller.snapshot().usage;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2.5">
      <ExecutiveToolbar
        mode={controller.mode}
        scanMs={controller.scanMs}
        onScanMs={(ms) => controller.setScanMs(ms)}
        onRun={() => void controller.run()}
        onPause={() => controller.pause()}
        onStop={() => controller.stop()}
        onReset={handleReset}
        hideRunControls
        onExport={exportProgram}
        exportTitle="Export circuit program (.logo.json)"
        onImport={(file) => void importFile(file)}
        importTitle="Load circuit program into LOGO! (.logo.json)"
        importAccept=".json,application/json"
        leading={
          <div className="flex shrink-0 items-center gap-1.5">
            <SegmentedControl<DeviceClass>
              aria-label="Supply voltage class"
              size="sm"
              value={spec.id}
              options={DEVICE_OPTIONS.map((option) => ({ ...option }))}
              onChange={(device) => controller.setDevice(device)}
              className="border-slate-200/80 bg-slate-200/60 dark:border-[#1a1d24] dark:bg-[#13161c]"
            />
            <div className="relative inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-slate-200/80 bg-slate-200/60 px-3 text-xs font-medium text-slate-700 transition hover:bg-slate-300/50 dark:border-[#1a1d24] dark:bg-[#13161c] dark:text-slate-300 dark:hover:bg-[#1a1d24]">
              <Factory className="pointer-events-none h-3.5 w-3.5 shrink-0 text-violet-600 dark:text-violet-400" aria-hidden="true" />
              <span className="pointer-events-none text-xs font-semibold text-slate-800 dark:text-slate-200">{scenario.title}</span>
              <ChevronDown className="pointer-events-none h-3 w-3 text-slate-400" aria-hidden="true" />
              <select
                aria-label="Application scenario"
                value={controller.scenario}
                onChange={(event) => {
                  const id = event.target.value;
                  if (!isScenarioId(id)) return;
                  controller.loadScenario(id);
                  setImportError(null);
                  toast.success(`Loaded "${SCENARIOS[id].title}"`);
                }}
                className="absolute inset-0 h-full w-full cursor-pointer text-xs opacity-0"
              >
                {SCENARIO_GROUPS.map((group) => (
                  <optgroup key={group.id} label={group.label}>
                    {SCENARIO_LIST.filter((entry) => entry.group === group.id).map((entry) => (
                      <option key={entry.id} value={entry.id} className="bg-white font-sans text-slate-800 dark:bg-[#13161c] dark:text-slate-200">
                        {`${entry.chapter} · ${entry.title}`}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => setManualOpen((open) => !open)}
              aria-pressed={manualOpen}
              aria-label="Beginner's manual"
              title="LOGO! beginner's manual"
              className={`${PILL_BUTTON} ${manualOpen ? '!border-red-500/60 !text-red-600 dark:!text-red-400' : ''}`}
            >
              <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Manual</span>
            </button>
          </div>
        }
      />

      {manualOpen && (
        <LogoManual
          onClose={() => setManualOpen(false)}
          onLoad={(id) => {
            controller.loadScenario(id);
            setImportError(null);
            toast.success(`Loaded "${SCENARIOS[id].title}"`);
          }}
        />
      )}

      <NoticeBanner
        message={controller.notice ?? importError}
        onDismiss={() => (controller.notice !== null ? controller.dismissNotice() : setImportError(null))}
      />

      <StudioCard
        title={`${spec.model} · ${scenario.title}`}
        subtitle={`${scenario.chapter} — ${scenario.summary}`}
        actionSlot={
          <span className="hidden shrink-0 text-[11px] font-medium tabular-nums text-slate-500 sm:block dark:text-slate-400">
            {`${program.name || 'no program'} · ${usage.blocks}/${MEMORY_LIMITS.blocks} blocks · ${usage.bytes}/${MEMORY_LIMITS.bytes} B · REM ${usage.rem}/${MEMORY_LIMITS.rem}`}
          </span>
        }
      >
        <LogoBench controller={controller} active={active} />
        <p role="note" aria-label="Keyboard shortcuts" className="mt-3 text-center text-[11px] font-medium text-slate-500 dark:text-slate-400">
          [▲▼◄► Nav] [Enter: OK] [Esc: Back]
        </p>
      </StudioCard>

      <StudioCard
        title="Function block diagram"
        subtitle={controller.running ? 'Live: wires carrying a 1 are highlighted; timers and counters show their accumulator.' : 'Start the program from the LCD to see live signal flow.'}
        actionSlot={
          <button type="button" onClick={() => setFbdOpen((open) => !open)} aria-expanded={fbdOpen} aria-controls="logo-fbd" className={PILL_BUTTON}>
            <Workflow className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{fbdOpen ? 'Hide' : 'Show'}</span>
          </button>
        }
      >
        <div id="logo-fbd" hidden={!fbdOpen}>
          {fbdOpen && (
            <FbdViewer
              program={program}
              ac={spec.supply.kind === 'AC'}
              running={controller.running}
              level={(ref) => controller.level(ref)}
              blockState={(id) => controller.blockState(id)}
            />
          )}
        </div>
      </StudioCard>
    </div>
  );
}
