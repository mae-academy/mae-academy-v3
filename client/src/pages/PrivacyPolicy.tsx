import { motion, type Variants } from "framer-motion";
import { useEffect } from "react";
import { useLocale } from "@/contexts/LocaleContext";
import { useTranslation } from "react-i18next";
import { usePageTitle } from "@/hooks/usePageTitle";
import { ShieldCheck, Trash2, Bot, Mail, Sparkles } from "lucide-react";

const containerVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: "easeOut" },
  },
};

export default function PrivacyPolicy() {
  const { t } = useTranslation("legal");
  const { locale, isRtl } = useLocale();
  usePageTitle(t("privacy.title"));

  // Ensure direct hash linking to #data-deletion works reliably in SPA
  useEffect(() => {
    const scrollToHash = () => {
      const hash = window.location.hash;
      if (hash) {
        const id = hash.replace(/^#/, "");
        const el = document.getElementById(id);
        if (el) {
          el.scrollIntoView({ behavior: "smooth" });
        }
      }
    };
    const timer = setTimeout(scrollToHash, 150);
    window.addEventListener("hashchange", scrollToHash);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("hashchange", scrollToHash);
    };
  }, []);

  return (
    <motion.article
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      dir={isRtl ? "rtl" : "ltr"}
      lang={locale}
      className={`max-w-[1380px] mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 ${
        isRtl ? "font-[Tajawal,sans-serif]" : "font-[Poppins,sans-serif]"
      }`}
    >
      <header className="mb-10">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-200/80 bg-violet-50/70 px-3 py-1 text-xs font-medium text-violet-700 dark:border-violet-500/30 dark:bg-violet-950/40 dark:text-violet-300">
            <ShieldCheck className="h-3.5 w-3.5" />
            Meta App Review & Compliance
          </span>
          <a
            href="#data-deletion"
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/80 bg-slate-100/70 px-3 py-1 text-xs font-medium text-slate-700 hover:border-violet-300 hover:text-violet-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:text-violet-300 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5 text-rose-500" />
            #data-deletion instructions &rarr;
          </a>
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-white">
          {t("privacy.title")}
        </h1>
        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
          {t("privacy.effectiveDate")}
        </p>
      </header>

      <div className="max-w-4xl text-slate-600 dark:text-slate-300 leading-relaxed space-y-6">
        <p dangerouslySetInnerHTML={{ __html: t("privacy.intro") }} />

        <h2 className="text-xl sm:text-2xl font-semibold text-slate-900 dark:text-white mt-8 mb-3">
          {t("privacy.collection.title")}
        </h2>
        <p>{t("privacy.collection.p1")}</p>
        <p dangerouslySetInnerHTML={{ __html: t("privacy.collection.p2") }} />

        {/* Instagram Automation Section */}
        <section className="rounded-2xl border border-slate-200/80 bg-slate-50/60 p-6 sm:p-7 dark:border-white/10 dark:bg-white/[0.02] my-8 space-y-3">
          <div className="flex items-center gap-2.5 mb-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-tr from-pink-500 to-violet-600 text-white shadow-xs">
              <Bot className="h-4 w-4" />
            </div>
            <h2 className="text-xl sm:text-2xl font-semibold text-slate-900 dark:text-white">
              {t("privacy.instagram.title")}
            </h2>
          </div>
          <p>{t("privacy.instagram.p1")}</p>
          <p>{t("privacy.instagram.p2")}</p>
          <p dangerouslySetInnerHTML={{ __html: t("privacy.instagram.p3") }} />
        </section>

        {/* Data Deletion Anchor Section */}
        <section
          id="data-deletion"
          className="scroll-mt-24 rounded-2xl border border-violet-200/90 bg-gradient-to-br from-violet-50/70 via-white/80 to-purple-50/50 p-6 sm:p-8 dark:border-violet-500/25 dark:from-violet-950/25 dark:via-slate-900/60 dark:to-purple-950/20 shadow-xs my-8"
        >
          <div className="flex items-start gap-4 mb-5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white shadow-sm dark:bg-violet-500">
              <Trash2 className="h-5 w-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                  {t("privacy.dataDeletion.title")}
                </h2>
                <span className="inline-flex items-center rounded-md bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
                  {t("privacy.dataDeletion.badge")}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                Direct Anchor: #data-deletion
              </p>
            </div>
          </div>

          <div className="space-y-4 text-slate-600 dark:text-slate-300">
            <p>{t("privacy.dataDeletion.p1")}</p>
            <p>{t("privacy.dataDeletion.p2")}</p>

            <div className="grid gap-3.5 my-5">
              <div className="rounded-xl border border-slate-200/70 bg-white/70 p-4 dark:border-white/10 dark:bg-white/[0.03]">
                <h3 className="font-semibold text-slate-900 dark:text-white mb-1">
                  {t("privacy.dataDeletion.step1Title")}
                </h3>
                <p className="text-sm" dangerouslySetInnerHTML={{ __html: t("privacy.dataDeletion.step1Desc") }} />
              </div>

              <div className="rounded-xl border border-slate-200/70 bg-white/70 p-4 dark:border-white/10 dark:bg-white/[0.03]">
                <h3 className="font-semibold text-slate-900 dark:text-white mb-1">
                  {t("privacy.dataDeletion.step2Title")}
                </h3>
                <p className="text-sm" dangerouslySetInnerHTML={{ __html: t("privacy.dataDeletion.step2Desc") }} />
              </div>

              <div className="rounded-xl border border-slate-200/70 bg-white/70 p-4 dark:border-white/10 dark:bg-white/[0.03]">
                <h3 className="font-semibold text-slate-900 dark:text-white mb-1">
                  {t("privacy.dataDeletion.step3Title")}
                </h3>
                <p className="text-sm" dangerouslySetInnerHTML={{ __html: t("privacy.dataDeletion.step3Desc") }} />
              </div>
            </div>

            <div className="rounded-xl bg-violet-100/60 p-4 dark:bg-violet-950/40 text-sm space-y-2 border border-violet-200/60 dark:border-violet-500/20">
              <p dangerouslySetInnerHTML={{ __html: t("privacy.dataDeletion.window") }} />
              <p dangerouslySetInnerHTML={{ __html: t("privacy.dataDeletion.jurisdiction") }} />
            </div>
          </div>
        </section>

        <h2 className="text-xl sm:text-2xl font-semibold text-slate-900 dark:text-white mt-8 mb-3">
          {t("privacy.logs.title")}
        </h2>
        <p>{t("privacy.logs.p1")}</p>

        <h2 className="text-xl sm:text-2xl font-semibold text-slate-900 dark:text-white mt-8 mb-3">
          {t("privacy.cookies.title")}
        </h2>
        <p>{t("privacy.cookies.intro")}</p>
        <ul className="list-disc ps-6 space-y-2">
          <li>{t("privacy.cookies.l1")}</li>
          <li>{t("privacy.cookies.l2")}</li>
        </ul>
        <p dangerouslySetInnerHTML={{ __html: t("privacy.cookies.optOut") }} />

        <h2 className="text-xl sm:text-2xl font-semibold text-slate-900 dark:text-white mt-8 mb-3">
          {t("privacy.ip.title")}
        </h2>
        <p>{t("privacy.ip.p1")}</p>

        <h2 className="text-xl sm:text-2xl font-semibold text-slate-900 dark:text-white mt-8 mb-3">
          {t("privacy.children.title")}
        </h2>
        <p>{t("privacy.children.p1")}</p>

        <h2 className="text-xl sm:text-2xl font-semibold text-slate-900 dark:text-white mt-8 mb-3">
          {t("privacy.contact.title")}
        </h2>
        <p>{t("privacy.contact.p1")}</p>
        <p dangerouslySetInnerHTML={{ __html: t("privacy.contact.p2") }} />
      </div>
    </motion.article>
  );
}
