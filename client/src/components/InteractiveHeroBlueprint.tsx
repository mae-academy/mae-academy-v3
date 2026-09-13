/**
 * MAE Academy visual system: Luminous Technical Atelier.
 * Interactive hero blueprint: hover and focus activate the model grid, coordinate orbit, nodes, and signal paths.
 */
import { motion, useReducedMotion } from "framer-motion";
import BlueprintVisual from "@/components/BlueprintVisual";
import { useLocale } from "@/contexts/LocaleContext";

const hexPath = "M120 262 260 182l140 80v158L260 500 120 420Z";

export default function InteractiveHeroBlueprint() {
  const { copy } = useLocale();
  const shouldReduceMotion = useReducedMotion();
  const animation = shouldReduceMotion ? { duration: 0.01 } : { type: "spring" as const, stiffness: 135, damping: 17 };
  const pathAnimation = shouldReduceMotion ? { duration: 0.01 } : { duration: 0.7, ease: [0.23, 1, 0.32, 1] as const };

  return <motion.div initial="rest" animate="rest" whileHover="active" whileFocus="active" tabIndex={0} role="img" aria-label={copy.blueprints.visual.hero.sublabel} className="group relative mx-auto w-full max-w-[600px] cursor-crosshair rounded-[2rem] outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-4 focus-visible:ring-offset-[#07111f] lg:justify-self-end">
    <motion.div variants={{ rest: { scale: 1, rotate: 0 }, active: { scale: 1.025, rotate: -0.8, transition: animation } }}><div className="absolute -inset-10 rounded-full bg-gradient-to-tr from-blue-600/15 via-violet-500/20 to-rose-500/15 blur-3xl transition-opacity duration-500 group-hover:opacity-90"/><BlueprintVisual kind="hero" labelled={false} className="relative w-full drop-shadow-[0_28px_45px_rgba(79,70,229,.15)]" /></motion.div>
    <motion.svg viewBox="0 0 520 520" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" fill="none" aria-hidden="true"><defs><linearGradient id="interactive-signal" x1="122" y1="180" x2="410" y2="502" gradientUnits="userSpaceOnUse"><stop stopColor="#60A5FA"/><stop offset=".5" stopColor="#C084FC"/><stop offset="1" stopColor="#FB7185"/></linearGradient><filter id="interactive-glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="8"/></filter></defs><motion.circle cx="260" cy="341" r="190" stroke="url(#interactive-signal)" strokeDasharray="4 10" strokeWidth="1.5" variants={{ rest: { opacity: 0, scale: 0.85 }, active: { opacity: 0.8, scale: 1, transition: animation } }} style={{ transformOrigin: "260px 341px" }}/><motion.circle cx="260" cy="341" r="146" stroke="white" strokeOpacity=".38" strokeDasharray="3 9" variants={{ rest: { opacity: 0, rotate: 0 }, active: { opacity: 0.8, rotate: 90, transition: { duration: shouldReduceMotion ? 0.01 : 1.1, ease: "linear" } } }} style={{ transformOrigin: "260px 341px" }}/><motion.path d={hexPath} stroke="url(#interactive-signal)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" variants={{ rest: { pathLength: 0.62, opacity: 0.18 }, active: { pathLength: 1, opacity: 1, transition: pathAnimation } }}/><motion.path d="M260 182v160l140 78M120 262l140 80 140-80M260 342v158" stroke="url(#interactive-signal)" strokeWidth="1.6" strokeDasharray="4 7" variants={{ rest: { opacity: 0, pathLength: 0 }, active: { opacity: 0.85, pathLength: 1, transition: { ...pathAnimation, delay: shouldReduceMotion ? 0 : 0.1 } } }}/>{[[120,262], [260,182], [400,262], [400,420], [260,500], [120,420]].map(([cx, cy], index) => <motion.g key={`${cx}-${cy}`} variants={{ rest: { opacity: 0, scale: 0.5 }, active: { opacity: 1, scale: 1, transition: { ...animation, delay: shouldReduceMotion ? 0 : index * 0.045 } } }} style={{ transformOrigin: `${cx}px ${cy}px` }}><circle cx={cx} cy={cy} r="12" fill="#C084FC" filter="url(#interactive-glow)" opacity=".9"/><circle cx={cx} cy={cy} r="4" fill="white"/></motion.g>)}</motion.svg>
  </motion.div>;
}
