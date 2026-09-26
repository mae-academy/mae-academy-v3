import { createContext, useContext, useState, type CSSProperties, type ReactNode, type Ref, type SVGProps } from 'react';

/**
 * An SVG whose box is locked to its viewBox aspect ratio, with a sibling overlay for HTML labels.
 *
 * Why: KaTeX labels are HTML. Inside an SVG `<foreignObject>` their scale and offset depend on how the
 * engine maps the viewBox, and WebKit gets that wrong as soon as the SVG is letterboxed (a height cap
 * with `preserveAspectRatio` meet), so labels drift away from their terminals at other viewports.
 * Here the wrapper itself has the viewBox aspect ratio and a width that already respects the height cap,
 * so the SVG fills it exactly - there is nothing to letterbox - and every label is placed in percent of
 * that same box, with its font size in container-query units of the same width. One coordinate system,
 * no drift at any viewport.
 */

interface LabelLayer {
  readonly layer: HTMLElement | null;
  readonly width: number;
  readonly height: number;
}

const LabelLayerContext = createContext<LabelLayer | null>(null);

export const useLabelLayer = (): LabelLayer | null => useContext(LabelLayerContext);

export interface LabelCanvasProps extends Omit<SVGProps<SVGSVGElement>, 'viewBox' | 'width' | 'height' | 'ref' | 'className'> {
  readonly width: number;
  readonly height: number;
  /** Height cap as a CSS length (`78vh`, `420px`); the wrapper's width is reduced to honour it. */
  readonly maxHeight: string;
  /** Applied to the wrapper (custom properties set here reach both the SVG and the labels). */
  readonly className?: string;
  readonly svgClassName?: string;
  readonly wrapperRef?: Ref<HTMLDivElement>;
  readonly children: ReactNode;
}

export function LabelCanvas({ width, height, maxHeight, className = '', svgClassName = '', wrapperRef, children, ...svgProps }: LabelCanvasProps) {
  const [layer, setLayer] = useState<HTMLDivElement | null>(null);
  const style: CSSProperties = {
    aspectRatio: `${width} / ${height}`,
    width: `min(100%, calc(${maxHeight} * ${width / height}))`,
    containerType: 'inline-size',
  };
  return (
    <div ref={wrapperRef} data-label-canvas="true" className={`relative mx-auto ${className}`} style={style}>
      <LabelLayerContext.Provider value={{ layer, width, height }}>
        <svg {...svgProps} viewBox={`0 0 ${width} ${height}`} className={`absolute inset-0 block h-full w-full ${svgClassName}`}>
          {children}
        </svg>
      </LabelLayerContext.Provider>
      <div ref={setLayer} aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-visible" />
    </div>
  );
}
