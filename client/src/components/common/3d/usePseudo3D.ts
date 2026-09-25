/**
 * Camera + render-loop controller for Pseudo3DCanvas. All interactive state lives in refs; the
 * rAF loop only runs while something moves (drag, momentum, tween, auto-fit damping, or a
 * draw callback that asks for another frame), so an idle scene costs zero CPU.
 */
import { useCallback, useEffect, useMemo, useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import {
  clampPitch,
  createProjector,
  dampViewport,
  fitViewport,
  interpolateCamera,
  resolveCamera,
  zoomViewport,
  type FitTarget,
  type CameraAngles,
  type CameraPresetId,
  type ProjectionFn,
  type Projector,
  type Viewport,
} from "./projection";

export interface Pseudo3DFrame extends Projector {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  /** Device pixel ratio of the backing canvas. */
  dpr: number;
  dark: boolean;
  /** rAF timestamp (ms). */
  now: number;
}

/** Return true to request another animation frame (e.g. while a data animation is running). */
export type Pseudo3DDraw = (frame: Pseudo3DFrame) => boolean | void;

export interface Pseudo3DOptions {
  bounds: FitTarget;
  draw: Pseudo3DDraw;
  initialCamera?: CameraAngles | CameraPresetId;
  padding?: number;
  /** Max scaleX/scaleY ratio of the auto-fit (1 = uniform, keeps circles round). */
  maxAspect?: number;
  minZoom?: number;
  maxZoom?: number;
  onHover?: (point: { x: number; y: number } | null) => void;
  /** Called when a user drag detaches the camera from the last preset. */
  onCameraDetached?: () => void;
}

export interface Pseudo3DHandle {
  tweenTo: (target: CameraAngles | CameraPresetId, durationMs?: number) => void;
  resetZoom: () => void;
  invalidate: () => void;
  projectToScreen: ProjectionFn;
  getCamera: () => CameraAngles;
}

const ROTATE_SENSITIVITY = 0.008; // rad per px
const MOMENTUM_DECAY = 0.92; // per 16.7 ms
const MOMENTUM_EPSILON = 2e-5; // rad/ms
const FIT_DAMPING = 0.24; // per 16.7 ms

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function usePseudo3D(options: Pseudo3DOptions) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const camera = useRef<CameraAngles>(resolveCamera(options.initialCamera ?? "isometric"));
  const velocity = useRef({ theta: 0, phi: 0 });
  const drag = useRef<{ x: number; y: number; t: number; pointerId: number } | null>(null);
  const tween = useRef<{ from: CameraAngles; to: CameraAngles; start: number; duration: number } | null>(null);
  const zoom = useRef(1);
  const viewport = useRef<Viewport | null>(null);
  const size = useRef({ width: 0, height: 0, dpr: 1 });
  const frameId = useRef(0);
  const lastNow = useRef(0);
  const snapFit = useRef(true);
  const dark = useRef(false);

  const tick = useCallback((now: number) => {
    frameId.current = 0;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const { width, height, dpr } = size.current;
    if (!canvas || !ctx || width <= 0 || height <= 0) return;
    const dt = lastNow.current ? Math.min(48, Math.max(1, now - lastNow.current)) : 16.7;
    lastNow.current = now;
    const steps = dt / 16.7;
    let active = false;

    const cam = camera.current;
    const tw = tween.current;
    if (tw) {
      const p = tw.duration <= 0 ? 1 : (now - tw.start) / tw.duration;
      const next = interpolateCamera(tw.from, tw.to, p);
      cam.theta = next.theta;
      cam.phi = clampPitch(next.phi);
      if (p >= 1) tween.current = null;
      else active = true;
    } else if (!drag.current) {
      const v = velocity.current;
      if (Math.abs(v.theta) > MOMENTUM_EPSILON || Math.abs(v.phi) > MOMENTUM_EPSILON) {
        cam.theta += v.theta * dt;
        cam.phi = clampPitch(cam.phi + v.phi * dt);
        const decay = Math.pow(MOMENTUM_DECAY, steps);
        v.theta *= decay;
        v.phi *= decay;
        active = true;
      } else {
        v.theta = 0;
        v.phi = 0;
      }
    }

    const opts = optionsRef.current;
    const target = zoomViewport(fitViewport(opts.bounds, cam, width, height, { padding: opts.padding, maxAspect: opts.maxAspect }), zoom.current);
    if (!viewport.current || snapFit.current) {
      viewport.current = target;
      snapFit.current = false;
    } else {
      const damped = dampViewport(viewport.current, target, 1 - Math.pow(1 - FIT_DAMPING, steps));
      viewport.current = damped.viewport;
      if (!damped.settled) active = true;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const projector = createProjector({ theta: cam.theta, phi: cam.phi }, viewport.current, 24);
    const wantsMore = opts.draw({ ...projector, ctx, width, height, dpr, dark: dark.current, now });
    if (wantsMore) active = true;

    if (active) frameId.current = requestAnimationFrame(tick);
    else lastNow.current = 0;
  }, []);

  const invalidate = useCallback(() => {
    if (!frameId.current && typeof requestAnimationFrame === "function") frameId.current = requestAnimationFrame(tick);
  }, [tick]);

  // Canvas sizing (device-pixel exact), theme tracking, native non-passive wheel zoom.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      size.current = { width: rect.width, height: rect.height, dpr };
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      snapFit.current = true;
      invalidate();
    };
    const readTheme = () => {
      dark.current = document.documentElement.classList.contains("dark");
      invalidate();
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const opts = optionsRef.current;
      const factor = Math.exp(-Math.max(-60, Math.min(60, event.deltaY)) * 0.0022);
      zoom.current = Math.max(opts.minZoom ?? 0.5, Math.min(opts.maxZoom ?? 2.6, zoom.current * factor));
      invalidate();
    };
    resize();
    readTheme();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    const themeObserver = new MutationObserver(readTheme);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      resizeObserver.disconnect();
      themeObserver.disconnect();
      canvas.removeEventListener("wheel", onWheel);
      if (frameId.current) cancelAnimationFrame(frameId.current);
      frameId.current = 0;
    };
  }, [invalidate]);

  const localPoint = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, t: event.timeStamp, pointerId: event.pointerId };
    velocity.current = { theta: 0, phi: 0 };
    tween.current = null;
    optionsRef.current.onHover?.(null);
  }, []);

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) {
      if (!current) optionsRef.current.onHover?.(localPoint(event));
      return;
    }
    const dx = event.clientX - current.x;
    const dy = event.clientY - current.y;
    const dt = Math.max(1, event.timeStamp - current.t);
    if (dx === 0 && dy === 0) return;
    const dTheta = dx * ROTATE_SENSITIVITY;
    const dPhi = dy * ROTATE_SENSITIVITY;
    camera.current.theta += dTheta;
    camera.current.phi = clampPitch(camera.current.phi + dPhi);
    // Low-pass the instantaneous angular velocity so the release momentum is smooth.
    velocity.current = {
      theta: velocity.current.theta * 0.6 + (dTheta / dt) * 0.4,
      phi: velocity.current.phi * 0.6 + (dPhi / dt) * 0.4,
    };
    drag.current = { ...current, x: event.clientX, y: event.clientY, t: event.timeStamp };
    optionsRef.current.onCameraDetached?.();
    invalidate();
  }, [invalidate]);

  const endDrag = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    // A pause before release means the user meant to stop: no fling.
    if (event.timeStamp - current.t > 80) velocity.current = { theta: 0, phi: 0 };
    drag.current = null;
    invalidate();
  }, [invalidate]);

  const onPointerLeave = useCallback(() => {
    if (!drag.current) optionsRef.current.onHover?.(null);
  }, []);

  const handle = useMemo<Pseudo3DHandle>(() => ({
    tweenTo: (target, durationMs = 750) => {
      velocity.current = { theta: 0, phi: 0 };
      const to = resolveCamera(target);
      tween.current = { from: { ...camera.current }, to, start: performance.now(), duration: prefersReducedMotion() ? 0 : durationMs };
      invalidate();
    },
    resetZoom: () => {
      zoom.current = 1;
      invalidate();
    },
    invalidate,
    projectToScreen: (x, y, z) => {
      const vp = viewport.current;
      if (!vp) return { x: 0, y: 0, depth: 0, visible: false };
      return createProjector(camera.current, vp).project(x, y, z);
    },
    getCamera: () => ({ ...camera.current }),
  }), [invalidate]);

  return {
    canvasRef,
    handle,
    pointerHandlers: { onPointerDown, onPointerMove, onPointerUp: endDrag, onPointerCancel: endDrag, onPointerLeave },
    isDragging: () => drag.current !== null,
  };
}
