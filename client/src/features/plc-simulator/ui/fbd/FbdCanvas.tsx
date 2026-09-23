import { useId, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type PointerEvent } from 'react';
import { CANVAS_SURFACE } from '../chrome';
import { CANVAS_FONT_FAMILY, dotClass, wireClass } from '../canvas/components/symbols/theme';
import { FBD_DRAG_TYPE } from './FbdPalette';
import { INVERTED, SYMBOL } from './FbdSymbols';
import { routeLink, type Point } from './routing';
import {
  BLOCK_W,
  GRID,
  HEADER_H,
  KINDS,
  PIN_PITCH,
  blockCaption,
  blockHeight,
  inputPinPos,
  outputPinPos,
  snap,
  type BlockId,
  type FbdBlock,
  type FbdKind,
} from './model';
import type { FbdEditor } from './useFbdEditor';

export interface FbdCanvasProps {
  editor: FbdEditor;
  /** Logic level per block output while the controller runs; null while stopped. */
  levels: ReadonlyMap<BlockId, boolean> | null;
  /** Editing is locked while the controller runs. */
  locked: boolean;
  className?: string;
}

const SNAP_RADIUS = 18;

interface WireDrag {
  readonly from: BlockId;
  readonly at: Point;
  readonly snapTo: { readonly block: BlockId; readonly pin: number } | null;
  /** A plain click on a pin arms the wire; it then follows the pointer until the next click. */
  readonly sticky: boolean;
}

interface MoveDrag {
  readonly id: BlockId;
  readonly dx: number;
  readonly dy: number;
}

const isKind = (value: string): value is FbdKind => value in KINDS;

/**
 * The FBD canvas: blocks on a snapped grid, orthogonally-routed links, wire-drawing by dragging
 * from an output pin (or click, then click a target pin). Drag from the library or click to arm.
 */
