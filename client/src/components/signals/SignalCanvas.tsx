/**
 * MAE Academy / Signals & Systems — SignalCanvas (Deprecated Wrapper).
 * Aligned directly with canonical PiecewiseSignalScope and template primitives.
 * @deprecated Prefer direct consumption of PiecewiseSignalScope.
 */
import React, { useMemo } from "react";
import {
  PiecewiseSignalScope,
  type ScopeModel,
} from "@/components/signals/PiecewiseSignalScope";
import { evaluateWindowedSignal, type ImpulseMarker, type PeriodMode, type SignalNode, type SignalWindow } from "@shared/signals/signalEngine";

type Props = {
  node: SignalNode;
  signalWindow: SignalWindow;
  periodMode: PeriodMode;
  impulses: ImpulseMarker[];
  showEven: boolean;
  showOdd: boolean;
};

/**
 * SignalCanvas — Legacy adapter delegating directly to PiecewiseSignalScope.
 * Zero custom HTML5 canvas code; 100% vector SVG rendering.
 */
export function SignalCanvas({
  node,
  signalWindow,
  periodMode,
  impulses,
}: Props) {
  const model: ScopeModel = useMemo(
    () => ({
      breakpoints: [signalWindow.from, signalWindow.to],
      impulses: impulses.map((imp) => ({
        time: imp.at,
        weight: imp.area,
        latex: imp.latex,
      })),
      valueAt: (t: number) =>
        evaluateWindowedSignal(node, t, signalWindow, periodMode),
    }),
    [impulses, node, periodMode, signalWindow]
  );

  return (
    <PiecewiseSignalScope
      model={model}
      height={390}
      yLabelKatex="x(t)"
    />
  );
}

export default SignalCanvas;
