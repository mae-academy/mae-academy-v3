/**
 * Pseudo3DCanvas — reusable 2.5D Canvas 2D stage (no WebGL): drag-to-orbit with momentum, wheel
 * zoom, eased camera presets, continuous auto-fit, and an absolutely positioned DOM/KaTeX overlay
 * layer whose children are placed each frame via `placeOverlay` + `frame.project`.
 */
import { forwardRef, useEffect, useImperativeHandle } from "react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { CameraAngles, FitTarget, CameraPresetId, ProjectionFn } from "./projection";
import { usePseudo3D, type Pseudo3DDraw, type Pseudo3DFrame, type Pseudo3DHandle } from "./usePseudo3D";

export interface Pseudo3DCanvasProps {
  /** Auto-scale fit target: a world bounding box or a hull point cloud (include axes and label anchors). */
  bounds: FitTarget;
  /** Line/trace renderer, called after the background and optional surface mesh. */
  render: Pseudo3DDraw;
  /** Optional surface pass (e.g. |H(s)| mesh with poles/zeros) drawn beneath `render`; `frame` exposes the allocation-free projector. */
  renderSurfaceMesh?: (ctx: CanvasRenderingContext2D, project: ProjectionFn, frame: Pseudo3DFrame) => void;
  initialCamera?: CameraAngles | CameraPresetId;
  padding?: number;
  /** Max scaleX/scaleY ratio of the auto-fit; 1 keeps true geometric aspect (e.g. pole-zero maps). */
  maxAspect?: number;
  onHover?: (point: { x: number; y: number } | null) => void;
  onCameraDetached?: () => void;
  background?: { light: string; dark: string };
  height?: number | string;
  className?: string;
  canvasClassName?: string;
  ariaLabel: string;
  /** DOM overlay (KaTeX billboards, tooltips); pointer-events are disabled on the layer. */
  children?: ReactNode;
}

const DEFAULT_BACKGROUND = { light: "#f8fafc", dark: "#07101e" };

export const Pseudo3DCanvas = forwardRef<Pseudo3DHandle, Pseudo3DCanvasProps>(function Pseudo3DCanvas(
  {
    bounds,
    render,
    renderSurfaceMesh,
    initialCamera,
    padding,
    maxAspect,
    onHover,
    onCameraDetached,
    background = DEFAULT_BACKGROUND,
    height = 460,
    className,
    canvasClassName,
    ariaLabel,
    children,
  },
  ref,
) {
  const { canvasRef, handle, pointerHandlers } = usePseudo3D({
    bounds,
    initialCamera,
    padding,
    maxAspect,
    onHover,
    onCameraDetached,
    draw: (frame) => {
      const { ctx, width, height: h, dark } = frame;
      ctx.fillStyle = dark ? background.dark : background.light;
      ctx.fillRect(0, 0, width, h);
      renderSurfaceMesh?.(ctx, frame.project, frame);
      return render(frame);
    },
  });

  useImperativeHandle(ref, () => handle, [handle]);

  // Any prop change (data, bounds, renderer) repaints once; animation loops are driven by `render`'s return value.
  useEffect(() => {
    handle.invalidate();
  }, [bounds, render, renderSurfaceMesh, handle]);

  return (
    <div className={cn("relative w-full overflow-hidden", className)} style={{ height }}>
      <canvas
        ref={canvasRef}
        {...pointerHandlers}
        className={cn("block h-full w-full touch-none cursor-grab active:cursor-grabbing", canvasClassName)}
        role="img"
        aria-label={ariaLabel}
      />
      <div className="pointer-events-none absolute inset-0">{children}</div>
    </div>
  );
});

export default Pseudo3DCanvas;
