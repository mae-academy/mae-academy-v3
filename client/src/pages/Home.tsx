/**
 * MAE Academy visual system: Luminous Technical Atelier.
 * Progressive, locale-driven platform gateway that keeps all user-facing copy in the central language registry.
 */
import { lazy, Suspense } from "react";
import { motion, Variants } from "framer-motion";
import { MoveRight, Play, ScanLine } from "lucide-react";
import { Link } from "wouter";
import FounderArchiveSeal from "@/components/FounderArchiveSeal";
import StationsSection from "@/components/StationsSection";
import { useLocale } from "@/contexts/LocaleContext";

// Code-split: keeps the hero's LCP text render unblocked by the canvas bundle.
const WaveField = lazy(() => import("@/components/hero-visualizer/WaveField"));

const section: Variants = { hidden: {}, visible: { transition: { staggerChildren: 0.1, delayChildren: 0.05 } } };
const item: Variants = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 165, damping: 21 } } };

export default function Home() {
  const { copy } = useLocale();
  const { home } = copy;

  return <motion.section variants={section} initial="hidden" animate="visible">
    <div className="container grid min-h-[calc(100svh-var(--mae-header-height))] items-center gap-12 py-14 lg:grid-cols-[1.05fr_.95fr] lg:py-20">
      <div className="relative z-10">
        <motion.h1 variants={item} className="mae-display max-w-4xl text-5xl leading-[.92] text-slate-950 sm:text-7xl xl:text-8xl dark:text-white"><span className="block">{home.headlinePrimary}</span><span className="mae-signal-word block">{home.headlineSecondary}</span></motion.h1>
        <motion.p variants={item} className="mt-7 max-w-xl text-base leading-7 text-slate-600 sm:text-lg dark:text-slate-400">{home.description}</motion.p>
        <motion.div variants={item} className="mt-9 flex flex-wrap gap-3"><Link href="/simulations" className="inline-flex items-center gap-2 rounded-full bg-brand-gradient px-5 py-3 text-sm font-bold text-white shadow-xl shadow-violet-500/20 transition-all duration-200 hover:scale-[1.02] hover:shadow-violet-500/30 active:scale-[.97]">{home.ctaPrimary} <Play className="h-4 w-4" /></Link><Link href="/courses" className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white/70 px-5 py-3 text-sm font-bold text-slate-700 transition-all duration-200 hover:scale-[1.02] hover:border-violet-400 hover:text-violet-700 active:scale-[.97] dark:border-white/15 dark:bg-white/5 dark:text-slate-200 dark:hover:border-violet-400 dark:hover:text-violet-300">{home.ctaSecondary} <ScanLine className="h-4 w-4" /></Link></motion.div>
        <motion.div variants={item} className="mt-14 grid max-w-2xl grid-cols-3 gap-4 border-t border-slate-200 pt-6 dark:border-white/10">{home.stats.map((stat) => <div key={stat.label}><p className="text-xl font-black tracking-[-.05em] text-slate-950 dark:text-white">{stat.value}</p><p className="mt-1 text-[10px] font-bold tracking-[.12em] text-slate-500 dark:text-slate-400">{stat.label}</p></div>)}</motion.div>
      </div>
      <motion.div variants={item}><Suspense fallback={<div className="mae-wave-grid aspect-[6/5] w-full rounded-[2rem] border border-slate-200/70 bg-white/40 dark:border-white/10 dark:bg-slate-950/30" />}><WaveField /></Suspense></motion.div>
    </div>

    <StationsSection />

    <motion.section variants={section} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.2 }} className="mae-station-section container py-16 sm:py-24"><motion.div variants={item} className="grid gap-8 border-b border-slate-200 pb-10 lg:grid-cols-[.85fr_1.15fr] lg:items-end dark:border-white/10"><div><p className="mb-4 text-[10px] font-bold tracking-[.18em] text-rose-500">{home.methodEyebrow}</p><h2 className="mae-display text-4xl leading-[.96] text-slate-950 sm:text-5xl dark:text-white">{home.methodTitle}</h2></div><p className="max-w-xl text-base leading-7 text-slate-600 dark:text-slate-400">{home.methodDescription}</p></motion.div><div className="mt-8 grid gap-5 md:grid-cols-3">{home.methodSteps.map((step) => <motion.div variants={item} key={step.number} className="border-l border-slate-200 pl-5 first:border-l-0 first:pl-0 dark:border-white/10"><p className="mb-5 text-xs font-black text-rose-500">{step.number}</p><h3 className="mae-card-title text-lg text-slate-950 dark:text-white">{step.title}</h3><p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">{step.description}</p></motion.div>)}</div></motion.section>

    <motion.section variants={section} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.15 }} className="mae-station-section container pb-16 sm:pb-24"><motion.div variants={item} className="relative overflow-hidden rounded-3xl border border-slate-200 bg-slate-950 px-6 py-10 text-white sm:px-10 sm:py-12 dark:border-white/10"><div className="absolute inset-4 border border-white/10"/><div className="absolute bottom-0 left-[45%] h-px w-[55%] bg-gradient-to-r from-transparent via-violet-400/80 to-rose-400/80"/><div className="relative grid gap-8 lg:grid-cols-[.26fr_1.05fr_.8fr] lg:items-center"><div className="mx-auto h-32 w-32 opacity-90 sm:h-40 sm:w-40"><FounderArchiveSeal /></div><div><p className="mb-4 text-[10px] font-bold tracking-[.18em] text-violet-300">{home.founderEyebrow}</p><h2 className="mae-display max-w-2xl text-3xl leading-[.96] sm:text-5xl">{home.founderTitle}</h2></div><div><p className="mb-6 max-w-md text-sm leading-7 text-slate-300">{home.founderDescription}</p><Link href="/about" className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-5 py-3 text-sm font-bold transition-all duration-200 hover:scale-[1.02] hover:border-violet-300 hover:bg-white/10 active:scale-[.97]">{home.founderAction} <MoveRight className="h-4 w-4" /></Link></div></div></motion.div></motion.section>
  </motion.section>;
}
