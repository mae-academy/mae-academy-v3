import { useId } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Lightbulb, Maximize2, Minimize2 } from "lucide-react";
import type { MascotState } from "@shared/aiTypes";
import { cn } from "@/lib/utils";

export interface MascotVisualizerProps {
  /** Which pose to show. Drive it with `useMascotState().state`. */
  state: MascotState;
  /** Collapsed face-only avatar (~56px, state-colored ring). Controlled: the parent owns/persists it. Default false. */
  minimized?: boolean;
  /** When provided, a toggle button is shown (expanded view) and the compact avatar becomes a button (minimized view). */
  onToggleMinimized?: () => void;
  /** Extra classes for the root. Expanded: fills the parent width up to 260px. Minimized: a 56px square; position it (e.g. `fixed bottom-4 end-4`) from here. */
  className?: string;
  /** Speech-badge text, shown only in the expanded idle view. Default: "Ready to analyze circuits & signals!" (pass the translated string). */
  greeting?: string;
  /** Overrides the accessible name of the image for every state (otherwise `stateLabels[state]`). */
  label?: string;
  /** Per-state accessible names (i18n). Missing keys fall back to the English defaults. */
  stateLabels?: Partial<Record<MascotState, string>>;
  /** Accessible name of the minimize/expand button (constant; `aria-pressed` carries the state). Default "Minimize assistant mascot". */
  toggleLabel?: string;
}

const DEFAULT_GREETING = "Ready to analyze circuits & signals!";
const DEFAULT_STATE_LABELS: Record<MascotState, string> = {
  idle: "Mai, the MAE AI assistant, is ready",
  listening: "Mai is listening",
  thinking: "Mai is thinking",
  eureka: "Mai has an answer",
  talking: "Mai is answering",
};

/** Ring + status dot colors of the compact avatar, so the state stays readable when minimized. */
const RING: Record<MascotState, string> = {
  idle: "ring-indigo-300 dark:ring-indigo-400/50",
  listening: "ring-sky-400 dark:ring-sky-400/80",
  thinking: "ring-violet-500 dark:ring-violet-400",
  eureka: "ring-amber-400",
  talking: "ring-emerald-400 dark:ring-emerald-400/80",
};
const DOT: Record<MascotState, string> = {
  idle: "bg-indigo-400",
  listening: "bg-sky-400",
  thinking: "bg-violet-500",
  eureka: "bg-amber-400",
  talking: "bg-emerald-400",
};
const PULSE: Partial<Record<MascotState, string>> = {
  listening: "border-sky-400",
  thinking: "border-violet-500 dark:border-violet-400",
};

/**
 * All keyframes are scoped by the `mai-` prefix and only touch transform/opacity. Pivots use
 * `transform-box: fill-box` (own centre) or `view-box` with explicit user-unit origins (neck).
 * Reduced motion: every animation/transition is removed; each state keeps a distinct static pose.
 */
