import { createContext, useContext, useId } from "react";
import type { ReactNode } from "react";
import type { MascotState } from "@shared/aiTypes";
import { cn } from "@/lib/utils";

/**
 * "Mai", the MAE AI platform mascot, redrawn as inline SVG.
 *
 * The reference art (MAEchatbotCAD/char.svg) is a single raster pose, so this is a hand-authored redraw
 * in the reference's own pixel space (viewBox units == the reference at 1635x2000). The eureka pose is the
 * reference pose; every other pose re-articulates the same layers (head, face parts, arms, gloves).
 * Colors were sampled from the reference: hair #271b17, mouth #50413c, tongue #d07b73, shirt #c41d32.
 *
 * Controlled by props only. All motion is CSS (`.mai-*`), transform/opacity only, and disabled under
 * `prefers-reduced-motion` (each pose still reads statically).
 */

export interface MaiMascotProps {
  state: MascotState;
  /** 'hero' = full body, large (empty state). 'avatar' = head-and-shoulders crop in a round frame, ~40px (next to message bubbles). */
  variant?: "hero" | "avatar";
  className?: string;
  /** Accessible name override; default is an English label per state. */
  label?: string;
  stateLabels?: Partial<Record<MascotState, string>>;
  /** false freezes every animation and transition (for older messages in a transcript). Default true. */
  animated?: boolean;
}

const DEFAULT_LABELS: Record<MascotState, string> = {
  idle: "Mai, the MAE AI assistant, is ready",
  listening: "Mai is listening",
  thinking: "Mai is thinking",
  eureka: "Mai has an answer",
  talking: "Mai is answering",
};

/* ------------------------------ palette ------------------------------ */

const INK = "#040704";
const HAIR = "#271b17";
const MOUTH = "#50413c";
const TONGUE = "#d07b73";
const SHIRT = "#c41d32";
const WHITE = "#ffffff";

/** Stroke multiplier: the avatar is rendered ~10x smaller, so outlines are thickened to stay legible. */
const StrokeK = createContext(1);
function useK() {
  return useContext(StrokeK);
}

/* ------------------------------- styles ------------------------------- */

