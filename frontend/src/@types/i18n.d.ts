import 'i18next';
import ru from '../locales/ru/app.json';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'app';
    resources: {
      app: typeof ru;
    };
  }
}
