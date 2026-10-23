import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import commonEn from '../locales/en/common.json';

import aboutEn from '../locales/en/about.json';

import landingEn from '../locales/en/landing.json';

import legalEn from '../locales/en/legal.json';

import libraryEn from '../locales/en/library.json';

import researchEn from '../locales/en/research.json';

import simulatorsEn from '../locales/en/simulators.json';

import simulationDocsEn from '../locales/en/simulationDocs.json';

import aiEn from '../locales/en/ai.json';

// English ships in the entry bundle (it is the fallback for every language); Arabic and Spanish are separate
// chunks fetched only when selected, which keeps ~700 kB of JSON out of the first load for most visitors.
const resources = {
  en: { common: commonEn, about: aboutEn, landing: landingEn, legal: legalEn, library: libraryEn, research: researchEn, simulators: simulatorsEn, simulationDocs: simulationDocsEn, ai: aiEn },
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: 'en',
    fallbackLng: 'en',
    supportedLngs: ['en', 'ar', 'es'],
    ns: ['common'],
    defaultNS: 'common',
    interpolation: {
      escapeValue: false,
    },
  });

i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng;
  document.documentElement.dir = lng === 'ar' ? 'rtl' : 'ltr';
});

type LoadableLocale = 'en' | 'ar' | 'es';

/** Resolves once the dictionaries for `lng` are registered. Safe to call repeatedly; never changes the active language. */
export async function prepareLocale(lng: string): Promise<void> {
  if (lng === 'en' || i18n.hasResourceBundle(lng, 'common')) return;
  const bundle = lng === 'ar' ? (await import('./resources/ar')).default : lng === 'es' ? (await import('./resources/es')).default : null;
  if (!bundle) return;
  for (const [ns, data] of Object.entries(bundle)) i18n.addResourceBundle(lng as LoadableLocale, ns, data, true, true);
}

/** The language saved by the locale switcher, if it is one we ship. */
export function storedLocale(): LoadableLocale {
  try {
    const value = localStorage.getItem('mae-locale');
    return value === 'ar' || value === 'es' ? value : 'en';
  } catch {
    return 'en';
  }
}

export default i18n;
