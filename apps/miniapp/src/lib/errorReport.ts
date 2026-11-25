import { ApiError } from './api';
import { initData } from './tg';
import { APP_VERSION } from './version';

export type ErrorSource = 'boundary' | 'error' | 'rejection';

/** Не больше стольких отчётов за сессию: зациклившийся рендер не должен засыпать сервер. */
const SESSION_LIMIT = 5;
const sent = new Set<string>();

const messageOf = (error: unknown): string => {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return typeof error === 'string' ? error : JSON.stringify(error) ?? String(error);
};

/** Не баг приложения: обрыв связи, отменённый запрос, ожидаемый ответ сервера, шум браузера. */
export function isNoise(error: unknown): boolean {
  if (error instanceof ApiError) return error.status < 500;
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  const text = messageOf(error);
  return /Failed to fetch|Load failed|NetworkError|ResizeObserver loop|^Script error\.?$/i.test(text);
}

/** Ленивый экран не загрузился: обычно это старая вкладка после деплоя, лечится перезагрузкой. */
export function isStaleChunk(error: unknown): boolean {
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported/i.test(messageOf(error));
}

/**
 * Отправить ошибку администратору (через `/api/client-errors` в сводку алертов). Никогда не бросает.
 * Одна и та же ошибка уходит один раз за сессию.
 */
export function reportClientError(error: unknown, source: ErrorSource, extra?: string): void {
  try {
    if (isNoise(error)) return;
    const message = messageOf(error).slice(0, 500);
    if (sent.has(message) || sent.size >= SESSION_LIMIT) return;
    sent.add(message);
    const stack = [error instanceof Error ? error.stack : undefined, extra].filter(Boolean).join('\n').slice(0, 4000);
    void fetch('/api/client-errors', {
      method: 'POST',
      keepalive: true,
      headers: { Authorization: `tma ${initData()}`, 'content-type': 'application/json' },
      body: JSON.stringify({ message, stack: stack || undefined, path: location.pathname.slice(0, 200), source, version: APP_VERSION }),
    }).catch(() => {});
  } catch {
    // Отчёт об ошибке не должен стать новой ошибкой.
  }
}

/** Ошибки вне React: брошенные в обработчиках и необработанные промисы. */
export function trackErrors(): void {
  window.addEventListener('error', e => reportClientError(e.error ?? e.message, 'error'));
  window.addEventListener('unhandledrejection', e => reportClientError(e.reason, 'rejection'));
}

export function __resetErrorReportsForTests(): void {
  sent.clear();
}
