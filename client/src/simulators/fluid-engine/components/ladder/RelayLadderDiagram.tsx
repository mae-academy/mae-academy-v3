import React from 'react';
import { BUS_REACH, JUNCTION_RADIUS, SENSOR_HALF_WIDTH, TERMINAL_REACH, layoutLadder, type PlacedColumn, type PlacedGroup } from '../../models/ladderLayout';
import { crossReferences, tagKey, type LadderCircuit, type LadderElement, type LadderResult } from '../../models/relayLadder';
import { useFluidT, type FluidTranslate } from '../../i18n/fluidText';
import { LadderGlyph, TexLabel, offInk, tagMath, type LadderTheme } from './LadderGlyphs';

export type LadderSelection = { kind: 'element'; id: string } | { kind: 'path'; id: string } | null;

/** A place on the diagram where an armed part can be dropped. */
export type LadderSite =
  | { type: 'series'; pathId: string }
  | { type: 'parallel'; pathId: string; group: number }
  | { type: 'load'; pathId: string };

export interface RelayLadderDiagramProps {
  circuit: LadderCircuit;
  result: LadderResult;
  /** The circuit is running: energised conductors, closed contacts and active coils are highlighted. */
  simulating: boolean;
  theme: LadderTheme;
  selection: LadderSelection;
  onSelect: (selection: LadderSelection) => void;
  /** What the armed palette part is: decides which sites are offered. */
  armed: 'condition' | 'load' | null;
  onSite: (site: LadderSite) => void;
  onAddPath: () => void;
  /** Operated pushbuttons and forced sensors, by tag. */
  pressed: Record<string, boolean>;
  forced: Record<string, boolean>;
  /** A pushbutton was pressed or released (mouse, touch or keyboard). */
  onOperate: (element: LadderElement, down: boolean) => void;
}

const kindName = (tr: FluidTranslate, element: LadderElement): string => {
  const form = element.form === 'NC' ? 'NC' : 'NO';
  switch (element.kind) {
    case 'sensor': return tr('ladder.palette.sensor');
    case 'pushbutton': return tr(`ladder.palette.pushbutton${form}`);
    case 'relayContact': return tr(`ladder.palette.relayContact${form}`);
    case 'timerContact': return tr(`ladder.palette.timerContact${form}`);
    case 'relayCoil': return tr('ladder.palette.relayCoil');
    case 'solenoid': return tr('ladder.palette.solenoid');
    case 'timerCoil': return tr(element.mode === 'off' ? 'ladder.palette.timerOff' : 'ladder.palette.timerOn');
    default: return element.kind;
  }
};

/** Most path numbers shown on one side of a cross-reference fraction before it is abbreviated. */
const MAX_REFERENCED = 4;

/** A conductor bent through rounded corners, e.g. the cap that joins parallel branches. */
function PathConductor({ d, on, theme }: { d: string; on: boolean; theme: LadderTheme }) {
  return (
    <path
      className={on ? 'ladder-conductor ladder-conductor-live' : 'ladder-conductor'}
      d={d}
      fill="none"
      stroke={on ? theme.live : offInk(theme)}
      strokeWidth={on ? 2.5 : 1.5}
      strokeLinejoin="round"
    />
  );
}

function Conductor({ x1, y1, x2, y2, on, theme }: { x1: number; y1: number; x2: number; y2: number; on: boolean; theme: LadderTheme }) {
  if (x1 === x2 && y1 === y2) return null;
  return (
    <line
      className={on ? 'ladder-conductor ladder-conductor-live' : 'ladder-conductor'}
      x1={x1} y1={y1} x2={x2} y2={y2}
      stroke={on ? theme.live : offInk(theme)}
      strokeWidth={on ? 2.5 : 1.5}
    />
  );
}

function Site({ x, y, label, testId, theme, onActivate }: { x: number; y: number; label: string; testId: string; theme: LadderTheme; onActivate: () => void }) {
  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={label}
      data-testid={testId}
      style={{ cursor: 'copy' }}
      onClick={event => { event.stopPropagation(); onActivate(); }}
      onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onActivate(); } }}
    >
      <title>{label}</title>
      <circle cx={x} cy={y} r={11} fill={theme.surface} stroke={theme.selection} strokeWidth={1.6} strokeDasharray="3 2.5" />
      <path d={`M${x - 4.5},${y} H${x + 4.5} M${x},${y - 4.5} V${y + 4.5}`} stroke={theme.selection} strokeWidth={1.8} strokeLinecap="round" />
    </g>
  );
}

