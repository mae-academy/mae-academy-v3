/**
 * MAE Academy: Editorial Engineering Curriculum Vitae & Founder Dossier.
 * High-precision, minimalist academic presentation of founder credentials,
 * impact metrics, authored educational works, field robotics, and leadership.
 * Perfectly balanced two-column symmetry aligned with natural engineering depth.
 * Strictly free of emojis, unified Poppins typography, zero green accents.
 */
import { useState } from "react";
import { motion, type Variants } from "framer-motion";
import { Link } from "wouter";
import {
  founderProfile,
  impactMetrics,
  authoredWorks,
  roboticsCompetitions,
  academicLeadershipRoles,
  officialChannels,
  verifiedSocialLinks,
} from "@/data/founderDossier";
import { useLocale } from "@/contexts/LocaleContext";
import FounderAvatarFrame from "@/components/about/FounderAvatarFrame";
import CurriculumVitaeModal from "@/components/about/CurriculumVitaeModal";
import {
  BookOpen,
  GraduationCap,
  Award,
  Mail,
  Copy,
  Check,
  ArrowRight,
  ExternalLink,
  Camera,
  Bot,
  PlayCircle,
  ShieldCheck,
} from "lucide-react";

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
    },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      type: "spring",
      stiffness: 220,
      damping: 24,
    },
  },
};

