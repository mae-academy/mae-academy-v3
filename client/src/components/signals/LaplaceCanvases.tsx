/**
 * MAE Academy / Signals & Systems — Tab E Frequency and Impulse-Response Scopes.
 * Canonical vector SVG implementation consuming StandardStepPlot template.
 */
import React, { forwardRef, useEffect, useImperativeHandle, useState, useMemo } from "react";
import {
  frequencyResponse,
  impulseResponse,
  type TransferFunction,
} from "@/features/signals/engines/laplaceEngine";
import { StandardStepPlot } from "@/components/common/templates/StandardStepPlot";

export function FrequencyResponseCanvases({ system }: { system: TransferFunction }) {
  const data = useMemo(() => frequencyResponse(system), [system]);

  const magPoints = useMemo(() => {
    return data.map((item) => ({
      x: item.omega,
      y: Math.min(40, Math.max(-80, 20 * Math.log10(Math.max(1e-5, item.magnitude)))),
    }));
  }, [data]);

  const phasePoints = useMemo(() => {
    return data.map((item) => ({
      x: item.omega,
      y: item.phase,
    }));
  }, [data]);

  return (
    <div className="space-y-4">
      <StandardStepPlot
        title="Bode Magnitude |H(jω)|"
        series={[
          {
            id: "magnitude",
            katexName: "|H(j\\omega)|\\text{ (dB)}",
            data: magPoints,
            color: "#2563EB",
          },
        ]}
        height={180}
        xLabelKatex="\omega\text{ (rad/s)}"
        yLabelKatex="|H(j\omega)|\text{ (dB)}"
        forceBipolar
        showLegend={false}
      />
      <StandardStepPlot
        title="Bode Phase ∠H(jω)"
        series={[
          {
            id: "phase",
            katexName: "\\angle H(j\\omega)\\text{ (rad)}",
            data: phasePoints,
            color: "#E11D48",
          },
        ]}
        height={180}
        xLabelKatex="\omega\text{ (rad/s)}"
        yLabelKatex="\angle H(j\omega)\text{ (rad)}"
        forceBipolar
        showLegend={false}
      />
    </div>
  );
}

export type ImpulseResponseCanvasHandle = { drawSystem: (system: TransferFunction) => void };

export const ImpulseResponseCanvas = forwardRef<ImpulseResponseCanvasHandle, { system: TransferFunction }>(
  function ImpulseResponseCanvas({ system }, ref) {
    const [currentSystem, setCurrentSystem] = useState<TransferFunction>(system);

    useEffect(() => {
      setCurrentSystem(system);
    }, [system]);

    useImperativeHandle(
      ref,
      () => ({
        drawSystem: (next) => {
          setCurrentSystem(next);
        },
      }),
      []
    );

    const points = useMemo(() => {
      const response = impulseResponse(currentSystem);
      if (!response.length) {
        return [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
        ];
      }
      return response.map((item) => ({ x: item.time, y: item.value }));
    }, [currentSystem]);

    return (
      <StandardStepPlot
        title="Impulse Response h(t)"
        series={[
          {
            id: "impulse-response",
            katexName: "h(t)",
            data: points,
            color: "#8B5CF6", // Brand violet
            unit: "",
          },
        ]}
        height={180}
        xLabelKatex="t\text{ (s)}"
        yLabelKatex="h(t)"
        forceBipolar
        showLegend={false}
      />
    );
  }
);

export default ImpulseResponseCanvas;
