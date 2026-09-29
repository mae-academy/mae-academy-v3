import { BookOpen, ChevronDown, Factory } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { SegmentedControl, StudioCard } from '@/components/common/templates';
import {
  loadKeyBindings,
  normalizeKey,
  saveKeyBindings,
  toggleNav,
  type LogoKeyBindings,
} from '../../logo/keybindings';
import { MEMORY_LIMITS } from '../../logo/engine/memory';
import type { DeviceClass } from '../../logo/hardware/devices';
import { parseProgram, serializeProgram } from '../../logo/persist';
import { isScenarioId, SCENARIO_GROUPS, SCENARIO_LIST, SCENARIOS, type ScenarioId } from '../../logo/scenarios';
import { FbdViewer } from '../../logo/ui/FbdViewer';
import { LogoManual } from '../../logo/ui/LogoManual';
import { LogoBench } from '../../logo/ui/LogoBench';
import { useLogoBench } from '../../logo/ui/useLogoBench';
import { NavTriangles } from '../TriangleGlyph';
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
export function LogoWorkspace({ active, initialScenario = 'seal-in-gates', initialDevice, runtimeOptions }: LogoWorkspaceProps) {
  const { t } = useTranslation('simulators');
  const { controller } = useLogoBench({
    scenario: initialScenario,
    device: initialDevice,
    scheduler: runtimeOptions?.scheduler,
    clock: runtimeOptions?.clock,
  });
  const [importError, setImportError] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [keybindings, setKeybindings] = useState<LogoKeyBindings>(() => loadKeyBindings());
  const [recordingTarget, setRecordingTarget] = useState<'ok' | 'esc' | null>(null);

  const updateKeybindings = useCallback((next: LogoKeyBindings): void => {
    setKeybindings(next);
    saveKeyBindings(next);
  }, []);

  const toggleNavScheme = (): void => {
    updateKeybindings(toggleNav(keybindings));
  };

  useEffect(() => {
    if (!recordingTarget) return;

    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const normalized = normalizeKey(e.key);
      if (!normalized) return;

      updateKeybindings({
        ...keybindings,
        [recordingTarget]: normalized,
      });
      setRecordingTarget(null);
    };

    window.addEventListener('keydown', onKeyDown, { capture: true, once: true });
    return () => {
      window.removeEventListener('keydown', onKeyDown, { capture: true });
    };
  }, [recordingTarget, keybindings, updateKeybindings]);

  // A hidden tab must not keep scanning behind the user's back.
  useEffect(() => {
    if (!active) controller.stop();
  }, [active, controller]);

  const scenario = SCENARIOS[controller.scenario];
  const spec = controller.device;
  const program = controller.program;

  const exportProgram = useCallback(() => {
    downloadText(`${(program.name || 'logo').toLowerCase()}.logo`, serializeProgram(program), 'application/octet-stream');
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
        exportTitle={t('plc.exportLogoTooltip', 'Export circuit program (.logo)')}
        onImport={(file) => void importFile(file)}
        importTitle={t('plc.importLogoTooltip', 'Load circuit program into LOGO! (.logo, .lsc, .json)')}
        importAccept=".logo,.lsc,.json,application/json,application/octet-stream,text/plain"
        leading={
          <div className="flex shrink-0 items-center gap-1.5">
            <SegmentedControl<DeviceClass>
              aria-label={t('plc.supplyVoltageClassAria', 'Supply voltage class')}
              size="sm"
              value={spec.id}
              options={DEVICE_OPTIONS.map((option) => ({ ...option }))}
              onChange={(device) => controller.setDevice(device)}
              className="border-slate-200/80 bg-slate-200/60 dark:border-[#1a1d24] dark:bg-[#13161c]"
            />
            <div
              className="relative inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-slate-200/80 bg-slate-200/60 px-3 font-['Poppins',sans-serif] text-xs font-medium text-slate-700 transition hover:bg-slate-300/50 dark:border-[#1a1d24] dark:bg-[#13161c] dark:text-slate-300 dark:hover:bg-[#1a1d24]"
              title={t('plc.activeExampleTooltip', 'Active: {{example}} (Click to switch example)', { example: scenario.title })}
            >
              <BookOpen className="pointer-events-none h-3.5 w-3.5 shrink-0 text-violet-600 dark:text-violet-400" aria-hidden="true" />
              <span className="pointer-events-none font-['Poppins',sans-serif] text-xs font-semibold text-slate-800 dark:text-slate-200">{t('toolbar.examples', 'Examples')}</span>
              <ChevronDown className="pointer-events-none h-3 w-3 text-slate-400" aria-hidden="true" />
              <select
                aria-label={t('plc.applicationScenarioAria', 'Application scenario')}
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
                      <option key={entry.id} value={entry.id} className="bg-white font-['Poppins',sans-serif] text-slate-800 dark:bg-[#13161c] dark:text-slate-200">
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
              aria-label={t('plc.beginnersManualAria', "Beginner's manual")}
              title={t('plc.beginnersManualTooltip', 'LOGO! beginner\'s manual')}
              className={`h-9 inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 font-['Poppins',sans-serif] text-xs font-medium transition active:scale-[.98] ${
                manualOpen
                  ? 'border border-violet-600 bg-violet-50 text-violet-700 dark:border-violet-500 dark:bg-violet-950/40 dark:text-violet-300'
                  : 'border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-[#13161c]'
              }`}
            >
              <BookOpen className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" aria-hidden="true" />
              <span>{t('plc.manual', 'Manual')}</span>
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
        <LogoBench controller={controller} active={active} keybindings={keybindings} />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 px-1 font-['Poppins',sans-serif]">
          <div
            role="note"
            aria-label={t('plc.keyboardShortcutsAria', 'Keyboard shortcuts')}
            className="flex flex-wrap items-center gap-1.5 font-['Poppins',sans-serif] text-xs font-medium text-slate-500 dark:text-slate-400"
          >
            {/* Navigation Scheme Pill: Clicking toggles between Arrows and WASD */}
            <button
              type="button"
              onClick={toggleNavScheme}
              aria-label={keybindings.nav === 'arrows' ? t('plc.navToggleToWasdAria', 'WASD keys navigation') : t('plc.navToggleToArrowsAria', 'Arrow keys navigation')}
              title={t('plc.navToggleTooltip', 'Click to toggle navigation keys (Arrow keys ⇄ WASD)')}
              className="inline-flex items-center gap-1 rounded-full border border-slate-200/80 bg-slate-100/90 px-2.5 py-1 font-['Poppins',sans-serif] text-xs font-semibold text-slate-700 shadow-2xs transition hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-300 dark:hover:border-violet-600 dark:hover:bg-violet-950/40 dark:hover:text-violet-300"
            >
              <span>
                [{keybindings.nav === 'arrows' ? (
                  <span className="inline-flex items-center gap-1">
                    <NavTriangles className="h-2.5 w-2.5" includeSpace />
                    <span>{t('plc.navLabel', 'Nav')}</span>
                  </span>
                ) : (
                  t('plc.wasdNavLabel', 'WASD Nav')
                )}]
              </span>
            </button>

            {/* Confirm (OK) Action Pill: Interactive key recording */}
            <button
              type="button"
              onClick={() => setRecordingTarget((curr) => (curr === 'ok' ? null : 'ok'))}
              aria-label={recordingTarget === 'ok' ? t('plc.listeningOkAria', 'Listening for OK key press') : t('plc.recordOkAria', 'Record OK key binding')}
              title={recordingTarget === 'ok' ? t('plc.pressAnyKeyToBindOk', 'Press any key to bind to OK...') : t('plc.recordOkTooltip', 'Click to record OK key')}
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-['Poppins',sans-serif] text-xs font-semibold transition ${
                recordingTarget === 'ok'
                  ? 'animate-pulse border border-violet-500 bg-violet-50 text-violet-700 ring-2 ring-violet-500/20 dark:border-violet-400 dark:bg-violet-950/60 dark:text-violet-300'
                  : 'border border-slate-200/80 bg-slate-100/90 text-slate-700 shadow-2xs hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-300 dark:hover:border-violet-600 dark:hover:bg-violet-950/40 dark:hover:text-violet-300'
              }`}
            >
              <span>{recordingTarget === 'ok' ? t('plc.pressAnyKey', '[ Press any key... ]') : t('plc.okKeyLabel', '[ {{key}}: OK ]', { key: normalizeKey(keybindings.ok) })}</span>
            </button>

            {/* Back (ESC) Action Pill: Interactive key recording */}
            <button
              type="button"
              onClick={() => setRecordingTarget((curr) => (curr === 'esc' ? null : 'esc'))}
              aria-label={recordingTarget === 'esc' ? t('plc.listeningBackAria', 'Listening for Back key press') : t('plc.recordBackAria', 'Record Back key binding')}
              title={recordingTarget === 'esc' ? t('plc.pressAnyKeyToBindBack', 'Press any key to bind to Back...') : t('plc.recordBackTooltip', 'Click to record Back key')}
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-['Poppins',sans-serif] text-xs font-semibold transition ${
                recordingTarget === 'esc'
                  ? 'animate-pulse border border-violet-500 bg-violet-50 text-violet-700 ring-2 ring-violet-500/20 dark:border-violet-400 dark:bg-violet-950/60 dark:text-violet-300'
                  : 'border border-slate-200/80 bg-slate-100/90 text-slate-700 shadow-2xs hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-300 dark:hover:border-violet-600 dark:hover:bg-violet-950/40 dark:hover:text-violet-300'
              }`}
            >
              <span>{recordingTarget === 'esc' ? t('plc.pressAnyKey', '[ Press any key... ]') : t('plc.backKeyLabel', '[ {{key}}: Back ]', { key: normalizeKey(keybindings.esc) })}</span>
            </button>

            {/* Numeric hotkeys info pill */}
            <span
              className="inline-flex items-center gap-1 rounded-full border border-slate-200/60 bg-slate-50 px-2.5 py-1 font-['Poppins',sans-serif] text-xs font-medium text-slate-500 dark:border-slate-800/60 dark:bg-slate-900/40 dark:text-slate-400"
              title={t('plc.globalHotkeysTooltip', 'Global hotkeys: press 1-8 to actuate inputs I1-I8')}
            >
              {t('plc.hotkeysInputsLabel', '[1-8: Inputs]')}
            </span>
          </div>
        </div>
      </StudioCard>

      <StudioCard
        title={t('plc.functionBlockDiagramTitle', 'Function block diagram')}
        subtitle={
          controller.running
            ? t('plc.fbdLiveSubtitle', 'Live: wires carrying a 1 are highlighted; timers and counters show their accumulator.')
            : t('plc.fbdIdleSubtitle', 'Start the program from the LCD to see live signal flow.')
        }
      >
        <div id="logo-fbd">
          <FbdViewer
            program={program}
            ac={spec.supply.kind === 'AC'}
            running={controller.running}
            level={(ref) => controller.level(ref)}
            blockState={(id) => controller.blockState(id)}
          />
        </div>
      </StudioCard>
    </div>
  );
}
