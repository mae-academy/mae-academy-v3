import React, { useLayoutEffect, useRef, useState } from 'react';
import type { Palette } from '@/simulators/shared/workspace/workspaceTheme';
import { VALVE_SPECS, defaultFluidProps, getFluidDefinition, type FluidLibraryItem, type FluidMedium, type FluidProps } from '../../models/fluidCatalog';
import { FluidSymbol } from '../symbols/FluidSymbols';

/** Stage the preview tiles show, in symbol units. Every tile uses the same window. */
export const PREVIEW_STAGE = { width: 260, height: 170 } as const;
/** Share of the stage a symbol's tight bounding box fills (75-85 % target). */
export const PREVIEW_FILL = 0.8;
/** Largest enlargement, so a tiny part is not blown up into a blob. */
export const PREVIEW_MAX_SCALE = 3;
/** Rendered outline weight of a preview, in screen pixels (kept constant whatever the scale). */
const PREVIEW_STROKE_PX = 1.5;
/** Approximate on-screen width of a tile's icon area, used to turn the stage scale into pixels. */
const TILE_ICON_WIDTH_PX = 100;

export interface PreviewBox { cx: number; cy: number; width: number; height: number }

/**
 * Places a symbol on the common stage, scaled so its tight bounding box fills PREVIEW_FILL of the stage
 * (by whichever dimension is limiting) and centred. Small parts such as gauges and check valves are enlarged;
 * wide ones such as 5/3 valves are fitted to the width.
 */
export function previewLayout(box: PreviewBox): { scale: number; translateX: number; translateY: number } {
  const scale = Math.min(PREVIEW_MAX_SCALE, (PREVIEW_FILL * PREVIEW_STAGE.width) / box.width, (PREVIEW_FILL * PREVIEW_STAGE.height) / box.height);
  return { scale, translateX: PREVIEW_STAGE.width / 2 - box.cx * scale, translateY: PREVIEW_STAGE.height / 2 - box.cy * scale };
}

/**
 * Props a tile draws with. Directional valves show the bare envelope: no operators (so no pilot terminals 14 / 12,
 * springs or levers), which lets the chambers fill the tile. The canvas still places valves with their own defaults.
 */
export function previewProps(type: string): FluidProps {
  const props = defaultFluidProps(getFluidDefinition(type)!);
  return VALVE_SPECS[type] ? { ...props, actuationLeft: 'None', actuationRight: 'None' } : props;
}

/** Bounding box before it can be measured (and wherever getBBox does not exist): the part's bounds. */
function estimatedBox(type: string): PreviewBox {
  const definition = getFluidDefinition(type)!;
  const props = previewProps(type);
  const bounds = definition.boundsFor(props);
  const ports = definition.portsFor(props);
  return { cx: bounds.centerX ?? 0, cy: 0, width: Math.max(bounds.width, ...ports.map(p => Math.abs(p.x - (bounds.centerX ?? 0)) * 2)), height: Math.max(bounds.height, ...ports.map(p => Math.abs(p.y) * 2)) };
}

/** Palette tile icon. */
export function FluidLibraryIcon({ item, colors, medium }: { item: FluidLibraryItem; colors: Palette; medium: FluidMedium }) {
  const definition = getFluidDefinition(item.id)!;
  const measured = useRef<SVGGElement>(null);
  const [box, setBox] = useState<PreviewBox>(() => estimatedBox(item.id));
  useLayoutEffect(() => {
    try {
      const b = measured.current?.getBBox();
      if (b && b.width > 0 && b.height > 0) setBox({ cx: b.x + b.width / 2, cy: b.y + b.height / 2, width: b.width, height: b.height });
    } catch { /* getBBox is unavailable (jsdom): keep the estimate */ }
  }, [item.id]);

  const layout = previewLayout(box);
  // The stage is shown at about TILE_ICON_WIDTH_PX / stage width pixels per unit; draw the outline so it lands near 1.5 px.
  const pixelsPerUnit = (TILE_ICON_WIDTH_PX / PREVIEW_STAGE.width) * layout.scale;
  const strokeWidth = PREVIEW_STROKE_PX / pixelsPerUnit;
  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${PREVIEW_STAGE.width} ${PREVIEW_STAGE.height}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true" data-preview-scale={layout.scale}>
      <g transform={`translate(${layout.translateX},${layout.translateY}) scale(${layout.scale})`}>
        <g ref={measured}><FluidSymbol definition={definition} medium={medium} props={previewProps(item.id)} stroke={colors.text} strokeWidth={strokeWidth} /></g>
      </g>
    </svg>
  );
}