export function FbdCanvas({ editor, levels, locked, className = '' }: FbdCanvasProps) {
  const { graph, selection, armed, actions } = editor;
  const svgRef = useRef<SVGSVGElement>(null);
  const gridId = useId();
  const [wire, setWire] = useState<WireDrag | null>(null);
  const [ghost, setGhost] = useState<Point | null>(null);
  const move = useRef<MoveDrag | null>(null);
  const downAt = useRef<Point | null>(null);

  const byId = useMemo(() => new Map(graph.blocks.map((block) => [block.id, block])), [graph.blocks]);
  const size = useMemo(() => {
    let width = 960;
    let height = 560;
    for (const block of graph.blocks) {
      width = Math.max(width, block.x + BLOCK_W + 240);
      height = Math.max(height, block.y + blockHeight(block.kind) + 200);
    }
    return { width, height };
  }, [graph.blocks]);

  const pointerPos = (event: { clientX: number; clientY: number }): Point => {
    const rect = svgRef.current?.getBoundingClientRect();
    return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) };
  };

  /** Free input pin closest to the pointer, so a wire snaps to a pin without pixel-perfect aim. */
  const nearestPin = (pos: Point, from: BlockId): WireDrag['snapTo'] => {
    let best: WireDrag['snapTo'] = null;
    let bestDistance = SNAP_RADIUS;
    for (const block of graph.blocks) {
      if (block.id === from) continue;
      for (let pin = 0; pin < KINDS[block.kind].pins.length; pin++) {
        const p = inputPinPos(block, pin);
        const distance = Math.hypot(p.x - pos.x, p.y - pos.y);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = { block: block.id, pin };
        }
      }
    }
    return best;
  };

  const finishWire = (current: WireDrag): void => {
    if (current.snapTo) actions.link(current.from, current.snapTo.block, current.snapTo.pin);
    setWire(null);
  };

  const ghostAt = (pos: Point): Point => ({ x: snap(pos.x - BLOCK_W / 2), y: snap(pos.y - 25) });

  // ---- pointer -----------------------------------------------------------------------------

  const onPointerDownCapture = (event: PointerEvent<SVGSVGElement>): void => {
    if (wire?.sticky) {
      // second click of click-click wiring: complete (or cancel) before anything else reacts
      event.stopPropagation();
      finishWire({ ...wire, snapTo: nearestPin(pointerPos(event), wire.from) });
    }
  };

  const onPointerDown = (event: PointerEvent<SVGSVGElement>): void => {
    if (locked || event.button > 0) return;
    const pos = pointerPos(event);
    if (armed !== null) {
      const at = ghostAt(pos);
      actions.place(armed, at.x, at.y);
      setGhost(null);
      return;
    }
    actions.select({ blockId: null, linkId: null });
  };

  const onPointerMove = (event: PointerEvent<SVGSVGElement>): void => {
    const pos = pointerPos(event);
    const dragging = move.current;
    if (dragging) {
      actions.moveTo(dragging.id, pos.x - dragging.dx, pos.y - dragging.dy);
    } else if (wire) {
      setWire({ ...wire, at: pos, snapTo: nearestPin(pos, wire.from) });
    } else if (armed !== null && !locked) {
      setGhost(ghostAt(pos));
    }
  };

  const onPointerUp = (event: PointerEvent<SVGSVGElement>): void => {
    if (move.current) {
      move.current = null;
      actions.endMove();
    }
    if (wire && !wire.sticky) {
      const start = downAt.current;
      const pos = pointerPos(event);
      const clicked = start !== null && Math.hypot(pos.x - start.x, pos.y - start.y) < 5;
      if (wire.snapTo) finishWire(wire);
      else if (clicked) setWire({ ...wire, sticky: true });
      else setWire(null);
    }
  };

  const startMove = (event: PointerEvent<SVGGElement>, block: FbdBlock): void => {
    if (locked || event.button > 0) return;
    event.stopPropagation();
    const pos = pointerPos(event);
    svgRef.current?.setPointerCapture?.(event.pointerId);
    actions.select({ blockId: block.id, linkId: null });
    move.current = { id: block.id, dx: pos.x - block.x, dy: pos.y - block.y };
  };

  const startWire = (event: PointerEvent<SVGGElement>, block: FbdBlock): void => {
    if (locked || event.button > 0) return;
    event.stopPropagation();
    const pos = pointerPos(event);
    downAt.current = pos;
    svgRef.current?.setPointerCapture?.(event.pointerId);
    setWire({ from: block.id, at: outputPinPos(block), snapTo: null, sticky: false });
  };

  // ---- drag & drop from the library --------------------------------------------------------

  const onDragOver = (event: DragEvent<SVGSVGElement>): void => {
    if (locked || !event.dataTransfer.types.includes(FBD_DRAG_TYPE)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    const at = ghostAt(pointerPos(event));
    if (ghost?.x !== at.x || ghost.y !== at.y) setGhost(at);
  };

  const onDrop = (event: DragEvent<SVGSVGElement>): void => {
    const kind = event.dataTransfer.getData(FBD_DRAG_TYPE);
    if (locked || !isKind(kind)) return;
    event.preventDefault();
    const at = ghostAt(pointerPos(event));
    setGhost(null);
    actions.place(kind, at.x, at.y);
  };

  // ---- keyboard ----------------------------------------------------------------------------

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
    if ((event.ctrlKey || event.metaKey) && !locked) {
      const key = event.key.toLowerCase();
      if (key === 'z') {
        event.preventDefault();
        if (event.shiftKey) actions.redo();
        else actions.undo();
      } else if (key === 'y') {
        event.preventDefault();
        actions.redo();
      }
      return;
    }
    if (locked) return;
    switch (event.key) {
      case 'Delete':
      case 'Backspace':
        if (selection.blockId === null && selection.linkId === null) break;
        event.preventDefault();
        actions.deleteSelection();
        break;
      case 'Escape': {
        // Only claim Escape when there is something to cancel; otherwise it belongs to the LCD's ESC key.
        const consumed = wire !== null || armed !== null || selection.blockId !== null || selection.linkId !== null;
        if (!consumed) break;
        event.preventDefault();
        if (wire) setWire(null);
        else if (armed !== null) actions.arm(null);
        else actions.select({ blockId: null, linkId: null });
        setGhost(null);
        break;
      }
      case 'ArrowUp':
      case 'ArrowDown':
      case 'ArrowLeft':
      case 'ArrowRight': {
        const block = selection.blockId === null ? undefined : byId.get(selection.blockId);
        if (!block) return;
        event.preventDefault();
        const step = event.shiftKey ? GRID * 5 : GRID;
        actions.moveTo(block.id, block.x + (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0), block.y + (event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0));
        actions.endMove();
        break;
      }
      default:
    }
  };

  const level = (id: BlockId): boolean => levels?.get(id) ?? false;

  const wirePath = wire
    ? (() => {
        const source = byId.get(wire.from);
        if (!source) return null;
        const end = wire.snapTo ? inputPinPos(byId.get(wire.snapTo.block) ?? source, wire.snapTo.pin) : { x: snap(wire.at.x), y: snap(wire.at.y) };
        return routeLink(outputPinPos(source), { x: end.x, y: end.y });
      })()
    : null;

  return (
    <div
      role="application"
      aria-roledescription="function block diagram editor"
      aria-label="Function block diagram. Drag blocks from the library, drag from an output pin to an input pin to wire them, Delete removes the selection."
      tabIndex={0}
      onKeyDown={onKeyDown}
      className={`relative min-h-0 overflow-auto outline-none focus-visible:ring-2 focus-visible:ring-violet-500/50 ${CANVAS_SURFACE} ${className}`}
      data-armed={armed ?? undefined}
    >
      <svg
        ref={svgRef}
        width={size.width}
        height={size.height}
        viewBox={`0 0 ${size.width} ${size.height}`}
        className="block max-w-none select-none"
        style={{ touchAction: 'none', cursor: wire ? 'crosshair' : armed !== null ? 'copy' : 'default' }}
        onPointerDownCapture={onPointerDownCapture}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDragOver={onDragOver}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setGhost(null);
        }}
        onDrop={onDrop}
      >
        <defs>
          <pattern id={gridId} width={GRID} height={GRID} patternUnits="userSpaceOnUse">
            <circle cx={GRID / 2} cy={GRID / 2} r={1} className="fill-slate-400/40 dark:fill-slate-500/30" />
          </pattern>
        </defs>
        <rect width={size.width} height={size.height} fill={`url(#${gridId})`} pointerEvents="none" />

        <g data-layer="links" fill="none" strokeWidth={2} shapeRendering="crispEdges">
          {graph.links.map((link) => {
            const from = byId.get(link.from);
            const to = byId.get(link.to);
            if (!from || !to) return null;
            const d = routeLink(outputPinPos(from), inputPinPos(to, link.pin));
            const selected = selection.linkId === link.id;
            const live = levels !== null && level(link.from);
            return (
              <g key={link.id} data-link={link.id}>
                <path
                  d={d}
                  stroke="transparent"
                  strokeWidth={12}
                  pointerEvents={locked ? 'none' : 'stroke'}
                  className="cursor-pointer"
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    actions.select({ blockId: null, linkId: link.id });
                  }}
                />
                <path d={d} className={selected ? 'stroke-sky-500' : wireClass(live)} strokeWidth={selected ? 3 : 2} pointerEvents="none" />
              </g>
            );
          })}
          {wirePath !== null && <path d={wirePath} strokeDasharray="5 3" pointerEvents="none" className={wire?.snapTo ? 'stroke-emerald-500' : 'stroke-violet-500'} data-wire-preview="true" />}
        </g>

        <g data-layer="blocks">
          {graph.blocks.map((block) => (
            <BlockView
              key={block.id}
              block={block}
              selected={selection.blockId === block.id}
              level={levels === null ? null : level(block.id)}
              inputLevel={levels === null ? null : (pin) => {
                const link = graph.links.find((entry) => entry.to === block.id && entry.pin === pin);
                return link ? level(link.from) : false;
              }}
              connected={(pin) => graph.links.some((entry) => entry.to === block.id && entry.pin === pin)}
              snapPin={wire?.snapTo?.block === block.id ? wire.snapTo.pin : null}
              locked={locked}
              onBodyDown={(event) => startMove(event, block)}
              onOutputDown={(event) => startWire(event, block)}
            />
          ))}
        </g>

        {ghost !== null && armed !== null && (
          <g pointerEvents="none" data-ghost="true" style={{ transform: `translate(${ghost.x}px, ${ghost.y}px)`, transition: 'transform 90ms cubic-bezier(0.2, 0, 0, 1)' }}>
            <rect width={BLOCK_W} height={blockHeight(armed)} rx={3} strokeWidth={1.5} strokeDasharray="5 3" className="fill-emerald-500/10 stroke-emerald-500" />
            <text
              x={BLOCK_W / 2}
              y={blockHeight(armed) / 2 + 4}
              textAnchor="middle"
              fontFamily={CANVAS_FONT_FAMILY}
              fontSize={12}
              fontWeight={600}
              className="fill-emerald-600 font-sans dark:fill-emerald-400"
            >
              {KINDS[armed].label}
            </text>
          </g>
        )}
      </svg>

      {graph.blocks.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6 text-center text-xs text-slate-500 dark:text-slate-400">
          Drag an Input, a gate and an Output from the library, then wire them pin to pin.
        </div>
      )}
    </div>
  );
}

