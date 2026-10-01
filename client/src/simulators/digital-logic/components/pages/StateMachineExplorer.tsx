/** Advanced FSM Explorer — native SVG editor plus pure FSM/K-Map derivation workspace. */
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { ArrowRight, Plus, RotateCcw, Trash2, ZoomIn, ZoomOut } from 'lucide-react';
import { KatexMath } from '@/components/ui/KatexMath';
import { SegmentedControl, StatusBadge, StudioButton, StudioCard, type SegmentedOption } from '@/components/common/templates';
import {
  createDefaultFSM,
  type ExcitationRow,
  type FSMDefinition,
  type FSMEncoding,
  type FSMEquation,
  type FSMKind,
  type FSMState,
  type FSMTransition,
  type FlipFlopKind,
  type StateAssignment,
  type StateTableRow,
} from '@shared/logic/fsmTypes';
import { analyzeFsmRemote } from '@/services/logicClient';
import { useLogicQuery } from '@/simulators/digital-logic/remote/useLogicQuery';

const NODE_RADIUS = 31;
const latexSignal = (signal: string) => signal.replace(/([A-Z])(\d+)/, '$1_{$2}');
const transitionMath = (machine: FSMDefinition, transition: FSMTransition) =>
  machine.kind === 'Mealy'
    ? `${machine.inputName}=${transition.input}\\;/\\;${transition.output ?? '0'}`
    : `${machine.inputName}=${transition.input}`;

/** Uses the first vacant state name rather than array length to prevent key collision. */
export const nextAvailableStateId = (states: readonly Pick<FSMState, 'id'>[]) => {
  const occupied = new Set(states.map(state => state.id));
  let index = 0;
  while (occupied.has(`S${index}`)) index += 1;
  return `S${index}`;
};

const nextAvailableTransitionId = (transitions: readonly Pick<FSMTransition, 'id'>[]) => {
  const occupied = new Set(transitions.map(transition => transition.id));
  let index = 0;
  while (occupied.has(`t${index}`)) index += 1;
  return `t${index}`;
};