const CSS = `
.mai-fb{transform-box:fill-box;transform-origin:center}
.mai-head{transform-box:view-box;transform-origin:100px 150px;transition:transform .45s cubic-bezier(.3,1.3,.5,1)}
.mai-root[data-state=listening] .mai-head{transform:rotate(7deg)}
.mai-root[data-state=thinking] .mai-head{transform:rotate(-4deg) translateY(1px)}
.mai-root[data-state=eureka] .mai-head{transform:translateY(-2px)}
.mai-eye{transition:transform .3s ease}
.mai-root[data-state=listening] .mai-eye{transform:scale(1.16)}
.mai-root[data-state=eureka] .mai-eye{transform:scale(1.22)}
.mai-pupil{transition:transform .35s ease}
.mai-root[data-state=listening] .mai-pupil{transform:translateY(1.5px)}
.mai-root[data-state=thinking] .mai-pupil{transform:translate(3.4px,-3.6px)}
.mai-root[data-state=eureka] .mai-pupil{transform:scale(1.12)}
.mai-brow{transition:transform .3s ease}
.mai-root[data-state=listening] .mai-brow{transform:translateY(-3px)}
.mai-root[data-state=eureka] .mai-brow{transform:translateY(-4px)}
.mai-root[data-state=thinking] .mai-brow-l{transform:translateY(-4px) rotate(-8deg)}
.mai-root[data-state=thinking] .mai-brow-r{transform:translateY(1.5px) rotate(5deg)}
.mai-arm-think{opacity:0;transition:opacity .3s ease}
.mai-arm-rest{opacity:1;transition:opacity .3s ease}
.mai-root[data-state=thinking] .mai-arm-think{opacity:1}
.mai-root[data-state=thinking] .mai-arm-rest{opacity:0}
.mai-root[data-state=idle] .mai-lid{animation:mai-blink 4.8s infinite}
.mai-root[data-state=idle] .mai-lid-b{animation-delay:0s}
.mai-root[data-state=talking] .mai-body{animation:mai-bob .62s ease-in-out infinite}
.mai-mouth-talk{transform:scaleY(.7)}
.mai-root[data-state=talking] .mai-mouth-talk{animation:mai-talk .74s ease-in-out infinite}
.mai-gear-a{animation:mai-spin 3.2s linear infinite}
.mai-gear-b{animation:mai-spin 2.3s linear infinite reverse}
.mai-thought{animation:mai-fade-in .35s ease both}
.mai-bulb{animation:mai-pop .5s cubic-bezier(.2,1.6,.4,1) both}
.mai-rays{animation:mai-ray 1.1s ease-in-out infinite}
.mai-glow{animation:mai-fade-in .5s ease both}
.mai-pulse{animation:mai-pulse 1.5s ease-out infinite}
.mai-dot-talk{animation:mai-bob .62s ease-in-out infinite}
@keyframes mai-blink{0%,92%,100%{transform:scaleY(1)}95.5%{transform:scaleY(.08)}}
@keyframes mai-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-2.5px)}}
@keyframes mai-talk{0%,100%{transform:scaleY(.22)}18%{transform:scaleY(1)}38%{transform:scaleY(.42)}58%{transform:scaleY(.9)}78%{transform:scaleY(.3)}}
@keyframes mai-spin{to{transform:rotate(360deg)}}
@keyframes mai-fade-in{from{opacity:0}to{opacity:1}}
@keyframes mai-pop{0%{opacity:0;transform:translateY(10px) scale(.2)}70%{opacity:1;transform:translateY(0) scale(1.18)}100%{opacity:1;transform:translateY(0) scale(1)}}
@keyframes mai-ray{0%,100%{opacity:.45}50%{opacity:1}}
@keyframes mai-pulse{0%{transform:scale(1);opacity:.7}100%{transform:scale(1.5);opacity:0}}
@media (prefers-reduced-motion: reduce){
.mai-root *,.mai-mini *,.mai-mini{animation:none!important;transition:none!important}
}
`;

/* ----------------------------- face / head ----------------------------- */

const SKIN = "#f3c6a0";
const SKIN_SHADE = "#e2a97f";
const INK = "#3b1f33";

function Eye({ cx }: { cx: number }) {
  return (
    <g className="mai-eye mai-fb">
      <g className="mai-lid mai-fb">
        <ellipse cx={cx} cy={113} rx={7.2} ry={8.2} className="fill-white" stroke="#cbd5e1" strokeWidth={0.8} />
        <g className="mai-pupil mai-fb">
          <circle cx={cx} cy={114} r={4.2} fill="#1e1b4b" />
          <circle cx={cx + 1.6} cy={112} r={1.5} fill="#fff" />
          <circle cx={cx - 1.6} cy={116} r={0.8} fill="#fff" opacity={0.8} />
        </g>
      </g>
    </g>
  );
}