const CSS = `
.mai-root{display:block;color-scheme:normal}
.mai-fb{transform-box:fill-box;transform-origin:center}
.mai-backing{fill:#eef2ff;opacity:.85}
.dark .mai-backing{fill:#e2e8f0;opacity:.95}
.mai-ground{fill:#0f172a;opacity:.14}
.mai-avatar{position:relative;display:inline-block;flex:none;overflow:hidden;border-radius:9999px;background:#eef2ff;box-shadow:0 0 0 2px var(--mai-ring,#a5b4fc)}
.dark .mai-avatar{background:#e2e8f0}
.mai-avatar>svg{display:block;width:100%;height:100%}
.mai-avatar[data-state=idle]{--mai-ring:#a5b4fc}
.mai-avatar[data-state=listening]{--mai-ring:#38bdf8}
.mai-avatar[data-state=thinking]{--mai-ring:#8b5cf6}
.mai-avatar[data-state=eureka]{--mai-ring:#fbbf24}
.mai-avatar[data-state=talking]{--mai-ring:#34d399}

/* head: tilts about the neck */
.mai-head{transition:transform .45s cubic-bezier(.3,1.3,.5,1)}
.mai-root[data-state=listening] .mai-head{transform:rotate(6deg)}
.mai-root[data-state=thinking] .mai-head{transform:rotate(-4deg)}
.mai-root[data-state=eureka] .mai-head{transform:translateY(-4px)}
.mai-root[data-state=thinking] .mai-head-bob{animation:mai-think-bob 3.4s ease-in-out infinite}
.mai-root[data-state=talking] .mai-head-bob{animation:mai-head-talk .9s ease-in-out infinite}

/* brows */
.mai-brow{transition:transform .3s ease}
.mai-root[data-state=idle] .mai-brow{transform:translateY(6px)}
.mai-root[data-state=talking] .mai-brow{transform:translateY(-2px)}
.mai-root[data-state=listening] .mai-brow{transform:translateY(-16px)}
.mai-root[data-state=thinking] .mai-brow-l{transform:translateY(8px) rotate(4deg)}
.mai-root[data-state=thinking] .mai-brow-r{transform:translateY(-26px) rotate(-7deg)}

/* pupils: gaze (outer) + blink (inner) */
.mai-gaze{transition:transform .4s ease}
.mai-root[data-state=listening] .mai-gaze{transform:translate(-6px,13px)}
.mai-root[data-state=thinking] .mai-gaze{transform:translate(16px,-15px)}
.mai-root[data-state=eureka] .mai-gaze{transform:scale(1)}
.mai-root:not([data-state=eureka]) .mai-pupil{animation:mai-blink 5.2s infinite}
.mai-root:not([data-state=eureka]) .mai-pupil-r{animation-delay:.02s}

/* body */
.mai-body{transition:transform .3s ease}
.mai-root[data-state=idle] .mai-body,.mai-root[data-state=listening] .mai-body{animation:mai-breathe 3.8s ease-in-out infinite}
.mai-root[data-state=talking] .mai-body{animation:mai-bob .62s ease-in-out infinite}
.mai-root[data-state=eureka] .mai-body{animation:mai-hop 1.2s ease-out both}

/* arms */
.mai-sway-a{animation:mai-sway 4.2s ease-in-out infinite}
.mai-sway-b{animation:mai-sway-big 1.5s ease-in-out infinite}
.mai-sway-c{animation:mai-sway-big 1.2s ease-in-out infinite reverse}
.mai-wave{animation:mai-wave 2.6s ease-in-out infinite}
.mai-pose-in{animation:mai-fade .3s ease both}
.mai-mouth{animation:mai-fade .2s ease both}
.mai-talk-mouth{animation:mai-talk .72s ease-in-out infinite}

/* thought dots + bulb */
.mai-dot{animation:mai-dot 1.6s ease-in-out infinite}
.mai-dot-2{animation-delay:.25s}
.mai-dot-3{animation-delay:.5s}
.mai-bulb{animation:mai-pop .55s cubic-bezier(.2,1.6,.4,1) both}
.mai-rays{animation:mai-ray 1s ease-in-out infinite}
.mai-glow{animation:mai-fade .5s ease both}

@keyframes mai-blink{0%,92%,100%{transform:scaleY(1)}95.5%{transform:scaleY(.08)}}
@keyframes mai-breathe{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
@keyframes mai-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-7px)}}
@keyframes mai-hop{0%{transform:translateY(0)}30%{transform:translateY(-16px)}60%{transform:translateY(0)}78%{transform:translateY(-5px)}100%{transform:translateY(0)}}
@keyframes mai-think-bob{0%,100%{transform:translateY(0) rotate(0deg)}50%{transform:translateY(5px) rotate(-1.6deg)}}
@keyframes mai-head-talk{0%,100%{transform:rotate(-1.2deg)}50%{transform:rotate(1.4deg)}}
@keyframes mai-sway{0%,100%{transform:rotate(-1.5deg)}50%{transform:rotate(2.5deg)}}
@keyframes mai-sway-big{0%,100%{transform:rotate(-4deg)}50%{transform:rotate(5deg)}}
@keyframes mai-wave{0%,100%{transform:rotate(-7deg)}50%{transform:rotate(9deg)}}
@keyframes mai-talk{0%,100%{transform:scaleY(.3)}16%{transform:scaleY(1)}36%{transform:scaleY(.5)}56%{transform:scaleY(.92)}78%{transform:scaleY(.36)}}
@keyframes mai-dot{0%,100%{opacity:.25;transform:translateY(0)}50%{opacity:1;transform:translateY(-8px)}}
@keyframes mai-pop{0%{opacity:0;transform:translateY(40px) scale(.15)}70%{opacity:1;transform:translateY(0) scale(1.2)}100%{opacity:1;transform:translateY(0) scale(1)}}
@keyframes mai-ray{0%,100%{opacity:.5}50%{opacity:1}}
@keyframes mai-fade{from{opacity:0}to{opacity:1}}

/* static poses: transform-only differences that must survive reduced motion */
.mai-root[data-state=talking] .mai-talk-mouth{transform:scaleY(.7)}
@media (prefers-reduced-motion: reduce){
.mai-root,.mai-root *{animation:none!important;transition:none!important}
}
.mai-static,.mai-static *{animation:none!important;transition:none!important}
`;

