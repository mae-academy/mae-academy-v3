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
import { KatexMath } from "@/components/ui/KatexMath";
import { StandardStepPlot } from "@/components/common/templates/StandardStepPlot";

/** Magnitude and phase slices side by side; `children` (the time response) gets its own full-width row. */
export function FrequencyResponseCanvases({ system, children }: { system: TransferFunction; children?: React.ReactNode }) {
  const discrete = system.mode === "z";
  const gain = discrete ? "|H(e^{j\\Omega})|" : "|H(j\\omega)|"; const angle = discrete ? "\\angle H(e^{j\\Omega})" : "\\angle H(j\\omega)"; const axis = discrete ? "\\Omega\\text{ (rad/sample)}" : "\\omega\\text{ (rad/s)}";
  const data = useMemo(() => frequencyResponse(system, 260, system.mode === "s" ? 20 : undefined), [system]);
  const xDomain: [number, number] = system.mode === "s" ? [-20, 20] : [-Math.PI, Math.PI];

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
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 [&>*]:min-w-0">
      <StandardStepPlot
        title={<KatexMath math={gain} />}
        series={[
          {
            id: "magnitude",
            katexName: `${gain}\\text{ (dB)}`,
            data: magPoints,
            color: "#2563EB",
          },
        ]}
        height={320}
        xDomain={xDomain}
        xLabelKatex={axis}
        yLabelKatex={`${gain}\\text{ (dB)}`}
        forceBipolar
        showLegend={false}
      />
      <StandardStepPlot
        title={<KatexMath math={angle} />}
        series={[
          {
            id: "phase",
            katexName: `${angle}\\text{ (rad)}`,
            data: phasePoints,
            color: "#E11D48",
          },
        ]}
        height={320}
        xDomain={xDomain}
        xLabelKatex={axis}
        yLabelKatex={`${angle}\\text{ (rad)}`}
        forceBipolar
        showLegend={false}
      />
      {children}
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
        title={<KatexMath math="h(t)" />}
        series={[
          {
            id: "impulse-response",
            katexName: "h(t)",
            data: points,
            color: "#8B5CF6", // Brand violet
            unit: "",
          },
        ]}
        height={320}
        xLabelKatex="t\text{ (s)}"
        yLabelKatex="h(t)"
        forceBipolar
        showLegend={false}
      />
    );
  }
);

export default ImpulseResponseCanvas;
