/**
 * MAE Academy: Editorial Engineering Curriculum Vitae (CV) Modal.
 * High-precision, printable, academic document layout.
 * Strictly free of emojis, unified Poppins typography, zero green accents.
 */
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  founderProfile,
  impactMetrics,
  authoredWorks,
  roboticsCompetitions,
  academicLeadershipRoles,
  officialChannels,
} from "@/data/founderDossier";
import { useLocale } from "@/contexts/LocaleContext";
import {
  Printer,
  Copy,
  Check,
  Building,
  Award,
  BookOpen,
  GraduationCap,
  Mail,
  ShieldCheck,
} from "lucide-react";

interface CurriculumVitaeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function CurriculumVitaeModal({ open, onOpenChange }: CurriculumVitaeModalProps) {
  const { locale, isRtl } = useLocale();
  const [copied, setCopied] = useState(false);

  const handlePrint = () => {
    window.print();
  };

  const handleCopySummary = async () => {
    const summary = `${founderProfile.name.en} (${founderProfile.name.ar})
${founderProfile.title.en}
${founderProfile.institution.en}
${founderProfile.standing.en} (Class of ${founderProfile.expectedGraduation})
Email: ${officialChannels[0].address} | Platform: ${officialChannels[1].address}
Impact: ${impactMetrics.map((m) => `${m.label.en}: ${m.value}`).join(" | ")}
MAE Academy: Model. Analyze. Engineering.`;

    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard fallback
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90vh] w-full max-w-4xl overflow-y-auto p-0 border border-slate-200 bg-white font-sans text-slate-900 shadow-2xl dark:border-white/[0.08] dark:bg-[#0c0d12] dark:text-slate-100"
        dir={isRtl ? "rtl" : "ltr"}
      >
        {/* Document Header & Print Controls */}
        <div className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white/95 px-6 py-4 backdrop-blur-md dark:border-white/[0.08] dark:bg-[#0c0d12]/95 print:hidden">
          <div className="flex items-center gap-2">
            <span className="flex h-2.5 w-2.5 rounded-full bg-violet-600" />
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Curriculum Vitae Document
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopySummary}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-700 shadow-2xs transition hover:bg-slate-50 active:scale-95 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-slate-300 dark:hover:bg-white/[0.08]"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
                  <span className="text-violet-600 dark:text-violet-400 font-medium">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  <span>Copy Text</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 rounded-full brand-active-pill px-4 py-1.5 text-xs font-semibold shadow-sm transition hover:opacity-95 hover:shadow active:scale-95"
            >
              <Printer className="h-3.5 w-3.5" />
              <span>Print / Save PDF</span>
            </button>
          </div>
        </div>

        {/* Printable Academic Document Body */}
        <div className="p-6 sm:p-10 space-y-8 print:p-0">
          <DialogHeader className="border-b border-slate-200 pb-6 dark:border-white/[0.08] text-start">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div>
                <DialogTitle className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                  {founderProfile.name.fullNameEn}
                </DialogTitle>
                <DialogDescription className="text-base font-semibold text-slate-600 dark:text-slate-300 mt-0.5">
                  {founderProfile.name.fullNameAr}
                </DialogDescription>
                <p className="mt-2 text-xs font-medium text-violet-600 dark:text-violet-400">
                  {founderProfile.title[locale === "ar" ? "ar" : "en"]}
                </p>
              </div>

              <div className="text-xs text-slate-500 dark:text-slate-400 space-y-1 sm:text-end">
                <p className="font-semibold text-slate-700 dark:text-slate-200">
                  Faculty of Engineering Technology
                </p>
                <p>Al-Balqa Applied University (BAU)</p>
                <p>Class of {founderProfile.expectedGraduation}</p>
                <p className="text-violet-600 dark:text-violet-400">{officialChannels[0].address}</p>
              </div>
            </div>
          </DialogHeader>

          {/* Education & Academic Profile */}
          <section>
            <h4 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-white border-b border-slate-100 pb-2 dark:border-white/[0.06]">
              <GraduationCap className="h-4 w-4 text-violet-600" />
              <span>Academic Education</span>
            </h4>
            <div className="mt-3 rounded-xl border border-slate-200/80 bg-slate-50/50 p-4 dark:border-white/[0.06] dark:bg-white/[0.02]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h5 className="font-semibold text-sm text-slate-900 dark:text-white">
                  B.Sc. in Mechatronics Engineering
                </h5>
                <span className="text-xs text-slate-500">2024 – 2028 (Expected)</span>
              </div>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                {founderProfile.institution.en}
              </p>
              <div className="mt-3 flex flex-wrap gap-3">
                {impactMetrics.map((metric) => (
                  <span
                    key={metric.id}
                    className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-slate-300"
                  >
                    {metric.label.en}: <strong className="text-slate-900 dark:text-white">{metric.value}</strong>
                  </span>
                ))}
              </div>
            </div>
          </section>

          {/* Authored Works */}
          <section>
            <h4 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-white border-b border-slate-100 pb-2 dark:border-white/[0.06]">
              <BookOpen className="h-4 w-4 text-violet-600" />
              <span>Authored Works & Video Lectures</span>
            </h4>
            <div className="mt-3 space-y-3">
              {authoredWorks.map((work) => (
                <div
                  key={work.id}
                  className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-3.5 dark:border-white/[0.06] dark:bg-white/[0.02]"
                >
                  <div className="flex items-center justify-between">
                    <h5 className="text-xs font-bold text-slate-900 dark:text-white">{work.title.en}</h5>
                    <span className="text-xs text-violet-600 dark:text-violet-400 font-medium">{work.category.en}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{work.description.en}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Robotics Competitions */}
          <section>
            <h4 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-white border-b border-slate-100 pb-2 dark:border-white/[0.06]">
              <Award className="h-4 w-4 text-violet-600" />
              <span>Robotics Competitions</span>
            </h4>
            <div className="mt-3 space-y-3">
              {roboticsCompetitions.map((comp) => (
                <div
                  key={comp.id}
                  className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-3.5 dark:border-white/[0.06] dark:bg-white/[0.02]"
                >
                  <div className="flex items-center justify-between">
                    <h5 className="text-xs font-bold text-slate-900 dark:text-white">{comp.event.en}</h5>
                    <span className="text-xs text-violet-600 dark:text-violet-400 font-medium">{comp.roleAchievement.en}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{comp.details.en}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Academic Leadership */}
          <section>
            <h4 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-white border-b border-slate-100 pb-2 dark:border-white/[0.06]">
              <Building className="h-4 w-4 text-violet-600" />
              <span>Academic Leadership</span>
            </h4>
            <div className="mt-3 space-y-3">
              {academicLeadershipRoles.map((role) => (
                <div
                  key={role.id}
                  className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-3.5 dark:border-white/[0.06] dark:bg-white/[0.02]"
                >
                  <div className="flex items-center justify-between">
                    <h5 className="text-xs font-bold text-slate-900 dark:text-white">
                      {role.organization.en} – {role.role.en}
                    </h5>
                    <span className="text-xs text-slate-500">{role.status}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{role.contribution.en}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Verification Footer */}
          <div className="border-t border-slate-200 pt-4 flex items-center justify-between text-xs text-slate-400 dark:border-white/[0.08]">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-violet-600" />
              <span>MAE Academy Official Engineering Record</span>
            </div>
            <span>Amman, Jordan</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