function ensureStyles() {
  if (typeof document === "undefined" || document.getElementById("mai-mascot-css")) return;
  const el = document.createElement("style");
  el.id = "mai-mascot-css";
  el.textContent = CSS;
  document.head.appendChild(el);
}

/* ------------------------------ helpers ------------------------------ */

/** Rotates/scales `children` about (x, y) with a CSS class (origin-exact, independent of the viewBox). */
function Pivot({ x, y, className, children }: { x: number; y: number; className?: string; children: ReactNode }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <g className={className}>
        <g transform={`translate(${-x} ${-y})`}>{children}</g>
      </g>
    </g>
  );
}

function Stroke({ d, w, color = INK }: { d: string; w: number; color?: string }) {
  const k = useK();
  return <path d={d} fill="none" stroke={color} strokeWidth={w * k} strokeLinecap="round" strokeLinejoin="round" />;
}

/* ------------------------------- gloves ------------------------------- */

/**
 * Gloves are authored in crop pixels of the reference (so they stay faithful) and placed with their wrist
 * anchor on the arm end. `s` scales (1 == reference size), `rot` rotates about the wrist (deg, clockwise).
 */
const G_SCALE = 0.662;

function Glove({
  kind,
  x,
  y,
  rot = 0,
  s = 1,
  flip = false,
}: {
  kind: "point" | "fist" | "palm";
  x: number;
  y: number;
  rot?: number;
  s?: number;
  flip?: boolean;
}) {
  const k = useK();
  const w = 17 * k; // crop-px stroke (== ~11 display units)
  const d = 13 * k; // detail stroke
  const wrist = kind === "palm" ? { x: 72, y: 300 } : { x: 300, y: 505 };
  const common = { stroke: INK, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${flip ? -G_SCALE * s : G_SCALE * s} ${G_SCALE * s}) translate(${-wrist.x} ${-wrist.y})`}>
      {kind === "palm" ? (
        <>
          <path
            d="M 215 72 C 225 50 258 52 266 76 C 272 102 256 140 250 175 C 300 183 400 183 440 193 C 472 203 472 236 452 250 C 482 256 496 272 481 288 C 470 312 440 330 420 345 C 370 372 300 376 220 372 C 160 368 120 360 100 335 L 82 322 C 64 290 70 250 90 222 C 110 205 140 195 170 150 C 190 120 200 95 215 72 Z"
            fill={WHITE}
            stroke={INK}
            strokeWidth={w}
            strokeLinejoin="round"
          />
          <g fill="none" strokeWidth={d} {...common}>
            <path d="M 305 232 C 380 232 420 236 446 242" />
            <path d="M 300 236 L 292 330" />
            <path d="M 150 246 C 190 236 215 256 238 276" />
            <path d="M 106 226 C 96 262 110 300 124 336" />
          </g>
        </>
      ) : (
        <>
          {kind === "point" && (
            <path
              d="M 178 250 C 158 192 148 112 160 72 C 168 38 206 30 220 64 C 234 112 256 180 278 244 Z"
              fill={WHITE}
              stroke={INK}
              strokeWidth={w}
              strokeLinejoin="round"
            />
          )}
          <path
            d="M 190 262 C 160 226 118 228 104 262 C 70 272 54 300 62 336 C 70 376 100 400 120 420 C 150 470 200 500 250 497 C 300 495 335 470 348 440 C 360 400 358 332 346 294 C 332 264 300 252 270 250 C 240 250 215 262 190 262 Z"
            fill={WHITE}
            stroke={INK}
            strokeWidth={w}
            strokeLinejoin="round"
          />
          <g fill="none" strokeWidth={d} {...common}>
            <path d="M 186 292 C 194 336 246 346 298 322" />
            <path d="M 240 352 C 226 384 236 410 232 428" />
            <path d="M 112 268 C 128 300 150 350 188 362" />
            <path d="M 170 262 L 184 276" />
          </g>
        </>
      )}
    </g>
  );
}

/* --------------------------------- arms --------------------------------- */

const SHOULDER_L = { x: 806, y: 1178 };
const SHOULDER_R = { x: 938, y: 1170 };

function Limb({ d }: { d: string }) {
  return <Stroke d={d} w={14.5} />;
}

/** The reference pose: left finger pointing up. */
function ArmPointUp() {
  return (
    <>
      <Limb d="M 806 1178 C 760 1235 700 1290 640 1345 Q 606 1376 590 1362 C 550 1325 500 1255 466 1204" />
      <Glove kind="point" x={466} y={1202} />
    </>
  );
}

/** The reference pose: right open palm, presenting. */
function ArmPresent() {
  return (
    <>
      <Limb d="M 938 1170 C 975 1240 1010 1320 1050 1395 Q 1066 1416 1088 1405 C 1140 1380 1200 1350 1240 1326" />
      <Glove kind="palm" x={1240} y={1326} />
    </>
  );
}

/** Left (viewer's) arm hanging relaxed, loose fist. */
function ArmRelaxed() {
  return (
    <>
      <Limb d="M 806 1178 C 760 1240 700 1310 672 1390 C 655 1440 650 1480 652 1516" />
      <Glove kind="fist" x={652} y={1516} rot={180} s={0.85} />
    </>
  );
}

/** Left (viewer's) arm waving gently: the forearm swings about the elbow. */
function ArmWave() {
  return (
    <>
      <Limb d="M 806 1178 C 740 1210 640 1260 562 1332" />
      <Pivot x={562} y={1332} className="mai-wave">
        <Limb d="M 562 1332 C 520 1290 450 1230 414 1192" />
        <Glove kind="palm" x={414} y={1192} rot={78} s={0.85} flip />
      </Pivot>
    </>
  );
}

/** Hand on hip. `side` is the viewer's side; the limb sits behind the shirt, the glove in front of it. */
function ArmHip({ side, layer }: { side: "left" | "right"; layer: "back" | "front" }) {
  if (side === "right") {
    return layer === "back" ? (
      <Limb d="M 938 1170 C 990 1220 1050 1280 1098 1338 Q 1110 1356 1090 1368 C 1060 1392 1020 1416 985 1432" />
    ) : (
      <Glove kind="fist" x={985} y={1432} rot={-128} s={0.9} />
    );
  }
  return layer === "back" ? (
    <Limb d="M 806 1178 C 760 1220 700 1270 655 1322 Q 640 1342 660 1356 C 690 1384 726 1406 752 1424" />
  ) : (
    <Glove kind="fist" x={752} y={1424} rot={128} s={0.9} />
  );
}

/* --------------------------------- head --------------------------------- */

function Eyes() {
  return (
    <g className="mai-gaze">
      <ellipse className="mai-pupil mai-fb" cx={697} cy={735} rx={23} ry={35} fill={INK} />
      <ellipse className="mai-pupil mai-pupil-r mai-fb" cx={957} cy={737} rx={24} ry={35} fill={INK} />
    </g>
  );
}

function Brows() {
  return (
    <>
      <g className="mai-brow mai-brow-l mai-fb">
        <Stroke d="M 604 631 C 628 604 664 590 700 590 C 712 591 720 595 724 600" w={13} />
      </g>
      <g className="mai-brow mai-brow-r mai-fb">
        <Stroke d="M 896 596 C 934 584 990 584 1030 626" w={13} />
      </g>
    </>
  );
}

function Glasses() {
  const k = useK();
  return (
    <g fill="none" stroke={INK} strokeWidth={11 * k} strokeLinecap="round" strokeLinejoin="round">
      <path d="M 548 682 L 756 676 Q 768 678 766 692 C 766 740 761 780 751 797 Q 745 806 734 807 C 680 813 620 813 568 804 Q 552 799 548 781 C 541 741 541 702 548 682 Z" />
      <path d="M 846 678 L 1068 672 Q 1082 676 1080 700 C 1080 750 1072 790 1055 812 Q 1045 821 1030 821 C 960 823 900 816 856 806 Q 846 799 845 781 C 842 740 841 700 846 678 Z" />
      <path d="M 768 718 Q 804 710 840 720" strokeWidth={9.5 * k} />
      <path d="M 548 724 L 478 736" strokeWidth={9.5 * k} />
      <path d="M 1080 718 C 1130 722 1190 732 1246 746" strokeWidth={9.5 * k} />
    </g>
  );
}

function Hair() {
  const k = useK();
  return (
    <g strokeLinecap="round" strokeLinejoin="round">
      <path
        d="M 493 700 C 486 640 500 590 530 540 C 545 520 548 505 560 490 C 600 450 660 430 730 400 C 790 380 860 366 930 372 C 1000 378 1060 405 1100 440 C 1150 460 1200 490 1235 560 C 1260 610 1268 670 1262 710 L 1248 742 C 1235 700 1225 685 1200 680 C 1130 640 1075 580 1040 505 C 980 525 900 540 840 540 C 770 542 700 535 650 527 C 600 540 560 580 530 625 C 515 650 505 675 497 700 Z"
        fill={HAIR}
        stroke={INK}
        strokeWidth={10 * k}
      />
      <g fill="none" stroke={INK} strokeWidth={5 * k}>
        <path d="M 640 440 C 720 430 790 445 840 490 C 870 515 900 520 925 518" />
        <path d="M 565 484 C 620 462 700 474 768 522" />
        <path d="M 900 408 C 950 404 1000 418 1038 470" />
        <path d="M 1060 492 C 1120 490 1160 540 1186 584" />
        <path d="M 1070 540 C 1110 580 1130 612 1200 664" />
        <path d="M 520 640 C 540 610 560 585 590 570" />
      </g>
      {/* sideburn / ear tick on the character's right */}
      <path d="M 1262 750 C 1280 760 1290 776 1288 796" fill="none" stroke={INK} strokeWidth={10 * k} />
    </g>
  );
}

/** Open mouth from the reference. Anchored at the top lip (850, 895) so it can scale open/closed. */
function MouthOpen({ tongue = true }: { tongue?: boolean }) {
  const k = useK();
  return (
    <g strokeLinecap="round" strokeLinejoin="round">
      <path
        d="M 708 916 C 740 925 830 925 910 905 C 950 893 980 880 996 872 C 995 940 960 1010 905 1035 C 860 1050 810 1040 770 1005 C 740 975 720 945 708 916 Z"
        fill={MOUTH}
        stroke={INK}
        strokeWidth={9 * k}
      />
      {tongue && (
        <path
          d="M 824 1030 C 820 1000 840 982 870 976 C 890 972 905 976 912 970 C 930 965 958 968 968 976 C 960 1000 930 1025 890 1033 C 860 1040 838 1038 824 1030 Z"
          fill={TONGUE}
          stroke={INK}
          strokeWidth={6 * k}
        />
      )}
      <path
        d="M 742 922 C 790 934 860 930 920 906 C 950 894 972 884 988 872 C 984 896 962 912 932 926 C 890 946 840 958 792 956 C 768 953 752 940 742 922 Z"
        fill={WHITE}
        stroke={INK}
        strokeWidth={5 * k}
      />
      <Stroke d="M 670 898 C 740 914 840 914 905 894 C 940 882 962 866 978 862" w={9} />
      <Stroke d="M 972 862 C 996 862 1012 876 1012 892" w={8} />
    </g>
  );
}

function MouthSmile() {
  const k = useK();
  return (
    <g strokeLinecap="round" strokeLinejoin="round">
      <path
        d="M 726 912 C 800 934 880 930 946 898 C 942 946 906 978 850 978 C 800 975 750 950 726 912 Z"
        fill={MOUTH}
        stroke={INK}
        strokeWidth={9 * k}
      />
      <path
        d="M 744 922 C 800 940 880 934 934 906 C 926 926 880 944 830 944 C 796 944 764 938 744 922 Z"
        fill={WHITE}
        stroke={INK}
        strokeWidth={5 * k}
      />
      <Stroke d="M 702 904 C 770 924 860 924 934 892" w={9} />
      <Stroke d="M 930 892 C 950 888 962 876 968 862" w={8} />
    </g>
  );
}

function MouthListening() {
  return (
    <>
      <Stroke d="M 770 936 C 820 964 890 958 940 912" w={10} />
      <Stroke d="M 936 914 C 950 906 958 896 962 884" w={8} />
    </>
  );
}

function MouthThinking() {
  return (
    <>
      <Stroke d="M 790 952 C 830 940 880 946 922 934" w={10} />
      <Stroke d="M 922 934 C 934 930 940 922 942 914" w={8} />
    </>
  );
}

function MouthFor({ state }: { state: MascotState }) {
  switch (state) {
    case "eureka":
      return <MouthOpen />;
    case "talking":
      return (
        <Pivot x={850} y={895} className="mai-talk-mouth">
          <MouthOpen />
        </Pivot>
      );
    case "listening":
      return <MouthListening />;
    case "thinking":
      return <MouthThinking />;
    default:
      return <MouthSmile />;
  }
}

const FACE_D =
  "M 488 704 C 470 880 520 1000 600 1050 C 700 1100 790 1114 870 1118 C 1000 1115 1110 1070 1180 980 C 1240 900 1262 820 1246 704";

function Head({ state }: { state: MascotState }) {
  const k = useK();
  return (
    <Pivot x={870} y={1112} className="mai-head">
      <Pivot x={870} y={1112} className="mai-head-bob">
        {/* face: fill is closed, the outline stays open under the hair */}
        <path d={FACE_D + " Z"} fill={WHITE} />
        <path d={FACE_D} fill="none" stroke={INK} strokeWidth={12 * k} strokeLinejoin="round" strokeLinecap="round" />
        <Hair />
        <Brows />
        <Glasses />
        <Eyes />
        <g className="mai-mouth" key={state}>
          <MouthFor state={state} />
        </g>
        {/* chin line */}
        <Stroke d="M 838 1064 C 864 1074 890 1068 906 1057" w={8} />
      </Pivot>
    </Pivot>
  );
}

/* --------------------------------- body --------------------------------- */

function Shirt() {
  const k = useK();
  return (
    <path
      d="M 822 1104 L 936 1104 L 938 1120 C 936 1200 940 1300 950 1400 C 958 1470 968 1520 975 1552 C 976 1562 970 1566 962 1569 C 900 1591 830 1593 745 1589 C 735 1588 733 1582 733 1572 C 735 1480 745 1400 765 1300 C 780 1230 795 1170 820 1118 L 822 1104 Z"
      fill={SHIRT}
      stroke={INK}
      strokeWidth={9 * k}
      strokeLinejoin="round"
    />
  );
}

function Legs() {
  const k = useK();
  return (
    <g>
      <Stroke d="M 800 1588 C 796 1680 794 1760 798 1846" w={13} />
      <Stroke d="M 904 1584 C 912 1680 920 1770 926 1846" w={13} />
      <path
        d="M 618 1892 C 620 1866 684 1842 752 1838 C 792 1838 818 1860 816 1884 C 810 1912 760 1926 702 1930 C 652 1932 616 1920 618 1892 Z"
        fill={WHITE}
        stroke={INK}
        strokeWidth={11 * k}
        strokeLinejoin="round"
      />
      <path
        d="M 914 1888 C 926 1856 980 1834 1030 1832 C 1080 1834 1118 1856 1120 1882 C 1118 1912 1060 1930 1000 1930 C 952 1930 912 1916 914 1888 Z"
        fill={WHITE}
        stroke={INK}
        strokeWidth={11 * k}
        strokeLinejoin="round"
      />
    </g>
  );
}

/** Arms + gloves drawn in front of the shirt for the thinking pose. */
function ThinkingArms() {
  return (
    <g className="mai-pose-in">
      {/* supporting arm folded across the torso, hand under the other elbow */}
      <Limb d="M 938 1170 C 984 1250 1020 1330 1010 1384 Q 1000 1404 976 1402 C 900 1396 830 1400 760 1420" />
      <Glove kind="fist" x={760} y={1420} rot={-96} s={0.8} />
      {/* chin arm: elbow low-left, forearm up to the jaw */}
      <Limb d="M 806 1178 C 770 1250 722 1340 706 1410 Q 702 1442 730 1430 C 780 1400 822 1345 836 1280" />
    </g>
  );
}

/* --------------------------------- extras --------------------------------- */

function Bulb({ cx, cy, scale = 1 }: { cx: number; cy: number; scale?: number }) {
  const k = useK() * (scale < 1 ? 0.6 : 1); // the avatar bulb is already drawn small; keep its strokes light
  const gid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const rays = [-180, -150, -120, -90, -60, -30, 0];
  return (
    <g transform={`translate(${cx} ${cy}) scale(${scale})`}>
      <defs>
        <radialGradient id={`mai-glow-${gid}`}>
          <stop offset="0" stopColor="#fde047" stopOpacity=".6" />
          <stop offset="1" stopColor="#fde047" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle className="mai-glow" r={150} fill={`url(#mai-glow-${gid})`} />
      <Pivot x={0} y={0} className="mai-bulb">
        <g className="mai-rays" stroke="#f59e0b" strokeWidth={9 * k} strokeLinecap="round">
          {rays.map((a) => {
            const r = (a * Math.PI) / 180;
            return <line key={a} x1={Math.cos(r) * 84} y1={Math.sin(r) * 84} x2={Math.cos(r) * 122} y2={Math.sin(r) * 122} />;
          })}
        </g>
        <path
          d="M -26 40 C -30 60 -22 66 -22 78 L 22 78 C 22 66 30 60 26 40 Z"
          fill="#cbd5e1"
          stroke={INK}
          strokeWidth={7 * k}
          strokeLinejoin="round"
        />
        <path d="M -22 58 L 24 58" stroke={INK} strokeWidth={5 * k} strokeLinecap="round" />
        <circle r={56} cy={0} fill="#fde047" stroke={INK} strokeWidth={9 * k} />
        <path d="M -18 36 L -12 4 L 0 20 L 12 4 L 18 36" fill="none" stroke={INK} strokeWidth={5 * k} strokeLinejoin="round" strokeLinecap="round" />
        <path d="M -36 -14 C -32 -30 -22 -40 -8 -44" fill="none" stroke={WHITE} strokeWidth={7 * k} strokeLinecap="round" />
      </Pivot>
    </g>
  );
}

