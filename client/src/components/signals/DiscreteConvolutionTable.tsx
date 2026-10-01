/**
 * MAE Academy / Signals & Systems — Right-Hand Discrete Matrix Analytical Stage.
 * Renders the reverse-diagonal convolution matrix, active index decomposition,
 * and exact summation breakdown matching the canonical academic analytical engine.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { KatexMath } from "@/components/ui/KatexMath";
import {
  StudioCard,
  InnerBox,
  FormulaBox,
  StatusBadge,
} from "@/components/common/templates";
import { useDiscreteConvolution } from "@/components/signals/useDiscreteConvolution";

function parseSequence(source: string): number[] {
  const values = source
    .split(",")
    .map((item) => Number(item.trim()))
    .filter(Number.isFinite);
  return values.length ? values : [0];
}

/** KaTeX-safe number: no "-0", no float noise. Negatives are parenthesised inside products via tp(). */
const tv = (v: number) => { const n = Number(v.toFixed(6)); return n === 0 ? "0" : String(n); };
const tp = (v: number) => (v < 0 ? `\\left(${tv(v)}\\right)` : tv(v));

export type DiscreteConvolutionTableProps = {
  x?: number[];
  h?: number[];
  xSource?: string;
  hSource?: string;
  onXSourceChange?: (val: string) => void;
  onHSourceChange?: (val: string) => void;
  active?: number;
  onActiveChange?: (index: number) => void;
  hideInputs?: boolean;
};

