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

export default function TermsOfService() {
  const { t } = useTranslation("legal");
  const { locale, isRtl } = useLocale();
  usePageTitle(t("terms.title"));

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
          {t("terms.title")}
        </h1>
        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
          {t("terms.effectiveDate")}
        </p>
      </header>

      <div className="text-slate-600 dark:text-slate-300 leading-relaxed space-y-6">
        <p dangerouslySetInnerHTML={{ __html: t("terms.intro") }} />

        <h2 className="text-xl sm:text-2xl font-semibold text-slate-900 dark:text-white mt-8 mb-3">
          {t("terms.service.title")}
        </h2>
        <p>{t("terms.service.p1")}</p>

        <h2 className="text-xl sm:text-2xl font-semibold text-slate-900 dark:text-white mt-8 mb-3">
          {t("terms.ip.title")}
        </h2>
        <p dangerouslySetInnerHTML={{ __html: t("terms.ip.p1") }} />
        <p dangerouslySetInnerHTML={{ __html: t("terms.ip.p2") }} />

        <h2 className="text-xl sm:text-2xl font-semibold text-slate-900 dark:text-white mt-8 mb-3">
          {t("terms.disclaimer.title")}
        </h2>
        <p>{t("terms.disclaimer.p1")}</p>
        <p>{t("terms.disclaimer.p2")}</p>

        <h2 className="text-xl sm:text-2xl font-semibold text-slate-900 dark:text-white mt-8 mb-3">
          {t("terms.links.title")}
        </h2>
        <p>{t("terms.links.p1")}</p>

        <h2 className="text-xl sm:text-2xl font-semibold text-slate-900 dark:text-white mt-8 mb-3">
          {t("terms.law.title")}
        </h2>
        <p>{t("terms.law.p1")}</p>

        <h2 className="text-xl sm:text-2xl font-semibold text-slate-900 dark:text-white mt-8 mb-3">
          {t("terms.contact.title")}
        </h2>
        <p dangerouslySetInnerHTML={{ __html: t("terms.contact.p1") }} />
      </div>
    </motion.article>
  );
}
