/**
 * Every label, result and error on the page goes through KaTeX (the site's own renderer, components/ui/KatexMath).
 * `MathLabel` typesets a LaTeX string; `MathMessage` typesets a sentence with `$…$` formulas in it (the site's MathText).
 * LaTeX that KaTeX cannot parse falls back to cleaned plain text inside KatexMath, so a bad string never breaks a row.
 */
import { KatexMath } from "@/components/ui/KatexMath";
import { splitMath } from "@/components/ai/mathText";

export function MathLabel({ math, block = false, className }: { math: string; block?: boolean; className?: string }) {
  return (
    <span dir="ltr" className={className ? `mc-math ${className}` : "mc-math"}>
      <KatexMath math={math} block={block} />
    </span>
  );
}

/** A sentence with `$…$` formulas: the text keeps the page's direction, every formula is an LTR KaTeX span. */
export function MathMessage({ text }: { text: string }) {
  return (
    <>
      {splitMath(text).map((seg, i) =>
        seg.kind === "text" ? <span key={i}>{seg.text}</span> : <MathLabel key={i} math={seg.math} block={false} />,
      )}
    </>
  );
}
