/**
 * MAE Academy visual system: Luminous Technical Atelier.
 * Native SVG technical illustrations with discipline-specific station schematics.
 */
import { memo } from "react";
import { useLocale } from "@/contexts/LocaleContext";

type VisualKind = "hero" | "research" | "courses" | "simulations" | "avatar" | "orbital";

type BlueprintVisualProps = {
  kind?: VisualKind;
  className?: string;
  labelled?: boolean;
  variant?: number;
};

const visualData: Record<Exclude<VisualKind, "avatar">, { label: string; sublabel: string; paths: string[] }> = {
  hero: { label: "MAE / SYSTEM 01", sublabel: "Multi-axis learning model", paths: ["M80 242 210 168l130 74v150L210 466 80 392Z", "M210 168v148l130 76", "M80 242l130 74 130-74", "M210 316v150"] },
  research: { label: "R / RESEARCH CELL", sublabel: "Evidence architecture", paths: ["M90 400 160 250l80 70 60-172 108 252H90Z", "M114 398h290", "M160 250l18 148", "M240 320l-26 78"] },
  courses: { label: "C / COURSE PATH", sublabel: "Progressive system", paths: ["M88 368h320", "M126 368V204h76v164", "M246 368V138h76v230", "M366 368V258h42v110"] },
  simulations: { label: "S / SIMULATION LOOP", sublabel: "Variables in motion", paths: ["M250 120c110 0 170 92 136 182-30 80-122 118-204 84-72-30-106-114-72-185 29-60 79-81 140-81Z", "M180 260h140", "M250 190v140"] },
  orbital: { label: "MAE / FIELD NOTES", sublabel: "Founder instrument panel", paths: ["M102 270c0-105 88-172 174-172 98 0 162 79 151 174-10 89-84 143-175 132-80-10-150-62-150-134Z", "M252 98v306", "M102 270h325"] },
};

const stationSchematics: Record<"research" | "courses" | "simulations", Array<{ label: string; sublabel: string; paths: string[]; nodes: [number, number][] }>> = {
  research: [
    { label: "EVIDENCE MAP", sublabel: "Systems as evidence", paths: ["M105 360 175 245l70 95 92-164 76 184H105Z", "M105 360h308", "M175 245l-20 115M245 340l-20 20"], nodes: [[105,360],[175,245],[245,340],[337,176],[413,360]] },
    { label: "FORCE TRACE", sublabel: "Applied mechanics", paths: ["M102 340h310M146 340l54-140 62 140M268 340l54-190 58 190", "M90 375h332", "M139 375v32M412 375v32"], nodes: [[146,340],[200,200],[268,340],[322,150],[380,340]] },
    { label: "CIVIC NETWORK", sublabel: "Smart infrastructure", paths: ["M104 332 180 236l79 52 72-124 79 168", "M104 332h306", "M180 236l79-74M259 288l72-52"], nodes: [[104,332],[180,236],[259,288],[331,164],[410,332]] },
    { label: "ENERGY VECTOR", sublabel: "Energy transitions", paths: ["M122 364V235h64v129M230 364V166h64v198M338 364V257h64v107", "M108 364h308", "M154 218l108-80 108 88"], nodes: [[154,235],[262,166],[370,257],[108,364],[416,364]] },
    { label: "PROCEDURAL FIELD", sublabel: "Computational design", paths: ["M112 342 172 196l58 110 59-170 98 206", "M112 342h275", "M172 196l117-60M230 306l157 36"], nodes: [[112,342],[172,196],[230,306],[289,136],[387,342]] },
    { label: "ETHICS MATRIX", sublabel: "Engineering ethics", paths: ["M126 178h266v186H126z", "M126 240h266M126 302h266M214 178v186M303 178v186", "M126 364h266"], nodes: [[126,178],[214,240],[303,302],[392,364]] },
  ],
  courses: [
    { label: "MODEL LADDER", sublabel: "Model thinking", paths: ["M112 370h300", "M142 370V292h62v78M231 370V214h62v156M320 370V136h62v234", "M173 270l88-84 90-78"], nodes: [[173,292],[262,214],[351,136],[112,370],[412,370]] },
    { label: "ANALYSIS PATH", sublabel: "Analysis studio", paths: ["M108 360h304M134 315h76M238 255h76M342 195h70", "M172 315 276 255 377 195", "M134 360v-45M238 360v-105M342 360v-165"], nodes: [[172,315],[276,255],[377,195],[108,360],[412,360]] },
    { label: "FOUNDATION SET", sublabel: "Engineering foundations", paths: ["M108 360h304M132 360l56-122 58 122M244 360l58-184 58 184", "M188 238h114", "M132 360h228"], nodes: [[132,360],[188,238],[244,360],[302,176],[360,360]] },
    { label: "DATA SIGNAL", sublabel: "Data for engineers", paths: ["M116 360h286M136 330l48-78 60 42 67-132 72 106", "M136 360v-30M184 360v-108M244 360v-66M311 360v-198M383 360v-92"], nodes: [[136,330],[184,252],[244,294],[311,162],[383,268]] },
    { label: "CONSTRAINT LOOP", sublabel: "Design under constraints", paths: ["M142 261c0-89 135-126 204-54 66 67 18 177-81 177-73 0-123-51-123-123Z", "M180 261h170M265 196v130", "M142 261h-40M346 261h46"], nodes: [[142,261],[265,196],[346,261],[265,384],[180,261]] },
    { label: "LEADERSHIP AXIS", sublabel: "Leadership in systems", paths: ["M128 352 250 145l130 207H128Z", "M250 145v207M128 352h252", "M180 264h140"], nodes: [[128,352],[250,145],[380,352],[250,264]] },
  ],
  simulations: [
    { label: "LOAD TEST", sublabel: "Bridge load lab", paths: ["M96 348h326M122 348l65-123 64 123M251 348l63-174 67 174", "M122 386h268", "M187 225h127"], nodes: [[122,348],[187,225],[251,348],[314,174],[381,348]] },
    { label: "GRID BALANCE", sublabel: "Energy balance", paths: ["M112 350h294M144 350V230h60v120M232 350V172h60v178M320 350V254h60v96", "M112 397h294", "M174 209l88-80 88 99"], nodes: [[174,230],[262,172],[350,254],[112,350],[406,350]] },
    { label: "FLOW NETWORK", sublabel: "City flow", paths: ["M104 220h104v106h104V180h104", "M104 382h312", "M156 220v162M260 326v56M364 180v202"], nodes: [[104,220],[208,326],[312,180],[416,382],[156,382]] },
    { label: "STRESS FIELD", sublabel: "Material stress", paths: ["M132 356c0-106 253-106 253 0", "M132 356h253M154 392h209", "M190 356v-61M258 356v-110M326 356v-61"], nodes: [[132,356],[190,295],[258,246],[326,295],[385,356]] },
    { label: "WATER LOGIC", sublabel: "Water system", paths: ["M119 194h286v178H119z", "M119 253h286M119 312h286", "M194 194v178M290 194v178", "M105 404h314"], nodes: [[119,194],[194,253],[290,312],[405,372],[105,404]] },
    { label: "CONTROL LOOP", sublabel: "Control room", paths: ["M260 142c98 0 156 86 123 172-27 72-109 111-185 82-68-26-105-103-74-174 25-58 78-80 136-80Z", "M260 190v144M188 262h144", "M103 262h85M332 262h84"], nodes: [[260,142],[383,262],[260,396],[124,262],[260,262]] },
  ],
};

