import { useLayoutEffect, useRef, useState } from "react";

/** Live pixel size of an element (layout-effect measured, ResizeObserver + window resize), so SVG maths never runs on a stale width. */
export function useElementSize<T extends HTMLElement>(initial: { width: number; height: number }) {
  const ref = useRef<T>(null);
  const [size, setSize] = useState(initial);
  useLayoutEffect(() => {
    const element = ref.current; if (!element) return;
    const update = () => {
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      setSize((previous) => (Math.abs(previous.width - rect.width) < 0.5 && Math.abs(previous.height - rect.height) < 0.5 ? previous : { width: rect.width, height: rect.height }));
    };
    update();
    const observer = new ResizeObserver(update); observer.observe(element);
    window.addEventListener("resize", update);
    return () => { observer.disconnect(); window.removeEventListener("resize", update); };
  }, []);
  return [ref, size] as const;
}