export function DiscreteConvolutionTable({
  x: propX,
  h: propH,
  xSource: controlledX,
  hSource: controlledH,
  onXSourceChange,
  onHSourceChange,
  active: controlledActive,
  onActiveChange,
  hideInputs = false,
}: DiscreteConvolutionTableProps = {}) {
  const { t } = useTranslation('simulators');
  const [internalXSource, setInternalXSource] = useState("1, 2, 1");
  const [internalHSource, setInternalHSource] = useState("1, -1, 2");
  const [internalActive, setInternalActive] = useState(0);

  const xSource = controlledX !== undefined ? controlledX : internalXSource;
  const hSource = controlledH !== undefined ? controlledH : internalHSource;
  const active = controlledActive !== undefined ? controlledActive : internalActive;

  const setActive = (val: number) => {
    if (controlledActive === undefined) setInternalActive(val);
    onActiveChange?.(val);
  };
  const setXSource = (val: string) => {
    if (controlledX === undefined) setInternalXSource(val);
    onXSourceChange?.(val);
    setActive(0);
  };
  const setHSource = (val: string) => {
    if (controlledH === undefined) setInternalHSource(val);
    onHSourceChange?.(val);
    setActive(0);
  };

  const x = useMemo(() => (propX ? propX : parseSequence(xSource)), [propX, xSource]);
  const h = useMemo(() => (propH ? propH : parseSequence(hSource)), [propH, hSource]);

  const result = useDiscreteConvolution(x, h);
  const maxN = Math.max(0, result.values.length - 1);
  const index = Math.max(0, Math.min(active, maxN));
  const contributions = result.contributions[index] ?? [];

  // Active mathematical term pairs for current shift n
  const activePairs = useMemo(() => {
    const pairs: Array<{ k: number; hIdx: number; xVal: number; hVal: number; prod: number }> = [];
    x.forEach((xVal, xIdx) => {
      const hIdx = index - xIdx;
      if (hIdx >= 0 && hIdx < h.length) {
        pairs.push({
          k: xIdx,
          hIdx,
          xVal,
          hVal: h[hIdx],
          prod: xVal * h[hIdx],
        });
      }
    });
    return pairs;
  }, [x, h, index]);

  const formulaExpansion = useMemo(() => {
    const total = tv(result.values[index] ?? 0);
    if (!activePairs.length) return `y[${index}] = 0`;
    const terms = activePairs.map((p) => `x[${p.k}]h[${p.hIdx}]`).join(" + ");
    const numTerms = activePairs.map((p) => `${tp(p.xVal)}${tp(p.hVal)}`).join(" + ");
    const evalTerms = activePairs.map((p) => tp(p.prod)).join(" + ");
    return `y[${index}] = ${terms} = ${numTerms} = ${evalTerms} = ${total}`;
  }, [activePairs, index, result.values]);

  return (
    <div className="space-y-4">
      {!hideInputs && (
        <InnerBox className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-bold text-slate-600 dark:text-slate-300">
            <span className="flex items-center gap-1.5 mb-1"><KatexMath math="x[n]" /> samples</span>
            <input
              value={xSource}
              onChange={(event) => setXSource(event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-900 outline-none focus:border-blue-500 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
            />
            <div className="mt-1.5 flex items-center justify-between gap-1.5 rounded-lg border border-slate-200/70 bg-slate-50/70 px-2 py-0.5 text-xs dark:border-slate-800 dark:bg-slate-900/60 font-serif">
              <KatexMath math={`x[n] = \\{${x.map(tv).join(",\\; ")}\\}`} />
              {x.length === 1 && x[0] === 1 && (
                <span className="text-[11px] font-sans text-blue-600 dark:text-blue-400 font-medium">
                  (<KatexMath math="x[n] = \delta[n]" />)
                </span>
              )}
            </div>
          </label>
          <label className="text-xs font-bold text-slate-600 dark:text-slate-300">
            <span className="flex items-center gap-1.5 mb-1"><KatexMath math="h[n]" /> samples</span>
            <input
              value={hSource}
              onChange={(event) => setHSource(event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-900 outline-none focus:border-blue-500 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
            />
            <div className="mt-1.5 flex items-center justify-between gap-1.5 rounded-lg border border-slate-200/70 bg-slate-50/70 px-2 py-0.5 text-xs dark:border-slate-800 dark:bg-slate-900/60 font-serif">
              <KatexMath math={`h[n] = \\{${h.map(tv).join(",\\; ")}\\}`} />
              {h.length === 1 && h[0] === 1 && (
                <span className="text-[11px] font-sans text-rose-600 dark:text-rose-400 font-medium">
                  (<KatexMath math="h[n] = \delta[n]" />)
                </span>
              )}
            </div>
          </label>
        </InnerBox>
      )}

      <StudioCard>
        <div className="flex items-center justify-between border-b border-slate-100 pb-2 dark:border-slate-800">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-white">
            {t('signals.discreteConvolutionMatrix', 'Discrete convolution matrix')}
          </h3>
          <span className="font-serif text-xs font-bold text-purple-600 dark:text-purple-400">
            <KatexMath math={`y[${index}] = ${tv(result.values[index] ?? 0)}`} />
          </span>
        </div>

        <div className="mt-3 space-y-3">
          {/* Phase Badge & Step Navigation */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <StatusBadge variant="info">
              {t('signals.stepReverseDiagonal', 'Step n = {{index}} / {{maxN}} · Reverse diagonal', { index, maxN })}
            </StatusBadge>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setActive(Math.max(0, index - 1))}
                disabled={index <= 0}
                className="rounded-lg border border-slate-200 px-2.5 py-1 font-['Poppins',sans-serif] font-medium text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-30 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800 transition cursor-pointer"
                title="Previous step"
              >
                &larr; {t('signals.prevStep', 'Prev')}
              </button>
              <button
                type="button"
                onClick={() => setActive(Math.min(maxN, index + 1))}
                disabled={index >= maxN}
                className="rounded-lg border border-slate-200 px-2.5 py-1 font-['Poppins',sans-serif] font-medium text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-30 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800 transition cursor-pointer"
                title="Next step"
              >
                {t('signals.nextStep', 'Next')} &rarr;
              </button>
            </div>
          </div>

          {/* Active Mathematical Formula Breakdown */}
          <FormulaBox className="flex-col gap-1.5 text-xs">
            <div className="font-serif text-[11px] text-slate-500 dark:text-slate-400">
              <KatexMath math={`y[n] = \\sum_{k=-\\infty}^{\\infty} x[k]h[n-k]`} />
            </div>
            <div className="overflow-x-auto font-serif text-[11px] font-semibold text-slate-900 dark:text-white">
              <KatexMath math={formulaExpansion} />
            </div>
          </FormulaBox>

          {/* Convolution Matrix Table */}
          <InnerBox className="p-2 sm:p-3 overflow-hidden">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.17em] text-slate-500 dark:text-slate-400">
              {t('signals.matrixProductGrid', 'Matrix product grid (k × j)')}
            </p>
            <div className="overflow-x-auto pb-1">
              <table className="border-collapse text-center text-xs mx-auto">
                <thead>
                  <tr>
                    <th className="w-12 h-10 min-w-12 max-w-12 border border-slate-200 bg-slate-100/90 p-0 text-center font-serif text-xs font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-900/90 dark:text-slate-400">
                      <div className="flex h-full w-full items-center justify-center">
                        <KatexMath math="x[k]" />
                      </div>
                    </th>
                    {h.map((hVal, hIndex) => (
                      <th
                        key={hIndex}
                        className="w-12 h-10 min-w-12 max-w-12 border border-slate-200 bg-slate-100/90 p-0 font-serif text-xs font-semibold text-rose-600 dark:border-slate-800 dark:bg-slate-900/90 dark:text-rose-400"
                        title={`h[${hIndex}] = ${tv(hVal)}`}
                      >
                        <div className="flex flex-col h-full w-full items-center justify-center leading-tight">
                          <span className="text-[9px] font-sans font-normal text-slate-400 dark:text-slate-500">
                            <KatexMath math={`h[${hIndex}]`} />
                          </span>
                          <KatexMath math={tv(hVal)} />
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {x.map((xVal, xIndex) => (
                    <tr key={xIndex}>
                      <th
                        className="w-12 h-10 min-w-12 max-w-12 border border-slate-200 bg-slate-100/90 p-0 font-serif text-xs font-semibold text-blue-600 dark:border-slate-800 dark:bg-slate-900/90 dark:text-blue-400"
                        title={`x[${xIndex}] = ${tv(xVal)}`}
                      >
                        <div className="flex flex-col h-full w-full items-center justify-center leading-tight">
                          <span className="text-[9px] font-sans font-normal text-slate-400 dark:text-slate-500">
                            <KatexMath math={`x[${xIndex}]`} />
                          </span>
                          <KatexMath math={tv(xVal)} />
                        </div>
                      </th>
                      {h.map((hVal, hIndex) => {
                        const isActive = xIndex + hIndex === index;
                        const cellVal = xVal * hVal;
                        return (
                          <td
                            key={hIndex}
                            onClick={() => setActive(xIndex + hIndex)}
                            className={`w-12 h-10 min-w-12 max-w-12 p-0 border transition-colors cursor-pointer text-center font-serif text-xs ${
                              isActive
                                ? "bg-purple-500/15 border-purple-400/50 text-purple-950 dark:text-purple-200 font-bold ring-1 ring-purple-400/40"
                                : "border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900/50"
                            }`}
                            title={`Click to set shift n = ${xIndex + hIndex}`}
                          >
                            <div className="flex h-full w-full items-center justify-center">
                              <span className={isActive ? "inline-block rounded border border-purple-400/30 bg-purple-500/15 px-1.5 py-0.5" : "inline-block"}>
                                <KatexMath math={tv(cellVal)} />
                              </span>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 flex items-center flex-wrap gap-1">
              <span>{t('signals.highlightedDiagonal', 'Highlighted diagonal:')}</span>
              <KatexMath
                math={`${
                  contributions.length
                    ? contributions.map((c) => tv(c.value)).join(" + ")
                    : "0"
                } = ${tv(result.values[index] ?? 0)}`}
              />
            </p>
          </InnerBox>

          {/* Active Indices Pill List */}
          {activePairs.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-slate-500 dark:text-slate-400">
                {t('signals.contributingSamples', 'Contributing samples (k, n−k)')}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {activePairs.map((p, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300"
                  >
                    <KatexMath math={`x[${p.k}] = ${tv(p.xVal)}`} className="text-blue-600 dark:text-blue-400" />
                    <span>&times;</span>
                    <KatexMath math={`h[${p.hIdx}] = ${tv(p.hVal)}`} className="text-rose-600 dark:text-rose-400" />
                    <span>=</span>
                    <KatexMath math={tv(p.prod)} className="font-semibold text-purple-600 dark:text-purple-400" />
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Bottom Readout Pill */}
          <div className="flex items-baseline justify-between rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2 text-xs dark:border-slate-800 dark:bg-slate-900/40">
            <KatexMath math={`n = ${index}`} className="text-slate-500 dark:text-slate-400" />
            <KatexMath math={`y[${index}] = ${tv(result.values[index] ?? 0)}`} className="font-semibold text-purple-600 dark:text-purple-400" />
          </div>
        </div>
      </StudioCard>
    </div>
  );
}

export default DiscreteConvolutionTable;
