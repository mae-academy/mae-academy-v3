/**
 * MAE Academy visual system: Luminous Technical Atelier.
 * The only animated region inside a fixed simulation shell; it remains content-free until a tool specification is supplied.
 */
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

export default function SimulationToolWorkspace({ toolKey }: { toolKey: string }) {
  const shouldReduceMotion = useReducedMotion();
  return <div className="relative mt-12 min-h-[28rem] overflow-hidden" aria-live="polite"><AnimatePresence mode="wait" initial={false}><motion.div key={toolKey} initial={{ opacity: shouldReduceMotion ? 1 : 0, x: shouldReduceMotion ? 0 : "12%" }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: shouldReduceMotion ? 1 : 0, x: shouldReduceMotion ? 0 : "-12%" }} transition={{ duration: shouldReduceMotion ? 0.01 : 0.56, ease: [0.77, 0, 0.175, 1] }} className="absolute inset-0 overflow-hidden"><motion.div initial={{ x: "-18%", opacity: 0.18 }} animate={{ x: "16%", opacity: 0.5 }} exit={{ x: "36%", opacity: 0 }} transition={{ duration: shouldReduceMotion ? 0.01 : 0.72, ease: [0.23, 1, 0.32, 1] }} className="absolute -inset-x-1/4 top-1/3 h-28 rotate-[-4deg] bg-gradient-to-r from-blue-500/0 via-violet-500/10 to-rose-500/0 blur-3xl"/><motion.div initial={{ x: "22%", opacity: 0.12 }} animate={{ x: "-14%", opacity: 0.36 }} exit={{ x: "-34%", opacity: 0 }} transition={{ duration: shouldReduceMotion ? 0.01 : 0.68, ease: [0.23, 1, 0.32, 1] }} className="absolute -inset-x-1/4 top-[48%] h-20 rotate-[3deg] bg-gradient-to-r from-rose-500/0 via-violet-500/10 to-blue-500/0 blur-3xl"/><div className="absolute inset-x-0 top-1/2 h-px bg-gradient-to-r from-transparent via-violet-400/20 to-transparent"/></motion.div></AnimatePresence></div>;
}