type CardKind = "hero" | "research" | "courses" | "simulations" | "orbital";

function AvatarVisual({ className }: { className?: string }) {
  const { copy } = useLocale();
  return <svg viewBox="0 0 520 520" className={className} fill="none" aria-label={copy.blueprints.avatar.aria} role="img"><defs><linearGradient id="avatarGradient" x1="86" y1="73" x2="417" y2="454" gradientUnits="userSpaceOnUse"><stop stopColor="#2563EB"/><stop offset=".5" stopColor="#8B5CF6"/><stop offset="1" stopColor="#F43F5E"/></linearGradient><pattern id="avatarGrid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" stroke="currentColor" strokeOpacity=".12"/></pattern></defs><rect x="18" y="18" width="484" height="484" rx="28" className="fill-white/50 dark:fill-slate-950/35"/><rect x="18" y="18" width="484" height="484" rx="28" fill="url(#avatarGrid)" className="text-slate-700 dark:text-slate-100"/><path d="M62 438 260 74 458 438M120 438h280M260 74v364" stroke="url(#avatarGradient)" strokeWidth="1.5" strokeDasharray="5 9" opacity=".75"/><path d="M91 223c0-86 70-155 156-155s156 69 156 155" stroke="url(#avatarGradient)" strokeWidth="17" strokeLinecap="round"/><path d="M112 222h279v35H112z" className="fill-slate-950 dark:fill-slate-100"/><path d="M148 220c10-74 57-118 102-118 47 0 96 44 105 118" fill="url(#avatarGradient)" opacity=".95"/><path d="M151 262c0-63 41-108 98-108 58 0 102 45 102 108v65c0 74-43 116-102 116-58 0-98-42-98-116v-65Z" className="fill-slate-100 dark:fill-slate-200"/><path d="M159 265c17-13 27-40 28-61 17 14 45 21 72 21 35 0 61-8 81-23 1 26 9 45 20 63" className="fill-slate-950 dark:fill-slate-900"/><path d="M165 284h72c9 0 16 7 16 16v25c0 9-7 16-16 16h-56c-9 0-16-7-16-16v-25c0-9 7-16 16-16Zm118 0h72c9 0 16 7 16 16v25c0 9-7 16-16 16h-56c-9 0-16-7-16-16v-25c0-9 7-16 16-16Z" stroke="url(#avatarGradient)" strokeWidth="7"/><path d="M253 310h30" stroke="url(#avatarGradient)" strokeWidth="7"/><path d="M236 382c10 9 40 9 50 0" stroke="#F43F5E" strokeWidth="6" strokeLinecap="round"/><path d="M126 504c12-59 54-92 123-92 68 0 111 33 123 92" fill="url(#avatarGradient)" opacity=".92"/><path d="M202 419h95l-48 55-47-55Z" className="fill-slate-950 dark:fill-slate-100"/><circle cx="69" cy="429" r="7" fill="#F43F5E"/><circle cx="449" cy="94" r="7" fill="#8B5CF6"/><path d="M43 89h83M43 99h50M384 440h94M419 450h59" className="stroke-slate-400 dark:stroke-slate-500" strokeWidth="3"/><text x="48" y="74" className="fill-slate-500 dark:fill-slate-400" fontSize="11" fontFamily="ui-sans-serif" letterSpacing="2">{copy.blueprints.avatar.archive}</text><text x="380" y="115" className="fill-slate-500 dark:fill-slate-400" fontSize="10" fontFamily="ui-sans-serif" letterSpacing="1.5">{copy.blueprints.avatar.reference}</text></svg>;
}

