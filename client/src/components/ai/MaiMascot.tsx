import { Lightbulb } from "lucide-react";
import type { MascotState } from "@shared/aiTypes";
import { cn } from "@/lib/utils";

/**
 * "Mai", the MAE AI platform mascot.
 *
 * The art is the official character artwork (see client/public/mascot/*.svg): the four master poses with
 * their chroma-green backgrounds keyed out, cropped to one shared box so the figure doesn't shift when the
 * pose changes. Nothing here draws the character; this component only picks the pose for a state and adds
 * CSS-only effects (glowing bulb, thinking dots, bounce) on top.
 *
 * Controlled by props only (the eureka timing lives in useMascotState). All motion is CSS, transform/opacity
 * only, and switched off under `prefers-reduced-motion` or `animated={false}`; each pose still reads statically.
 */

export interface MaiMascotProps {
  state: MascotState;
  /** 'hero' = full body, large (empty state). 'avatar' = head-and-shoulders crop in a round frame (next to messages). */
  variant?: "hero" | "avatar";
  className?: string;
  /** Accessible name override; default is an English label per state. */
  label?: string;
  stateLabels?: Partial<Record<MascotState, string>>;
  /** false freezes every animation and transition (for older messages in a transcript). Default true. */
  animated?: boolean;
}

type Pose = "idle" | "thinking" | "eureka" | "talking";

const POSES: readonly Pose[] = ["idle", "thinking", "eureka", "talking"];

/** There is no dedicated "listening" artwork: it reuses the idle pose with an attentive tilt (CSS). */
const POSE_FOR_STATE: Record<MascotState, Pose> = {
  idle: "idle",
  listening: "idle",
  thinking: "thinking",
  eureka: "eureka",
  talking: "talking",
};

const DEFAULT_LABELS: Record<MascotState, string> = {
  idle: "Mai, the MAE AI assistant, is ready",
  listening: "Mai is listening",
  thinking: "Mai is thinking",
  eureka: "Mai has an answer",
  talking: "Mai is answering",
};

const poseSrc = (pose: Pose) => `${import.meta.env.BASE_URL}mascot/${pose}.svg`;

/** Pixel size of the exported poses; the avatar window below is expressed in the same units. */
const ART_W = 886;
const ART_H = 1100;
/** Head-and-shoulders square cropped out of the art for the avatar. */
const AVATAR_X = 120;
const AVATAR_Y = 10;
const AVATAR_SIDE = 640;

const CSS = `
.mai-root{display:block;color-scheme:normal}
.mai-pose{transition:opacity .18s ease}
.mai-figure{transform-origin:50% 100%;transition:transform .45s cubic-bezier(.3,1.3,.5,1)}
.mai-root[data-state=idle] .mai-figure{animation:mai-breathe 3.8s ease-in-out infinite}
.mai-root[data-state=listening] .mai-figure{transform:rotate(1.6deg);animation:mai-breathe 3.8s ease-in-out infinite}
.mai-root[data-state=thinking] .mai-figure{animation:mai-think 3.4s ease-in-out infinite}
.mai-root[data-state=talking] .mai-figure{animation:mai-bob .62s ease-in-out infinite}
.mai-root[data-state=eureka] .mai-figure{animation:mai-hop 1.2s ease-out both}
.mai-bulb{animation:mai-pop .55s cubic-bezier(.2,1.6,.4,1) both}
.mai-bulb-glow{animation:mai-glow 1.1s ease-in-out infinite alternate}
.mai-avatar{position:relative;display:inline-block;flex:none;border-radius:9999px;background:#eef2ff;box-shadow:0 0 0 2px var(--mai-ring,#a5b4fc)}
.dark .mai-avatar{background:#e2e8f0}
.mai-avatar[data-state=idle]{--mai-ring:#a5b4fc}
.mai-avatar[data-state=listening]{--mai-ring:#38bdf8}
.mai-avatar[data-state=thinking]{--mai-ring:#8b5cf6}
.mai-avatar[data-state=eureka]{--mai-ring:#fbbf24}
.mai-avatar[data-state=talking]{--mai-ring:#34d399}
@keyframes mai-breathe{0%,100%{translate:0 0}50%{translate:0 -.5%}}
@keyframes mai-bob{0%,100%{translate:0 0;scale:1}50%{translate:0 -1.4%;scale:1.008}}
@keyframes mai-think{0%,100%{rotate:0deg}50%{rotate:-.7deg}}
@keyframes mai-hop{0%{translate:0 0}30%{translate:0 -2.4%}60%{translate:0 0}78%{translate:0 -.8%}100%{translate:0 0}}
@keyframes mai-pop{0%{scale:.2;opacity:0}100%{scale:1;opacity:1}}
@keyframes mai-glow{0%{opacity:.55;transform:scale(.9)}100%{opacity:1;transform:scale(1.12)}}
.mai-static *,.mai-static{animation:none!important;transition:none!important}
@media (prefers-reduced-motion: reduce){.mai-root *,.mai-root{animation:none!important;transition:none!important}}
`;

