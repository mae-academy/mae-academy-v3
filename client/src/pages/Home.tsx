/**
 * MAE Academy landing page: Luminous Technical Atelier.
 * Refactored with balanced hero typography, framed oscilloscope monitor,
 * and vertical alternating engineering platforms showcase.
 */
import { lazy, Suspense } from "react";
import { motion, Variants } from "framer-motion";
import { ArrowRight, MoveRight } from "lucide-react";
import { Link } from "wouter";
import EngineeringPlatformsSection from "@/components/EngineeringPlatformsSection";
import MaeAiCallout from "@/components/MaeAiCallout";
import { useTranslation } from "react-i18next";
import { usePageTitle } from "@/hooks/usePageTitle";

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
  const { t } = useTranslation("landing");
  usePageTitle("Model. Analyze. Engineering");

  return (
    <motion.div variants={sectionVariants} initial="hidden" animate="visible" className="w-full">
      {/* ============================================================ */}
      {/* HERO SECTION: Balanced Scale, Clean CTAs, Framed Scope       */}
      {/* ============================================================ */}
      <section className="relative overflow-hidden pt-4 pb-6 sm:pt-6 sm:pb-8 lg:pt-8 lg:pb-12">
        {/* Subtle Tri-Tone Background Ambient Glow */}
        <div className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-[850px] h-[360px] opacity-35 blur-3xl mae-gradient-glow rounded-full -z-10 dark:opacity-20" />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-4 lg:pt-16 lg:pb-8">
          {/* Left Column (Text & CTAs): Span 7 columns */}
          <div className="min-w-0 lg:col-span-7 flex flex-col items-start space-y-6 z-10 text-left rtl:text-right">
            <motion.span
              variants={itemVariants}
              className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white tracking-wide"
            >
              {t("hero.headlinePrimary")}
            </motion.span>

            <motion.h1
              variants={itemVariants}
              className="max-w-full text-2xl sm:text-3xl lg:text-[2.25rem] xl:text-[2.6rem] font-bold tracking-tight text-slate-900 dark:text-white break-words text-balance text-left rtl:text-right leading-tight"
            >
              <span className="text-brand-gradient">{t("hero.headlineSecondary")}</span>
            </motion.h1>

            <motion.p
              variants={itemVariants}
              className="text-slate-600 dark:text-slate-400 text-sm max-w-lg leading-relaxed text-left rtl:text-right break-words"
            >
              {t("hero.description")}
            </motion.p>

            {/* Call-to-Action Buttons */}
            <motion.div variants={itemVariants} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto pt-1">
              <Link
                href="/simulations"
                className="btn-brand-primary min-h-[44px] px-6 sm:px-8 py-3 text-xs sm:text-sm font-semibold justify-center gap-2"
              >
                {t("hero.ctaPrimary")}
                <ArrowRight className="h-4 w-4" />
              </Link>

              <Link
                href="/library"
                className="btn-brand-subtle min-h-[44px] px-6 sm:px-8 py-3 text-xs sm:text-sm font-semibold justify-center shadow-xs hover:shadow-sm gap-2"
              >
                {t("hero.ctaSecondary")}
              </Link>
            </motion.div>

            {/* MAE AI banner (mobile/tablet): stacked directly under the launch actions */}
            <motion.div variants={itemVariants} className="w-full pt-2 lg:hidden">
              <MaeAiCallout />
            </motion.div>
          </div>

          {/* Right Column (Oscilloscope Interactive Widget): Span 5 columns */}
          <motion.div variants={itemVariants} className="lg:col-span-5 flex justify-center lg:justify-end w-full">
            <div className="w-full max-w-md lg:max-w-none">
              <Suspense
                fallback={
                  <div className="w-full aspect-[4/3] rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 animate-pulse dark:border-white/[0.08] dark:bg-zinc-950/60" />
                }
              >
                <EngineeringScope />
              </Suspense>
            </div>
          </motion.div>
        </div>

        {/* MAE AI entry banner (desktop): single row spanning the hero, beneath the launch actions */}
        <motion.div variants={itemVariants} className="hidden lg:block w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <MaeAiCallout />
        </motion.div>
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
        <div className="max-w-[1380px] mx-auto px-4 sm:px-6 lg:px-8 w-full">
          <motion.div
            variants={itemVariants}
            className="relative overflow-hidden rounded-2xl border border-slate-200/90 bg-slate-50/80 p-5 sm:p-8 lg:p-10 shadow-sm dark:border-white/[0.08] dark:bg-[#08080A]"
          >
            {/* Subtle brand gradient bottom line */}
            <div className="absolute bottom-0 left-[10%] h-0.5 w-[80%] bg-gradient-to-r from-transparent via-[#2563EB]/40 via-[#7C3AED]/60 to-[#E11D48]/50" />

            <div className="relative grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
              {/* Left Column (lg:col-span-7): Headline, Quote, Mission (Top badge removed) */}
              <div className="lg:col-span-7 space-y-4">
                <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight leading-tight text-slate-900 dark:text-white">
                  {t("founder.title")}
                </h2>
                <p className="text-base sm:text-lg leading-relaxed text-slate-600 dark:text-zinc-400">
                  {t("founder.quote")}
                </p>
              </div>

              {/* Right Column (lg:col-span-5): Founder Profile Summary, Image Placeholder, Slogan Gradient & Action Link */}
              <div className="min-w-0 lg:col-span-5 flex flex-col justify-between p-4 sm:p-7 rounded-xl border border-slate-200/80 bg-white/90 dark:border-white/[0.08] dark:bg-[#08080A] space-y-5">
                <div className="flex items-center gap-4">
                  <div className="aspect-square w-20 h-20 sm:w-24 sm:h-24 max-w-[120px] rounded-2xl border border-slate-200/80 bg-slate-950 overflow-hidden shrink-0 dark:border-white/[0.08]">
                    <img
                      src="/founder-schematic.jpg"
                      alt="Mohammad AbuElyan — Schematic CAD Portrait"
                      className="h-full w-full object-cover object-center"
                      loading="lazy"
                    />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-base font-bold text-slate-900 dark:text-white break-words">
                      {t("founder.name")}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {t("founder.role")}
                    </p>
                    {/* Brand Slogan Gradient: Model (Blue) · Analyze (Violet) · Engineering (Warm Rose/Red) */}
                    <p className="mt-1.5 flex flex-wrap items-center gap-y-0.5 text-xs font-semibold tracking-wide">
                      <span className="text-[#2563EB]">Model</span>
                      <span className="text-slate-400 mx-1.5">·</span>
                      <span className="text-[#7C3AED]">Analyze</span>
                      <span className="text-slate-400 mx-1.5">·</span>
                      <span className="text-[#E11D48]">Engineering</span>
                    </p>
                  </div>
                </div>

                <p className="text-sm leading-relaxed text-slate-600 dark:text-zinc-400">
                  {t("founder.description")}
                </p>

                <div className="pt-1">
                  {/* Founder Action CTA: Blue to Purple diagonal gradient with rounded-full */}
                  <Link
                    href="/about"
                    className="inline-flex items-center gap-2 rounded-full brand-active-pill px-7 py-3.5 text-sm sm:text-base font-semibold shadow-sm hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 w-full sm:w-auto justify-center"
                  >
                    {t("founder.cta")}
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
