/**
 * MAE Academy - Core Engineering Platforms Section
 * Vertical feature showcase (Z-pattern / alternating 50-50 columns) with:
 * 1. Practical Simulations: Image slot + Active module links (Control, Circuits, Power, Assembly)
 * 2. Academic Courses: Inverted order (Content + Curricula links + Image slot)
 * 3. Academic Research: Image slot + Mathematical modeling content
 */
import { Link } from "wouter";
import { motion, Variants } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";

const sectionVariants: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.12,
      delayChildren: 0.05,
    },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: "spring", stiffness: 140, damping: 20 },
  },
};

// Clean Visual Preview Placeholder Slot (Ready for static image imports)
function VisualPreviewSlot() {
  return (
    <div className="relative w-full min-h-[440px] lg:min-h-[500px] rounded-2xl border border-slate-200/80 bg-slate-50/50 shadow-sm overflow-hidden flex items-center justify-center dark:border-white/[0.08] dark:bg-zinc-950/60" />
  );
}

export default function EngineeringPlatformsSection() {
  const { copy } = useLocale();
  const { home } = copy;

  return (
    <motion.section
      id="engineering-platforms"
      variants={sectionVariants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.08 }}
      className="py-12 sm:py-16 border-t border-slate-200/80 dark:border-white/[0.08] bg-white dark:bg-[#000000]"
    >
      <div className="max-w-[1380px] mx-auto px-6 sm:px-8 lg:px-12 w-full">
        {/* Section Header */}
        <motion.div variants={itemVariants} className="text-center max-w-3xl mx-auto mb-12 sm:mb-16">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-slate-900 dark:text-white">
            {home.platformsTitle}
          </h2>
          <div className="mae-signal-rule mx-auto my-3" />
          <p className="mt-2 text-base md:text-lg text-slate-500 dark:text-zinc-400 max-w-xl mx-auto">
            {home.platformsSubtitle}
          </p>
        </motion.div>

        <div className="divide-y divide-slate-100 dark:divide-white/5 space-y-4">
          {/* ============================================================ */}
          {/* FEATURE ROW 1: Practical Simulations (Visual Left 7 / Content Right 5) */}
          {/* ============================================================ */}
          <motion.div
            variants={itemVariants}
            className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-stretch py-12 lg:py-16"
          >
            {/* Visual Column: lg:col-span-7 */}
            <div className="lg:col-span-7 w-full h-full flex items-center">
              <VisualPreviewSlot />
            </div>

            {/* Content Column: lg:col-span-5 */}
            <div className="lg:col-span-5 flex flex-col justify-center space-y-6">
              <div>
                <h3 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                  Practical Simulations & Virtual Lab Benches
                </h3>

                <p className="mt-3 text-base text-slate-600 dark:text-zinc-400 leading-relaxed">
                  Bridge abstract mathematics with interactive, real-time physical simulation. Explore state transitions, transient settling curves, and feedback responses instantly in your browser.
                </p>
              </div>

              {/* Clean Navigational Links (3 Standardized Links, Text-First, No Icons) */}
              <div className="space-y-1">
                <Link
                  href="/simulations/control-systems"
                  className="group flex items-center justify-between px-3.5 py-3.5 -mx-3.5 rounded-lg hover:bg-slate-50 dark:hover:bg-white/[0.04] transition-colors"
                >
                  <span className="text-base md:text-lg font-medium text-slate-800 transition-colors group-hover:text-blue-600 dark:text-zinc-300 dark:group-hover:text-white">
                    Control Systems Simulator
                  </span>
                  <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-blue-600 group-hover:translate-x-1 transition-all dark:text-zinc-500 dark:group-hover:text-white" />
                </Link>

                <Link
                  href="/simulations/circuits"
                  className="group flex items-center justify-between px-3.5 py-3.5 -mx-3.5 rounded-lg hover:bg-slate-50 dark:hover:bg-white/[0.04] transition-colors"
                >
                  <span className="text-base md:text-lg font-medium text-slate-800 transition-colors group-hover:text-blue-600 dark:text-zinc-300 dark:group-hover:text-white">
                    Electrical Circuits Simulator
                  </span>
                  <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-blue-600 group-hover:translate-x-1 transition-all dark:text-zinc-500 dark:group-hover:text-white" />
                </Link>

                <Link
                  href="/simulations/power-electronics"
                  className="group flex items-center justify-between px-3.5 py-3.5 -mx-3.5 rounded-lg hover:bg-slate-50 dark:hover:bg-white/[0.04] transition-colors"
                >
                  <span className="text-base md:text-lg font-medium text-slate-800 transition-colors group-hover:text-blue-600 dark:text-zinc-300 dark:group-hover:text-white">
                    Power Electronics Simulator
                  </span>
                  <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-blue-600 group-hover:translate-x-1 transition-all dark:text-zinc-500 dark:group-hover:text-white" />
                </Link>
              </div>

              {/* CTA 1: Electric Blue (#2563EB) to Deep Violet (#7C3AED) */}
              <div className="pt-2">
                <Link
                  href="/simulations"
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#2563EB] to-[#7C3AED] hover:from-[#1D4ED8] hover:to-[#6D28D9] text-white px-7 py-3.5 text-base font-semibold shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:shadow-blue-500/25 active:translate-y-0"
                >
                  Explore All Simulations
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </motion.div>

          {/* ============================================================ */}
          {/* FEATURE ROW 2: Academic Courses (Content Left 5 / Visual Right 7) */}
          {/* ============================================================ */}
          <motion.div
            variants={itemVariants}
            className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-stretch py-12 lg:py-16"
          >
            {/* Content Column: lg:col-span-5 */}
            <div className="lg:col-span-5 flex flex-col justify-center space-y-6 order-2 lg:order-1">
              <div>
                <h3 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                  Rigorous Engineering Courses
                </h3>

                <p className="mt-3 text-base text-slate-600 dark:text-zinc-400 leading-relaxed">
                  Concept-first lecture series and structured study tracks covering foundational and advanced engineering topics with mathematical rigor and intuitive visual breakdowns.
                </p>
              </div>

              {/* Clean Navigational Links (Text-First, No Icons) */}
              <div className="space-y-1">
                {[
                  "Classical Control Theory",
                  "Modern State Space",
                  "Signal Processing & Filter Design",
                  "Embedded Systems",
                ].map((track) => (
                  <Link
                    key={track}
                    href="/courses"
                    className="group flex items-center justify-between px-3.5 py-3.5 -mx-3.5 rounded-lg hover:bg-slate-50 dark:hover:bg-white/[0.04] transition-colors"
                  >
                    <span className="text-base md:text-lg font-medium text-slate-800 transition-colors group-hover:text-violet-600 dark:text-zinc-300 dark:group-hover:text-white">
                      {track}
                    </span>
                    <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-violet-600 group-hover:translate-x-1 transition-all dark:text-zinc-500 dark:group-hover:text-white" />
                  </Link>
                ))}
              </div>

              {/* CTA 2: Deep Violet (#7C3AED) to Warm Crimson / Rose-Red (#E11D48) */}
              <div className="pt-2">
                <Link
                  href="/courses"
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#E11D48] hover:from-[#6D28D9] hover:to-[#BE123C] text-white px-7 py-3.5 text-base font-semibold shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:shadow-violet-500/25 active:translate-y-0"
                >
                  Browse Course Catalog
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>

            {/* Visual Column: lg:col-span-7 */}
            <div className="lg:col-span-7 w-full h-full flex items-center order-1 lg:order-2">
              <VisualPreviewSlot />
            </div>
          </motion.div>

          {/* ============================================================ */}
          {/* FEATURE ROW 3: Academic Research (Visual Left 7 / Content Right 5) */}
          {/* ============================================================ */}
          <motion.div
            variants={itemVariants}
            className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-stretch py-12 lg:py-16"
          >
            {/* Visual Column: lg:col-span-7 */}
            <div className="lg:col-span-7 w-full h-full flex items-center">
              <VisualPreviewSlot />
            </div>

            {/* Content Column: lg:col-span-5 */}
            <div className="lg:col-span-5 flex flex-col justify-center space-y-6">
              <div>
                <h3 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                  Mathematical Research & System Identification
                </h3>

                <p className="mt-3 text-base text-slate-600 dark:text-zinc-400 leading-relaxed">
                  Open research notes, mathematical formulations, transfer functions, and algorithmic proofs behind our simulations. Grounded in numerical physics and validated against benchmark experiments.
                </p>
              </div>

              {/* Clean Navigational Links (Text-First, No Icons) */}
              <div className="space-y-1">
                {[
                  "Nonlinear System Identification",
                  "Dynamic Simulation Solvers",
                  "Algorithmic Derivations & Proofs",
                ].map((pillar) => (
                  <Link
                    key={pillar}
                    href="/research"
                    className="group flex items-center justify-between px-3.5 py-3.5 -mx-3.5 rounded-lg hover:bg-slate-50 dark:hover:bg-white/[0.04] transition-colors"
                  >
                    <span className="text-base md:text-lg font-medium text-slate-800 transition-colors group-hover:text-rose-600 dark:text-zinc-300 dark:group-hover:text-white">
                      {pillar}
                    </span>
                    <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-rose-600 group-hover:translate-x-1 transition-all dark:text-zinc-500 dark:group-hover:text-white" />
                  </Link>
                ))}
              </div>

              {/* CTA 3: Crimson / Rose-Red (#E11D48) to Deep Violet (#7C3AED) */}
              <div className="pt-2">
                <Link
                  href="/research"
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#E11D48] to-[#7C3AED] hover:from-[#BE123C] hover:to-[#6D28D9] text-white px-7 py-3.5 text-base font-semibold shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:shadow-rose-500/25 active:translate-y-0"
                >
                  Explore Research Notes
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </motion.section>
  );
}
