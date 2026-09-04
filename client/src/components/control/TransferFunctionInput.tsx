import React, { useState, useMemo } from "react";
import { KatexMath } from "../ui/KatexMath";
import { rootsToPolynomial, parseRootsList, Complex } from "../../lib/controlMath";

export type TfInputMode = "polynomial" | "zpk";

export interface TransferFunctionData {
  mode: TfInputMode;
  numPoly: number[]; // Resulting polynomial (expanded)
  denPoly: number[]; // Resulting polynomial (expanded)
  zpk: {
    k: number;
    z: string;
    p: string;
  };
  polyStr: {
    num: string;
    den: string;
  };
}

interface TransferFunctionInputProps {
  onUpdate: (data: TransferFunctionData) => void;
  defaultData?: Partial<TransferFunctionData>;
  gainK: number;
}

function convolve(a: number[], b: number[]): number[] {
  let result = new Array(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      result[i + j] += a[i] * b[j];
    }
  }
  return result;
}

export function TransferFunctionInput({ onUpdate, defaultData, gainK }: TransferFunctionInputProps) {
  const [mode, setMode] = useState<TfInputMode>(defaultData?.mode || "polynomial");

  // State for Mode A: Polynomial
  const [numStr, setNumStr] = useState(defaultData?.polyStr?.num || "1 2");
  const [denStr, setDenStr] = useState(defaultData?.polyStr?.den || "1 3 2 0");

  // State for Mode B: ZPK
  const [kStr, setKStr] = useState(defaultData?.zpk?.k?.toString() || "1");
  const [zStr, setZStr] = useState(defaultData?.zpk?.z || "-2");
  const [pStr, setPStr] = useState(defaultData?.zpk?.p || "0, -1, -2");

  // Convert ZPK strings to polynomial
  const zpkToPoly = useMemo(() => {
    let k = parseFloat(kStr);
    if (isNaN(k)) k = 1;
    const zeros = parseRootsList(zStr);
    const poles = parseRootsList(pStr);
    
    let num = rootsToPolynomial(zeros);
    let den = rootsToPolynomial(poles);

    // Multiply every element in num by kzpk
    num = num.map(c => c * k);

    return { num, den };
  }, [kStr, zStr, pStr]);

  // Convert poly strings to polynomial arrays
  const polyStrToArrays = useMemo(() => {
    const parse = (str: string) => str.trim().split(/\s+/).map((s) => parseFloat(s)).filter((n) => !isNaN(n));
    const num = parse(numStr);
    const den = parse(denStr);
    return { num: num.length > 0 ? num : [1], den: den.length > 0 ? den : [1] };
  }, [numStr, denStr]);

  const activeNum = mode === "polynomial" ? polyStrToArrays.num : zpkToPoly.num;
  const activeDen = mode === "polynomial" ? polyStrToArrays.den : zpkToPoly.den;

  // Render polynomial nicely to KaTeX
  const polyToKatex = (coeffs: number[], variable = "s") => {
    if (coeffs.length === 0) return "0";
    let str = "";
    const n = coeffs.length - 1;
    for (let i = 0; i <= n; i++) {
      const c = coeffs[i];
      if (Math.abs(c) < 1e-10) continue;
      const power = n - i;
      let term = "";
      if (Math.abs(c) !== 1 || power === 0) {
        term += parseFloat(c.toFixed(4));
      } else if (c === -1) {
        term += "-";
      }
      if (power > 0) {
        term += variable;
        if (power > 1) term += `^{${power}}`;
      }
      if (str && c > 0) {
        str += " + " + term;
      } else if (str && c < 0) {
        str += " - " + term.replace("-", ""); // Avoid double negative
      } else {
        str += term;
      }
    }
    return str || "0";
  };

  const zpkToKatex = () => {
    let k = parseFloat(kStr);
    if (isNaN(k)) k = 1;
    const z = parseRootsList(zStr);
    const p = parseRootsList(pStr);

    const formatRoots = (roots: Complex[]) => {
      if (roots.length === 0) return "1";
      const processed = new Set<number>();
      let outStr = "";

      for (let i = 0; i < roots.length; i++) {
        if (processed.has(i)) continue;
        const r = roots[i];

        if (Math.abs(r.re) < 1e-10 && Math.abs(r.im) < 1e-10) {
          outStr += "s";
          continue;
        }

        if (Math.abs(r.im) > 1e-10) {
          // Look for conjugate
          let conjIdx = -1;
          for (let j = i + 1; j < roots.length; j++) {
            if (!processed.has(j)) {
              if (Math.abs(roots[j].re - r.re) < 1e-5 && Math.abs(roots[j].im + r.im) < 1e-5) {
                conjIdx = j;
                break;
              }
            }
          }

          if (conjIdx !== -1) {
             processed.add(conjIdx);
             const imPart = Math.abs(r.im) === 1 ? "j" : `${Math.abs(r.im)}j`;
             const reStr = r.re < 0 ? `-${Math.abs(r.re)}` : `${Math.abs(r.re)}`;
             if (Math.abs(r.re) < 1e-10) {
                outStr += `(s^2 + ${Math.abs(r.im)**2})`;
             } else {
                outStr += `(s - (${reStr} \\pm ${imPart}))`;
             }
             continue;
          }
        }

        let out = "(s ";
        if (Math.abs(r.im) > 1e-10) {
          const signRe = r.re < 0 ? "+" : "-";
          const signIm = r.im < 0 ? "+" : "-";
          const imPart = Math.abs(r.im) === 1 ? "j" : `${Math.abs(r.im)}j`;
          out += `${signRe} ${Math.abs(r.re)} ${signIm} ${imPart})`;
        } else {
          const signRe = r.re < 0 ? "+" : "-";
          out += `${signRe} ${Math.abs(r.re)})`;
        }
        outStr += out;
      }
      return outStr;
    };

    let numFormat = z.length > 0 ? formatRoots(z) : "";
    if (numFormat === "" && k === 1) numFormat = "1";
    const denFormat = formatRoots(p);
    return `\\frac{${k !== 1 ? k : ""}${numFormat}}{${denFormat}}`;
  };

  const displayK = parseFloat(gainK.toFixed(2));
  const dynamicK = displayK !== 1 ? `${displayK} \\cdot ` : "";

  const renderedMath = mode === "polynomial" 
    ? `G(s) = ${dynamicK} \\frac{${polyToKatex(activeNum)}}{${polyToKatex(activeDen)}}`
    : `G(s) = ${dynamicK} ${zpkToKatex()}`;

  // Notify parent on change
  React.useEffect(() => {
    onUpdate({
      mode,
      numPoly: activeNum,
      denPoly: activeDen,
      zpk: { k: parseFloat(kStr) || 1, z: zStr, p: pStr },
      polyStr: { num: numStr, den: denStr }
    });
  }, [mode, numStr, denStr, kStr, zStr, pStr]);

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200/80 shadow-sm rounded-2xl p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-white">Transfer Function Engine</h3>

        {/* Toggle Mode */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setMode("polynomial")}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium shadow-sm ${mode === "polynomial" ? "bg-gradient-to-r from-blue-600 to-pink-500 text-white" : "border border-slate-200 bg-white text-slate-500 hover:border-blue-400 hover:text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:border-blue-400 dark:hover:text-slate-200"}`}
          >
            Polynomial
          </button>
          <button
            onClick={() => setMode("zpk")}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium shadow-sm ${mode === "zpk" ? "bg-gradient-to-r from-blue-600 to-pink-500 text-white" : "border border-slate-200 bg-white text-slate-500 hover:border-blue-400 hover:text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:border-blue-400 dark:hover:text-slate-200"}`}
          >
            ZPK
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-2">
        {/* Inputs */}
        <div className="space-y-4">
          {mode === "polynomial" ? (
            <>
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1"><KatexMath math="N(s) \text{ coefficients}" /></label>
                <input
                  type="text"
                  value={numStr}
                  onChange={(e) => setNumStr(e.target.value)}
                  className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2 text-sm text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. 1 2"
                />
                <p className="text-[10px] text-slate-400 mt-1">Space-separated from highest to lowest power.</p>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1"><KatexMath math="D(s) \text{ coefficients}" /></label>
                <input
                  type="text"
                  value={denStr}
                  onChange={(e) => setDenStr(e.target.value)}
                  className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2 text-sm text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. 1 3 2 0"
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1"><KatexMath math="\text{DC Gain } (K)" /></label>
                <input
                  type="text"
                  value={kStr}
                  placeholder="1"
                  onChange={(e) => setKStr(e.target.value)}
                  className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2 text-sm text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1"><KatexMath math="\text{Zeros } z_i" /></label>
                <input
                  type="text"
                  value={zStr}
                  onChange={(e) => setZStr(e.target.value)}
                  className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2 text-sm text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. -2, -3+4j"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1"><KatexMath math="\text{Poles } p_i" /></label>
                <input
                  type="text"
                  value={pStr}
                  onChange={(e) => setPStr(e.target.value)}
                  className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2 text-sm text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. 0, -1, -2"
                />
                <p className="text-[10px] text-slate-400 mt-1">Comma-separated roots. Use 'j' for complex conjugate pairs.</p>
              </div>
            </>
          )}
        </div>

        {/* Display */}
        <div className="flex min-h-[180px] items-center justify-center overflow-x-auto rounded-2xl border border-slate-200 bg-white px-4 py-6 dark:border-slate-800 dark:bg-slate-950">
          <KatexMath math={renderedMath} displayMode={true} className="text-xl text-slate-900 dark:text-white" />
        </div>
      </div>
    </div>
  );
}