function ThoughtDots() {
  const k = useK();
  return (
    <g fill={WHITE} stroke={INK} strokeWidth={6 * k}>
      <circle className="mai-dot mai-fb" cx={1222} cy={410} r={13} />
      <circle className="mai-dot mai-dot-2 mai-fb" cx={1296} cy={330} r={20} />
      <circle className="mai-dot mai-dot-3 mai-fb" cx={1380} cy={236} r={30} />
    </g>
  );
}

/* ---------------------------------- main ---------------------------------- */

function Figure({ state, variant }: { state: MascotState; variant: "hero" | "avatar" }) {
  const hero = variant === "hero";
  const thinking = state === "thinking";
  let back: ReactNode = null;
  let front: ReactNode = null;
  switch (state) {
    case "eureka":
      back = (
        <>
          <Pivot x={SHOULDER_L.x} y={SHOULDER_L.y} className="mai-sway-c">
            <ArmPointUp />
          </Pivot>
          <Pivot x={SHOULDER_R.x} y={SHOULDER_R.y} className="mai-sway-b">
            <ArmPresent />
          </Pivot>
        </>
      );
      break;
    case "talking":
      back = (
        <>
          <ArmHip side="left" layer="back" />
          <Pivot x={SHOULDER_R.x} y={SHOULDER_R.y} className="mai-sway-b">
            <ArmPresent />
          </Pivot>
        </>
      );
      front = <ArmHip side="left" layer="front" />;
      break;
    case "thinking":
      break;
    case "listening":
      back = (
        <>
          <Pivot x={SHOULDER_L.x} y={SHOULDER_L.y} className="mai-sway-a">
            <ArmRelaxed />
          </Pivot>
          <ArmHip side="right" layer="back" />
        </>
      );
      front = <ArmHip side="right" layer="front" />;
      break;
    default:
      back = (
        <>
          <ArmWave />
          <ArmHip side="right" layer="back" />
        </>
      );
      front = <ArmHip side="right" layer="front" />;
  }

  return (
    <>
      {hero && <Legs />}
      <g className="mai-body">
        {back && (
          <g className="mai-pose-in" key={`b-${state}`}>
            {back}
          </g>
        )}
        <Shirt />
        {front && (
          <g className="mai-pose-in" key={`f-${state}`}>
            {front}
          </g>
        )}
        {thinking && <ThinkingArms />}
        <Head state={state} />
        {thinking && (
          <Pivot x={870} y={1112} className="mai-head-bob">
            <Glove kind="fist" x={836} y={1282} rot={20} s={1} />
          </Pivot>
        )}
      </g>
      {state === "eureka" && (hero ? <Bulb cx={1000} cy={210} /> : <Bulb cx={1138} cy={400} scale={0.62} />)}
      {thinking && hero && <ThoughtDots />}
    </>
  );
}