export function RelayLadderDiagram({ circuit, result, simulating, theme, selection, onSelect, armed, onSite, onAddPath, pressed, forced, onOperate }: RelayLadderDiagramProps) {
  const tr = useFluidT();
  const layout = layoutLadder(circuit);
  const references = crossReferences(circuit);
  const lit = (value: boolean | undefined) => simulating && Boolean(value);

  const renderElement = (element: LadderElement, x: number, y: number, lane = false) => {
    const status = result.elements[element.id];
    const isLoad = element.kind === 'relayCoil' || element.kind === 'solenoid' || element.kind === 'timerCoil';
    const operated = element.kind === 'pushbutton' && Boolean(pressed[tagKey(element.tag)]);
    const isForced = element.kind === 'sensor' && Boolean(forced[tagKey(element.tag)]);
    const selected = selection?.kind === 'element' && selection.id === element.id;
    const state = { simulating, closed: Boolean(status?.closed), live: Boolean(status?.live), operated, forced: isForced, lane };
    const interactive = element.kind === 'pushbutton';
    const name = `${element.tag} ${kindName(tr, element)}`;
    const textRight = isLoad ? (element.kind === 'solenoid' ? 31 : 27) : 16;
    const timerNote = element.kind === 'timerCoil' ? `${element.delay ?? 0} s ${tr(element.mode === 'off' ? 'ladder.offDelay' : 'ladder.onDelay')}` : '';
    return (
      <g
        key={element.id}
        className="ladder-element"
        data-testid={`ladder-element-${element.tag}`}
        data-kind={element.kind}
        data-form={element.form ?? ''}
        data-closed={lit(status?.closed) ? 'true' : 'false'}
        data-operated={operated ? 'true' : 'false'}
        transform={`translate(${x} ${y})`}
        role="button"
        tabIndex={0}
        aria-label={name}
        aria-pressed={interactive ? operated : undefined}
        style={{ cursor: interactive ? 'pointer' : 'default', outline: 'none' }}
        onMouseDown={event => {
          event.stopPropagation();
          onSelect({ kind: 'element', id: element.id });
          if (interactive) onOperate(element, true);
        }}
        onClick={event => { event.stopPropagation(); onSelect({ kind: 'element', id: element.id }); }}
        onKeyDown={event => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          onSelect({ kind: 'element', id: element.id });
          if (interactive && !event.repeat) onOperate(element, true);
        }}
        onKeyUp={event => { if (interactive && (event.key === 'Enter' || event.key === ' ')) onOperate(element, false); }}
      >
        <title>{name}</title>
        <rect x={-30} y={-28} width={element.kind === 'sensor' ? 72 : 60} height={56} fill="transparent" />
        {selected && <rect className="ladder-selection" x={-31} y={-27} width={element.kind === 'sensor' ? 72 : 62} height={54} rx={5} fill="none" stroke={theme.selection} strokeWidth={1.5} strokeDasharray="4 3" />}
        <LadderGlyph element={element} state={state} theme={theme} />
        {!isLoad && (
          <TexLabel className="ladder-tag" x={element.kind === 'sensor' ? -24 : textRight} y={element.kind === 'sensor' ? 0 : -4} anchor={element.kind === 'sensor' ? 'end' : 'start'} math={tagMath(element.tag)} color={theme.ink} />
        )}
        {element.caption && (
          <text className="ladder-caption" x={element.kind === 'sensor' ? -24 : textRight} y={isLoad ? 4 : element.kind === 'sensor' ? 14 : 11} textAnchor={element.kind === 'sensor' ? 'end' : 'start'} fontSize={9} fill={theme.ink} fillOpacity={0.7}>{element.caption}</text>
        )}
        {timerNote && <text className="ladder-timer-note" x={textRight} y={-4} fontSize={9} fill={theme.ink} fillOpacity={0.75}>{timerNote}</text>}
      </g>
    );
  };

  const renderGroup = (column: PlacedColumn, group: PlacedGroup, path: LadderCircuit['paths'][number], cursor: { y: number; on: boolean }) => {
    const status = result.paths[path.id];
    const multi = group.elements.length > 1;
    const topY = group.y - (multi ? BUS_REACH : TERMINAL_REACH);
    const bottomY = group.y + (multi ? BUS_REACH : TERMINAL_REACH);
    const live = lit(status?.groupLive[group.index]);
    const through = live && Boolean(status?.groupClosed[group.index]);
    const parts: React.ReactNode[] = [
      <Conductor key={`g${group.index}-in`} x1={column.spine} y1={cursor.y} x2={column.spine} y2={topY} on={cursor.on} theme={theme} />,
    ];
    if (multi) {
      // Square 90° routing: a cap over and one under the group run right from the trunk; each branch drops straight between them.
      const r = JUNCTION_RADIUS;
      const { busLeft: left, busRight: right } = group;
      parts.push(
        <PathConductor key={`g${group.index}-bus-top`} d={`M${left},${topY} H${right}`} on={live} theme={theme} />,
        <PathConductor key={`g${group.index}-bus-bottom`} d={`M${left},${bottomY} H${right}`} on={through} theme={theme} />,
      );
      group.elements.forEach((placed, index) => {
        const element = result.elements[placed.element.id];
        const outer = index === 0 || index === group.elements.length - 1;
        parts.push(
          <Conductor key={`g${group.index}-up-${placed.element.id}`} x1={placed.x} y1={outer ? topY + r : topY} x2={placed.x} y2={group.y - TERMINAL_REACH} on={live} theme={theme} />,
          <Conductor key={`g${group.index}-down-${placed.element.id}`} x1={placed.x} y1={group.y + TERMINAL_REACH} x2={placed.x} y2={outer ? bottomY - r : bottomY} on={live && Boolean(element?.closed)} theme={theme} />,
        );
        // Inner branches tap the cap with a junction dot.
        if (!outer) parts.push(
          <circle key={`g${group.index}-tap-top-${placed.element.id}`} cx={placed.x} cy={topY} r={2.4} fill={live ? theme.live : theme.ink} />,
          <circle key={`g${group.index}-tap-bottom-${placed.element.id}`} cx={placed.x} cy={bottomY} r={2.4} fill={through ? theme.live : theme.ink} />,
        );
      });
      parts.push(
        <circle key={`g${group.index}-join-top`} cx={column.spine} cy={topY} r={2.6} fill={cursor.on ? theme.live : theme.ink} />,
        <circle key={`g${group.index}-join-bottom`} cx={column.spine} cy={bottomY} r={2.6} fill={through ? theme.live : theme.ink} />,
      );
    }
    return { nodes: parts, next: { y: bottomY, on: through } };
  };

  const renderColumn = (column: PlacedColumn) => {
    const path = circuit.paths.find(entry => entry.id === column.pathId)!;
    const status = result.paths[path.id];
    const cursor = { y: layout.topRailY, on: simulating };
    const nodes: React.ReactNode[] = [];
    const pathSelected = selection?.kind === 'path' && selection.id === path.id;
    const lane = column.lane;
    if (lane) {
      // 3-wire sensor: terminal 1 straight up to +24 V, terminal 3 straight down to 0 V, signal out right then down the spine.
      const heading = column.groups[0];
      const sensorLive = lit(status?.groupClosed[0]);
      nodes.push(
        <Conductor key="sensor-t1" x1={lane.trunkX} y1={layout.topRailY} x2={lane.trunkX} y2={heading.y - SENSOR_HALF_WIDTH} on={simulating} theme={theme} />,
        <Conductor key="sensor-t3" x1={lane.trunkX} y1={heading.y + SENSOR_HALF_WIDTH} x2={lane.trunkX} y2={layout.bottomRailY} on={simulating} theme={theme} />,
        <Conductor key="sensor-out" x1={lane.sensorX + SENSOR_HALF_WIDTH} y1={lane.signalY} x2={column.spine} y2={lane.signalY} on={sensorLive} theme={theme} />,
        <circle key="sensor-t1-dot" cx={lane.trunkX} cy={layout.topRailY} r={3.2} fill={lit(true) ? theme.live : theme.ink} />,
        <circle key="sensor-t3-dot" cx={lane.trunkX} cy={layout.bottomRailY} r={3.2} fill={lit(true) ? theme.live : theme.ink} />,
      );
      cursor.y = lane.signalY;
      cursor.on = sensorLive;
    }
    for (const group of lane ? column.groups.slice(1) : column.groups) {
      const drawn = renderGroup(column, group, path, cursor);
      nodes.push(...drawn.nodes);
      cursor.y = drawn.next.y;
      cursor.on = drawn.next.on;
    }
    const energised = lit(status?.energised);
    const loadTop = layout.loadY - TERMINAL_REACH;
    nodes.push(<Conductor key="to-load" x1={column.spine} y1={cursor.y} x2={column.spine} y2={loadTop} on={cursor.on} theme={theme} />);
    if (column.load) {
      nodes.push(<Conductor key="to-rail" x1={column.spine} y1={layout.loadY + TERMINAL_REACH} x2={column.spine} y2={layout.bottomRailY} on={energised} theme={theme} />);
    } else {
      nodes.push(
        <rect key="load-placeholder" x={column.spine - 22} y={layout.loadY - 14} width={44} height={28} rx={2} fill="none" stroke={theme.faint} strokeDasharray="4 3" />,
        <Conductor key="to-rail" x1={column.spine} y1={layout.loadY + 14} x2={column.spine} y2={layout.bottomRailY} on={false} theme={theme} />,
      );
    }
    const number = (
      <g
        key="number"
        role="button"
        tabIndex={0}
        aria-label={tr('ladder.path', { n: column.number })}
        aria-pressed={pathSelected}
        data-testid={`ladder-path-${column.number}`}
        style={{ cursor: 'pointer', outline: 'none' }}
        onClick={event => { event.stopPropagation(); onSelect({ kind: 'path', id: path.id }); }}
        onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect({ kind: 'path', id: path.id }); } }}
      >
        <rect x={column.spine - 15} y={layout.topRailY - 31} width={30} height={22} rx={5} fill={pathSelected ? theme.selection : 'none'} fillOpacity={0.14} stroke={pathSelected ? theme.selection : 'none'} />
        <TexLabel className="ladder-path-number" x={column.spine} y={layout.topRailY - 20} size={13} math={String(column.number)} color={theme.ink} />
      </g>
    );
    const reference = references.find(entry => entry.pathNumber === column.number);
    /** The coil's contacts of one form in a path currently pass current: that number lights up in the cross-reference. */
    const contactMade = (pathNumber: number, form: 'NO' | 'NC'): boolean => {
      const coil = column.load?.element;
      const contactKind = coil?.kind === 'timerCoil' ? 'timerContact' : 'relayContact';
      return simulating && (circuit.paths[pathNumber - 1]?.conditions.flat() ?? []).some(element => (
        element.kind === contactKind && tagKey(element.tag) === tagKey(coil?.tag ?? '') && (element.form ?? 'NO') === form && Boolean(result.elements[element.id]?.closed)
      ));
    };
    const fractionMath = (numbers: number[], form: 'NO' | 'NC') => (numbers.length === 0 ? '\\text{-}' : [
      ...numbers.slice(0, MAX_REFERENCED).map(number => (contactMade(number, form) ? `\\textcolor{${theme.active}}{\\mathbf{${number}}}` : String(number))),
      ...(numbers.length > MAX_REFERENCED ? ['\\ldots'] : []),
    ].join('\\;'));
    return (
      <g key={column.pathId} className="ladder-path" data-testid={`ladder-column-${column.number}`}>
        {number}
        {nodes}
        {!lane && <circle cx={column.spine} cy={layout.topRailY} r={3.2} fill={lit(true) ? theme.live : theme.ink} />}
        <circle cx={column.spine} cy={layout.bottomRailY} r={3.2} fill={energised ? theme.live : theme.ink} />
        {column.groups.map(group => group.elements.map(placed => renderElement(placed.element, placed.x, placed.y, Boolean(lane) && group.index === 0)))}
        {column.load && renderElement(column.load.element, column.load.x, column.load.y)}
        {reference && (
          <g className="ladder-cross-reference" data-testid={`ladder-xref-${reference.tag}`} aria-label={`${reference.tag}: ${tr('ladder.makeContacts')} ${reference.no.join(' ') || '-'}; ${tr('ladder.breakContacts')} ${reference.nc.join(' ') || '-'}`}>
            <title>{`${reference.tag}: ${tr('ladder.makeContacts')} ${reference.no.join(', ') || '-'} / ${tr('ladder.breakContacts')} ${reference.nc.join(', ') || '-'}`}</title>
            {/* make-contact paths over the fraction bar, break-contact paths under it */}
            <TexLabel className="xref-no" x={column.spine} y={layout.tableY + 8} size={11} bold={false} math={fractionMath(reference.no, 'NO')} color={theme.ink} />
            <line className="xref-bar" x1={column.spine - 22} x2={column.spine + 22} y1={layout.tableY + 18} y2={layout.tableY + 18} stroke={theme.ink} strokeWidth={1.2} />
            <TexLabel className="xref-nc" x={column.spine} y={layout.tableY + 28} size={11} bold={false} math={fractionMath(reference.nc, 'NC')} color={theme.ink} />
          </g>
        )}
        {armed === 'condition' && <Site x={column.seriesSite.x} y={column.seriesSite.y} label={tr('ladder.site.series', { n: column.number })} testId={`ladder-site-series-${column.number}`} theme={theme} onActivate={() => onSite({ type: 'series', pathId: path.id })} />}
        {armed === 'condition' && column.groups.map(group => (
          <Site key={group.index} x={group.parallelSite.x} y={group.parallelSite.y} label={tr('ladder.site.parallel', { n: column.number })} testId={`ladder-site-parallel-${column.number}-${group.index + 1}`} theme={theme} onActivate={() => onSite({ type: 'parallel', pathId: path.id, group: group.index })} />
        ))}
        {armed === 'load' && !column.load && <Site x={column.loadSite.x} y={column.loadSite.y} label={tr('ladder.site.load', { n: column.number })} testId={`ladder-site-load-${column.number}`} theme={theme} onActivate={() => onSite({ type: 'load', pathId: path.id })} />}
      </g>
    );
  };

  return (
    <div data-testid="relay-ladder" style={{ overflowX: 'auto' }}>
      <svg
        role="img"
        aria-label={tr('ladder.diagramLabel')}
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        width={layout.width}
        height={layout.height}
        style={{ display: 'block', maxWidth: 'none', direction: 'ltr', fontFamily: 'inherit', userSelect: 'none' }}
        onClick={() => onSelect(null)}
      >
        <rect x={0} y={0} width={layout.width} height={layout.height} fill="transparent" />
        {/* +24 V and 0 V rails */}
        <line data-testid="rail-24v" x1={layout.railLeft} x2={layout.railRight} y1={layout.topRailY} y2={layout.topRailY} stroke={lit(true) ? theme.live : theme.ink} strokeWidth={3.5} strokeLinecap="round" />
        <line data-testid="rail-0v" x1={layout.railLeft} x2={layout.railRight} y1={layout.bottomRailY} y2={layout.bottomRailY} stroke={theme.ink} strokeWidth={3.5} strokeLinecap="round" />
        <TexLabel className="rail-label" x={layout.railLeft - 6} y={layout.topRailY} anchor="end" size={13} math={'+24\\,\\mathrm{V}'} color={theme.ink} />
        <TexLabel className="rail-label" x={layout.railLeft - 6} y={layout.bottomRailY} anchor="end" size={13} math={'0\\,\\mathrm{V}'} color={theme.ink} />
        {layout.columns.map(renderColumn)}
        {layout.columns.length === 0 && (
          <text x={layout.railLeft + 10} y={(layout.topRailY + layout.bottomRailY) / 2} fontSize={12} fill={theme.ink} fillOpacity={0.6}>{tr('ladder.empty')}</text>
        )}
        <g
          role="button"
          tabIndex={0}
          aria-label={tr('ladder.addPath')}
          data-testid="ladder-new-path"
          style={{ cursor: 'copy' }}
          onClick={event => { event.stopPropagation(); onAddPath(); }}
          onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onAddPath(); } }}
        >
          <title>{tr('ladder.addPath')}</title>
          <circle cx={layout.newPathSite.x} cy={layout.newPathSite.y} r={13} fill={theme.surface} stroke={theme.faint} strokeWidth={1.6} strokeDasharray="3 2.5" />
          <path d={`M${layout.newPathSite.x - 5},${layout.newPathSite.y} H${layout.newPathSite.x + 5} M${layout.newPathSite.x},${layout.newPathSite.y - 5} V${layout.newPathSite.y + 5}`} stroke={theme.ink} strokeOpacity={0.6} strokeWidth={1.8} strokeLinecap="round" />
        </g>
      </svg>
    </div>
  );
}
