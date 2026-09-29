import { motion, type Variants } from "framer-motion";
import { useLocale } from "@/contexts/LocaleContext";
import { useTranslation } from "react-i18next";
import { usePageTitle } from "@/hooks/usePageTitle";

const containerVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: "easeOut" },
  },
};

export default function AttributionPolicy() {
  const { t } = useTranslation("legal");
  const { locale, isRtl } = useLocale();
  usePageTitle(t("attribution.title"));

  return (
    <motion.article
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      dir={isRtl ? "rtl" : "ltr"}
      lang={locale}
      className={`max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 ${
        isRtl ? "font-['Tajawal',sans-serif]" : "font-['Poppins',sans-serif]"
      }`}
    >
      <header className="mb-10">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-white">
          {t("attribution.title")}
        </h1>
        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
          {t("attribution.effectiveDate")}
        </p>
      </header>

      <div className="text-slate-600 dark:text-slate-300 leading-relaxed space-y-6">
        <p>{t("attribution.intro")}</p>

        <h2 className="text-xl sm:text-2xl font-semibold text-slate-900 dark:text-white mt-8 mb-3">
          {t("attribution.library.title")}
        </h2>
        <p dangerouslySetInnerHTML={{ __html: t("attribution.library.p1") }} />

        <h2 className="text-xl sm:text-2xl font-semibold text-slate-900 dark:text-white mt-8 mb-3">
          {t("attribution.research.title")}
        </h2>
        <p dangerouslySetInnerHTML={{ __html: t("attribution.research.p1") }} />

        <h2 className="text-xl sm:text-2xl font-semibold text-slate-900 dark:text-white mt-8 mb-3">
          {t("attribution.simulations.title")}
        </h2>
        <p>{t("attribution.simulations.p1")}</p>

        <h2 className="text-xl sm:text-2xl font-semibold text-slate-900 dark:text-white mt-8 mb-3">
          {t("attribution.dmca.title")}
        </h2>
        <p>{t("attribution.dmca.p1")}</p>
        <p dangerouslySetInnerHTML={{ __html: t("attribution.dmca.p2") }} />
        <p>{t("attribution.dmca.p3")}</p>
      </div>
    </motion.article>
  );
}
