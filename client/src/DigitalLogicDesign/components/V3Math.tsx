import { BlockMath, InlineMath } from "react-katex";
import "katex/dist/katex.min.css";

export function V3Math({ math, className = "" }: { math: string; className?: string }) {
  return <span className={`v3-math ${className}`}><InlineMath math={math} /></span>;
}

export function V3BlockMath({ math, className = "" }: { math: string; className?: string }) {
  return <div className={`v3-block-math ${className}`} role="math"><BlockMath math={math} errorColor="#ef4444" renderError={() => <span role="alert">Mathematical expression unavailable.</span>} /></div>;
}