function BlueprintVisual({ kind = "hero", className = "", labelled = true, variant = 0 }: BlueprintVisualProps) {
  if (kind === "avatar") return <AvatarVisual className={className}/>;
  const { copy, locale } = useLocale();
  const hasStation = kind === "research" || kind === "courses" || kind === "simulations";
  const station = hasStation ? stationSchematics[kind][variant % 6] : undefined;
  const data = station || visualData[kind];
  const visualKind = kind === "hero" || kind === "orbital" ? kind : "hero";
  const translatedData = hasStation ? copy.blueprints.stations[kind][variant % 6] : copy.blueprints.visual[visualKind];
  const displaySublabel = locale === "ar" ? translatedData.sublabel : translatedData.sublabel.toUpperCase();
  const fallbackNodes: [number, number][] = [[80,108],[210,168],[340,104],[408,242],[340,392],[210,466],[80,392],[42,258]];
  const nodes = station?.nodes || fallbackNodes;
  return <svg viewBox="0 0 520 520" className={className} fill="none" role="img" aria-label={translatedData.sublabel}><defs><linearGradient id={`blueprint-${kind}-${variant}`} x1="66" y1="78" x2="442" y2="438" gradientUnits="userSpaceOnUse"><stop stopColor="#2563EB"/><stop offset=".5" stopColor="#8B5CF6"/><stop offset="1" stopColor="#F43F5E"/></linearGradient><pattern id={`grid-${kind}-${variant}`} width="26" height="26" patternUnits="userSpaceOnUse"><path d="M26 0H0V26" stroke="currentColor" strokeOpacity=".12"/></pattern><filter id={`glow-${kind}-${variant}`} x="-25%" y="-25%" width="150%" height="150%"><feGaussianBlur stdDeviation="9"/></filter></defs><rect x="18" y="18" width="484" height="484" rx="28" className="fill-white/40 dark:fill-slate-950/20"/><rect x="18" y="18" width="484" height="484" rx="28" fill={`url(#grid-${kind}-${variant})`} className="text-slate-700 dark:text-slate-100"/><circle cx="261" cy="263" r="148" stroke={`url(#blueprint-${kind}-${variant})`} strokeWidth="1" strokeDasharray="5 9" opacity=".8"/><circle cx="261" cy="263" r="109" stroke="currentColor" strokeOpacity=".14" strokeWidth="1" className="text-slate-800 dark:text-slate-100"/>{data.paths.map((path, index) => <path d={path} stroke={`url(#blueprint-${kind}-${variant})`} strokeWidth={index === 0 ? 5 : 2} strokeLinecap="round" strokeLinejoin="round" key={path}/>)}<path d="M64 102 450 412M84 402 432 126" stroke="currentColor" strokeOpacity=".10" strokeWidth="1" className="text-slate-800 dark:text-slate-100"/>{nodes.map(([cx,cy]) => <g key={`${cx}-${cy}`}><circle cx={cx} cy={cy} r="12" fill={`url(#blueprint-${kind}-${variant})`} filter={`url(#glow-${kind}-${variant})`} opacity=".72"/><circle cx={cx} cy={cy} r="4" className="fill-slate-950 dark:fill-white"/></g>)}<path d="M64 450h128M328 450h128M64 70h70M386 70h70" stroke="currentColor" strokeWidth="2" className="text-slate-400 dark:text-slate-500"/>{labelled && <><text x="63" y="55" className="fill-slate-700 dark:fill-slate-200" fontSize="11" fontFamily="ui-sans-serif" fontWeight="700" letterSpacing="2">{translatedData.label}</text><text x="63" y="475" className="fill-slate-500 dark:fill-slate-400" fontSize="10" fontFamily="ui-sans-serif" letterSpacing="1.5">{displaySublabel}</text></>}</svg>;
}

export default memo(BlueprintVisual);
