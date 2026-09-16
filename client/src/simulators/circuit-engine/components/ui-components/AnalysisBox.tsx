/* MAE Luminous Technical Atelier: Tab D Academic Analysis renders solver-backed derivations only.
   This view selects an engine trace; all circuit mathematics remains inside the dedicated solvers. */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { MNAElement } from '@/simulators/circuit-engine/engine/mnaSolver';
import { NodalSolver } from '@/simulators/circuit-engine/engine/NodalSolver';
import { MeshSolver } from '@/simulators/circuit-engine/engine/MeshSolver';
import { SuperpositionSolver } from '@/simulators/circuit-engine/engine/SuperpositionSolver';
import { SourceTransformationSolver } from '@/simulators/circuit-engine/engine/SourceTransformationSolver';
import { TheveninSolver } from '@/simulators/circuit-engine/engine/TheveninSolver';
import type { AnalysisMethod, AnalysisTrace, NodalNodeLabel } from '@/simulators/circuit-engine/models/analysisTypes';
import { compactMathNumbers, buildIdToLabelMap, sanitizeMathUuids } from '@/simulators/circuit-engine/models/analysisFormatting';
import type { MeshGeometry } from '@/simulators/circuit-engine/components/meshGeometry';
import { V3BlockMath, V3Math } from '@/components/ui/V3Math';
import { MESH_LOOP_COLORS } from '@/simulators/circuit-engine/components/analogCanvasGeometry';
import { AcademicNodalDictionary } from '@/simulators/circuit-engine/models/AcademicNodalDictionary';
import type { CircuitComponent } from '@/simulators/circuit-engine/models/circuitTypes';
import { TargetLoadSelector, DecimalPlacesSelector } from '@/simulators/circuit-engine/components/ui-components/TargetLoadSelector';
import { isACCircuit } from '@/simulators/circuit-engine/models/isACCircuit';

const METHODS: Array<{ id: AnalysisMethod; label: string }> = [
  { id: 'nodal', label: 'Nodal' },
  { id: 'mesh', label: 'Mesh' },
  { id: 'superposition', label: 'Superposition' },
  { id: 'thevenin', label: 'Thévenin' },
];

type AnalysisColors = { panel: string; panelAlt: string; line: string; text: string; muted: string; primary: string; danger: string };

