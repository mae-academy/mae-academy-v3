import { BookOpen, ChevronDown } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { Network } from '../../domain/ast';
import { getProfile, listProfiles, S7_200_CPU224 } from '../../domain/hardware';
import { ilToLad, type SymbolMap } from '../../transpiler';
import { PlcEditorView } from '../canvas/PlcEditor';
import { S7200Hardware } from '../hardware/S7200Hardware';
import { SimulationProvider } from '../canvas/simulation';
import { IssueBanner, NoticeBanner } from './Banners';
import { ExecutiveToolbar } from './ExecutiveToolbar';
import { ExportDialog } from './ExportDialog';
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

/** STEP 7-Micro/WIN style environment: ladder / IL editing plus the S7-200 rack. Remounted per CPU. */
export function S7Workspace({ active, profileId, initialNetworks, symbols, runtimeOptions, onProfileChange, onNetworks }: S7WorkspaceProps) {
  const profile = getProfile(profileId) ?? S7_200_CPU224;
  const host = usePlcHost(profile, initialNetworks, { symbols, runtimeOptions });
  const [exporting, setExporting] = useState(false);
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
        setImportError(`${file.name}: ${result.diagnostics.find((d) => d.severity === 'error')?.message ?? 'not a valid STL program'}`);
        return;
      }
      setImportError(null);
      host.editor.actions.loadNetworks(result.value);
    },
    [profile, host.editor.actions],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2.5">
      <ExecutiveToolbar
        mode={status.mode}
        scanMs={host.scanMs}
        onScanMs={host.setScanMs}
        onRun={() => void host.run()}
        onPause={host.pause}
        onStop={host.stop}
        onStep={host.step}
        frame={session.frame}
        readMetrics={host.readMetrics}
        onExport={() => setExporting(true)}
        exportTitle="Export STEP 7-Micro/WIN program (.awl)"
        onImport={(file) => void importFile(file)}
        importTitle="Import STL program (.awl, .txt)"
        importAccept=".awl,.txt"
        leading={
          <div
            className="relative inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-slate-200/80 bg-slate-200/60 px-3 text-xs font-medium text-slate-700 transition hover:bg-slate-300/50 dark:border-[#1a1d24] dark:bg-[#13161c] dark:text-slate-300 dark:hover:bg-[#1a1d24]"
            title="Switch CPU"
          >
            <BookOpen aria-hidden="true" className="pointer-events-none h-3.5 w-3.5 shrink-0 text-violet-600 dark:text-violet-400" />
            <span className="pointer-events-none text-xs font-semibold text-slate-800 dark:text-slate-200">{profile.model}</span>
            <ChevronDown aria-hidden="true" className="pointer-events-none h-3 w-3 text-slate-400" />
            <select
              aria-label="Hardware profile"
              value={profile.id}
              onChange={(event) => onProfileChange(event.target.value)}
              className="absolute inset-0 h-full w-full cursor-pointer text-xs opacity-0"
            >
              {CPU_PROFILES.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.model}
                </option>
              ))}
            </select>
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
