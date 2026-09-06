/* MAE Luminous Technical Atelier: math remains a compact readable annotation in the circuit field,
   never a development placeholder competing with the native SVG construction geometry. */
import { KatexMath } from "@/components/ui/KatexMath";

export function V3Math({ math, className }: { math: string; className?: string }) {
  return <KatexMath math={math} className={className} />;
}

export function V3BlockMath({ math, className }: { math: string; className?: string }) {
  return <KatexMath math={math} block className={className} />;
}