// ---- one block ---------------------------------------------------------------------------------

interface BlockViewProps {
  block: FbdBlock;
  selected: boolean;
  /** Output level while running; null when stopped. */
  level: boolean | null;
  inputLevel: ((pin: number) => boolean) | null;
  connected: (pin: number) => boolean;
  snapPin: number | null;
  locked: boolean;
  onBodyDown: (event: PointerEvent<SVGGElement>) => void;
  onOutputDown: (event: PointerEvent<SVGGElement>) => void;
}

function BlockView({ block, selected, level, inputLevel, connected, snapPin, locked, onBodyDown, onOutputDown }: BlockViewProps) {
  const spec = KINDS[block.kind];
  const height = blockHeight(block.kind);
  const io = block.kind === 'input' || block.kind === 'output';
  const live = level === true;
  const outY = HEADER_H + PIN_PITCH / 2;

  return (
    <g transform={`translate(${block.x} ${block.y})`} data-block={block.id} data-kind={block.kind}>
      <g onPointerDown={onBodyDown} className={locked ? '' : 'cursor-move'}>
        <rect
          width={BLOCK_W}
          height={height}
          rx={io ? 14 : 3}
          strokeWidth={selected ? 2.5 : 2}
          className={`${live && block.kind !== 'output' ? 'fill-emerald-50 dark:fill-emerald-950/40' : 'fill-white dark:fill-[#0d0f12]'} ${selected ? 'stroke-sky-500' : 'stroke-slate-500 dark:stroke-slate-400'}`}
        />
        <line x1={0} x2={BLOCK_W} y1={HEADER_H} y2={HEADER_H} strokeWidth={1} className="stroke-slate-300 dark:stroke-[#1a1d24]" />
        <text
          x={BLOCK_W / 2}
          y={HEADER_H - 6}
          textAnchor="middle"
          fontFamily={CANVAS_FONT_FAMILY}
          fontSize={11}
          fontWeight={600}
          className="fill-slate-700 font-sans dark:fill-slate-200"
        >
          {blockCaption(block)}
        </text>

        {spec.pins.map((label, pin) => (
          <text
            key={pin}
            x={10}
            y={HEADER_H + pin * PIN_PITCH + PIN_PITCH / 2 + 4}
            fontFamily={CANVAS_FONT_FAMILY}
            fontSize={10}
            className="fill-slate-500 font-sans dark:fill-slate-400"
          >
            {label}
          </text>
        ))}

        {!io && (
          <text
            x={BLOCK_W - 12}
            y={height / 2 + HEADER_H / 2 + 8}
            textAnchor="end"
            fontFamily={CANVAS_FONT_FAMILY}
            fontSize={block.kind === 'ton' || block.kind === 'tof' ? 14 : 20}
            fontWeight={600}
            className="fill-slate-400 font-sans dark:fill-slate-500"
          >
            {SYMBOL[block.kind]}
          </text>
        )}
        {io && (
          <text
            x={BLOCK_W / 2}
            y={HEADER_H + PIN_PITCH / 2 + 4}
            textAnchor="middle"
            fontFamily={CANVAS_FONT_FAMILY}
            fontSize={12}
            fontWeight={600}
            className={live ? 'fill-[#2E7D32] font-sans dark:fill-[#00E676]' : 'fill-slate-400 font-sans dark:fill-slate-500'}
          >
            {level === null ? '·' : live ? '1' : '0'}
          </text>
        )}
      </g>

      {spec.pins.map((_, pin) => {
        const on = inputLevel?.(pin) ?? false;
        const snapped = snapPin === pin;
        return (
          <g key={pin} data-in-pin={pin}>
            <circle cx={0} cy={HEADER_H + pin * PIN_PITCH + PIN_PITCH / 2} r={snapped ? 6 : 4} strokeWidth={2} className={`${snapped ? 'fill-emerald-500 stroke-emerald-500' : connected(pin) ? `${dotClass(on)} stroke-transparent` : 'fill-white stroke-slate-500 dark:fill-[#0d0f12] dark:stroke-slate-400'}`} />
          </g>
        );
      })}

      {spec.hasOutput && (
        <g data-out-pin="true" onPointerDown={onOutputDown} className={locked ? '' : 'cursor-crosshair'}>
          <circle cx={BLOCK_W} cy={outY} r={12} fill="transparent" />
          <circle
            cx={BLOCK_W}
            cy={outY}
            r={INVERTED.has(block.kind) ? 5 : 4}
            strokeWidth={2}
            className={INVERTED.has(block.kind) ? 'fill-white stroke-slate-500 dark:fill-[#0d0f12] dark:stroke-slate-400' : `${dotClass(live)} stroke-transparent`}
          />
        </g>
      )}
    </g>
  );
}
