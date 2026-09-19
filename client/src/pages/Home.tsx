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
      <section className="relative overflow-hidden pt-4 pb-6 sm:pt-6 sm:pb-8 lg:pt-8 lg:pb-12">
        {/* Subtle Tri-Tone Background Ambient Glow */}
        <div className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-[850px] h-[360px] opacity-35 blur-3xl mae-gradient-glow rounded-full -z-10 dark:opacity-20" />

        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-12">
          <div className="grid grid-cols-12 gap-4 lg:gap-8 items-center">
            {/* Left Column: Headings, Subtitle, Actions (58-60% width) */}
            <div className="col-span-7 flex flex-col justify-center gap-3 sm:gap-4 z-10 min-w-0">
              <motion.h1
                variants={itemVariants}
                className="font-bold tracking-tight text-slate-900 dark:text-white text-xl sm:text-2xl md:text-3xl lg:text-5xl whitespace-nowrap"
              >
                {home.headlinePrimary}
              </motion.h1>

              <motion.h2
                variants={itemVariants}
                className="font-extrabold text-xl sm:text-2xl md:text-3xl lg:text-5xl whitespace-nowrap text-brand-gradient"
              >
                {home.headlineSecondary}
              </motion.h2>

              <motion.p
                variants={itemVariants}
                className="text-slate-600 dark:text-zinc-300 text-xs sm:text-sm md:text-base max-w-xl leading-relaxed"
              >
                {home.description}
              </motion.p>

              {/* Call-to-Action Buttons */}
              <motion.div variants={itemVariants} className="flex flex-wrap items-center gap-2.5 sm:gap-3 mt-1 sm:mt-2">
                <Link
                  href="/simulations"
                  className="btn-brand-primary px-5 sm:px-7 md:px-8 py-2.5 sm:py-3.5 text-xs sm:text-sm md:text-base font-semibold shrink-0 gap-2"
                >
                  {home.ctaPrimary}
                  <ArrowRight className="h-4 w-4" />
                </Link>

                <Link
                  href="/courses"
                  className="btn-brand-subtle px-5 sm:px-7 md:px-8 py-2.5 sm:py-3.5 text-xs sm:text-sm md:text-base font-semibold shadow-xs hover:shadow-sm shrink-0 gap-2"
                >
                  {home.ctaSecondary}
                </Link>
              </motion.div>
            </div>

            {/* Right Column: Oscilloscope (40-42% width) */}
            <motion.div variants={itemVariants} className="col-span-5 flex justify-end w-full">
              <Suspense
                fallback={
                  <div className="w-full aspect-[4/3] rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 animate-pulse dark:border-white/[0.08] dark:bg-zinc-950/60" />
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
                  {/* Founder Action CTA: Blue to Purple diagonal gradient with rounded-full */}
                  <Link
                    href="/about"
                    className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[#2563eb] to-[#9333ea] hover:from-[#1d4ed8] hover:to-[#7e22ce] px-7 py-3.5 text-sm sm:text-base font-semibold text-white shadow-sm hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 w-full sm:w-auto justify-center"
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