export function MaiMascot({ state, variant = "hero", className, label, stateLabels, animated = true }: MaiMascotProps) {
  ensureStyles();
  const name = label ?? stateLabels?.[state] ?? DEFAULT_LABELS[state];

  if (variant === "avatar") {
    return (
      <span
        role="img"
        aria-label={name}
        data-state={state}
        data-variant="avatar"
        className={cn("mai-root mai-avatar size-10", !animated && "mai-static", className)}
      >
        <svg viewBox="370 200 980 980" aria-hidden="true" focusable="false" preserveAspectRatio="xMidYMid slice">
          <StrokeK.Provider value={1.9}>
            <Figure state={state} variant="avatar" />
          </StrokeK.Provider>
        </svg>
      </span>
    );
  }

  return (
    <svg
      role="img"
      aria-label={name}
      data-state={state}
      data-variant="hero"
      viewBox="270 70 1260 1920"
      focusable="false"
      className={cn("mai-root h-auto w-full", !animated && "mai-static", className)}
    >
      <StrokeK.Provider value={1}>
        <rect className="mai-backing" x={296} y={318} width={1208} height={1650} rx={430} />
        <ellipse className="mai-ground" cx={868} cy={1952} rx={360} ry={26} />
        <Figure state={state} variant="hero" />
      </StrokeK.Provider>
    </svg>
  );
}

export default MaiMascot;
