import React, { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useTranslation } from 'react-i18next';
import {
  findPolynomialRoots,
  simulateLtiStepResponse,
  findBreakawayPoints,
  generateFlawlessRootLocus,
  type Complex,
} from "@/features/control/controlMath";
import { TransferFunctionInput, TransferFunctionData } from "./TransferFunctionInput";
import { RootLocusStepsPanel } from "./RootLocusStepsPanel";
import { KatexMath } from "../ui/KatexMath";
import {
  StandardRootLocusPlot,
  StandardStepPlot,
  StudioCard,
  StudioSlider,
  InnerBox,
  StatusBadge,
  type PlotSeries,
} from "@/components/common/templates";

export function RootLocusStudio() {
  const { t } = useTranslation('simulators');
  // Dual-mode transfer function state
  const [tfData, setTfData] = useState<TransferFunctionData>({
    mode: "polynomial",
    numPoly: [1],
    denPoly: [1, 3, 2, 0],
    zpk: { k: 1, z: "", p: "0, -1, -2" },
    polyStr: { num: "1", den: "1 3 2 0" },
  });

  const [gainK, setGainK] = useState(1);
  const [kMin, setKMin] = useState(0.01);
  const [kMax, setKMax] = useState(10);
  const [maxTime, setMaxTime] = useState(10.0);
  const [gridMode, setGridMode] = useState<"cartesian" | "polar">("cartesian");
  const [highlightedStep, setHighlightedStep] = useState<string | null>(null);
  const highlightTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Refs used to measure the right sidebar's step boundaries so the left plots
  // can be sized in pixels to align their bottoms with Step 4 and Step 6.
  const leftColRef = useRef<HTMLDivElement>(null);
  const sidebarColRef = useRef<HTMLDivElement>(null);
  const step4BoxRef = useRef<HTMLDivElement>(null);
  const [plotHeights, setPlotHeights] = useState<{ splane: number; stepResp: number } | null>(null);

  const handleHighlight = (step: string) => {
    if (highlightTimerRef.current) {
      clearTimeout(highlightTimerRef.current);
    }
    // Re-trigger pulse animation cleanly on click
    setHighlightedStep(null);
    requestAnimationFrame(() => {
      setHighlightedStep(step);
      highlightTimerRef.current = setTimeout(() => {
        setHighlightedStep(null);
      }, 2000);
    });
  };

  // Extract N(s) and D(s) with padding
  const { num, den } = useMemo(() => {
    const n = [...tfData.numPoly];
    const d = [...tfData.denPoly];
    while (n.length > 1 && Math.abs(n[0]) < 1e-12) n.shift();
    while (d.length > 1 && Math.abs(d[0]) < 1e-12) d.shift();
    return { num: n, den: d };
  }, [tfData]);

  const openLoopZeros = useMemo(() => findPolynomialRoots(num), [num]);
  const openLoopPoles = useMemo(() => findPolynomialRoots(den), [den]);

  // Asymptotes Calculation
  const asymptotes = useMemo(() => {
    const n = openLoopPoles.length;
    const m = openLoopZeros.length;
    const i = n - m;
    if (i <= 0) return null;

    const sumPoles = openLoopPoles.reduce((acc, val) => acc + val.re, 0.0);
    const sumZeros = openLoopZeros.reduce((acc, val) => acc + val.re, 0.0);

    const centroid = (sumPoles - sumZeros) / i;
    const angles = [];
    for (let k = 0; k < i; k++) {
      angles.push(((2 * k + 1) * Math.PI) / i);
    }
    return { centroid, angles };
  }, [openLoopPoles, openLoopZeros]);

  // Precompute Root Locus Sweeps and Crossings
  const { locusTrajectories, imagCrossings } = useMemo(() => {
    if (openLoopPoles.length === 0) return { locusTrajectories: [], imagCrossings: [], angleDepartures: [] };

    const computeRoots = (kVal: number): Complex[] => {
      const maxDeg = Math.max(den.length, num.length);
      const charPoly = new Array(maxDeg).fill(0);
      const dOffset = maxDeg - den.length;
      for (let idx = 0; idx < den.length; idx++) charPoly[dOffset + idx] += den[idx];
      const nOffset = maxDeg - num.length;
      for (let idx = 0; idx < num.length; idx++) charPoly[nOffset + idx] += kVal * num[idx];

      let st = 0;
      while (st < charPoly.length && Math.abs(charPoly[st]) < 1e-12) st++;
      if (st === charPoly.length) return [];
      const lead = charPoly[st];
      const normPoly = charPoly.slice(st).map((val) => val / lead);
      return findPolynomialRoots(normPoly);
    };

    let branches = generateFlawlessRootLocus(openLoopPoles, computeRoots);

    // Breakaway Injection Pass
    const analyticalBreakPts = findBreakawayPoints(num, den);
    if (analyticalBreakPts.length > 0) {
      branches = branches.map((branch) => {
        const result: Complex[] = [];
        for (let i = 0; i < branch.length; i++) {
          const pt = branch[i];
          const prevPt = i > 0 ? branch[i - 1] : null;

          const wasReal = prevPt !== null && Math.abs(prevPt.im) < 1e-4;
          const isComplex = Math.abs(pt.im) > 1e-4;

          if (wasReal && isComplex && prevPt) {
            let bestBreak: number | null = null;
            let bestDist = Infinity;
            for (const bp of analyticalBreakPts) {
              const d = Math.abs(bp - prevPt.re);
              if (d < bestDist) {
                bestDist = d;
                bestBreak = bp;
              }
            }
            if (bestBreak !== null && bestDist < 1.0) {
              result.push({ re: bestBreak, im: 0 });
              result.push({ re: bestBreak, im: pt.im >= 0 ? 0.0001 : -0.0001 });
            }
          }
          result.push(pt);
        }
        return result;
      });
    }

    // Imaginary Axis Crossing Detection
    const crossingSet = new Map<string, { k: number; omega: number }>();

    const findStabilityK = (): number => {
      let kLo = 0,
        kHi = 1e6;
      for (let iter = 0; iter < 60; iter++) {
        const kMid = (kLo + kHi) / 2;
        const roots = computeRoots(kMid);
        if (roots.some((r) => r.re > 0)) kHi = kMid;
        else kLo = kMid;
      }
      return (kLo + kHi) / 2;
    };

    const kMarginal = findStabilityK();
    if (kMarginal > 0.01 && kMarginal < 999999) {
      const rootsAtK = computeRoots(kMarginal);
      rootsAtK.forEach((r) => {
        if (Math.abs(r.re) < 0.05 && Math.abs(r.im) > 0.05) {
          const key = r.im.toFixed(2);
          if (!crossingSet.has(key)) {
            crossingSet.set(key, { k: kMarginal, omega: Math.abs(r.im) });
          }
        }
      });
    }

    const crossings = Array.from(crossingSet.values());

    // Angle of Departure / Arrival
    const angleDepartures: { pole: Complex; angleDeg: number }[] = [];
    openLoopPoles.forEach((p) => {
      if (Math.abs(p.im) > 1e-5) {
        let sumZeros = 0;
        openLoopZeros.forEach((z) => {
          sumZeros += Math.atan2(p.im - z.im, p.re - z.re);
        });
        let sumPoles = 0;
        openLoopPoles.forEach((otherP) => {
          if (otherP !== p) {
            sumPoles += Math.atan2(p.im - otherP.im, p.re - otherP.re);
          }
        });
        const phi = Math.PI + sumZeros - sumPoles;
        let deg = (phi * 180) / Math.PI;
        while (deg > 180) deg -= 360;
        while (deg < -180) deg += 360;
        angleDepartures.push({ pole: p, angleDeg: deg });
      }
    });

    return { locusTrajectories: branches, imagCrossings: crossings, angleDepartures };
  }, [num, den, openLoopPoles, openLoopZeros]);

  // Current roots at current gain K
  const currentRoots = useMemo(() => {
    const maxDeg = Math.max(den.length, num.length);
    const charPoly = new Array(maxDeg).fill(0);
    const dOffset = maxDeg - den.length;
    for (let idx = 0; idx < den.length; idx++) charPoly[dOffset + idx] += den[idx];
    const nOffset = maxDeg - num.length;
    for (let idx = 0; idx < num.length; idx++) charPoly[nOffset + idx] += gainK * num[idx];

    let st = 0;
    while (st < charPoly.length && Math.abs(charPoly[st]) < 1e-12) st++;
    if (st === charPoly.length) return [];
    const lead = charPoly[st];
    const normPoly = charPoly.slice(st).map((val) => val / lead);
    return findPolynomialRoots(normPoly);
  }, [num, den, gainK]);

  // Closed Loop Step Response Simulation
  const stepResponse = useMemo(() => {
    const maxDeg = Math.max(num.length, den.length);
    const alignArr = (arr: number[]) => {
      const out = new Array(maxDeg).fill(0);
      for (let i = 0; i < arr.length; i++) out[maxDeg - arr.length + i] = arr[i];
      return out;
    };

    const dAligned = alignArr(den);
    const nAligned = alignArr(num);

    const numCl = nAligned.map((val) => gainK * val);
    const denCl = dAligned.map((d_val, i) => d_val + gainK * nAligned[i]);

    return simulateLtiStepResponse(numCl, denCl, 1.0, maxTime, 0.01);
  }, [num, den, gainK, maxTime]);

  // Breakaway Points
  const breakawayPoints = useMemo(() => {
    return findBreakawayPoints(num, den);
  }, [num, den]);

  // Formatted asymptote lines for ComplexPlanePlot
  const formattedAsymptotes = useMemo(() => {
    if (!asymptotes) return [];
    return asymptotes.angles.map((rad) => ({
      angleDeg: (rad * 180) / Math.PI,
      centroid: asymptotes.centroid,
    }));
  }, [asymptotes]);

  // Formatted locus branches for ComplexPlanePlot
  const formattedBranches = useMemo(() => {
    return locusTrajectories.map((b) => b.map((pt) => ({ re: pt.re, im: pt.im, k: 0 })));
  }, [locusTrajectories]);

  // Formatted series for StandardStepPlot (including error signal e(t) = r(t) - y(t))
  const stepPlotSeries: PlotSeries[] = useMemo(() => {
    if (!stepResponse || stepResponse.t.length === 0) return [];
    const refData = stepResponse.t.map((tVal) => ({ x: tVal, y: 1.0 }));
    const outData = stepResponse.t.map((tVal, i) => ({ x: tVal, y: stepResponse.y[i] }));
    const errData = stepResponse.t.map((tVal, i) => ({ x: tVal, y: 1.0 - stepResponse.y[i] }));
    return [
      {
        id: "r",
        katexName: "r(t)",
        data: refData,
        color: "#7C3AED", // Violet
        dashArray: "4,4",
        strokeWidth: 1.5,
      },
      {
        id: "y",
        katexName: "y(t)",
        data: outData,
        color: "#2563EB", // Blue
        strokeWidth: 2.5,
      },
      {
        id: "e",
        katexName: "e(t)",
        data: errData,
        color: "#E11D48", // Rose/Red
        dashArray: "4,3",
        strokeWidth: 1.75,
      },
    ];
  }, [stepResponse]);

  // Grouped Closed-Loop Poles with KaTeX formatting
  const formattedGroupedRoots = useMemo(() => {
    const handled = new Set<number>();
    const groups: {
      math: string;
      wn: number;
      zeta: number;
      os: number;
      unstable: boolean;
    }[] = [];

    for (let i = 0; i < currentRoots.length; i++) {
      if (handled.has(i)) continue;
      const r1 = currentRoots[i];
      const wn = Math.sqrt(r1.re ** 2 + r1.im ** 2);
      const zeta = wn === 0 ? 1 : -r1.re / wn;
      const os =
        zeta > 0 && zeta < 1
          ? Math.exp((-zeta * Math.PI) / Math.sqrt(1 - zeta ** 2)) * 100
          : 0;
      const unstable = r1.re > 0;

      // Check for conjugate pair
      let pairIdx = -1;
      if (Math.abs(r1.im) > 1e-5) {
        for (let j = i + 1; j < currentRoots.length; j++) {
          if (!handled.has(j)) {
            const r2 = currentRoots[j];
            if (
              Math.abs(r1.re - r2.re) < 1e-4 &&
              Math.abs(r1.im + r2.im) < 1e-4
            ) {
              pairIdx = j;
              break;
            }
          }
        }
      }

      if (pairIdx !== -1) {
        handled.add(i);
        handled.add(pairIdx);
        const reStr = parseFloat(r1.re.toFixed(3));
        const imStr = parseFloat(Math.abs(r1.im).toFixed(3));
        const sMath =
          reStr === 0
            ? `s_{${i + 1},${pairIdx + 1}} = \\pm \\mathit{j}${imStr}`
            : `s_{${i + 1},${pairIdx + 1}} = ${reStr} \\pm \\mathit{j}${imStr}`;
        groups.push({
          math: sMath,
          wn,
          zeta,
          os,
          unstable,
        });
      } else {
        handled.add(i);
        const reStr = parseFloat(r1.re.toFixed(3));
        const imStr = parseFloat(Math.abs(r1.im).toFixed(3));
        let sMath = `s_{${i + 1}} = ${reStr}`;
        if (Math.abs(r1.im) > 1e-5) {
          const sign = r1.im >= 0 ? "+" : "-";
          sMath = `s_{${i + 1}} = ${reStr} ${sign} \\mathit{j}${imStr}`;
        }
        groups.push({
          math: sMath,
          wn,
          zeta,
          os,
          unstable,
        });
      }
    }
    return groups;
  }, [currentRoots]);

  // Pixel-align the S-Plane plot's bottom edge with the TOP of Step 4, and the
  // Step Response plot's bottom edge with the bottom of the sidebar (Step 6),
  // by measuring actual DOM positions instead of guessing fixed heights.
  useEffect(() => {
    const recompute = () => {
      const isLgUp = window.matchMedia("(min-width: 1024px)").matches;
      const leftCol = leftColRef.current;
      const sidebarCol = sidebarColRef.current;
      if (!isLgUp || !leftCol || !sidebarCol) {
        setPlotHeights(null);
        return;
      }

      const leftColTop = leftCol.getBoundingClientRect().top;
      const sidebarBottom = sidebarCol.getBoundingClientRect().bottom;
      const gapPx = parseFloat(getComputedStyle(leftCol).rowGap || "16") || 16;

      const step4Box = step4BoxRef.current;
      const step4Top = step4Box
        ? step4Box.getBoundingClientRect().top
        : leftColTop + (sidebarBottom - leftColTop) * 0.45;

      const splaneHeight = Math.max(400, Math.round(step4Top - leftColTop));
      const stepRespHeight = Math.max(
        280,
        Math.round(sidebarBottom - leftColTop - splaneHeight - gapPx)
      );

      setPlotHeights((prev) =>
        prev && prev.splane === splaneHeight && prev.stepResp === stepRespHeight
          ? prev
          : { splane: splaneHeight, stepResp: stepRespHeight }
      );
    };

    recompute();
    // Re-measure once more after the browser has settled layout/fonts (KaTeX
    // typesets asynchronously and can change Step 4's box size after paint).
    const raf = requestAnimationFrame(recompute);
    let fontsCancelled = false;
    if (typeof document !== "undefined" && "fonts" in document) {
      document.fonts.ready.then(() => {
        if (!fontsCancelled) recompute();
      });
    }

    const ro = new ResizeObserver(recompute);
    if (leftColRef.current) ro.observe(leftColRef.current);
    if (sidebarColRef.current) ro.observe(sidebarColRef.current);
    if (step4BoxRef.current) ro.observe(step4BoxRef.current);
    window.addEventListener("resize", recompute);

    return () => {
      fontsCancelled = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("resize", recompute);
    };
  }, [openLoopPoles, openLoopZeros, asymptotes, breakawayPoints, imagCrossings]);

  return (
    <div className="space-y-6">
      <TransferFunctionInput onUpdate={setTfData} defaultData={tfData} gainK={gainK} />

      <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column (8 of 12 columns for extra width): */}
        <div ref={leftColRef} className="lg:col-span-8 flex flex-col gap-4">
          {/* S-Plane Plot (Target: Aligns flush with bottom of Step 4) */}
          <div
            className="w-full h-[580px] min-h-[580px]"
            style={plotHeights ? { height: plotHeights.splane, minHeight: plotHeights.splane } : undefined}
          >
            <StandardRootLocusPlot
              poles={openLoopPoles}
              zeros={openLoopZeros}
              locusBranches={formattedBranches}
              currentRoots={currentRoots}
              breakawayPoints={breakawayPoints}
              asymptotes={formattedAsymptotes}
              imagCrossings={imagCrossings}
              gridMode={gridMode}
              onGridModeChange={setGridMode}
              highlightedStep={highlightedStep}
              interactive={true}
              title={t('control.splaneTitle', 'S-Plane Root Locus')}
              className="w-full h-full"
              height="100%"
            />
          </div>

          {/* Closed-Loop Step Response (Target: Spans alongside Steps 5 & 6) */}
          <div
            className="w-full h-[360px] min-h-[360px]"
            style={plotHeights ? { height: plotHeights.stepResp, minHeight: plotHeights.stepResp } : undefined}
          >
            <StandardStepPlot
              title={t('control.closedLoopStepResponse', 'Closed-Loop Step Response')}
              headerRight={
                <div className="flex items-center gap-2">
                  <KatexMath math="t_{max}" className="text-xs font-bold text-slate-500 dark:text-slate-400" />
                  <input
                    type="number"
                    value={maxTime}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      if (!isNaN(val) && val > 0) setMaxTime(val);
                    }}
                    data-math-input="true"
                    style={{ fontFamily: "'KaTeX_Main', 'Times New Roman', serif" }}
                    className="bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-2 py-1 text-slate-800 text-lg tracking-wide dark:text-white w-20 text-right focus:outline-blue-500 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield] m-0"
                  />
                </div>
              }
              series={stepPlotSeries}
              xLabelKatex="t \text{ (s)}"
              yLabelKatex="y(t)"
              steadyStateValue={stepResponse ? stepResponse.y[stepResponse.y.length - 1] : undefined}
              showSteadyState={true}
              className="w-full h-full"
              height="100%"
            />
          </div>
        </div>

        {/* Right Column (4 of 12 columns): */}
        <div ref={sidebarColRef} className="lg:col-span-4 space-y-6">
          {/* Prominent Gain Calibration Card matching PID Studio style */}
          <StudioCard title={t('control.gainCalibration', 'Gain Calibration')}>
            <StudioSlider
              label={<KatexMath math="K =" />}
              min={kMin}
              max={kMax}
              step={(kMax - kMin) / 1000}
              value={gainK}
              onChange={setGainK}
              editableLimits
              onMinChange={(v) => { if (v < kMax) setKMin(v); }}
              onMaxChange={(v) => { if (v > kMin) setKMax(v); }}
              editableValue
              precision={4}
            />
          </StudioCard>

          {/* Analytical Steps Panel */}
          <RootLocusStepsPanel
            openLoopZeros={openLoopZeros}
            openLoopPoles={openLoopPoles}
            asymptotes={asymptotes}
            breakawayPoints={breakawayPoints}
            imagCrossings={imagCrossings}
            step4BoxRef={step4BoxRef}
            onHighlight={handleHighlight}
            highlightedStep={highlightedStep}
          />
        </div>
      </div>

      {/* Bottom Full-Width Metrics Row (1:3 ratio / 1 quadrant for metrics, 3 quadrants for poles) */}
      <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch mt-6">
        {/* RK4 Transient Metrics (1 quadrant = 3 of 12 columns) */}
        <StudioCard
          title={t('control.transientMetrics', 'Transient Metrics')}
          className="lg:col-span-5 w-full flex flex-col justify-between"
        >
          <div className="space-y-3">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100 dark:border-slate-800">
              <span className="text-xs font-bold text-slate-500">
                {t('control.overshoot', 'Overshoot')} (<KatexMath math="\%OS" />)
              </span>
              <span className="text-sm font-bold text-slate-900 dark:text-white">
                <KatexMath math={`${stepResponse?.overshootPercent.toFixed(2)}\\%`} />
              </span>
            </div>
            <div className="flex justify-between items-center pb-2 border-b border-slate-100 dark:border-slate-800">
              <span className="text-xs font-bold text-slate-500">
                {t('control.peakTime', 'Peak Time')} (<KatexMath math="T_p" />)
              </span>
              <span className="text-sm font-bold text-slate-900 dark:text-white">
                <KatexMath math={`${stepResponse?.peakTime.toFixed(3)}\\,\\text{s}`} />
              </span>
            </div>
            <div className="flex justify-between items-center pb-2 border-b border-slate-100 dark:border-slate-800">
              <span className="text-xs font-bold text-slate-500">
                {t('control.settlingTime', 'Settling Time')} (<KatexMath math="T_s" />)
              </span>
              <span className="text-sm font-bold text-slate-900 dark:text-white">
                <KatexMath math={`${stepResponse?.settlingTime.toFixed(3)}\\,\\text{s}`} />
              </span>
            </div>
            <div className="flex justify-between items-center pb-2 border-b border-slate-100 dark:border-slate-800">
              <span className="text-xs font-bold text-slate-500">
                {t('control.riseTime', 'Rise Time')} (<KatexMath math="T_r" />)
              </span>
              <span className="text-sm font-bold text-slate-900 dark:text-white">
                <KatexMath math={`${stepResponse?.riseTime.toFixed(3)}\\,\\text{s}`} />
              </span>
            </div>
            <div className="flex justify-between items-center pb-2 border-b border-slate-100 dark:border-slate-800">
              <span className="text-xs font-bold text-slate-500">
                {t('control.delayTime', 'Delay Time')} (<KatexMath math="T_d" />)
              </span>
              <span className="text-sm font-bold text-slate-900 dark:text-white">
                <KatexMath math={`${stepResponse?.delayTime.toFixed(3)}\\,\\text{s}`} />
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-slate-500">
                {t('control.steadyState', 'Steady State')} (<KatexMath math="y_{ss}" />)
              </span>
              <span className="text-sm font-bold text-slate-900 dark:text-white">
                <KatexMath math={`${(stepResponse?.y[stepResponse.y.length - 1] ?? 0).toFixed(3)}`} />
              </span>
            </div>
          </div>
        </StudioCard>

        {/* Closed-Loop Poles at Gain K (3 quadrants = 9 of 12 columns) */}
        <StudioCard
          title={t('control.closedLoopPoles', 'Closed-Loop Poles')}
          actionSlot={<KatexMath math={`K = ${Number(gainK.toFixed(4))}`} className="text-xs font-bold text-violet-600 dark:text-violet-400" />}
          className="lg:col-span-7 w-full flex flex-col justify-between"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {formattedGroupedRoots.map((group, i) => (
              <InnerBox
                key={i}
                className="text-xs flex flex-col justify-between"
              >
                <div className="text-sm font-semibold text-violet-600 dark:text-violet-400 mb-2 pb-1.5 border-b border-slate-200/50 dark:border-slate-800/60">
                  <KatexMath math={group.math} />
                </div>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <div className="text-slate-600 dark:text-slate-400">
                    <KatexMath math={`\\omega_n = ${group.wn.toFixed(2)}\\,\\text{rad/s}`} />
                  </div>
                  <div className="text-slate-600 dark:text-slate-400">
                    <KatexMath math={`\\zeta = ${group.zeta.toFixed(3)}`} />
                  </div>
                  {group.zeta > 0 && group.zeta < 1 && (
                    <div className="col-span-2 text-blue-600 dark:text-blue-400 font-semibold">
                      <KatexMath math={`\\%OS = ${group.os.toFixed(1)}\\%`} />
                    </div>
                  )}
                  {group.unstable && (
                    <div className="col-span-2 mt-1">
                      <StatusBadge variant="danger">{t('control.unstableRegion', 'Unstable Region')}</StatusBadge>
                    </div>
                  )}
                </div>
              </InnerBox>
            ))}
          </div>
        </StudioCard>
      </div>
    </div>
  );
}
