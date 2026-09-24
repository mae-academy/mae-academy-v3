import * as React from "react";
import { KatexMath } from "../ui/KatexMath";
import { Complex } from "@/features/control/controlMath";
import { StudioCard, InnerBox, GradientButton } from "@/components/common/templates";

interface RootLocusStepsPanelProps {
    openLoopZeros: Complex[];
    openLoopPoles: Complex[];
    asymptotes: { centroid: number; angles: number[] } | null;
    breakawayPoints: number[];
    imagCrossings: { k: number; omega: number }[];
    onHighlight: (step: string) => void;
    highlightedStep?: string | null;
    /** Attached to Step 4's container so the parent can measure its top edge for plot-height alignment. */
    step4BoxRef?: React.RefObject<HTMLDivElement | null>;
}

export function RootLocusStepsPanel({
    openLoopZeros,
    openLoopPoles,
    asymptotes,
    breakawayPoints,
    imagCrossings,
    onHighlight,
    highlightedStep,
    step4BoxRef,
}: RootLocusStepsPanelProps) {
    const formatSet = (roots: Complex[]) => {
        if (roots.length === 0) return "\\emptyset";
        return "\\{" + roots.map(r => {
            if (Math.abs(r.im) < 1e-10) return `${parseFloat(r.re.toFixed(4))}`;
            const sign = r.im < 0 ? "-" : "+";
            return `${parseFloat(r.re.toFixed(4))} ${sign} j${parseFloat(Math.abs(r.im).toFixed(4))}`;
        }).join(", ") + "\\}";
    };

    const pStr = formatSet(openLoopPoles);
    const zStr = formatSet(openLoopZeros);
    const i = Math.abs(openLoopPoles.length - openLoopZeros.length);

    const renderShowButton = (stepKey: string) => {
        return (
            <GradientButton
                size="sm"
                onClick={() => onHighlight(stepKey)}
                className="py-0.5 px-3 text-xs"
            >
                Show
            </GradientButton>
        );
    };

    return (
        <StudioCard title="Root Locus Analytical Steps">
            <div className="space-y-6 text-sm text-slate-700 dark:text-slate-300">

                {/* Step 1 */}
                <div>
                    <div className="flex items-center justify-between mb-2">
                        <div className="font-bold text-slate-900 dark:text-white">Step 1: Poles and Zeros</div>
                        {renderShowButton("poles_zeros")}
                    </div>
                    <p className="mb-2">Identify the finite open-loop poles and zeros.</p>
                    <InnerBox>
                        <KatexMath math={`\\#p = ${openLoopPoles.length}`} displayMode={true} />
                        <KatexMath math={`\\#z = ${openLoopZeros.length}`} displayMode={true} />
                        <KatexMath math={`p = ${pStr}`} displayMode={true} />
                        <KatexMath math={`z = ${zStr}`} displayMode={true} />
                    </InnerBox>
                </div>

                {/* Step 2 */}
                <div>
                    <div className="flex items-center justify-between mb-2">
                        <div className="font-bold text-slate-900 dark:text-white">Step 2: Real Axis Segments</div>
                        {renderShowButton("real_axis")}
                    </div>
                    <p className="mb-2">
                        The root locus exists on the real axis to the left of an odd number of total real poles and zeros.
                        This satisfies the angle condition <KatexMath math={`\\sum \\angle(s-z_i) - \\sum \\angle(s-p_j) = (2k+1)180^\\circ`} />.
                    </p>
                    <InnerBox>
                        <div className="text-xs text-slate-600 dark:text-slate-400">
                            Odd count condition applies to all real poles & zeros from right to left along <KatexMath math="\sigma" />.
                        </div>
                    </InnerBox>
                </div>

                {/* Step 3 */}
                <div>
                    <div className="font-bold text-slate-900 dark:text-white mb-2">Step 3: Infinite Roots</div>
                    <p className="mb-2">Count the branches that go to infinity.</p>
                    <InnerBox>
                        <KatexMath math={`i = |\\#p - \\#z| = |${openLoopPoles.length} - ${openLoopZeros.length}| = ${i}`} displayMode={true} />
                    </InnerBox>
                </div>

                {/* Step 4 */}
                <div ref={step4BoxRef}>
                    <div className="flex items-center justify-between mb-2">
                        <div className="font-bold text-slate-900 dark:text-white">Step 4: Asymptotes</div>
                        {i > 0 && asymptotes && renderShowButton("asymptotes")}
                    </div>
                    {i > 0 && asymptotes ? (
                        <>
                            <div className="mb-2">Calculate the centroid <KatexMath math="\sigma_a" /> and angles <KatexMath math="\psi" />.</div>
                            <InnerBox>
                                <KatexMath math={`\\sigma_a = \\frac{\\sum p - \\sum z}{i} = ${parseFloat(asymptotes.centroid.toFixed(4))}`} displayMode={true} />
                                <div className="mt-2 text-center text-slate-500 text-xs">Angles (Degrees)</div>
                                <KatexMath math={`\\psi = \\{${asymptotes.angles.map(a => (a * 180 / Math.PI).toFixed(1) + "^\\circ").join(", ")}\\}`} displayMode={true} />
                            </InnerBox>
                        </>
                    ) : (
                        <div className="italic text-slate-500">No asymptotes exist since <KatexMath math="i = 0" />.</div>
                    )}
                </div>

                {/* Step 5 */}
                <div>
                    <div className="flex items-center justify-between mb-2">
                        <div className="font-bold text-slate-900 dark:text-white">Step 5: Breakaway/Break-in Points</div>
                        {breakawayPoints.length > 0 && renderShowButton("breakaway")}
                    </div>
                    <div className="mb-2">Solve <KatexMath math="\frac{dK}{ds} = 0 \implies D'(s)N(s) - D(s)N'(s) = 0" /> for real roots on the locus.</div>
                    <InnerBox>
                        {breakawayPoints.length > 0 ? (
                            <KatexMath math={`s_{break} = \\{${breakawayPoints.map(p => parseFloat(p.toFixed(4))).join(", ")}\\}`} displayMode={true} />
                        ) : (
                            <div className="text-center font-mono text-slate-500">None detected</div>
                        )}
                    </InnerBox>
                </div>

                {/* Step 6 */}
                <div>
                    <div className="flex items-center justify-between mb-2">
                        <div className="font-bold text-slate-900 dark:text-white">Step 6: Imaginary Axis Crossing</div>
                        {imagCrossings.length > 0 && renderShowButton("imag_crossings")}
                    </div>
                    <p className="mb-2">Found via Routh-Hurwitz array zero-row criteria and auxiliary polynomial roots.</p>
                    <InnerBox>
                        {imagCrossings.length > 0 ? (
                            <div className="space-y-2">
                                {imagCrossings.map((c, idx) => (
                                    <KatexMath key={idx} math={`s = \\pm j${c.omega.toFixed(3)} \\text{ at } K_{crit} = ${c.k.toFixed(3)}`} displayMode={true} />
                                ))}
                            </div>
                        ) : (
                            <div className="text-center font-mono text-slate-500">No stability boundary crossed</div>
                        )}
                    </InnerBox>
                </div>

            </div>
        </StudioCard>
    );
}
