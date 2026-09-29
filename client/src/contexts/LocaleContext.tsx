/** MAE Academy localization architecture: selected language and complete locale copy for the whole application. */
import { createContext, ReactNode, useContext, useEffect } from "react";
import type { Locale } from "@/data/platform";
import { localizedContent, LocaleContent } from "@/data/content";
import i18n from "@/i18n/config";

type LocaleContextValue = { locale: Locale; copy: LocaleContent; isRtl: boolean };
const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  useEffect(() => {
    if (i18n.language !== locale) {
      i18n.changeLanguage(locale);
    }
  }, [locale]);

  return <LocaleContext.Provider value={{ locale, copy: localizedContent[locale], isRtl: locale === "ar" }}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const value = useContext(LocaleContext);
  if (!value) throw new Error("useLocale must be used inside LocaleProvider");
  return value;
}