let stylesInjected = false;
function ensureStyles() {
  if (stylesInjected || typeof document === "undefined") return;
  if (!document.getElementById("mai-mascot-css")) {
    const style = document.createElement("style");
    style.id = "mai-mascot-css";
    style.textContent = CSS;
    document.head.appendChild(style);
  }
  stylesInjected = true;
}

/** Glowing bulb: a crisp amber bulb over a soft radial glow, anchored by its bottom-centre. */
function Bulb({ className }: { className?: string }) {
  return (
    <span className={cn("mai-bulb pointer-events-none absolute", className)} aria-hidden="true">
      <span className="mai-bulb-glow absolute -inset-[70%] rounded-full bg-[radial-gradient(circle,rgba(253,224,71,.85)_0%,rgba(253,224,71,.35)_40%,transparent_70%)]" />
      <Lightbulb
        className="relative size-full fill-yellow-300 text-amber-500 drop-shadow-[0_0_6px_rgba(250,204,21,.9)]"
        strokeWidth={1.75}
      />
    </span>
  );
}

const DOTS = [
  { left: "80%", top: "9%", size: "1.1%", delay: "0s" },
  { left: "86%", top: "3%", size: "1.7%", delay: ".25s" },
  { left: "93%", top: "-4%", size: "2.5%", delay: ".5s" },
] as const;

export function MaiMascot({ state, variant = "hero", className, label, stateLabels, animated = true }: MaiMascotProps) {
  ensureStyles();
  const name = label ?? stateLabels?.[state] ?? DEFAULT_LABELS[state];
  const pose = POSE_FOR_STATE[state];

  if (variant === "avatar") {
    return (
      <span
        role="img"
        aria-label={name}
        data-state={state}
        data-variant="avatar"
        className={cn("mai-root mai-avatar size-10", !animated && "mai-static", className)}
      >
        {/* the image clips to the circle; the bulb sits outside the clip so it can pop above the head */}
        <span className="absolute inset-0 overflow-hidden rounded-full">
          <img
            src={poseSrc(pose)}
            alt=""
            aria-hidden="true"
            draggable={false}
            className="mai-pose absolute max-w-none select-none"
            style={{
              width: `${(ART_W / AVATAR_SIDE) * 100}%`,
              left: `${(-AVATAR_X / AVATAR_SIDE) * 100}%`,
              top: `${(-AVATAR_Y / AVATAR_SIDE) * 100}%`,
            }}
          />
        </span>
        {state === "eureka" && <Bulb className="-end-[22%] -top-[34%] size-[58%]" />}
      </span>
    );
  }

  return (
    <div
      role="img"
      aria-label={name}
      data-state={state}
      data-variant="hero"
      className={cn("mai-root relative w-full", !animated && "mai-static", className)}
    >
      {/* headroom above the head for the bulb / thought dots */}
      <div className="relative" style={{ paddingTop: "13%" }}>
        <div className="relative" style={{ aspectRatio: `${ART_W} / ${ART_H}` }}>
          {/* The artwork has black outlines, so on dark themes it sits on a pale card to stay readable. */}
          <div className="absolute inset-x-[14%] bottom-[1%] top-[5%] hidden rounded-[2.5rem] bg-slate-200/95 dark:block" />
          <div className="absolute inset-x-[24%] -bottom-[0.5%] h-[2.4%] rounded-full bg-slate-900/15 blur-[2px]" />
          <div className="mai-figure absolute inset-0">
            {/* All four poses stay mounted (and preloaded); the active one is shown, so swaps never flash. */}
            {POSES.map((p) => (
              <img
                key={p}
                src={poseSrc(p)}
                alt=""
                aria-hidden="true"
                draggable={false}
                className={cn("mai-pose absolute inset-0 h-full w-full select-none object-contain", p === pose ? "opacity-100" : "opacity-0")}
              />
            ))}
          </div>
          {state === "eureka" && <Bulb className="bottom-[96%] left-[49%] aspect-square w-[12%] -translate-x-1/2" />}
          {state === "thinking" &&
            DOTS.map((dot, i) => (
              <span
                key={i}
                className="mai-dot animate-pulse absolute aspect-square rounded-full bg-violet-500/80 dark:bg-violet-400"
                style={{ left: dot.left, top: dot.top, width: dot.size, animationDelay: dot.delay }}
              />
            ))}
        </div>
      </div>
    </div>
  );
}

export default MaiMascot;