function StateDiagram({
  machine,
  selectedStateId,
  onMoveState,
  onSelectState,
}: {
  machine: FSMDefinition;
  selectedStateId: string | null;
  onMoveState: (stateId: string, x: number, y: number) => void;
  onSelectState: (stateId: string) => void;
}) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [panning, setPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const svgRef = useRef<SVGSVGElement | null>(null);

  const stateById = useMemo(() => new Map(machine.states.map(state => [state.id, state])), [machine.states]);

  const transitionPath = (transition: FSMTransition) => {
    const from = stateById.get(transition.from);
    const to = stateById.get(transition.to);
    if (!from || !to) return null;

    // Self-loops: disperse anchors by loop index to eliminate overlaps
    if (from.id === to.id) {
      const selfLoops = machine.transitions.filter(t => t.from === from.id && t.to === from.id);
      const selfIndex = selfLoops.findIndex(t => t.id === transition.id);
      if (selfIndex === 0) {
        return {
          d: `M ${from.x - 16} ${from.y - 25} C ${from.x - 46} ${from.y - 82}, ${from.x + 46} ${from.y - 82}, ${from.x + 16} ${from.y - 25}`,
          labelX: from.x,
          labelY: from.y - 68,
        };
      }
      if (selfIndex === 1) {
        return {
          d: `M ${from.x - 16} ${from.y + 25} C ${from.x - 46} ${from.y + 82}, ${from.x + 46} ${from.y + 82}, ${from.x + 16} ${from.y + 25}`,
          labelX: from.x,
          labelY: from.y + 68,
        };
      }
      if (selfIndex === 2) {
        return {
          d: `M ${from.x - 25} ${from.y - 16} C ${from.x - 82} ${from.y - 46}, ${from.x - 82} ${from.y + 46}, ${from.x - 25} ${from.y + 16}`,
          labelX: from.x - 70,
          labelY: from.y,
        };
      }
      return {
        d: `M ${from.x + 25} ${from.y - 16} C ${from.x + 82} ${from.y - 46}, ${from.x + 82} ${from.y + 46}, ${from.x + 25} ${from.y + 16}`,
        labelX: from.x + 70,
        labelY: from.y,
      };
    }

    const sameDirection = machine.transitions.filter(t => t.from === from.id && t.to === to.id);
    const sameIndex = sameDirection.findIndex(t => t.id === transition.id);
    const hasReverse = machine.transitions.some(t => t.from === to.id && t.to === from.id);

    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const distance = Math.hypot(dx, dy) || 1;
    const ux = dx / distance;
    const uy = dy / distance;
    // Normal vector perpendicular to the travel direction
    const nx = -uy;
    const ny = ux;

    if (sameDirection.length === 1 && !hasReverse) {
      const startX = from.x + ux * NODE_RADIUS;
      const startY = from.y + uy * NODE_RADIUS;
      const endX = to.x - ux * NODE_RADIUS;
      const endY = to.y - uy * NODE_RADIUS;
      return {
        d: `M ${startX} ${startY} L ${endX} ${endY}`,
        labelX: (startX + endX) / 2 + nx * 16,
        labelY: (startY + endY) / 2 + ny * 16,
      };
    }

    // Curved edge: offset depends on whether there are multiple parallel transitions
    const curvature = 36 + sameIndex * 42;
    const controlX = (from.x + to.x) / 2 + nx * curvature;
    const controlY = (from.y + to.y) / 2 + ny * curvature;

    const cStartDx = controlX - from.x;
    const cStartDy = controlY - from.y;
    const cStartDist = Math.hypot(cStartDx, cStartDy) || 1;
    const startX = from.x + (cStartDx / cStartDist) * NODE_RADIUS;
    const startY = from.y + (cStartDy / cStartDist) * NODE_RADIUS;

    const cEndDx = controlX - to.x;
    const cEndDy = controlY - to.y;
    const cEndDist = Math.hypot(cEndDx, cEndDy) || 1;
    const endX = to.x + (cEndDx / cEndDist) * NODE_RADIUS;
    const endY = to.y + (cEndDy / cEndDist) * NODE_RADIUS;

    const midX = 0.25 * startX + 0.5 * controlX + 0.25 * endX;
    const midY = 0.25 * startY + 0.5 * controlY + 0.25 * endY;

    return {
      d: `M ${startX} ${startY} Q ${controlX} ${controlY} ${endX} ${endY}`,
      labelX: midX + nx * (16 + sameIndex * 8),
      labelY: midY + ny * (16 + sameIndex * 8),
    };
  };

  const onBackgroundPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if ((event.target as HTMLElement).tagName === 'circle' || (event.target as HTMLElement).tagName === 'text') {
      return;
    }
    setPanning(true);
    panStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      panX: pan.x,
      panY: pan.y,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (panning) {
      const dx = event.clientX - panStartRef.current.x;
      const dy = event.clientY - panStartRef.current.y;
      setPan({
        x: panStartRef.current.panX + dx,
        y: panStartRef.current.panY + dy,
      });
      return;
    }
    if (!dragging || !svgRef.current) return;
    const bounds = svgRef.current.getBoundingClientRect();
    const scaleX = 680 / bounds.width;
    const scaleY = 370 / bounds.height;
    const svgX = (event.clientX - bounds.left) * scaleX;
    const svgY = (event.clientY - bounds.top) * scaleY;
    const localX = (svgX - pan.x) / zoom;
    const localY = (svgY - pan.y) / zoom;
    onMoveState(
      dragging,
      Math.round(Math.max(NODE_RADIUS + 5, Math.min(675 - NODE_RADIUS, localX))),
      Math.round(Math.max(NODE_RADIUS + 5, Math.min(360 - NODE_RADIUS, localY))),
    );
  };

  const onPointerUp = () => {
    setPanning(false);
    setDragging(null);
  };

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const zoomIn = () => setZoom(prev => Math.min(2.5, Number((prev + 0.15).toFixed(2))));
  const zoomOut = () => setZoom(prev => Math.max(0.5, Number((prev - 0.15).toFixed(2))));

  return (
    <div className="relative">
      {/* Floating HUD Viewport Controls */}
      <div className="absolute top-3 right-3 z-10 flex items-center gap-1 rounded-lg border border-slate-200/80 bg-white/90 p-1 shadow-xs backdrop-blur-xs dark:border-slate-800 dark:bg-slate-900/90">
        <button
          type="button"
          onClick={zoomOut}
          className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
          title="Zoom Out"
          aria-label="Zoom Out"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={resetView}
          className="px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          title="Reset View"
          aria-label="Reset View"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          type="button"
          onClick={zoomIn}
          className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
          title="Zoom In"
          aria-label="Zoom In"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={resetView}
          className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
          title="Reset Pan and Zoom"
          aria-label="Reset Pan and Zoom"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>

      <svg
        ref={svgRef}
        role="img"
        aria-label="Interactive FSM state diagram"
        viewBox="0 0 680 370"
        onPointerDown={onBackgroundPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        className="block w-full min-h-[350px] overflow-hidden rounded-xl border border-slate-200/80 bg-white dark:border-slate-800/80 dark:bg-slate-950 touch-none select-none"
        style={{ cursor: panning ? 'grabbing' : 'default' }}
      >
        <defs>
          <marker id="fsm-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
            <path d="M 0,0 L 8,4 L 0,8 Z" className="fill-slate-500 dark:fill-slate-400" />
          </marker>
          <pattern
            id="fsm-grid"
            width={20 * zoom}
            height={20 * zoom}
            patternUnits="userSpaceOnUse"
            patternTransform={`translate(${pan.x % (20 * zoom)}, ${pan.y % (20 * zoom)})`}
          >
            <circle cx="1" cy="1" r=".8" className="fill-slate-300 dark:fill-slate-700" opacity=".58" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#fsm-grid)" />

        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
          {(() => {
            // Relax label anchors so condition badges never overlap each other.
            const LABEL_W = 62;
            const LABEL_H = 22;
            const anchors = machine.transitions.map(transition => transitionPath(transition));
            const pts = anchors.map(a => (a ? { x: a.labelX, y: a.labelY } : { x: 0, y: 0 }));
            for (let iter = 0; iter < 24; iter++) {
              for (let i = 0; i < pts.length; i++) {
                for (let j = i + 1; j < pts.length; j++) {
                  if (!anchors[i] || !anchors[j]) continue;
                  const ox = LABEL_W - Math.abs(pts[i].x - pts[j].x);
                  const oy = LABEL_H - Math.abs(pts[i].y - pts[j].y);
                  if (ox <= 0 || oy <= 0) continue;
                  if (oy <= ox) {
                    const dir = pts[i].y <= pts[j].y ? -1 : 1;
                    pts[i].y += (dir * oy) / 2;
                    pts[j].y -= (dir * oy) / 2;
                  } else {
                    const dir = pts[i].x <= pts[j].x ? -1 : 1;
                    pts[i].x += (dir * ox) / 2;
                    pts[j].x -= (dir * ox) / 2;
                  }
                }
              }
            }
            return machine.transitions.map((transition, idx) => {
            const base = anchors[idx];
            const path = base && { ...base, labelX: pts[idx].x, labelY: pts[idx].y };
            return (
              path && (
                <g key={transition.id}>
                  <path d={path.d} fill="none" className="stroke-slate-500 dark:stroke-slate-400" strokeWidth="1.6" markerEnd="url(#fsm-arrow)" />
                  <foreignObject
                    x={path.labelX - 45}
                    y={path.labelY - 14}
                    width="90"
                    height="28"
                    className="overflow-visible pointer-events-none"
                  >
                    <div className="flex h-full w-full items-center justify-center">
                      <span className="inline-flex items-center rounded border border-slate-200/90 bg-white/95 px-1.5 py-0.5 text-[9px] shadow-2xs backdrop-blur-xs dark:border-slate-700/90 dark:bg-slate-900/95 text-slate-800 dark:text-slate-200 select-none">
                        <KatexMath math={transitionMath(machine, transition)} />
                      </span>
                    </div>
                  </foreignObject>
                </g>
              )
            );
            });
          })()}
          {machine.states.map(state => {
            const selected = state.id === selectedStateId;
            return (
              <g
                key={state.id}
                transform={`translate(${state.x} ${state.y})`}
                onPointerDown={event => {
                  event.stopPropagation();
                  event.currentTarget.setPointerCapture?.(event.pointerId);
                  onSelectState(state.id);
                  setDragging(state.id);
                }}
                style={{ cursor: 'grab' }}
              >
                {selected && <circle r={NODE_RADIUS + 7} className="fill-blue-200/60 dark:fill-blue-900/50" />}
                <circle
                  r={NODE_RADIUS}
                  className={`${
                    selected
                      ? 'fill-white stroke-violet-600 dark:fill-slate-900 dark:stroke-violet-400'
                      : 'fill-white stroke-slate-700 dark:fill-slate-800 dark:stroke-slate-400'
                  }`}
                  strokeWidth={selected ? '2.5' : '1.8'}
                />
                <circle r={NODE_RADIUS - 5} fill="none" className={selected ? 'stroke-blue-300 dark:stroke-blue-700' : 'stroke-slate-200 dark:stroke-slate-700'} strokeWidth="1" />
                <text y="-2" textAnchor="middle" className="fill-slate-900 text-xs font-bold dark:fill-white font-serif italic">
                  <tspan>{state.name[0]}</tspan>
                  <tspan dy="3" fontSize="8">{state.name.slice(1)}</tspan>
                </text>
                {machine.kind === 'Moore' && (
                  <foreignObject x={-24} y={5} width={48} height={18} style={{ overflow: 'visible', pointerEvents: 'none' }}>
                    <div className="flex h-full items-center justify-center text-[11px] text-violet-600 dark:text-violet-400" style={{ direction: 'ltr' }}>
                      <KatexMath math={`${machine.outputName}=${state.output}`} />
                    </div>
                  </foreignObject>
                )}
              </g>
            );
          })}
        </g>
      </svg>
      <div className="absolute bottom-2.5 left-3 text-[10px] text-slate-400 dark:text-slate-500 font-sans pointer-events-none select-none">
        Drag nodes to reposition · Drag canvas to pan · Scroll to zoom
      </div>
    </div>
  );
}

