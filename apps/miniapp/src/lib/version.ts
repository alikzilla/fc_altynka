declare const __APP_VERSION__: string | undefined;
declare const __APP_BUILT_AT__: string | undefined;

/** Коммит, из которого собран мини-апп (`vite.config.ts`); в тестах без сборки — `dev`. */
export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
export const APP_BUILT_AT: string | null = typeof __APP_BUILT_AT__ === 'string' ? __APP_BUILT_AT__ : null;

/** «a1b2c3d · 25 нояб.» — по строке в настройках и в отчёте об ошибке видно, какая версия у человека. */
export function versionLabel(): string {
  if (!APP_BUILT_AT) return APP_VERSION;
  const day = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Asia/Almaty', day: 'numeric', month: 'short' }).format(new Date(APP_BUILT_AT));
  return `${APP_VERSION} · ${day}`;
}
