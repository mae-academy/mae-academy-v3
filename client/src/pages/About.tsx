/** MAE Academy visual system: locale-driven founder archive. */
import { motion, Variants } from "framer-motion";
import BlueprintVisual from "@/components/BlueprintVisual";
import { useLocale } from "@/contexts/LocaleContext";

const container: Variants = { hidden: {}, visible: { transition: { staggerChildren: 0.1 } } };
const item: Variants = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 170, damping: 21 } } };

export default function About() {
  const { copy } = useLocale();
  const about = copy.about;
  return <motion.section className="container py-14 sm:py-20" variants={container} initial="hidden" animate="visible"><motion.div variants={item} className="mb-12 grid gap-8 lg:grid-cols-[1.15fr_.85fr] lg:items-end"><div><p className="mb-4 text-[10px] font-bold tracking-[0.18em] text-violet-700 dark:text-violet-300">{about.eyebrow}</p><h1 className="max-w-3xl text-4xl font-black tracking-[-0.055em] text-slate-950 sm:text-6xl dark:text-white">{about.title}</h1></div><p className="max-w-xl text-base leading-7 text-slate-600 dark:text-zinc-400">{about.intro}</p></motion.div><motion.div variants={item} className="grid overflow-hidden rounded-3xl border border-slate-200 bg-white/70 shadow-[0_24px_70px_-40px_rgba(30,41,59,.45)] lg:grid-cols-[.9fr_1.1fr] dark:border-white/[0.08] dark:bg-[#08080A]"><div className="relative min-h-[380px] overflow-hidden bg-slate-100 p-6 dark:bg-zinc-950/60"><div className="absolute inset-0 bg-gradient-to-br from-indigo-600/10 via-violet-500/5 to-purple-600/10"/><BlueprintVisual kind="avatar" className="relative z-10 mx-auto h-full w-full max-w-[430px]" /></div><div className="p-7 sm:p-10"><p className="mb-5 text-[10px] font-bold tracking-[.18em] text-violet-600 dark:text-violet-400">{about.founderEyebrow}</p><h2 className="mb-2 text-3xl font-black tracking-[-.04em] text-slate-950 dark:text-white">{about.founderName}</h2><p className="mb-7 text-sm font-semibold text-violet-700 dark:text-violet-300">{about.founderFullName}</p><div className="space-y-5 text-[15px] leading-7 text-slate-600 dark:text-zinc-400"><p>{about.paragraphOne}</p><p>{about.paragraphTwo}</p></div><div className="mt-9 grid grid-cols-3 gap-3 border-t border-slate-200 pt-6 dark:border-white/[0.08]">{about.principles.map((principle) => <div key={principle.label}><p className="text-[10px] font-bold tracking-[.14em] text-slate-400">{principle.label}</p><p className="mt-1 text-sm font-bold text-slate-900 dark:text-white">{principle.value}</p></div>)}</div></div></motion.div></motion.section>;
}