function CompactTable({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section aria-label={label} className="overflow-auto rounded-xl border border-slate-200/80 dark:border-slate-800/80">
      {children}
    </section>
  );
}

const MODEL_OPTIONS: SegmentedOption<FSMKind>[] = [
  { value: 'Moore', label: 'Moore' },
  { value: 'Mealy', label: 'Mealy' },
];

const FF_OPTIONS: SegmentedOption<FlipFlopKind>[] = [
  { value: 'D', label: 'D' },
  { value: 'T', label: 'T' },
  { value: 'JK', label: 'JK' },
  { value: 'SR', label: 'SR' },
];

const ENCODING_OPTIONS: SegmentedOption<FSMEncoding>[] = [
  { value: 'Binary', label: 'Binary' },
  { value: 'Gray', label: 'Gray' },
  { value: 'One-Hot', label: 'One-Hot' },
];

/** Functional EDA workspace: click a state, edit context, observe derived results update. */
export function StateMachineExplorer() {
  const [machine, setMachine] = useState<FSMDefinition>(createDefaultFSM);
  const [encoding, setEncoding] = useState<FSMEncoding>('Binary');
  const [flipFlop, setFlipFlop] = useState<FlipFlopKind>('D');
  const [selectedStateId, setSelectedStateId] = useState<string | null>('S0');
  const [transitionInput, setTransitionInput] = useState<'0' | '1'>('0');
  const [transitionOutput, setTransitionOutput] = useState<'0' | '1'>('0');
  const [transitionTargetId, setTransitionTargetId] = useState<string>('S0');

  useEffect(() => {
    if (!machine.states.some(state => state.id === selectedStateId)) {
      setSelectedStateId(machine.states[0]?.id ?? null);
    }
  }, [machine.states, selectedStateId]);

  // State encoding, state/excitation tables and minimized equations come from the serverless engine. State
  // positions are layout only: they stay out of the request key, so dragging a state never re-queries.
  const analysisKey = JSON.stringify([{ ...machine, states: machine.states.map(({ x: _x, y: _y, ...rest }) => rest) }, encoding, flipFlop]);
  const analysis = useLogicQuery(analysisKey, signal => analyzeFsmRemote(machine, encoding, flipFlop, false, signal), { debounceMs: 120 }).data;
  const assignments: StateAssignment[] = analysis?.assignments ?? [];
  const stateTable: StateTableRow[] = analysis?.stateTable ?? [];
  const excitationTable: ExcitationRow[] = analysis?.excitationTable ?? [];
  const equations: FSMEquation[] = analysis?.equations ?? [];

  const selectedState = machine.states.find(state => state.id === selectedStateId);
  const stateWidth = Math.max(1, assignments[0]?.code.length ?? 1);

  const updateMachine = (patch: Partial<FSMDefinition>) => setMachine(current => ({ ...current, ...patch }));
  const addState = () => {
    const nextId = nextAvailableStateId(machine.states);
    const angle = (machine.states.length / 5) * Math.PI * 2;
    const nextStateObj: FSMState = {
      id: nextId,
      name: nextId,
      output: '0',
      x: Math.round(340 + Math.cos(angle) * 160),
      y: Math.round(185 + Math.sin(angle) * 110),
    };
    setMachine(current => ({ ...current, states: [...current.states, nextStateObj] }));
    setSelectedStateId(nextId);
  };
  const deleteSelectedState = () => {
    if (!selectedState || machine.states.length <= 1) return;
    const remaining = machine.states.filter(state => state.id !== selectedState.id);
    setMachine(current => ({
      ...current,
      states: remaining,
      transitions: current.transitions.filter(t => t.from !== selectedState.id && t.to !== selectedState.id),
    }));
    setSelectedStateId(remaining[0]?.id ?? null);
    setTransitionTargetId(remaining[0]?.id ?? '');
  };
  const updateSelectedState = (patch: Partial<FSMState>) =>
    selectedState &&
    setMachine(current => ({
      ...current,
      states: current.states.map(state => (state.id === selectedState.id ? { ...state, ...patch } : state)),
    }));
  const addTransitionFromSelected = () => {
    if (!selectedState || !transitionTargetId) return;
    setMachine(current => ({
      ...current,
      transitions: [
        ...current.transitions.filter(t => !(t.from === selectedState.id && t.input === transitionInput)),
        {
          id: nextAvailableTransitionId(current.transitions),
          from: selectedState.id,
          to: transitionTargetId,
          input: transitionInput,
          output: transitionOutput,
        },
      ],
    }));
  };
  const moveState = (stateId: string, x: number, y: number) =>
    setMachine(current => ({
      ...current,
      states: current.states.map(state => (state.id === stateId ? { ...state, x, y } : state)),
    }));

  const stateHeaders = [
    { id: 'present-state', math: '\\text{PS}' },
    { id: 'present-code', math: '\\text{Code}' },
    { id: 'input', math: machine.inputName },
    { id: 'next-state', math: '\\text{NS}' },
    { id: 'next-code', math: '\\text{Code}' },
    { id: 'output', math: machine.outputName },
  ];

  const selectClass = "w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200";

  return (
    <section
      aria-label="Advanced FSM Explorer"
      className="grid grid-cols-1 items-start gap-5 text-slate-900 dark:text-white lg:grid-cols-[220px_minmax(0,1fr)]"
    >
      <div className="flex flex-col gap-4">
        <StudioCard title="EDA Controls">
          <StudioButton
            onClick={addState}
            className="btn-active-brand w-full justify-center flex items-center gap-1.5 rounded-full border-transparent text-white hover:text-white"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add State</span>
          </StudioButton>

          {selectedState ? (
            <div className="mt-4 border-t border-slate-200 pt-3 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <StatusBadge variant="default">Selected: {selectedState.name}</StatusBadge>
                <KatexMath math={latexSignal(selectedState.name)} className="text-xs font-semibold text-blue-600 dark:text-blue-400" />
              </div>
              <StudioButton
                onClick={deleteSelectedState}
                disabled={machine.states.length <= 1}
                className="w-full justify-center flex items-center gap-1.5 text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30 border-rose-200 dark:border-rose-900/50 disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete State</span>
              </StudioButton>

              {machine.kind === 'Moore' && (
                <div>
                  <label className="mb-1 block text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">
                    State Output (<KatexMath math={machine.outputName} />)
                  </label>
                  <SegmentedControl<'0' | '1'>
                    value={selectedState.output === '1' ? '1' : '0'}
                    onChange={val => updateSelectedState({ output: val })}
                    options={[
                      { value: '0', label: '0' },
                      { value: '1', label: '1' },
                    ]}
                    size="sm"
                  />
                </div>
              )}

              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">
                  Transition Target
                </label>
                <select
                  value={transitionTargetId}
                  onChange={e => setTransitionTargetId(e.target.value)}
                  className={selectClass}
                >
                  {machine.states.map(state => (
                    <option key={state.id} value={state.id}>{state.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-[9px] font-bold uppercase text-slate-500 dark:text-slate-400">
                    Input (<KatexMath math={machine.inputName} />)
                  </label>
                  <SegmentedControl<'0' | '1'>
                    value={transitionInput}
                    onChange={setTransitionInput}
                    options={[
                      { value: '0', label: '0' },
                      { value: '1', label: '1' },
                    ]}
                    size="sm"
                  />
                </div>
                {machine.kind === 'Mealy' && (
                  <div>
                    <label className="mb-1 block text-[9px] font-bold uppercase text-slate-500 dark:text-slate-400">
                      Output (<KatexMath math={machine.outputName} />)
                    </label>
                    <SegmentedControl<'0' | '1'>
                      value={transitionOutput}
                      onChange={setTransitionOutput}
                      options={[
                        { value: '0', label: '0' },
                        { value: '1', label: '1' },
                      ]}
                      size="sm"
                    />
                  </div>
                )}
              </div>

              <StudioButton
                onClick={addTransitionFromSelected}
                className="w-full justify-center flex items-center gap-1.5"
              >
                <ArrowRight className="w-3.5 h-3.5" />
                <span>Add Transition To…</span>
              </StudioButton>
            </div>
          ) : (
            <div className="mt-3 text-xs text-slate-400">Select a state to configure.</div>
          )}

          <div className="mt-4 border-t border-slate-200 pt-3 dark:border-slate-800 space-y-3">
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">
                Machine Model
              </label>
              <SegmentedControl<FSMKind>
                options={MODEL_OPTIONS}
                value={machine.kind}
                onChange={kind => updateMachine({ kind })}
                size="sm"
              />
            </div>

            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">
                Flip-Flop Type
              </label>
              <SegmentedControl<FlipFlopKind>
                options={FF_OPTIONS}
                value={flipFlop}
                onChange={setFlipFlop}
                size="sm"
              />
            </div>

            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">
                Encoding
              </label>
              <SegmentedControl<FSMEncoding>
                options={ENCODING_OPTIONS}
                value={encoding}
                onChange={setEncoding}
                size="sm"
              />
            </div>

            <div className="border-t border-slate-200 pt-3 text-[11px] leading-relaxed text-slate-500 dark:border-slate-800 dark:text-slate-400">
              State assignment uses <strong>{stateWidth}</strong> flip-flop{stateWidth === 1 ? '' : 's'}. Unassigned codes route as don’t-cares into minimization.
            </div>
          </div>
        </StudioCard>
      </div>

      <div className="flex min-w-0 flex-col gap-5">
        <StudioCard
          title="Interactive State Diagram"
          actionSlot={
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {machine.kind} · {encoding} · {flipFlop}-FF
            </span>
          }
        >
          <StateDiagram
            machine={machine}
            selectedStateId={selectedStateId}
            onMoveState={moveState}
            onSelectState={setSelectedStateId}
          />
        </StudioCard>

        <div className="flex flex-col gap-4">
          <StudioCard title="State table">
            <CompactTable label="FSM state table">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-950/50 text-slate-700 dark:text-slate-300">
                    {stateHeaders.map(header => (
                      <th key={header.id} className="p-2 text-center font-normal">
                        <KatexMath math={header.math} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {stateTable.map((row) => (
                    <tr
                      key={`${row.presentCode}-${row.input}`}
                      className={
                        row.unused
                          ? 'text-rose-500 font-mono bg-rose-50/50 dark:bg-rose-950/20 dark:text-rose-400'
                          : 'text-slate-800 dark:text-slate-200'
                      }
                    >
                      <td className="p-2 text-center font-semibold">
                        {row.unused ? (
                          <span className="font-mono text-[11px] text-rose-500 dark:text-rose-400">Unused</span>
                        ) : (
                          <KatexMath math={latexSignal(row.presentState)} />
                        )}
                      </td>
                      <td className="p-2 text-center font-mono text-slate-500 dark:text-slate-400">{row.presentCode}</td>
                      <td className="p-2 text-center"><KatexMath math={row.input} /></td>
                      <td className="p-2 text-center font-semibold">
                        {row.unused ? (
                          <KatexMath math="X" />
                        ) : (
                          <KatexMath math={latexSignal(row.nextState)} />
                        )}
                      </td>
                      <td className="p-2 text-center font-mono text-slate-500 dark:text-slate-400">{row.nextCode}</td>
                      <td className="p-2 text-center">
                        <KatexMath math={row.output === 'X' ? 'X' : row.output} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CompactTable>
          </StudioCard>

          <StudioCard title={`${flipFlop} excitation matrix`}>
            <CompactTable label="FSM excitation table">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-950/50 text-slate-700 dark:text-slate-300">
                    {['\\text{PS}', machine.inputName, ...Object.keys(excitationTable[0]?.signals ?? {}).map(latexSignal)].map((headerMath, index) => (
                      <th key={`excitation-${index}`} className="p-2 text-center font-normal">
                        <KatexMath math={headerMath} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {excitationTable.map((row) => (
                    <tr
                      key={`${row.presentCode}-${row.input}`}
                      className={
                        row.unused
                          ? 'text-rose-500 font-mono bg-rose-50/50 dark:bg-rose-950/20 dark:text-rose-400'
                          : 'text-slate-800 dark:text-slate-200'
                      }
                    >
                      <td className="p-2 text-center font-mono text-slate-500 dark:text-slate-400">{row.presentCode}</td>
                      <td className="p-2 text-center"><KatexMath math={row.input} /></td>
                      {Object.values(row.signals).map((value, signalIndex) => (
                        <td key={signalIndex} className="p-2 text-center">
                          <KatexMath math={value === 'X' ? 'X' : value} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </CompactTable>
          </StudioCard>
        </div>

        <StudioCard title="Minimized equations">
          <div className="mb-2 text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
            Excitation equations minimized through the K-Map solver.
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {equations.length ? (
              equations.map(equation => (
                <div
                  key={equation.signal}
                  className="overflow-x-auto rounded-lg border border-slate-200 bg-white p-2.5 text-xs font-semibold text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                >
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    <KatexMath math={latexSignal(equation.signal)} />
                  </div>
                  <KatexMath math={equation.latex} displayMode />
                </div>
              ))
            ) : analysis ? (
              <div className="col-span-full rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
                Selected encoding exceeds 5-variable K-Map limit.
              </div>
            ) : null}
          </div>
        </StudioCard>
      </div>
    </section>
  );
}
