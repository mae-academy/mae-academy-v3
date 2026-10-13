import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import commonEn from '../locales/en/common.json';
import commonAr from '../locales/ar/common.json';
import commonEs from '../locales/es/common.json';

import aboutEn from '../locales/en/about.json';
import aboutAr from '../locales/ar/about.json';
import aboutEs from '../locales/es/about.json';

import landingEn from '../locales/en/landing.json';
import landingAr from '../locales/ar/landing.json';
import landingEs from '../locales/es/landing.json';

import legalEn from '../locales/en/legal.json';
import legalAr from '../locales/ar/legal.json';
import legalEs from '../locales/es/legal.json';

import libraryEn from '../locales/en/library.json';
import libraryAr from '../locales/ar/library.json';
import libraryEs from '../locales/es/library.json';

import researchEn from '../locales/en/research.json';
import researchAr from '../locales/ar/research.json';
import researchEs from '../locales/es/research.json';

import simulatorsEn from '../locales/en/simulators.json';
import simulatorsAr from '../locales/ar/simulators.json';
import simulatorsEs from '../locales/es/simulators.json';

import simulationDocsEn from '../locales/en/simulationDocs.json';
import simulationDocsAr from '../locales/ar/simulationDocs.json';
import simulationDocsEs from '../locales/es/simulationDocs.json';

const resources = {
  en: { common: commonEn, about: aboutEn, landing: landingEn, legal: legalEn, library: libraryEn, research: researchEn, simulators: simulatorsEn, simulationDocs: simulationDocsEn },
  ar: { common: commonAr, about: aboutAr, landing: landingAr, legal: legalAr, library: libraryAr, research: researchAr, simulators: simulatorsAr, simulationDocs: simulationDocsAr },
  es: { common: commonEs, about: aboutEs, landing: landingEs, legal: legalEs, library: libraryEs, research: researchEs, simulators: simulatorsEs, simulationDocs: simulationDocsEs },
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

export default i18n;
