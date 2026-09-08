import i18n from 'i18next';
import { initReactI18next, useTranslation, I18nextProvider } from 'react-i18next';
import ru from './locales/ru/app.json';
import en from './locales/en/app.json';
import { Language } from './types';

export const defaultNS = 'app';
export const resources = {
  ru: { app: ru },
  en: { app: en },
} as const;

export const LOCALES = {
  ru,
  en,
};

i18n.use(initReactI18next).init({
  fallbackLng: 'en',
  lng: 'ru',
  defaultNS: 'app',
  ns: ['app'],
  resources,
  interpolation: {
    escapeValue: false,
  },
  react: {
    useSuspense: false,
  },
});

export type LocaleData = typeof ru;
export { ru, en, useTranslation, I18nextProvider };
export default i18n;

export type TranslationKey = string;

/**
 * Universal t function with i18next:
 * - t('sidebar.dashboard')
 * - t(lang, 'sidebar.dashboard')
 * - t('app.pingTested', { selector: 'Proxy' })
 */
export function t(
  keyOrLang: Language | string,
  keyOrParams?: string | Record<string, any>,
  params?: Record<string, any>
): string {
  if (keyOrLang === 'ru' || keyOrLang === 'en') {
    const key = keyOrParams as any;
    return (i18n.t as any)(key, { lng: keyOrLang, ...params }) as string;
  }
  return (i18n.t as any)(keyOrLang, keyOrParams as Record<string, any>) as string;
}
