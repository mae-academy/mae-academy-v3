import React, { useState } from "react";
import type { FrequencyPoint, StabilityMargins } from "@shared/control/frequencyTypes";
import { BodeMagnitudePlot } from "./BodeMagnitudePlot";
import { BodePhasePlot } from "./BodePhasePlot";

export interface BodePlotProps {
  data: FrequencyPoint[];
  margins?: StabilityMargins;
  height?: number | string;
  className?: string;
  showAsymptote?: boolean;
  interactive?: boolean;
  layout?: "stacked" | "side-by-side";
}

/**
 * BodePlot: Synchronized dual-pane Bode diagram (Magnitude + Phase)
 * Coordinates frequency hover tracking across both plots.
 */
export function BodePlot({
  data,
  margins,
  height,
  className = "",
  showAsymptote = true,
  interactive = true,
  layout = "side-by-side",
}: BodePlotProps) {
  const [hoverOmega, setHoverOmega] = useState<number | null>(null);

  const isSideBySide = layout === "side-by-side";
  const itemHeightClass = height ? "flex-1" : "h-[380px]";

  return (
    <div
      className={`w-full grid ${
        isSideBySide ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1"
      } gap-6 items-stretch ${className}`}
      style={height !== undefined ? { height: typeof height === "number" ? `${height}px` : height } : undefined}
    >
      {/* Column 1: Bode Magnitude */}
      <div className={`w-full ${itemHeightClass} flex flex-col`}>
        <BodeMagnitudePlot
          data={data}
          margins={margins}
          showAsymptote={showAsymptote}
          interactive={interactive}
          hoverOmega={hoverOmega}
          onHoverOmegaChange={setHoverOmega}
          className="w-full h-full"
          height="100%"
        />
      </div>

      {/* Column 2: Bode Phase */}
      <div className={`w-full ${itemHeightClass} flex flex-col`}>
        <BodePhasePlot
          data={data}
          margins={margins}
          showAsymptote={showAsymptote}
          interactive={interactive}
          hoverOmega={hoverOmega}
          onHoverOmegaChange={setHoverOmega}
          className="w-full h-full"
          height="100%"
        />
      </div>
    </div>
  );
}
