/**
 * MAE Academy visual system: Luminous Technical Atelier.
 * Nine discipline-specific simulation schematics for control, circuits, computation, and communication systems.
 */
import { useLocale } from "@/contexts/LocaleContext";

type SimulationSchematicProps = { variant: number; className?: string; labelled?: boolean };

const diagrams: Array<{ paths: string[]; nodes: [number, number][] }> = [
  { paths: ["M110 260h80M190 204v112M190 204h120v112H190", "M310 260h94", "M404 260c0 78-87 130-160 99-62-27-78-105-31-153", "M212 191l1 42-42-8"], nodes: [[110,260],[190,260],[310,260],[404,260],[244,359]] },
  { paths: ["M95 278h52l20-58 27 116 28-116 27 116 27-58h65", "M110 375h300", "M130 162h84M306 162h84", "M165 150v25M350 150v25"], nodes: [[95,278],[167,220],[222,336],[276,220],[341,336],[406,278]] },
  { paths: ["M120 165h100v110H120zM300 165h100v110H300z", "M120 355h100v-110H120zM300 355h100v-110H300z", "M220 220h80M220 300h80M260 130v65M260 325v65", "M408 260c30-38 30 38 60 0"], nodes: [[170,220],[350,220],[170,300],[350,300],[260,260],[468,260]] },
  { paths: ["M108 170h304v168H108z", "M108 212h304M108 254h304M108 296h304", "M160 170v168M212 170v168M264 170v168M316 170v168M368 170v168", "M126 390h268"], nodes: [[134,191],[186,233],[238,275],[290,317],[342,275],[394,191]] },
  { paths: ["M120 146v226M400 146v226", "M120 196h82M268 196h132M120 258h64M228 258h172M120 320h92M268 320h132", "M202 180v32M184 242v32M212 304v32M268 180v32M228 242v32M268 304v32"], nodes: [[120,196],[202,196],[268,196],[400,196],[184,258],[228,258],[268,320],[400,320]] },
  { paths: ["M92 295c36-105 72 105 108 0s72 105 108 0 72 105 108 0", "M90 356h340", "M90 152h340", "M260 152v204", "M235 174h50v72h-50z"], nodes: [[92,295],[200,295],[308,295],[416,295],[260,210]] },
  { paths: ["M115 196h84c36 0 36 76 0 76h-84z", "M115 320h84c36 0 36-76 0-76h-84z", "M199 234h92M199 282h92", "M291 204c72 0 72 108 0 108", "M291 258h106"], nodes: [[115,234],[115,282],[199,234],[199,282],[291,258],[397,258]] },
  { paths: ["M125 160h170v170H125z", "M125 216h170M125 273h170M182 160v170M238 160v170", "M340 170l78 78-78 78", "M318 248h100", "M125 382h290"], nodes: [[153,188],[210,245],[267,302],[340,170],[418,248],[340,326]] },
  { paths: ["M120 282c48-108 112-108 160 0", "M240 282c48-108 112-108 160 0", "M104 362h312", "M140 392h272", "M170 282v80M310 282v80"], nodes: [[120,282],[200,190],[280,282],[360,190],[400,282],[170,362],[310,362]] },
];

export default function SimulationSchematic({ variant, className = "", labelled = true }: SimulationSchematicProps) {
  const { copy, locale } = useLocale();
  const index = variant % diagrams.length;
  const diagram = diagrams[index];
  const label = copy.blueprints.stations.simulations[index];
  const sublabel = locale === "ar" ? label.sublabel : label.sublabel.toUpperCase();
  return <svg viewBox="0 0 520 520" className={className} fill="none" role="img" aria-label={label.sublabel}><defs><linearGradient id={`simulation-signal-${index}`} x1="90" y1="142" x2="430" y2="394" gradientUnits="userSpaceOnUse"><stop stopColor="#2563EB"/><stop offset=".5" stopColor="#8B5CF6"/><stop offset="1" stopColor="#F43F5E"/></linearGradient><pattern id={`simulation-grid-${index}`} width="26" height="26" patternUnits="userSpaceOnUse"><path d="M26 0H0V26" stroke="currentColor" strokeOpacity=".12"/></pattern><filter id={`simulation-glow-${index}`} x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="8"/></filter></defs><rect x="18" y="18" width="484" height="484" rx="28" className="fill-white/40 dark:fill-slate-950/20"/><rect x="18" y="18" width="484" height="484" rx="28" fill={`url(#simulation-grid-${index})`} className="text-slate-700 dark:text-slate-100"/><circle cx="260" cy="260" r="156" stroke={`url(#simulation-signal-${index})`} strokeWidth="1" strokeDasharray="5 9" opacity=".65"/><circle cx="260" cy="260" r="112" stroke="currentColor" strokeOpacity=".13" className="text-slate-800 dark:text-slate-100"/>{diagram.paths.map((path, pathIndex) => <path d={path} key={path} stroke={`url(#simulation-signal-${index})`} strokeWidth={pathIndex === 0 ? 4.5 : 2} strokeLinecap="round" strokeLinejoin="round" pathLength={pathIndex === 0 ? 1 : undefined} className={pathIndex === 0 ? "mae-signal-primary" : undefined}/>)}<path d="M66 102 454 412M86 402 432 126" stroke="currentColor" strokeOpacity=".08" className="text-slate-800 dark:text-slate-100"/>{diagram.nodes.map(([cx, cy]) => <g key={`${cx}-${cy}`}><circle cx={cx} cy={cy} r="11" fill={`url(#simulation-signal-${index})`} filter={`url(#simulation-glow-${index})`} opacity=".72"/><circle cx={cx} cy={cy} r="3.5" className="fill-slate-950 dark:fill-white"/></g>)}<path d="M64 450h128M328 450h128M64 70h70M386 70h70" stroke="currentColor" strokeWidth="2" className="text-slate-400 dark:text-slate-500"/>{labelled && <><text x="63" y="55" className="fill-slate-700 dark:fill-slate-200" fontSize="11" fontFamily="ui-sans-serif" fontWeight="700" letterSpacing="2">S / {label.label}</text><text x="63" y="475" className="fill-slate-500 dark:fill-slate-400" fontSize="10" fontFamily="ui-sans-serif" letterSpacing="1.5">{sublabel}</text></>}</svg>;
}
