/**
 * MAE Academy landing page: Luminous Technical Atelier.
 * Refactored with balanced hero typography, framed oscilloscope monitor,
 * and vertical alternating engineering platforms showcase.
 */
import { lazy, Suspense } from "react";
import { motion, Variants } from "framer-motion";
import { ArrowRight, MoveRight } from "lucide-react";
import { Link } from "wouter";
import FounderArchiveSeal from "@/components/FounderArchiveSeal";
import EngineeringPlatformsSection from "@/components/EngineeringPlatformsSection";
import { useLocale } from "@/contexts/LocaleContext";

// Code-split: Framed oscilloscope monitor hero visual
const EngineeringScope = lazy(() => import("@/components/hero-visualizer/EngineeringScope"));

const sectionVariants: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12, delayChildren: 0.05 } },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: "spring", stiffness: 150, damping: 20 },
  },
};

export default function Home() {
  const { copy } = useLocale();
  const { home } = copy;

  return (
    <motion.div variants={sectionVariants} initial="hidden" animate="visible" className="w-full">
      {/* ============================================================ */}
      {/* HERO SECTION: Balanced Scale, Clean CTAs, Framed Scope       */}
      {/* ============================================================ */}
      <section className="relative overflow-hidden pt-6 pb-6 lg:pt-10 lg:pb-8">
        {/* Subtle Tri-Tone Background Ambient Glow */}
        <div className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-[850px] h-[360px] opacity-35 blur-3xl mae-gradient-glow rounded-full -z-10 dark:opacity-20" />

        <div className="max-w-[1380px] mx-auto px-6 sm:px-8 lg:px-12 w-full">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center min-h-[520px]">
            {/* Left Column: Headline, Body, and Primary/Secondary CTAs */}
            <div className="lg:col-span-7 z-10">
              <motion.h1
                variants={itemVariants}
                className="text-3xl sm:text-4xl lg:text-6xl font-extrabold tracking-tight leading-[1.15] text-slate-900 dark:text-white"
              >
                <span className="block">{home.headlinePrimary}</span>
                <span className="block mt-1.5 mae-gradient-text">
                  {home.headlineSecondary}
                </span>
              </motion.h1>

              <motion.p
                variants={itemVariants}
                className="mt-6 max-w-2xl text-lg md:text-xl text-slate-600 dark:text-zinc-300 leading-relaxed"
              >
                {home.description}
              </motion.p>

              {/* Call-to-Action Buttons */}
              <motion.div variants={itemVariants} className="mt-8 flex flex-wrap items-center gap-4">
                <Link
                  href="/simulations"
                  className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-blue-600 via-violet-600 to-rose-600 hover:from-blue-700 hover:via-violet-700 hover:to-rose-700 text-white px-8 py-3.5 text-base font-semibold shadow-sm shadow-violet-500/20 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:shadow-violet-500/30 active:translate-y-0"
                >
                  {home.ctaPrimary}
                  <ArrowRight className="h-4 w-4" />
                </Link>

                <Link
                  href="/courses"
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 px-8 py-3.5 text-base font-semibold shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 active:translate-y-0 dark:border-white/15 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10"
                >
                  {home.ctaSecondary}
                </Link>
              </motion.div>
            </div>

            {/* Right Column: Framed Engineering Scope / Wave Monitor */}
            <motion.div variants={itemVariants} className="lg:col-span-5 w-full">
              <Suspense
                fallback={
                  <div className="min-h-[460px] lg:min-h-[500px] w-full rounded-2xl border border-slate-200/80 bg-slate-50/50 p-6 animate-pulse dark:border-white/[0.08] dark:bg-zinc-950/60" />
                }
              >
                <EngineeringScope />
              </Suspense>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* CORE ENGINEERING PLATFORMS: Vertical Alternating Showcase    */}
      {/* ============================================================ */}
      <EngineeringPlatformsSection />

      {/* ============================================================ */}
      {/* FOUNDER & ABOUT SECTION: Expanded 2-Column Banner            */}
      {/* ============================================================ */}
      <motion.section
        variants={sectionVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.15 }}
        className="py-12 sm:py-16 bg-white dark:bg-[#000000] border-t border-slate-200/80 dark:border-white/[0.08]"
      >
        <div className="max-w-[1380px] mx-auto px-6 sm:px-8 lg:px-12 w-full">
          <motion.div
            variants={itemVariants}
            className="relative overflow-hidden rounded-2xl border border-slate-200/90 bg-slate-50/80 p-8 lg:p-10 shadow-sm dark:border-white/[0.08] dark:bg-[#08080A]"
          >
            {/* Subtle brand gradient bottom line */}
            <div className="absolute bottom-0 left-[10%] h-0.5 w-[80%] bg-gradient-to-r from-transparent via-blue-500/40 via-violet-500/60 to-rose-500/50" />

            <div className="relative grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
              {/* Left Column (lg:col-span-7): Headline, Quote, Mission (Top badge removed) */}
              <div className="lg:col-span-7 space-y-4">
                <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight leading-tight text-slate-900 dark:text-white">
                  {home.founderTitle}
                </h2>
                <p className="text-base sm:text-lg leading-relaxed text-slate-600 dark:text-zinc-400">
                  Engineering education becomes powerful when it remains close to the real system. MAE Academy turns abstract engineering curiosity into structured models, analytical clarity, and hands-on simulation.
                </p>
              </div>

              {/* Right Column (lg:col-span-5): Founder Profile Summary, Image Placeholder, Slogan Gradient & Action Link */}
              <div className="lg:col-span-5 flex flex-col justify-between p-6 sm:p-7 rounded-xl border border-slate-200/80 bg-white/90 dark:border-white/[0.08] dark:bg-[#08080A] space-y-5">
                <div className="flex items-center gap-4">
                  {/* Clean, borderless container slot ready for future headshot */}
                  <div className="aspect-square w-20 h-20 sm:w-24 sm:h-24 max-w-[120px] rounded-2xl border border-slate-200/80 bg-slate-100/50 flex items-center justify-center overflow-hidden shrink-0 dark:border-white/[0.08] dark:bg-white/[0.02]">
                    <div className="w-14 h-14 text-slate-700 dark:text-slate-300">
                      <FounderArchiveSeal />
                    </div>
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">
                      Mohammad AbuElyan
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Founder & Engineering Educator // MAE
                    </p>
                    {/* Brand Slogan Gradient: Model (Blue) · Analyze (Violet) · Engineering (Warm Rose/Red) */}
                    <p className="mt-1.5 text-xs font-semibold tracking-wide">
                      <span className="text-[#2563EB]">Model</span>
                      <span className="text-slate-400 mx-1.5">·</span>
                      <span className="text-[#7C3AED]">Analyze</span>
                      <span className="text-slate-400 mx-1.5">·</span>
                      <span className="text-[#E11D48]">Engineering</span>
                    </p>
                  </div>
                </div>

                <p className="text-sm leading-relaxed text-slate-600 dark:text-zinc-400">
                  {home.founderDescription}
                </p>

                <div className="pt-1">
                  {/* Founder Action CTA: Gradient shifting from Deep Violet (#7C3AED) back to Electric Blue (#2563EB) */}
                  <Link
                    href="/about"
                    className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#2563EB] hover:from-[#6D28D9] hover:to-[#1D4ED8] px-7 py-3.5 text-base font-semibold text-white shadow-sm transition-all duration-200 hover:scale-[1.02] hover:shadow-md hover:shadow-violet-500/25 active:scale-[.98] w-full sm:w-auto justify-center"
                  >
                    Meet the Founder & About MAE
                    <MoveRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </motion.section>
    </motion.div>
  );
}
