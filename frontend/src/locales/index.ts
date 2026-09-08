import ru from './ru/app.json';
import en from './en/app.json';

export type LocaleData = typeof ru;

export const LOCALES: Record<'ru' | 'en', LocaleData> = {
  ru,
  en,
};

export { ru, en };