function Mouth({ state }: { state: MascotState }) {
  switch (state) {
    case "listening":
      return <ellipse cx={100} cy={132.5} rx={3.2} ry={3.8} fill={INK} />;
    case "thinking":
      return <path d="M94.5 133.5 Q100 130.5 106 134.2" fill="none" stroke={INK} strokeWidth={2.2} strokeLinecap="round" />;
    case "eureka":
      return (
        <g>
          <path d="M89 127.5 Q100 151 111 127.5 Q100 130.5 89 127.5 Z" fill={INK} stroke={INK} strokeWidth={1.2} strokeLinejoin="round" />
          <path d="M94.5 137.5 Q100 134 105.5 137.5 Q100 143.5 94.5 137.5 Z" fill="#fb7185" />
        </g>
      );
    case "talking":
      return (
        <g className="mai-mouth-talk mai-fb">
          <ellipse cx={100} cy={133} rx={6.2} ry={5.6} fill={INK} />
          <ellipse cx={100} cy={136} rx={3.4} ry={2.2} fill="#fb7185" />
        </g>
      );
    default:
      return <path d="M91.5 130.5 Q100 138.5 108.5 130.5" fill="none" stroke={INK} strokeWidth={2.4} strokeLinecap="round" />;
  }
}

/** Head, hair, face. Pivots about the neck (100,150), so rotations tilt the head rather than spin it. */
function Head({ state }: { state: MascotState }) {
  return (
    <g className="mai-head">
      {/* ears */}
      <ellipse cx={66.5} cy={115} rx={4.6} ry={6.4} fill={SKIN} />
      <ellipse cx={133.5} cy={115} rx={4.6} ry={6.4} fill={SKIN} />
      {/* face */}
      <ellipse cx={100} cy={112} rx={34} ry={37} fill={SKIN} />
      {/* hair */}
      <path
        d="M65 110 C60 70 84 60 104 62 C128 62 142 80 135 110 C131 96 124 88 112 85 C104 92 86 94 76 90 C70 96 66 102 65 110 Z"
        className="fill-indigo-900 stroke-indigo-400/70"
        strokeWidth={1.2}
        strokeLinejoin="round"
      />
      <path d="M96 62 C92 54 100 50 106 55" fill="none" className="stroke-indigo-900" strokeWidth={4} strokeLinecap="round" />
      {/* cheeks */}
      <ellipse cx={77} cy={126} rx={6} ry={3.6} fill="#fb7185" opacity={0.28} />
      <ellipse cx={123} cy={126} rx={6} ry={3.6} fill="#fb7185" opacity={0.28} />
      {/* brows */}
      <path className="mai-brow mai-brow-l mai-fb" d="M77.5 99 Q86 94.5 94 98.5" fill="none" stroke="#1e1b4b" strokeWidth={2.6} strokeLinecap="round" />
      <path className="mai-brow mai-brow-r mai-fb" d="M106 98.5 Q114 94.5 122.5 99" fill="none" stroke="#1e1b4b" strokeWidth={2.6} strokeLinecap="round" />
      {/* eyes */}
      <Eye cx={86} />
      <Eye cx={114} />
      {state === "eureka" && (
        <>
          <circle cx={88.6} cy={110.6} r={1.9} fill="#fff" />
          <circle cx={116.6} cy={110.6} r={1.9} fill="#fff" />
        </>
      )}
      {/* nose + mouth */}
      <path d="M99 120 Q100.6 123 102.5 121.6" fill="none" stroke={SKIN_SHADE} strokeWidth={2} strokeLinecap="round" />
      <Mouth key={state} state={state} />
    </g>
  );
}

/* ------------------------------ full body ------------------------------ */

