/**
 * MAE Academy landing page station card: illustrative visual, title, description, single CTA.
 * Visual, title, description, and CTA are the only content — no eyebrow tag, status dot, or annotations.
 */
import { motion, Variants } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { Link } from "wouter";
import BlueprintVisual from "@/components/BlueprintVisual";
import SimulationSchematic from "@/components/SimulationSchematic";
import type { CardType } from "@/data/platform";

export interface StationCardProps {
  title: string;
  description: string;
  action: string;
  href: string;
  visual: CardType;
  visualVariant: number;
  variants?: Variants;
}

export default function StationCard({ title, description, action, href, visual, visualVariant, variants }: StationCardProps) {
  return <motion.article variants={variants} className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white/75 p-4 shadow-[0_16px_44px_-32px_rgba(15,23,42,.55)] transition-all duration-300 hover:-translate-y-2 hover:border-violet-400 hover:shadow-2xl hover:shadow-purple-500/20 dark:border-white/[0.08] dark:bg-[#08080A] dark:hover:border-white/[0.15]">
    <div className="absolute inset-x-0 top-0 h-px bg-violet-500/45 transition-colors duration-300 group-hover:bg-rose-400" />
    <div className="mb-4 grid aspect-[1.42] place-items-center overflow-hidden rounded-xl border border-slate-200/70 bg-slate-50 p-1.5 dark:border-white/[0.08] dark:bg-zinc-950/60">
      {visual === "simulations"
        ? <SimulationSchematic variant={visualVariant} labelled={false} className="mae-signal-draw h-full w-full transition-transform duration-500 group-hover:scale-[1.04]" />
        : <BlueprintVisual kind={visual} variant={visualVariant} labelled={false} className="mae-signal-draw h-full w-full transition-transform duration-500 group-hover:scale-[1.04]" />}
    </div>
    <div className="px-2 pb-2">
      <h3 className="mae-card-title mb-2 text-2xl text-slate-950 dark:text-white">{title}</h3>
      <p className="mb-6 min-h-12 text-sm leading-6 text-slate-600 dark:text-zinc-400">{description}</p>
      <Link href={href} className="inline-flex items-center gap-2 text-xs font-bold text-violet-700 transition-all duration-200 group-hover:gap-3 dark:text-violet-300">{action}<ArrowUpRight className="h-4 w-4" /></Link>
    </div>
  </motion.article>;
}
