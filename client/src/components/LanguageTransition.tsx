/**
 * MAE Academy visual system: Luminous Technical Atelier.
 * A full-viewport, direction-aware language sweep that visually bridges LTR and RTL interfaces.
 */
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { Locale } from "@/data/platform";

type LanguageTransitionProps = { target: Locale | null };

export default function LanguageTransition({ target }: LanguageTransitionProps) {
  const shouldReduceMotion = useReducedMotion();
  const movesRightToLeft = target === "ar";
  const startX = movesRightToLeft ? "100%" : "-100%";
  const endX = movesRightToLeft ? "-100%" : "100%";

  return <AnimatePresence>{target && <motion.div key={target} initial={{ x: shouldReduceMotion ? 0 : startX }} animate={{ x: 0 }} exit={{ x: shouldReduceMotion ? 0 : endX }} transition={{ duration: shouldReduceMotion ? 0.01 : 0.29, ease: [0.77, 0, 0.175, 1] }} className="pointer-events-none fixed inset-0 z-[100] overflow-hidden bg-[#000000]" aria-hidden="true">
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(139,92,246,.3),transparent_36%),linear-gradient(115deg,rgba(37,99,235,.85),rgba(124,58,237,.78),rgba(244,63,94,.72))]" />
    <motion.div initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.08 }} transition={{ duration: shouldReduceMotion ? 0.01 : 0.2, delay: shouldReduceMotion ? 0 : 0.07 }} className="absolute inset-0 grid place-items-center">
      <div className="relative grid h-48 w-48 place-items-center rounded-full border border-white/30"><div className="absolute inset-3 rounded-full border border-dashed border-white/35"/><div className="absolute inset-9 rounded-full border border-white/20"/><span className="relative text-4xl font-black tracking-[.2em] text-white">{target.toUpperCase()}</span><span className="absolute h-2.5 w-2.5 rounded-full bg-rose-300 shadow-[0_0_22px_rgba(253,164,175,1)]" style={{ top: "14px", right: movesRightToLeft ? "30px" : "auto", left: movesRightToLeft ? "auto" : "30px" }} /></div>
    </motion.div>
    <div className="absolute inset-y-0 left-[18%] w-px bg-white/35"/><div className="absolute inset-y-0 right-[18%] w-px bg-white/25"/><div className="absolute top-[28%] h-px w-full bg-white/20"/><div className="absolute bottom-[28%] h-px w-full bg-white/15"/>
  </motion.div>}</AnimatePresence>;
}
