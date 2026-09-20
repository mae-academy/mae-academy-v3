import { useCallback, useState, useRef, type PointerEvent } from 'react';
import type { NetworkId, NodeId } from '../../domain/ast';
import { CELL_HEIGHT, CELL_WIDTH, MARGIN_TOP, RAIL_X } from './geometry';

export interface DragState {
  isActive: boolean;
  networkId: NetworkId | null;
  nodeId: NodeId | null;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  row: number;
  col: number;
}

export function useCanvasDragDrop(options: {
  maxCols: number;
  maxRows: number;
  onDrop: (networkId: NetworkId, nodeId: NodeId, targetRow: number, targetCol: number) => void;
}) {
  const { maxCols, maxRows, onDrop } = options;

  const [dragState, setDragState] = useState<DragState>({
    isActive: false,
    networkId: null,
    nodeId: null,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
    row: 0,
    col: 0,
  });

  const svgRef = useRef<SVGSVGElement | null>(null);

  const startDrag = useCallback(
    (event: PointerEvent<Element>, networkId: NetworkId, nodeId: NodeId) => {
      // Must target primary button
      if (event.button !== 0) return;

      const svg = event.currentTarget.closest('svg');
      if (!svg) return;
      
      svgRef.current = svg;
      
      const ctm = svg.getScreenCTM();
      if (!ctm) return;
      
      const pt = svg.createSVGPoint();
      pt.x = event.clientX;
      pt.y = event.clientY;
      const svgP = pt.matrixTransform(ctm.inverse());
      
      event.currentTarget.setPointerCapture(event.pointerId);

      setDragState({
        isActive: true,
        networkId,
        nodeId,
        startX: svgP.x,
        startY: svgP.y,
        currentX: svgP.x,
        currentY: svgP.y,
        row: Math.max(0, Math.min(maxRows - 1, Math.floor((svgP.y - MARGIN_TOP) / CELL_HEIGHT))),
        col: Math.max(0, Math.min(maxCols - 1, Math.floor((svgP.x - RAIL_X) / CELL_WIDTH))),
      });
    },
    [maxCols, maxRows],
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent<Element>) => {
      if (!dragState.isActive || !svgRef.current) return;

      const svg = svgRef.current;
      const ctm = svg.getScreenCTM();
      if (!ctm) return;

      const pt = svg.createSVGPoint();
      pt.x = event.clientX;
      pt.y = event.clientY;
      const svgP = pt.matrixTransform(ctm.inverse());

      setDragState((prev) => {
        // Optimization: avoid re-render if coords haven't really changed
        if (prev.currentX === svgP.x && prev.currentY === svgP.y) return prev;
        return {
          ...prev,
          currentX: svgP.x,
          currentY: svgP.y,
          row: Math.max(0, Math.min(maxRows - 1, Math.floor((svgP.y - MARGIN_TOP) / CELL_HEIGHT))),
          col: Math.max(0, Math.min(maxCols - 1, Math.floor((svgP.x - RAIL_X) / CELL_WIDTH))),
        };
      });
    },
    [dragState.isActive, maxCols, maxRows],
  );

  const handlePointerUp = useCallback(
    (event: PointerEvent<Element>) => {
      if (!dragState.isActive) return;
      
      event.currentTarget.releasePointerCapture(event.pointerId);
      
      // We check if it actually moved, else it was just a click
      const dx = Math.abs(dragState.currentX - dragState.startX);
      const dy = Math.abs(dragState.currentY - dragState.startY);
      const isDrag = dx > 5 || dy > 5;

      if (isDrag && dragState.networkId && dragState.nodeId) {
        onDrop(dragState.networkId, dragState.nodeId, dragState.row, dragState.col);
      }

      setDragState({
        isActive: false,
        networkId: null,
        nodeId: null,
        startX: 0,
        startY: 0,
        currentX: 0,
        currentY: 0,
        row: 0,
        col: 0,
      });
      svgRef.current = null;
    },
    [dragState, onDrop],
  );

  const handlePointerCancel = useCallback(
    (event: PointerEvent<Element>) => {
      if (!dragState.isActive) return;
      event.currentTarget.releasePointerCapture(event.pointerId);
      setDragState({
        isActive: false,
        networkId: null,
        nodeId: null,
        startX: 0,
        startY: 0,
        currentX: 0,
        currentY: 0,
        row: 0,
        col: 0,
      });
      svgRef.current = null;
    },
    [dragState.isActive],
  );

  return {
    dragState,
    startDrag,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
  };
}
