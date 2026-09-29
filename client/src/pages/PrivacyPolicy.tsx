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

export default function PrivacyPolicy() {
  const { t } = useTranslation("legal");
  const { locale, isRtl } = useLocale();
  usePageTitle(t("privacy.title"));

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
          {t("privacy.title")}
        </h1>
        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
          {t("privacy.effectiveDate")}
        </p>
      </header>

      <div className="text-slate-600 dark:text-slate-300 leading-relaxed space-y-6">
        <p dangerouslySetInnerHTML={{ __html: t("privacy.intro") }} />

        <h2 className="text-xl sm:text-2xl font-semibold text-slate-900 dark:text-white mt-8 mb-3">
          {t("privacy.collection.title")}
        </h2>
        <p>{t("privacy.collection.p1")}</p>
        <p dangerouslySetInnerHTML={{ __html: t("privacy.collection.p2") }} />

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