export function AnalysisBox({
  elements,
  geometry,
  nodalNodes = [],
  colors,
  standalone = false,
  onTraceChange,
  components = [],
}: {
  elements: MNAElement[];
  geometry?: MeshGeometry;
  nodalNodes?: NodalNodeLabel[];
  colors: AnalysisColors;
  standalone?: boolean;
  onTraceChange?: (trace: AnalysisTrace) => void;
  components?: CircuitComponent[];
}) {
  const [method, setMethod] = useState<AnalysisMethod>('nodal');
  const [targetResistor, setTargetResistor] = useState('');
  const [targetSource, setTargetSource] = useState('');
  const [precision, setPrecision] = useState(4);
  const [activeStepIndex, setActiveStepIndex] = useState<number>(0);

  const hasAC = useMemo(() => isACCircuit(components), [components]);

  // Dynamically merge live component labels to ensure instant synchronization when renamed on canvas
  const liveElements = useMemo(() => {
    if (!components || components.length === 0) return elements;
    const labelMap = new Map<string, string>();
    for (const c of components) {
      if (c.label) labelMap.set(c.id, c.label);
    }
    return elements.map((el) => {
      const userLabel = labelMap.get(el.id);
      return userLabel ? { ...el, label: userLabel } : el;
    });
  }, [elements, components]);

  const resistors = liveElements.filter((element): element is Extract<MNAElement, { type: 'resistor' }> => element.type === 'resistor');
  const voltageSources = liveElements.filter((element): element is Extract<MNAElement, { type: 'voltage' }> => element.type === 'voltage');
  const independentSources = liveElements.filter((element): element is Extract<MNAElement, { type: 'voltage' | 'current' }> => element.type === 'voltage' || element.type === 'current');

  // Reset active step when method changes
  useEffect(() => {
    setActiveStepIndex(0);
  }, [method]);

  const rawTrace = useMemo<AnalysisTrace>(() => {
    if (hasAC) {
      return {
        method,
        status: 'unsupported',
        heading: 'Academic Analysis',
        steps: [],
        warning: undefined,
      };
    }
    if (!liveElements.length) return { method, status: 'unsupported', heading: 'Academic Analysis', steps: [], warning: 'Build a grounded DC circuit to generate a derivation.' };
    if (method === 'nodal') return new NodalSolver(liveElements, nodalNodes).analyze();
    if (method === 'mesh') return new MeshSolver(liveElements, geometry).analyze();
    if (method === 'superposition') return new SuperpositionSolver(liveElements).analyze(targetResistor);
    if (method === 'transform') return new SourceTransformationSolver(liveElements).analyze(targetSource, targetResistor);
    return new TheveninSolver(liveElements).analyze(targetResistor);
  }, [hasAC, liveElements, geometry, method, nodalNodes, targetResistor, targetSource]);

  // ID-to-Label mapping for intercepting UUIDs in derivations and dropdowns, strictly synchronized with latest component labels
  const idToLabelMap = useMemo(() => buildIdToLabelMap(liveElements, nodalNodes, components), [liveElements, nodalNodes, components]);

  // Enriched trace carrying targetId and activeSourceId for dynamic canvas reactivity
  const trace = useMemo<AnalysisTrace>(() => {
    const effectiveTargetId = targetResistor || resistors[0]?.id;
    const activeSource = independentSources[activeStepIndex] ?? independentSources[0];
    return {
      ...rawTrace,
      targetId: effectiveTargetId,
      activeSourceId: method === 'superposition' ? activeSource?.id : undefined,
      activeStepIndex: method === 'superposition' ? activeStepIndex : undefined,
    };
  }, [rawTrace, targetResistor, resistors, independentSources, activeStepIndex, method]);

  const onTraceChangeRef = useRef(onTraceChange);
  useEffect(() => {
    onTraceChangeRef.current = onTraceChange;
  });

  const prevTraceKeyRef = useRef<string>('');
  useEffect(() => {
    const key = `${trace.method}:${trace.status}:${trace.heading}:${trace.warning || ''}:${trace.targetId || ''}:${trace.activeSourceId || ''}:${trace.steps.length}:${trace.steps.map(s => `${s.title}=${s.math}`).join('|')}`;
    if (prevTraceKeyRef.current === key) return;
    prevTraceKeyRef.current = key;
    onTraceChangeRef.current?.(trace);
  }, [trace]);

  const displayMath = (math: string) => compactMathNumbers(sanitizeMathUuids(math, idToLabelMap), precision);
  const sanitizeText = (text?: string) => (text ? sanitizeMathUuids(text, idToLabelMap) : undefined);

  const meshStepStyle = (title: string) => {
    if (method !== 'mesh') return undefined;
    const match = title.match(/(?:Loop|Mesh)\s*(\d+)/i);
    if (!match) return undefined;
    return { borderLeft: `3px solid ${MESH_LOOP_COLORS[(parseInt(match[1], 10) - 1) % MESH_LOOP_COLORS.length]}` };
  };

  const dict = useMemo(() => new AcademicNodalDictionary(liveElements), [liveElements]);
  const activeTransformSource = voltageSources.find((s) => s.id === targetSource) || voltageSources[0];
  const transformSourceMath = activeTransformSource
    ? `${dict.element(activeTransformSource)} \\cdot ${activeTransformSource.voltage}\\,\\mathrm{V}`
    : '\\text{Automatic (First)}';

  return (
    <section
      className="rounded-xl border border-slate-200/80 bg-slate-50/70 dark:border-[#1a1d24] dark:bg-[#090a0d]"
      style={{ padding: standalone ? '18px 20px 22px' : '12px 15px', borderTop: standalone ? 'none' : `1px solid ${colors.line}` }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div>
          <div className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-white">
            {hasAC ? 'AC Analysis (Phasors)' : trace.heading}
          </div>
          {!hasAC && trace.status === 'ready' && (
            <div style={{ marginTop: 3, color: colors.muted, fontSize: 10 }}>
              Solver-backed derivation
            </div>
          )}
        </div>
        {!hasAC && <DecimalPlacesSelector precision={precision} onChangePrecision={setPrecision} />}
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {METHODS.map((item) => {
          const sel = method === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={sel}
              onClick={() => setMethod(item.id)}
              className={`inline-flex min-h-[36px] items-center justify-center rounded-lg px-4 py-2 text-xs font-medium transition-colors ${
                sel
                  ? 'bg-brand-gradient text-white shadow-sm'
                  : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-[#282d38] dark:bg-[#13161c] dark:text-slate-400 dark:hover:bg-[#1a1d24]'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {hasAC ? (
        <div
          data-testid="ac-analysis-coming-soon"
          className="my-3 flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-8 text-center dark:border-slate-800 dark:bg-[#0d0f12]/60"
        >
          <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
            AC Analysis (Phasors) — Coming Soon
          </h3>
          <p className="mt-2 max-w-md text-center text-sm text-slate-500 dark:text-slate-400">
            The simulator engine is successfully running your AC circuit in the background. However, step-by-step academic derivations using complex numbers (Phasors) for Nodal, Mesh, Superposition, and Thévenin are locked for a future update.
          </p>
        </div>
      ) : (
        <>
          {(method === 'superposition' || method === 'transform' || method === 'thevenin') && (
            <div className="mb-3">
              <TargetLoadSelector
                elements={liveElements}
                resistors={resistors}
                targetResistor={targetResistor}
                onSelectTarget={setTargetResistor}
              />

              {method === 'transform' && (
                <div className="flex flex-col gap-1.5 font-sans mt-2">
                  <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    <span>SOURCE / RESISTOR PAIR</span>
                  </div>
                  <div className="relative">
                    <div className="flex min-h-[38px] items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-sans text-slate-700 shadow-sm dark:border-[#282d38] dark:bg-[#13161c] dark:text-slate-200">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400 font-sans text-xs">Source:</span>
                        <span className="font-sans font-medium text-slate-800 dark:text-slate-100">
                          <V3Math math={transformSourceMath} />
                        </span>
                      </div>
                      <svg className="h-4 w-4 text-slate-400 shrink-0 ml-2" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <select
                      value={targetSource}
                      onChange={(event) => setTargetSource(event.target.value)}
                      className="absolute inset-0 h-full w-full cursor-pointer opacity-0 font-sans text-slate-700 dark:text-slate-200"
                      aria-label="Target source"
                    >
                      <option value="">Automatic first voltage source</option>
                      {voltageSources.map((item) => {
                        const cleanLabel = dict.element(item).replace(/[\\{}]/g, '').replace(/_/g, '');
                        return (
                          <option key={item.id} value={item.id}>
                            {cleanLabel} ({item.voltage} V)
                          </option>
                        );
                      })}
                    </select>
                  </div>
                </div>
              )}
            </div>
          )}

          {trace.warning && (
            <div
              role="status"
              style={{
                color: trace.status === 'error' ? colors.danger : colors.muted,
                fontSize: 10,
                lineHeight: 1.45,
                marginBottom: 8,
              }}
            >
              {trace.warning}
            </div>
          )}

          <div className="flex flex-col">
        {trace.steps.map((step, index) => {
          const isSelectedSuperpositionStep = method === 'superposition' && activeStepIndex === index;
          return (
            <article
              key={`${step.title}-${index}`}
              onClick={() => {
                if (method === 'superposition') setActiveStepIndex(index);
              }}
              className={`mb-4 rounded-xl border p-5 shadow-sm transition-all ${
                isSelectedSuperpositionStep
                  ? 'border-blue-500/80 bg-blue-50/20 ring-2 ring-blue-500/20 dark:border-blue-500/70 dark:bg-blue-950/20'
                  : 'border-slate-200/80 bg-white dark:border-[#1a1d24] dark:bg-[#0d0f12]'
              } ${method === 'superposition' ? 'cursor-pointer hover:border-slate-300 dark:hover:border-slate-700' : ''}`}
              style={meshStepStyle(step.title)}
            >
              <div className="mb-3 flex items-baseline gap-3">
                <span className="text-[10px] font-bold uppercase tracking-[.14em] text-slate-400 dark:text-slate-500">
                  Step {index + 1}
                </span>
                <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {(() => {
                    const rawClean = sanitizeText(step.title.replace(/^\s*\d+[.):]?\s*/, '')) || '';
                    const subcircuitMatch = rawClean.match(/^(?:Sub-circuit\s*\d+:\s*)?(.+?)\s+active$/i);
                    if (subcircuitMatch) {
                      const prefixMatch = rawClean.match(/^(Sub-circuit\s*\d+:\s*)/i);
                      const prefix = prefixMatch ? prefixMatch[1] : '';
                      const sourceMath = subcircuitMatch[1].trim();
                      return (
                        <span>
                          {prefix}
                          <V3Math math={`${sourceMath} \\text{ active}`} />
                        </span>
                      );
                    }
                    return rawClean;
                  })()}
                </h4>
                {isSelectedSuperpositionStep && (
                  <span className="ml-auto inline-flex items-center rounded bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                    Live on Canvas
                  </span>
                )}
              </div>
              <div
                className="custom-scrollbar w-full overflow-x-auto"
                style={{ maxWidth: '100%', color: colors.text, fontSize: 12, paddingBlock: 2 }}
              >
                <div className="min-w-max pr-2">
                  {method === 'nodal' || method === 'mesh' ? (
                    <V3BlockMath math={displayMath(step.math)} />
                  ) : (
                    <V3Math math={displayMath(step.math)} />
                  )}
                </div>
              </div>
              {step.prose && (
                <div className="mt-3 text-slate-500 dark:text-slate-400" style={{ fontSize: 11, lineHeight: 1.6 }}>
                  {sanitizeText(step.prose)}
                </div>
              )}
            </article>
          );
        })}
          </div>
        </>
      )}
    </section>
  );
}
