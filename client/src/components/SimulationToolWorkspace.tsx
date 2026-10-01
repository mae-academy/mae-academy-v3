/**
 * MAE Academy visual system: Luminous Technical Atelier.
 * The only animated region inside a fixed simulation shell; it remains content-free until a tool specification is supplied.
 */
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

export default function SimulationToolWorkspace({ toolKey }: { toolKey: string }) {
  const shouldReduceMotion = useReducedMotion();
  return <div className="relative mt-12 min-h-[28rem]" aria-live="polite"><AnimatePresence mode="wait" initial={false}><motion.div key={toolKey} initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 8, scale: shouldReduceMotion ? 1 : 0.995 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: shouldReduceMotion ? 0 : -6 }} transition={{ duration: 0.22, ease: [0.25, 1, 0.5, 1] }} className="absolute inset-0"/></AnimatePresence></div>;
}
