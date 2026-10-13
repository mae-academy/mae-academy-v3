import { Fragment } from "react";
import { KatexMath } from "@/components/ui/KatexMath";

/** Splits prose into text, inline `$...$` and display `$$...$$` math. Math is always rendered LTR. */
export function RichMathText({ text }: { text: string }) {
  const parts = text.split(/(\$\$[\s\S]+?\$\$|\$[^$]+?\$)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("$$") && part.endsWith("$$") && part.length > 4) {
          return (
            <span key={i} dir="ltr" className="my-3 block overflow-x-auto touch-pan-x text-center">
              <KatexMath math={part.slice(2, -2)} displayMode />
            </span>
          );
        }
        if (part.startsWith("$") && part.endsWith("$") && part.length > 2) {
          return (
            <span key={i} dir="ltr" className="inline-block max-w-full align-baseline [unicode-bidi:isolate]">
              <KatexMath math={part.slice(1, -1)} />
            </span>
          );
        }
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </>
  );
}