function Pen({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) {
  return (
    <g strokeLinecap="round">
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#4f46e5" strokeWidth={3.6} />
      <line x1={x1} y1={y1} x2={(x1 * 2 + x2) / 3} y2={(y1 * 2 + y2) / 3} stroke="#c7d2fe" strokeWidth={1.4} />
      <circle cx={x2} cy={y2} r={1.6} fill="#1e1b4b" />
    </g>
  );
}

function Sleeve({ d }: { d: string }) {
  return (
    <>
      <path d={d} fill="none" strokeLinecap="round" strokeWidth={19} className="stroke-slate-300 dark:stroke-slate-400" />
      <path d={d} fill="none" strokeLinecap="round" strokeWidth={16.5} className="stroke-white dark:stroke-slate-100" />
    </>
  );
}

function Gear({ cx, cy, r, className, spin }: { cx: number; cy: number; r: number; className: string; spin: string }) {
  return (
    <g className={cn(spin, "mai-fb")} style={{ transformOrigin: `${cx}px ${cy}px`, transformBox: "view-box" }}>
      <circle cx={cx} cy={cy} r={r} fill="none" strokeWidth={r * 0.5} strokeDasharray={`${(Math.PI * r) / 5} ${(Math.PI * r) / 5}`} className={className} />
      <circle cx={cx} cy={cy} r={r * 0.72} fill="none" strokeWidth={r * 0.26} className={className} />
      <circle cx={cx} cy={cy} r={r * 0.2} className="fill-violet-500 dark:fill-violet-300" />
    </g>
  );
}

function Thinking() {
  return (
    <g className="mai-thought">
      <circle cx={133} cy={63} r={2.2} className="fill-violet-400 dark:fill-violet-300" opacity={0.55} />
      <circle cx={139} cy={55} r={3.2} className="fill-violet-400 dark:fill-violet-300" opacity={0.75} />
      <Gear cx={152} cy={46} r={11} className="stroke-violet-500 dark:stroke-violet-300" spin="mai-gear-a" />
      <Gear cx={171.5} cy={64} r={7.5} className="stroke-indigo-500 dark:stroke-indigo-300" spin="mai-gear-b" />
    </g>
  );
}

function Eureka({ gradId }: { gradId: string }) {
  const rays = Array.from({ length: 9 }, (_, i) => {
    const a = (-90 + (i - 4) * 28) * (Math.PI / 180);
    return { x1: 100 + Math.cos(a) * 21, y1: 34 + Math.sin(a) * 21, x2: 100 + Math.cos(a) * 29, y2: 34 + Math.sin(a) * 29 };
  });
  return (
    <g>
      <circle className="mai-glow" cx={100} cy={36} r={38} fill={`url(#${gradId})`} />
      <g className="mai-rays" stroke="#f59e0b" strokeWidth={2.6} strokeLinecap="round">
        {rays.map((r, i) => (
          <line key={i} {...r} />
        ))}
      </g>
      <g className="mai-bulb mai-fb" style={{ transformOrigin: "100px 40px", transformBox: "view-box" }}>
        <path d="M100 20 C88 20 81 29 81 38 C81 46 87 49 89.5 55 L110.5 55 C113 49 119 46 119 38 C119 29 112 20 100 20 Z" fill="#fde047" stroke="#f59e0b" strokeWidth={2} strokeLinejoin="round" />
        <path d="M93 41 L97 47 L100 40 L103 47 L107 41" fill="none" stroke="#d97706" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
        <path d="M89 31 Q91 26 96 24.5" fill="none" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" opacity={0.8} />
        <rect x={91.5} y={55} width={17} height={4.6} rx={1.6} className="fill-slate-500 dark:fill-slate-400" />
        <rect x={94.5} y={59.6} width={11} height={3.6} rx={1.6} className="fill-slate-600 dark:fill-slate-500" />
      </g>
    </g>
  );
}

function FullBody({ state, gradId, name }: { state: MascotState; gradId: string; name: string }) {
  return (
    <svg viewBox="0 0 200 250" className="block h-auto w-full overflow-visible" role="img" aria-label={name} focusable="false">
      <g className="mai-body">
        {/* left arm (viewer's left) */}
        <Sleeve d="M56 190 Q42 214 46 238" />
        <circle cx={46} cy={240} r={7.2} fill={SKIN} />
        {/* torso: lab coat */}
        <path d="M36 252 C36 204 54 176 100 172 C146 176 164 204 164 252 Z" className="fill-white stroke-slate-300 dark:fill-slate-100 dark:stroke-slate-400" strokeWidth={2} strokeLinejoin="round" />
        {/* neck + shirt */}
        <path d="M89 148 L89 172 Q100 182 111 172 L111 148 Z" fill={SKIN_SHADE} />
        <path d="M82 173 L100 205 L118 173 Q100 184 82 173 Z" className="fill-indigo-500" />
        <path d="M82 173 L100 205 L88 215 L70 180 Z M118 173 L100 205 L112 215 L130 180 Z" className="fill-slate-100 stroke-slate-300 dark:fill-slate-200 dark:stroke-slate-400" strokeWidth={1.6} strokeLinejoin="round" />
        {/* pocket, badge */}
        <path d="M110 222 H138 V246 H110 Z" fill="none" className="stroke-slate-300 dark:stroke-slate-400" strokeWidth={1.6} />
        <circle cx={68} cy={222} r={6.2} className="fill-violet-500" />
        <path d="M64.6 222 H71.4 M68 218.6 V225.4" stroke="#fff" strokeWidth={1.4} strokeLinecap="round" />
        {/* resting arm holding the pen (viewer's right) */}
        <g className="mai-arm-rest">
          <Sleeve d="M146 190 Q162 214 158 236" />
          <Pen x1={158} y1={238} x2={172} y2={212} />
          <circle cx={158} cy={238} r={7.2} fill={SKIN} />
        </g>
        <Head state={state} />
        {/* thinking arm: pen to the chin, drawn above the head */}
        <g className="mai-arm-think">
          <Sleeve d="M148 190 Q176 232 124 160" />
          <Pen x1={121} y1={158} x2={105} y2={146.5} />
          <circle cx={121} cy={158} r={7.2} fill={SKIN} />
        </g>
      </g>
      {state === "thinking" && <Thinking />}
      {state === "eureka" && <Eureka gradId={gradId} />}
    </svg>
  );
}

/* ------------------------------- compact ------------------------------- */

function CompactFace({ state }: { state: MascotState }) {
  return (
    <svg viewBox="50 52 100 100" className="block size-full" aria-hidden focusable="false">
      <path d="M89 140 L89 160 L111 160 L111 140 Z" fill={SKIN_SHADE} />
      <Head state={state} />
    </svg>
  );
}

/* -------------------------------- root -------------------------------- */

export function MascotVisualizer({
  state,
  minimized = false,
  onToggleMinimized,
  className,
  greeting = DEFAULT_GREETING,
  label,
  stateLabels,
  toggleLabel = "Minimize assistant mascot",
}: MascotVisualizerProps) {
  const reduce = useReducedMotion();
  const gradId = useId().replace(/:/g, "") + "-glow";
  const name = label ?? stateLabels?.[state] ?? DEFAULT_STATE_LABELS[state];
  // Polite live region: only "thinking" is announced (listening/talking would be noise; the answer itself is announced by the chat).
  const announce = state === "thinking" ? (label ?? stateLabels?.thinking ?? DEFAULT_STATE_LABELS.thinking) : "";
  const fade = reduce ? { duration: 0 } : { duration: 0.2 };

  return (
    <motion.div
      layout={!reduce}
      transition={reduce ? { duration: 0 } : { layout: { type: "spring", stiffness: 380, damping: 34 } }}
      data-state={state}
      data-minimized={minimized ? "true" : "false"}
      className={cn("relative", minimized ? "size-14 shrink-0" : "w-full max-w-[260px]", className)}
    >
      <style>{CSS}</style>
      <span role="status" aria-live="polite" className="sr-only">
        {announce}
      </span>
      <AnimatePresence initial={false} mode="popLayout">
        {minimized ? (
          <motion.div
            key="mini"
            initial={reduce ? false : { opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
            transition={fade}
            className="mai-mini mai-root size-14"
            data-state={state}
          >
            <MiniShell state={state} name={name} onToggle={onToggleMinimized} toggleLabel={toggleLabel} />
          </motion.div>
        ) : (
          <motion.div
            key="full"
            initial={reduce ? false : { opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={fade}
            className="mai-root relative w-full overflow-hidden rounded-3xl bg-gradient-to-b from-indigo-50 to-violet-100/70 ring-1 ring-indigo-200/70 dark:from-indigo-950/60 dark:to-violet-950/40 dark:ring-indigo-400/20"
            data-state={state}
          >
            <FullBody state={state} gradId={gradId} name={name} />
            <svg width="0" height="0" className="absolute" aria-hidden focusable="false">
              <defs>
                <radialGradient id={gradId}>
                  <stop offset="0%" stopColor="#fde047" stopOpacity={0.75} />
                  <stop offset="60%" stopColor="#fbbf24" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="#fbbf24" stopOpacity={0} />
                </radialGradient>
              </defs>
            </svg>
            <AnimatePresence>
              {state === "idle" && (
                <motion.div
                  key="greeting"
                  initial={reduce ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  transition={fade}
                  className="pointer-events-none absolute start-3 end-14 top-3"
                >
                  <p className="relative rounded-2xl bg-white px-3 py-1.5 text-start text-[11px] font-medium leading-snug text-indigo-900 shadow-sm ring-1 ring-indigo-200 dark:bg-slate-800 dark:text-indigo-100 dark:ring-indigo-400/30">
                    {greeting}
                    <span aria-hidden className="absolute -bottom-1 start-5 size-2 rotate-45 border-b border-e border-indigo-200 bg-white dark:border-indigo-400/30 dark:bg-slate-800" />
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
            {onToggleMinimized && (
              <button
                type="button"
                onClick={onToggleMinimized}
                aria-pressed={false}
                aria-label={toggleLabel}
                className="absolute end-1.5 top-1.5 inline-flex size-11 items-center justify-center rounded-full text-indigo-700 transition-colors hover:bg-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-indigo-50 dark:text-indigo-200 dark:hover:bg-white/10 dark:focus-visible:ring-indigo-300 dark:focus-visible:ring-offset-slate-900"
              >
                <Minimize2 className="size-4" aria-hidden />
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function MiniShell({
  state,
  name,
  onToggle,
  toggleLabel,
}: {
  state: MascotState;
  name: string;
  onToggle?: () => void;
  toggleLabel: string;
}) {
  const pulse = PULSE[state];
  const body = (
    <>
      {pulse && <span aria-hidden className={cn("mai-pulse pointer-events-none absolute inset-0 rounded-full border-2", pulse)} />}
      <span
        className={cn(
          "relative block size-full overflow-hidden rounded-full bg-gradient-to-b from-indigo-100 to-violet-200 shadow-md ring-[3px] transition-shadow dark:from-indigo-900 dark:to-violet-950",
          RING[state],
          state === "eureka" && "shadow-[0_0_14px_2px_rgba(251,191,36,0.6)]",
        )}
      >
        <CompactFace state={state} />
      </span>
      <span
        aria-hidden
        className={cn(
          "absolute -bottom-0.5 -end-0.5 flex size-5 items-center justify-center rounded-full ring-2 ring-white dark:ring-slate-900",
          DOT[state],
          state === "talking" && "mai-dot-talk",
        )}
      >
        {state === "eureka" ? <Lightbulb className="size-3 text-amber-950" /> : <Maximize2 className="size-2.5 text-white/90" />}
      </span>
    </>
  );
  if (!onToggle) {
    return (
      <div role="img" aria-label={name} className="relative size-full">
        {body}
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed
      aria-label={toggleLabel}
      title={name}
      className="relative block size-full rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-indigo-300 dark:focus-visible:ring-offset-slate-900"
    >
      {body}
    </button>
  );
}

export default MascotVisualizer;
