import { Boxes, Redo2, Undo2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LOGO_0BA8 } from '../../domain/hardware';
import type { MemoryMap } from '../../domain/memory';
import { ICON_PILL_BUTTON, PANEL, WindowBar } from '../chrome';
import { SimulationProvider } from '../canvas/simulation';
import { compileFbd, evaluateLevels } from '../fbd/compile';
import { createDemoDiagram } from '../fbd/demo-diagram';
import { FbdCanvas } from '../fbd/FbdCanvas';
import { FbdInspector } from '../fbd/FbdInspector';
import { FbdPalette } from '../fbd/FbdPalette';
import type { FbdGraph } from '../fbd/model';
import { parseFbd, serializeFbd } from '../fbd/serialize';
import { useFbdEditor } from '../fbd/useFbdEditor';
import { useFrameVersion } from '../hardware/hooks';
import type { FrameStore } from '../hardware/frame-store';
import { LogoHardware } from '../hardware/LogoHardware';
import { IssueBanner, NoticeBanner } from './Banners';
import { downloadText } from './download';
import { ExecutiveToolbar } from './ExecutiveToolbar';
import { usePlcHost, type PlcHostOptions } from './usePlcHost';

export interface LogoWorkspaceProps {
  active: boolean;
  initialGraph?: FbdGraph;
  runtimeOptions?: PlcHostOptions['runtimeOptions'];
}

const profile = LOGO_0BA8;

/** Canvas wrapper that re-reads live signal levels at display rate while the controller runs. */
function LiveCanvas({ editor, memory, frame, running }: { editor: ReturnType<typeof useFbdEditor>; memory: MemoryMap; frame: FrameStore; running: boolean }) {
  useFrameVersion(frame);
  const levels = running
    ? evaluateLevels(editor.graph, (address) => {
        try {
          return memory.readBit(address);
        } catch {
          return false;
        }
      })
    : null;
  return <FbdCanvas editor={editor} levels={levels} locked={running} className="min-h-0 flex-1" />;
}

/**
 * Siemens LOGO! environment: function block diagram only. The diagram is the single source of
 * truth; it is lowered to the engine's ladder form on every edit, and preset changes made on the
 * LCD are written back into the diagram, so the two can never drift apart.
 */
export function LogoWorkspace({ active, initialGraph, runtimeOptions }: LogoWorkspaceProps) {
  const fbd = useFbdEditor(initialGraph ?? createDemoDiagram());
  const compiled = useMemo(() => compileFbd(fbd.graph, profile), [fbd.graph]);
  const [importError, setImportError] = useState<string | null>(null);

  const { timerBlocks } = compiled;
  const patchPreset = useCallback(
    (instance: string, value: number): boolean => {
      const blockId = timerBlocks.get(instance);
      if (blockId === undefined) return false;
      fbd.actions.patch(blockId, { preset: value });
      return true;
    },
    [timerBlocks, fbd.actions],
  );

  const host = usePlcHost(profile, compiled.networks, { runtimeOptions, presetSink: patchPreset });
  const { session, status, stop } = host;
  const { loadNetworks } = host.editor.actions;

  // The diagram drives the program: every edit re-lowers it into the host's editor state.
  const seeded = useRef(true);
  useEffect(() => {
    if (seeded.current) {
      seeded.current = false; // the host was created from these very networks
      return;
    }
    loadNetworks(compiled.networks);
  }, [compiled.networks, loadNetworks]);

  useEffect(() => {
    if (!active) stop();
  }, [active, stop]);

  const running = status.mode !== 'STOP';

  const exportDiagram = useCallback(() => downloadText('logo-program.fbd.json', serializeFbd(fbd.graph), 'application/json'), [fbd.graph]);
  const importFile = useCallback(
    async (file: File): Promise<void> => {
      const result = parseFbd(await file.text());
      if (!result.ok) {
        setImportError(`${file.name}: ${result.reason}`);
        return;
      }
      setImportError(null);
      fbd.actions.load(result.graph);
    },
    [fbd.actions],
  );

  const issues = compiled.diagnostics.map((d) => ({ severity: d.severity, message: d.message }));

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
        onExport={exportDiagram}
        exportTitle="Export function block diagram (.fbd.json)"
        onImport={(file) => void importFile(file)}
        importTitle="Import function block diagram (.fbd.json)"
        importAccept=".json,application/json"
      />

      <IssueBanner label="LOGO! diagram" issues={issues.filter((issue) => issue.severity === 'error')} />
      <NoticeBanner message={host.notice ?? importError ?? fbd.notice} onDismiss={() => (host.notice !== null ? host.dismissNotice() : importError !== null ? setImportError(null) : fbd.actions.dismissNotice())} />

      <div className="grid min-h-0 flex-1 gap-2.5 lg:grid-cols-[14rem_minmax(0,1fr)] xl:grid-cols-[14rem_minmax(0,1fr)_26rem]">
        <FbdPalette
          armed={fbd.armed}
          disabled={running}
          onActivate={(kind) => fbd.actions.arm(fbd.armed === kind ? null : kind)}
          onDragStart={(kind) => fbd.actions.arm(kind)}
          onDragEnd={() => fbd.actions.arm(null)}
          className="max-h-[70vh] lg:max-h-none"
        />

        <div className="flex min-h-0 min-w-0 flex-col gap-2.5">
          <div className={`${PANEL} shrink-0 !flex-row flex-wrap items-center gap-2 px-2 py-1.5`}>
            <span className="inline-flex h-7 items-center rounded-full bg-violet-500/10 px-3 text-[11px] font-semibold text-violet-700 dark:text-violet-300">
              Function Block Diagram (FBD)
            </span>
            <button type="button" onClick={fbd.actions.undo} disabled={!fbd.canUndo || running} aria-label="Undo" title="Undo (Ctrl+Z)" className={`${ICON_PILL_BUTTON} !h-7 !w-7`}>
              <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <button type="button" onClick={fbd.actions.redo} disabled={!fbd.canRedo || running} aria-label="Redo" title="Redo (Ctrl+Shift+Z)" className={`${ICON_PILL_BUTTON} !h-7 !w-7`}>
              <Redo2 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            {running && (
              <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">Simulation running: editing is locked</span>
            )}
          </div>

          <section className={`${PANEL} min-h-0 flex-1`}>
            <WindowBar icon={<Boxes className="h-3.5 w-3.5" />} title="diagram.fbd" trailing={`${fbd.graph.blocks.length} blocks · ${fbd.graph.links.length} wires`} />
            <div className="flex min-h-0 flex-1 flex-col">
              <LiveCanvas editor={fbd} memory={session.memory} frame={session.frame} running={running} />
            </div>
          </section>
        </div>

        <div className="flex min-h-0 min-w-0 flex-col gap-2.5 overflow-y-auto lg:col-span-2 xl:col-span-1">
          <SimulationProvider store={session.store}>
            <LogoHardware
              profile={profile}
              memory={session.memory}
              field={session.field}
              mode={status.mode}
              frame={session.frame}
              getSnapshot={host.lcd.getSnapshot}
              onEffect={host.lcd.perform}
              keyboard={active}
            />
          </SimulationProvider>
          <FbdInspector editor={fbd} profile={profile} diagnostics={issues} className="shrink-0" />
        </div>
      </div>
    </div>
  );
}
