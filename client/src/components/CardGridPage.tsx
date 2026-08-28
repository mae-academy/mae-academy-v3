/**
 * MAE Academy visual system: Luminous Technical Atelier.
 * Responsive collection grid with blueprint content planes and exact six-card placeholders.
 */
import { motion, Variants } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { Link } from "wouter";
import BlueprintVisual from "./BlueprintVisual";
import SimulationSchematic from "./SimulationSchematic";
import { useLocale } from "@/contexts/LocaleContext";
import type { CardType } from "@/data/platform";
import { simulationRouteMeta } from "@/data/platform";

export type { CardType } from "@/data/platform";

type CardGridPageProps = { type: CardType; title: string; eyebrow: string; description: string; cards: Array<{ title: string; description: string; code: string }>; };

const containerVariants: Variants = { hidden: {}, visible: { transition: { staggerChildren: 0.1, delayChildren: 0.08 } } };
const itemVariants: Variants = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 170, damping: 21 } } };

export default function CardGridPage({ type, title, eyebrow, description, cards }: CardGridPageProps) {
  const { copy } = useLocale();
  return <motion.section className="container py-14 sm:py-20" variants={containerVariants} initial="hidden" animate="visible">
    <motion.div variants={itemVariants} className="mb-12 grid gap-7 lg:grid-cols-[1.2fr_.8fr] lg:items-end"><div><div className="mb-4 flex items-center gap-3"><p className="text-[10px] font-bold tracking-[0.18em] text-violet-700 dark:text-violet-300">{eyebrow}</p><span className="h-px w-16 bg-gradient-to-r from-blue-600 via-violet-500 to-rose-500" /></div><h1 className="max-w-3xl text-4xl font-black tracking-[-0.055em] text-slate-950 sm:text-6xl dark:text-white">{title}</h1></div><p className="max-w-xl border-l-2 border-gradient-signal pl-5 text-base leading-7 text-slate-600 dark:text-slate-400 rtl:border-l-0 rtl:border-r-2 rtl:pl-0 rtl:pr-5">{description}</p></motion.div>
    <motion.div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3" variants={containerVariants}>
      {cards.map((card, index) => <motion.article variants={itemVariants} key={card.code} className={`group relative overflow-hidden rounded-2xl border border-slate-200 bg-white/75 p-4 shadow-[0_15px_40px_-28px_rgba(15,23,42,.45)] transition-all duration-300 hover:-translate-y-2 hover:border-violet-400 hover:shadow-2xl hover:shadow-purple-500/20 dark:border-white/10 dark:bg-white/[0.035] dark:hover:border-violet-400/70 ${index === 1 && type !== "simulations" ? "lg:-translate-y-2 lg:border-violet-400/70" : ""} ${type === "simulations" ? "simulation-station" : ""}`}>
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-blue-600 via-purple-500 to-rose-500 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
        <div className="relative mb-4 overflow-hidden rounded-xl border border-slate-200/70 bg-slate-50 p-2 dark:border-white/10 dark:bg-slate-950/50">{type === "simulations" ? <SimulationSchematic variant={("visualVariant" in simulationRouteMeta[index] ? simulationRouteMeta[index].visualVariant : index) ?? index} labelled={false} className="aspect-[1.26] w-full transition-transform duration-500 group-hover:scale-[1.035]" /> : <BlueprintVisual kind={type} variant={index} labelled={false} className="aspect-[1.26] w-full transition-transform duration-500 group-hover:scale-[1.035]" />}</div>
        <div className="px-2 pb-2"><h2 className="mb-2 text-xl font-bold tracking-[-0.03em] text-slate-900 dark:text-white">{card.title}</h2><p className="mb-5 min-h-12 text-sm leading-6 text-slate-600 dark:text-slate-400">{card.description}</p>{type === "simulations" ? <Link href={`/simulations/${simulationRouteMeta[index].slug}`} className="group/button inline-flex items-center gap-2 rounded-full border border-violet-300/70 bg-white/50 px-4 py-2.5 text-xs font-bold text-violet-700 shadow-sm transition-all duration-200 hover:scale-[1.02] hover:border-violet-400 hover:bg-violet-50 active:scale-[.97] dark:border-violet-400/35 dark:bg-white/5 dark:text-violet-300 dark:hover:bg-violet-500/10">{copy.controls.explore} <ArrowUpRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover/button:-translate-y-0.5 group-hover/button:translate-x-0.5" /></Link> : <button className="group/button inline-flex items-center gap-2 rounded-full border border-violet-300/70 bg-white/50 px-4 py-2.5 text-xs font-bold text-violet-700 shadow-sm transition-all duration-200 hover:scale-[1.02] hover:border-violet-400 hover:bg-violet-50 active:scale-[.97] dark:border-violet-400/35 dark:bg-white/5 dark:text-violet-300 dark:hover:bg-violet-500/10">{copy.controls.explore} <ArrowUpRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover/button:-translate-y-0.5 group-hover/button:translate-x-0.5" /></button>}</div>
      </motion.article>)}
    </motion.div>
  </motion.section>;
}