export default function About() {
  const { locale, isRtl } = useLocale();
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null);
  const [cvModalOpen, setCvModalOpen] = useState(false);

  const handleCopyEmail = async (email: string) => {
    try {
      await navigator.clipboard.writeText(email);
      setCopiedEmail(email);
      setTimeout(() => setCopiedEmail(null), 2500);
    } catch {
      // clipboard fallback
    }
  };

  return (
    <motion.main
      className="container py-12 sm:py-16 text-slate-900 dark:text-slate-100 font-sans"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      dir={isRtl ? "rtl" : "ltr"}
    >
      {/* ====================================================================
          STANDARDIZED SECTION HEADER (MATCHING RESEARCH, LIBRARY, SIMS)
          ==================================================================== */}
      <motion.div
        variants={itemVariants}
        className="mb-10 grid gap-6 lg:grid-cols-[1.2fr_.8fr] lg:items-end"
      >
        <div>
          <div className="mb-3 flex items-center gap-3">
            <p className="text-sm font-semibold tracking-wider text-indigo-600 dark:text-indigo-400">
              04 / {locale === "ar" ? "عن الأكاديمية والمؤسس" : "About MAE Academy"}
            </p>
            <span className="h-px w-16 bg-brand-gradient" />
          </div>
          <h1 className="max-w-3xl text-3xl lg:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            {locale === "ar" ? "نمذجة. تحليل. هندسة." : "Model. Analyze. Engineering."}
          </h1>
        </div>
        <p className="max-w-xl border-l-2 border-indigo-500/40 pl-5 text-sm md:text-base text-slate-500 leading-relaxed dark:text-zinc-400 rtl:border-l-0 rtl:border-r-2 rtl:pl-0 rtl:pr-5 font-normal">
          {locale === "ar"
            ? "السيرة الهندسية والملف التوثيقي لمؤسس أكاديمية MAE — ردم الفجوة بين ديناميكا الأجهزة الفيزيائية والمحاكاة الرقمية التفاعلية."
            : "Interactive Engineering Curriculum Vitae & Founder Dossier — bridging physical hardware dynamics and intuitive digital simulations."}
        </p>
      </motion.div>

      {/* ====================================================================
          SECTION 1: HERO FOUNDER CARD
          ==================================================================== */}
      <motion.section
        variants={itemVariants}
        aria-label="Founder Dossier Hero Card"
        className="relative mb-12 overflow-hidden rounded-3xl border border-slate-200/90 bg-white shadow-[0_24px_70px_-40px_rgba(15,23,42,0.14)] transition-all duration-300 dark:border-white/[0.08] dark:bg-[#08090d]"
      >
        {/* Subtle Background Accent Lighting */}
        <div
          className="pointer-events-none absolute -top-40 -right-40 h-96 w-96 rounded-full bg-violet-500/5 blur-3xl dark:bg-violet-600/10"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -bottom-40 -left-40 h-96 w-96 rounded-full bg-pink-500/5 blur-3xl dark:bg-pink-600/10"
          aria-hidden="true"
        />

        <div className="relative z-10 grid gap-8 p-6 sm:p-10 lg:grid-cols-[380px_1fr] lg:gap-12 xl:grid-cols-[400px_1fr]">
          {/* Left Column: Avatar Frame with iOS Segmented Switcher */}
          <div className="flex flex-col items-center justify-start lg:border-r lg:border-slate-100 lg:pr-10 dark:lg:border-white/[0.06]">
            <FounderAvatarFrame className="w-full" />
          </div>

          {/* Right Column: Identity, Bio & Social Links */}
          <div className="flex flex-col justify-between">
            <div>
              {/* Founder Name */}
              <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl lg:text-5xl dark:text-white">
                {founderProfile.name.en}
              </h2>
              <p className="mt-1 text-lg font-semibold text-slate-700 sm:text-xl dark:text-slate-300">
                {founderProfile.name.ar}
              </p>

              {/* Status Subtitle Badge */}
              <div className="mt-3.5 inline-flex flex-wrap items-center gap-2 rounded-xl border border-slate-200/80 bg-slate-50/70 px-3 py-1.5 text-xs font-medium text-slate-800 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-slate-200">
                <GraduationCap className="h-4 w-4 text-violet-600 dark:text-violet-400 shrink-0" />
                <span>
                  {founderProfile.title[locale === "ar" ? "ar" : "en"]} | BAU, FET (Class of {founderProfile.expectedGraduation})
                </span>
              </div>

              {/* Institutional Affiliation */}
              <p className="mt-2 text-xs font-normal text-slate-500 dark:text-slate-400">
                {founderProfile.institution[locale === "ar" ? "ar" : "en"]} – {founderProfile.department[locale === "ar" ? "ar" : "en"]}
              </p>

              {/* Engineering Philosophy Paragraphs */}
              <div className="mt-6 space-y-3.5 text-[15px] font-normal leading-relaxed text-slate-600 dark:text-slate-300">
                <p>
                  {founderProfile.philosophyParagraphs[0][locale === "ar" ? "ar" : "en"]}
                </p>
                <p>
                  {founderProfile.philosophyParagraphs[1][locale === "ar" ? "ar" : "en"]}
                </p>
              </div>
            </div>

            {/* Social Channels Row & Official Curriculum Vitae (CV) Trigger */}
            <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-6 dark:border-white/[0.06]">
              <div className="flex flex-wrap items-center gap-2.5">
                {/* LinkedIn */}
                <a
                  href={verifiedSocialLinks[0].url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Mohammad AbuElyan on LinkedIn"
                  title="LinkedIn Profile"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-2xs transition-all hover:border-violet-300 hover:bg-slate-50 hover:text-slate-950 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-slate-300 dark:hover:border-violet-500/30 dark:hover:bg-white/[0.08] dark:hover:text-white"
                >
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z" />
                  </svg>
                </a>

                {/* YouTube */}
                <a
                  href={verifiedSocialLinks[1].url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="MAE Academy on YouTube"
                  title="MAE Academy YouTube"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-2xs transition-all hover:border-violet-300 hover:bg-slate-50 hover:text-slate-950 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-slate-300 dark:hover:border-violet-500/30 dark:hover:bg-white/[0.08] dark:hover:text-white"
                >
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814ZM9.545 15.568V8.432L15.818 12l-6.273 3.568Z" />
                  </svg>
                </a>

                {/* Instagram */}
                <a
                  href={verifiedSocialLinks[2].url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="MAE Academy on Instagram"
                  title="MAE Academy Instagram"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-2xs transition-all hover:border-violet-300 hover:bg-slate-50 hover:text-slate-950 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-slate-300 dark:hover:border-violet-500/30 dark:hover:bg-white/[0.08] dark:hover:text-white"
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
                    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                    <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
                  </svg>
                </a>

                {/* Facebook */}
                <a
                  href={verifiedSocialLinks[3].url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="MAE Academy on Facebook"
                  title="MAE Academy Facebook"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-2xs transition-all hover:border-violet-300 hover:bg-slate-50 hover:text-slate-950 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-slate-300 dark:hover:border-violet-500/30 dark:hover:bg-white/[0.08] dark:hover:text-white"
                >
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.82 0-1.667.417-1.667 1.623v2.366h4.161l-.645 3.667h-3.516v7.98c-1.397.098-2.825.101-4.223 0Z" />
                  </svg>
                </a>

                {/* Direct Institutional Email */}
                <a
                  href={officialChannels[0].href}
                  aria-label="Send email to Mohammad AbuElyan"
                  title="Institutional Email"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-2xs transition-all hover:border-violet-300 hover:bg-slate-50 hover:text-slate-950 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-slate-300 dark:hover:border-violet-500/30 dark:hover:bg-white/[0.08] dark:hover:text-white"
                >
                  <Mail className="h-4 w-4" />
                </a>
              </div>

              {/* Official Academic Curriculum Vitae (CV) Trigger */}
              <button
                type="button"
                onClick={() => setCvModalOpen(true)}
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[#6366F1] via-[#8B5CF6] to-[#EC4899] px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:opacity-95 hover:shadow active:scale-95 shrink-0"
              >
                <BookOpen className="h-3.5 w-3.5" />
                <span>{locale === "ar" ? "السيرة الأكاديمية (CV)" : "Academic Curriculum Vitae"}</span>
              </button>
            </div>
          </div>
        </div>
      </motion.section>

      {/* ====================================================================
          SECTION 2: QUANTITATIVE IMPACT (METRICS STRIP)
          ==================================================================== */}
      <motion.section
        variants={itemVariants}
        aria-label="Quantitative Impact Metrics"
        className="mb-12 overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-xs dark:border-white/[0.08] dark:bg-[#08090d]"
      >
        <div className="grid grid-cols-2 divide-y divide-slate-200 sm:grid-cols-4 sm:divide-y-0 sm:divide-x dark:divide-slate-800">
          {impactMetrics.map((metric) => (
            <div key={metric.id} className="p-6 sm:p-7 text-center sm:text-start">
              <span className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-white">
                {metric.value}
              </span>
              <p className="mt-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
                {metric.label[locale === "ar" ? "ar" : "en"]}
              </p>
              <p className="mt-1 text-xs font-normal text-slate-500 dark:text-slate-400">
                {metric.sublabel[locale === "ar" ? "ar" : "en"]}
              </p>
            </div>
          ))}
        </div>
      </motion.section>

      {/* ====================================================================
          SECTION 3: BALANCED TWO-COLUMN DOSSIER LAYOUT
          Perfect height alignment between Left stacked cards & Right card
          ==================================================================== */}
      <section aria-label="Technical Depth & Field Record" className="mb-14">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
          {/* ================================================================
              LEFT COLUMN: Stacked Closed Cards (Authored Works + Leadership)
              ================================================================ */}
          <div className="flex flex-col gap-6">
            {/* --------------------------------------------------------------
                CARD 1: AUTHORED WORKS & VIDEO LECTURES
                Standalone closed card with clean borders and rounded corners
                -------------------------------------------------------------- */}
            <motion.article
              variants={itemVariants}
              className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-xs sm:p-8 dark:border-white/[0.08] dark:bg-[#08090d]"
            >
              <div>
                {/* Header */}
                <div className="flex items-center gap-3 border-b border-slate-100 pb-4 dark:border-white/[0.06]">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400">
                    <BookOpen className="h-5 w-5" />
                  </span>
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">
                      {locale === "ar" ? "المؤلفات والمساقات التعليمية" : "Authored Works & Video Lectures"}
                    </h3>
                    <p className="text-xs font-normal text-slate-500 dark:text-slate-400">
                      {locale === "ar"
                        ? "المساقات المرئية، الأدلة المنهجية، والمذكرات التطبيقية"
                        : "Video Courses, Study Guides & Laboratory Manuals"}
                    </p>
                  </div>
                </div>

                {/* Authored Works List */}
                <div className="mt-5 space-y-4">
                  {authoredWorks.map((work) => (
                    <div
                      key={work.id}
                      className="group rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4.5 transition-all hover:border-violet-200 hover:bg-white hover:shadow-xs dark:border-white/[0.06] dark:bg-white/[0.02] dark:hover:border-violet-900/40 dark:hover:bg-white/[0.04]"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="inline-flex items-center rounded-md bg-violet-50 px-2.5 py-0.5 text-xs font-medium text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
                          {work.category[locale === "ar" ? "ar" : "en"]}
                        </span>
                        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                          {work.platformOrFormat}
                        </span>
                      </div>

                      <h4 className="mt-2 text-sm font-semibold text-slate-900 dark:text-white group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors">
                        {work.title[locale === "ar" ? "ar" : "en"]}
                      </h4>

                      <p className="mt-1.5 text-xs font-normal leading-relaxed text-slate-600 dark:text-slate-300">
                        {work.description[locale === "ar" ? "ar" : "en"]}
                      </p>

                      {/* Technical Syllabus Topics */}
                      {work.keyTopics && (
                        <div className="mt-2.5 flex flex-wrap gap-1.5">
                          {work.keyTopics.map((topic, idx) => (
                            <span
                              key={idx}
                              className="rounded-md border border-slate-200/80 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700 dark:border-white/[0.06] dark:bg-white/[0.04] dark:text-slate-300"
                            >
                              {topic[locale === "ar" ? "ar" : "en"]}
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="mt-3 flex items-center justify-end">
                        {work.isExternal ? (
                          <a
                            href={work.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-violet-600 hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-300"
                          >
                            <PlayCircle className="h-3.5 w-3.5" />
                            <span>{work.linkText[locale === "ar" ? "ar" : "en"]}</span>
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          <Link
                            href={work.link}
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-violet-600 hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-300"
                          >
                            <span>{work.linkText[locale === "ar" ? "ar" : "en"]}</span>
                            <ArrowRight className="h-3 w-3" />
                          </Link>
                        )}
                      </div>
                    </div>
                  ))}

                  {/* Modernized Simulation Callout Banner with Official Gradient */}
                  <div className="relative overflow-hidden rounded-2xl border border-violet-200/80 bg-gradient-to-r from-violet-600/5 via-indigo-600/5 to-pink-600/5 p-5 dark:border-violet-900/40 dark:from-violet-950/30 dark:via-slate-950/40 dark:to-pink-950/20">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-semibold text-violet-700 dark:bg-violet-950/60 dark:text-violet-300">
                            {locale === "ar" ? "برمجيات هندسية" : "Production Software"}
                          </span>
                          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                            MAE Engine V3
                          </span>
                        </div>
                        <h4 className="mt-1.5 text-base font-bold text-slate-900 dark:text-white">
                          {locale === "ar" ? "محركات محاكاة MAE الهندسية التفاعلية" : "MAE Interactive Web Simulation Engines"}
                        </h4>
                        <p className="mt-1 text-xs font-normal text-slate-600 dark:text-slate-300">
                          {locale === "ar"
                            ? "محركات حوسبة رقمية داخل المتصفح للوحات PLC ومعالجات 8086 وأنظمة التحكم الديناميكية."
                            : "Web-based real-time simulation engines for PLC logic, 8086 microarchitectures, and feedback control."}
                        </p>
                      </div>

                      <Link
                        href="/simulations"
                        className="group inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-br from-[#6366F1] via-[#8B5CF6] to-[#EC4899] px-5 py-2.5 text-xs font-semibold text-white shadow-sm hover:shadow-md hover:opacity-95 transition-all active:scale-95 shrink-0"
                      >
                        <span>{locale === "ar" ? "تشغيل بيئات المحاكاة" : "Launch Simulators"}</span>
                        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            </motion.article>

            {/* --------------------------------------------------------------
                CARD 2: ACADEMIC LEADERSHIP & SERVICE (SPECTRUM & ATHAR TEAMS)
                Standalone closed card placed directly underneath Card 1
                -------------------------------------------------------------- */}
            <motion.article
              variants={itemVariants}
              className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-xs sm:p-8 dark:border-white/[0.08] dark:bg-[#08090d]"
            >
              <div>
                {/* Header */}
                <div className="flex items-center gap-3 border-b border-slate-100 pb-4 dark:border-white/[0.06]">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400">
                    <GraduationCap className="h-5 w-5" />
                  </span>
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">
                      {locale === "ar" ? "القيادة الأكاديمية والمبادرات الطلابية" : "Academic Leadership & Service"}
                    </h3>
                    <p className="text-xs font-normal text-slate-500 dark:text-slate-400">
                      {locale === "ar"
                        ? "المسؤولية الأكاديمية في فريقي سبيكتروم وأثر الهندسيين"
                        : "Academic Directorship across Spectrum & Athar Engineering Teams"}
                    </p>
                  </div>
                </div>

                {/* Leadership Roles List */}
                <div className="mt-5 space-y-4">
                  {academicLeadershipRoles.map((role) => (
                    <div
                      key={role.id}
                      className="flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-slate-50/50 p-5 transition-all hover:border-violet-200 hover:bg-white hover:shadow-xs dark:border-white/[0.06] dark:bg-white/[0.02] dark:hover:border-violet-900/40"
                    >
                      <div>
                        {/* Organization & Dedicated Logo Slot */}
                        <div className="flex items-center gap-3.5">
                          <div className="h-14 w-14 rounded-xl border border-slate-200/90 bg-white p-1.5 shadow-2xs overflow-hidden shrink-0 dark:border-white/[0.08] dark:bg-[#0c0d12] flex items-center justify-center">
                            <img
                              src={role.logo}
                              alt={`${role.organization.en} Logo`}
                              className="h-full w-full object-contain"
                              loading="lazy"
                            />
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <h4 className="font-semibold text-slate-900 dark:text-white text-base truncate">
                                {role.organization[locale === "ar" ? "ar" : "en"]}
                              </h4>
                              <span
                                className={`rounded-full px-2.5 py-0.5 text-xs font-medium shrink-0 ${
                                  role.status === "Current"
                                    ? "bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300 border border-violet-200/80 dark:border-violet-900/40"
                                    : "bg-slate-100 text-slate-600 dark:bg-white/[0.06] dark:text-slate-400"
                                }`}
                              >
                                {role.statusBadge[locale === "ar" ? "ar" : "en"]}
                              </span>
                            </div>

                            <p className="mt-0.5 text-xs font-medium text-violet-600 dark:text-violet-400">
                              {role.role[locale === "ar" ? "ar" : "en"]}
                            </p>
                          </div>
                        </div>

                        <p className="mt-3.5 text-xs font-normal leading-relaxed text-slate-600 dark:text-slate-300">
                          {role.contribution[locale === "ar" ? "ar" : "en"]}
                        </p>

                        <ul className="mt-3 space-y-1.5 text-xs font-normal text-slate-500 dark:text-slate-400">
                          {role.keyPillars.map((pillar, idx) => (
                            <li key={idx} className="flex items-start gap-2">
                              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-violet-400" />
                              <span>{pillar[locale === "ar" ? "ar" : "en"]}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.article>
          </div>

          {/* ================================================================
              RIGHT COLUMN: Field Robotics & Competitions
              ================================================================ */}
          <div className="flex flex-col">
            <motion.article
              variants={itemVariants}
              className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-xs sm:p-8 dark:border-white/[0.08] dark:bg-[#08090d]"
            >
              <div>
                {/* Header */}
                <div className="flex items-center gap-3 border-b border-slate-100 pb-4 dark:border-white/[0.06]">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400">
                    <Bot className="h-5 w-5" />
                  </span>
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">
                      {locale === "ar" ? "الروبوتات الميدانية والمنافسات" : "Field Robotics Competitions"}
                    </h3>
                    <p className="text-xs font-normal text-slate-500 dark:text-slate-400">
                      {locale === "ar" ? "المسابقات الوطنية والروبوتات المستقلة" : "National Contests & Autonomous Hardware"}
                    </p>
                  </div>
                </div>

                {/* Robotics Competitions List */}
                <div className="mt-5 space-y-4">
                  {roboticsCompetitions.map((comp) => (
                    <div
                      key={comp.id}
                      className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4.5 transition-all hover:border-violet-200 hover:bg-white dark:border-white/[0.06] dark:bg-white/[0.02] dark:hover:border-violet-900/40"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                          {comp.event[locale === "ar" ? "ar" : "en"]}
                        </h4>

                        <span className="inline-flex items-center gap-1 rounded-full border border-violet-200/80 bg-violet-50/80 px-2.5 py-0.5 text-xs font-medium text-violet-700 dark:border-violet-900/40 dark:bg-violet-950/40 dark:text-violet-300">
                          <Award className="h-3 w-3" />
                          <span>{comp.roleAchievement[locale === "ar" ? "ar" : "en"]}</span>
                        </span>
                      </div>

                      {/* Clean Minimal Image Slot (Preserving exact 16:9 aspect ratio) */}
                      <div className="aspect-video w-full rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center overflow-hidden my-3 dark:bg-white/[0.02] dark:border-white/[0.08]">
                        {comp.imageSrc ? (
                          <img
                            src={comp.imageSrc}
                            alt={comp.event.en}
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="flex flex-col items-center justify-center text-slate-400 dark:text-slate-500">
                            <Camera className="h-6 w-6 stroke-[1.5] mb-1.5 opacity-60" />
                            <span className="text-xs font-medium tracking-wide">
                              {locale === "ar" ? "مساحة الصورة" : "Photo Slot"}
                            </span>
                          </div>
                        )}
                      </div>

                      <p className="text-xs font-normal leading-relaxed text-slate-600 dark:text-slate-300">
                        {comp.details[locale === "ar" ? "ar" : "en"]}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </motion.article>
          </div>
        </div>
      </section>

      {/* ====================================================================
          SECTION 4: OFFICIAL CHANNELS & DIRECT INQUIRIES (FULL-WIDTH)
          ==================================================================== */}
      <motion.section
        variants={itemVariants}
        aria-label="Direct Inquiries and Official Contact"
        className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-xs sm:p-10 dark:border-white/[0.08] dark:bg-[#08090d]"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 pb-6 dark:border-white/[0.06]">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-2xl">
              {locale === "ar" ? "قنوات المراسلات الرسمية" : "Direct Inquiries & Official Channels"}
            </h2>
            <p className="mt-1 text-xs font-normal text-slate-500 dark:text-slate-400">
              {locale === "ar"
                ? "قنوات تواصل معتمدة للجامعات، المؤتمرات، والتعاون الأكاديمي والبحثي."
                : "Verified direct communication lines for academic institutions, research collaboration, and educational partnerships."}
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs font-medium text-slate-400 dark:text-slate-500">
            <ShieldCheck className="h-4 w-4 text-violet-600 dark:text-violet-400" />
            <span>Verified Communication Lines</span>
          </div>
        </div>

        {/* Dual-Card Contact Drawer */}
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          {officialChannels.map((channel) => {
            const isCopied = copiedEmail === channel.address;
            return (
              <div
                key={channel.id}
                className="flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-slate-50/50 p-6 transition-all hover:border-violet-200 hover:bg-white dark:border-white/[0.06] dark:bg-white/[0.02] dark:hover:border-violet-900/40"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-violet-700 dark:text-violet-400">
                      {channel.type === "institutional"
                        ? locale === "ar"
                          ? "البريد الجامعي الرسمي"
                          : "University Official"
                        : locale === "ar"
                        ? "بريد المنصة التنفيذي"
                        : "Platform Official"}
                    </span>
                    <span className="flex h-2 w-2 rounded-full bg-violet-500" />
                  </div>

                  <h3 className="mt-2 text-sm font-semibold text-slate-900 dark:text-white">
                    {channel.label[locale === "ar" ? "ar" : "en"]}
                  </h3>

                  <p className="mt-1 text-xs font-normal leading-relaxed text-slate-500 dark:text-slate-400">
                    {channel.description[locale === "ar" ? "ar" : "en"]}
                  </p>
                </div>

                {/* Interactive Address Row with Copy & Mailto Buttons */}
                <div className="mt-6 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-t border-slate-200/60 pt-4 dark:border-white/[0.04]">
                  <span className="text-xs font-medium text-slate-800 dark:text-slate-200 select-all truncate">
                    {channel.address}
                  </span>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleCopyEmail(channel.address)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-700 shadow-2xs transition hover:bg-slate-50 active:scale-95 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-slate-200 dark:hover:bg-white/[0.08]"
                      title="Copy email to clipboard"
                    >
                      {isCopied ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
                          <span className="text-violet-600 dark:text-violet-400 font-medium">
                            {locale === "ar" ? "تم النسخ" : "Copied"}
                          </span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" />
                          <span>{locale === "ar" ? "نسخ" : "Copy"}</span>
                        </>
                      )}
                    </button>

                    <a
                      href={channel.href}
                      className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-[#6366F1] via-[#8B5CF6] to-[#EC4899] px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:opacity-95 hover:shadow active:scale-95"
                    >
                      <Mail className="h-3.5 w-3.5" />
                      <span>{locale === "ar" ? "مراسلة" : "Mail"}</span>
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </motion.section>

      {/* Official Curriculum Vitae Document Modal */}
      <CurriculumVitaeModal open={cvModalOpen} onOpenChange={setCvModalOpen} />
    </motion.main>
  );
}
