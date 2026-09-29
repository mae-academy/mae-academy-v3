import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { Network } from '../../domain/ast';
import { getProfile, listProfiles, S7_200_CPU224, S7_200_CPU226, S7_200_CPU226_EXP } from '../../domain/hardware';
import { ilToLad, type SymbolMap } from '../../transpiler';
import { createEmptyNetwork } from '../canvas/network-edit';
import { PlcEditorView } from '../canvas/PlcEditor';
import { S7200Hardware } from '../hardware/S7200Hardware';
import { SimulationProvider } from '../canvas/simulation';
import { IssueBanner, NoticeBanner } from './Banners';
import { ExecutiveToolbar } from './ExecutiveToolbar';
import { ExportDialog } from './ExportDialog';
import { PlcExamplesDropdown } from './PlcExamplesDropdown';
import type { PlcExample } from './plcExamples';
import { usePlcHost, type PlcHostOptions } from './usePlcHost';

export interface S7WorkspaceProps {
  active: boolean;
  profileId: string;
  initialNetworks: readonly Network[];
  symbols?: SymbolMap;
  runtimeOptions?: PlcHostOptions['runtimeOptions'];
  onProfileChange: (id: string) => void;
  /** Reports the edited program upward so a CPU switch can carry it over. */
  onNetworks: (networks: readonly Network[]) => void;
}

const CPU_PROFILES = listProfiles().filter((profile) => profile.family === 'S7-200');

const CPU_OPTIONS = [
  { label: 'CPU 224', value: S7_200_CPU224.id },
  { label: 'CPU 226', value: S7_200_CPU226.id },
  { label: 'CPU 226 + Exp.', value: S7_200_CPU226_EXP.id },
] as const;

/** STEP 7-Micro/WIN style environment: ladder / IL editing plus the S7-200 rack. Remounted per CPU. */
export function S7Workspace({ active, profileId, initialNetworks, symbols, runtimeOptions, onProfileChange, onNetworks }: S7WorkspaceProps) {
  const { t } = useTranslation('simulators');
  const profile = getProfile(profileId) ?? S7_200_CPU224;
  const host = usePlcHost(profile, initialNetworks, { symbols, runtimeOptions });
  const [exporting, setExporting] = useState(false);
  const [currentExampleId, setCurrentExampleId] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const { session, status, stop } = host;

  useEffect(() => onNetworks(host.editor.networks), [host.editor.networks, onNetworks]);
  // A hidden tab must not keep scanning behind the user's back.
  useEffect(() => {
    if (!active) stop();
  }, [active, stop]);

  const importFile = useCallback(
    async (file: File): Promise<void> => {
      const result = ilToLad(await file.text(), profile);
      if (!result.ok || result.value === null) {
        const msg = `${file.name}: ${result.diagnostics.find((d) => d.severity === 'error')?.message ?? 'not a valid STL program'}`;
        setImportError(msg);
        toast.error('Import failed');
        return;
      }
      setImportError(null);
      host.editor.actions.loadNetworks(result.value);
      setCurrentExampleId(null);
      toast.success(`Imported ${file.name}`);
    },
    [profile, host.editor.actions],
  );

  const handleSelectExample = useCallback((example: PlcExample) => {
    const result = ilToLad(example.stl, profile);
    if (result.ok && result.value) {
      host.editor.actions.loadNetworks(result.value);
      setCurrentExampleId(example.id);
      toast.success(`Loaded "${example.title}"`);
    } else {
      toast.error('Failed to parse example program');
    }
  }, [profile, host.editor.actions]);

  const handleCopy = useCallback(() => {
    const code = host.exportMicroWin().content;
    void navigator.clipboard.writeText(code);
    toast.success('Copied program to clipboard');
  }, [host]);

  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) return;
      const result = ilToLad(text, profile);
      if (!result.ok || result.value === null) {
        toast.error('Clipboard content is not valid STL/MicroWIN');
        return;
      }
      host.editor.actions.loadNetworks(result.value);
      setCurrentExampleId(null);
      toast.success('Pasted program from clipboard');
    } catch {
      toast.error('Clipboard permission required to paste');
    }
  }, [profile, host.editor.actions]);

  const handleDelete = useCallback(() => {
    host.editor.actions.loadNetworks([createEmptyNetwork('network-1')]);
    setCurrentExampleId(null);
    toast.info('Cleared ladder program');
  }, [host.editor.actions]);

  const handleReset = useCallback(() => {
    host.reset();
    toast.info('PLC state reset');
  }, [host]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2.5">
      <ExecutiveToolbar
        mode={status.mode}
        scanMs={host.scanMs}
        onScanMs={host.setScanMs}
        onRun={() => void host.run()}
        onPause={host.pause}
        onStop={host.stop}
        onReset={handleReset}
        onUndo={host.editor.actions.undo}
        canUndo={host.editor.canUndo}
        onRedo={host.editor.actions.redo}
        canRedo={host.editor.canRedo}
        onCopy={handleCopy}
        onPaste={handlePaste}
        onDelete={handleDelete}
        frame={session.frame}
        readMetrics={host.readMetrics}
        onExport={() => setExporting(true)}
        exportTitle={t('plc.exportMicrowinTooltip', 'Export STEP 7-Micro/WIN program (.awl)')}
        onImport={(file) => void importFile(file)}
        importTitle={t('plc.importStlTooltip', 'Import STL program (.awl, .txt)')}
        importAccept=".awl,.txt"
        leading={
          <div className="flex items-center gap-1.5 shrink-0">
            <div
              role="tablist"
              aria-label={t('plc.cpuSelectionAria', 'CPU Selection')}
              className="inline-flex items-center p-1 rounded-full bg-slate-100/80 dark:bg-slate-800/50 backdrop-blur-sm border border-slate-200/60 dark:border-slate-700/50"
            >
              {CPU_OPTIONS.map((opt) => {
                const isActive = opt.value === profile.id;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => onProfileChange(opt.value)}
                    className={`cursor-pointer select-none whitespace-nowrap ${isActive
                        ? 'rounded-full btn-active-brand brand-active-pill px-4 py-1 text-xs'
                        : 'rounded-full px-4 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-all'
                      }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            <select
              aria-label={t('plc.hardwareProfileAria', 'Hardware profile')}
              value={profile.id}
              onChange={(event) => onProfileChange(event.target.value)}
              className="sr-only"
              tabIndex={-1}
            >
              {CPU_PROFILES.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.model}
                </option>
              ))}
            </select>

            <PlcExamplesDropdown
              currentExampleId={currentExampleId}
              onSelectExample={handleSelectExample}
            />
          </div>
        }
      />

      <IssueBanner label={profile.model} issues={host.issues} />
      <NoticeBanner message={host.notice ?? importError} onDismiss={() => (host.notice !== null ? host.dismissNotice() : setImportError(null))} />

      <PlcEditorView
        editor={host.editor}
        profile={profile}
        symbols={symbols}
        simulation={host.simulation}
        memory={session.memory}
        className="min-h-0 flex-1"
        rightPanel={
          <SimulationProvider store={session.store}>
            <S7200Hardware
              profile={profile}
              memory={session.memory}
              field={session.field}
              mode={status.mode}
              fault={status.fault}
              switchPosition={host.switchPosition}
              onSwitch={host.setSwitchPosition}
            />
          </SimulationProvider>
        }
      />

      <ExportDialog open={exporting} onOpenChange={setExporting} build={host.exportMicroWin} />
    </div>
  );
}
