import { createPortal } from 'react-dom';
import { KatexMath } from '@/components/ui/KatexMath';
import { useLabelLayer } from './LabelCanvas';

/** `I1` -> `I_{1}`, `L+` -> `L{+}`: port names are typeset as math, like every other variable on the platform. */
export function toMath(name: string): string {
  const indexed = /^([A-Za-z]+)(\d+)$/.exec(name);
  // The phantom subscript on the left balances the real one, so the base letter sits on the terminal axis.
  if (indexed) return `\\phantom{_{${indexed[2]}}}${indexed[1]}_{${indexed[2]}}`;
  return name.replace(/\+/g, '{+}');
}

export interface PortLabelProps {
  readonly x: number;
  /** Vertical centre. */
  readonly y: number;
  readonly name: string;
  readonly anchor?: 'start' | 'middle' | 'end';
  readonly className?: string;
  readonly size?: number;
  /** The terminal this label names (user units); checked at runtime by `usePortLabelAudit`. */
  readonly target?: readonly [number, number];
}

const BOX_W = 44;
const BOX_H = 18;

/** Port designation typeset by KaTeX: in a LabelCanvas overlay, or (outside one) inside an SVG <foreignObject>. */
export function PortLabel({ x, y, name, anchor = 'middle', className = 'text-slate-700 dark:text-slate-300', size = 11, target }: PortLabelProps) {
  const canvas = useLabelLayer();
  const targetAttr = target ? `${target[0]},${target[1]}` : undefined;
  if (canvas) {
    // Inside a LabelCanvas: percent of the aspect-locked wrapper and a container-width font size, i.e. the
    // very same scale as the SVG at every viewport. No foreignObject, so nothing for an engine to mis-scale.
    if (!canvas.layer) return null;
    const shift = anchor === 'end' ? '-100%, -50%' : anchor === 'start' ? '0, -50%' : '-50%, -50%';
    return createPortal(
      <div
        data-port={name}
        data-label-id={name}
        data-target={targetAttr}
        className={`absolute whitespace-nowrap font-semibold leading-none ${className}`}
        style={{ left: `${(x / canvas.width) * 100}%`, top: `${(y / canvas.height) * 100}%`, transform: `translate(${shift})`, fontSize: `${(size / canvas.width) * 100}cqw` }}
      >
        <KatexMath math={toMath(name)} />
      </div>,
      canvas.layer,
    );
  }
  const left = anchor === 'end' ? x - BOX_W : anchor === 'start' ? x : x - BOX_W / 2;
  const justify = anchor === 'end' ? 'flex-end' : anchor === 'start' ? 'flex-start' : 'center';
  return (
    <foreignObject x={left} y={y - BOX_H / 2} width={BOX_W} height={BOX_H} pointerEvents="none" overflow="visible" data-port={name} data-label-id={name} data-target={targetAttr}>
      <div className={`flex h-full items-center font-semibold leading-none ${className}`} style={{ justifyContent: justify, fontSize: size }}>
        <KatexMath math={toMath(name)} />
      </div>
    </foreignObject>
  );
}
