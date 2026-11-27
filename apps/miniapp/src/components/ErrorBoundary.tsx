import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Link } from 'wouter';
import { isStaleChunk, reportClientError } from '../lib/errorReport';
import { ErrorNote } from './ui';

const RELOADED_KEY = 'altynka:chunk-reload';

/** Перезагрузить страницу один раз за сессию; `false`, если уже пробовали. */
function reloadOnce(): boolean {
  try {
    if (sessionStorage.getItem(RELOADED_KEY)) return false;
    sessionStorage.setItem(RELOADED_KEY, '1');
  } catch {
    return false;
  }
  location.reload();
  return true;
}

interface Props {
  children: ReactNode;
  /** Смена ключа (например, маршрута) снимает экран ошибки: можно уйти на главную или через нижнюю панель на вкладках. */
  resetKey?: string;
}

interface State { error: unknown; key?: string }

/**
 * Упавший экран вместо белой страницы: сообщение и кнопка «Попробовать ещё раз» (перезагрузка).
 * Ошибка уходит администратору. Не загрузившийся после деплоя ленивый экран перезагружается сам, один раз.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { error };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    if (props.resetKey === state.key) return null;
    return { key: props.resetKey, error: null };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    if (isStaleChunk(error) && reloadOnce()) return;
    reportClientError(error, 'boundary', info.componentStack ?? undefined);
  }

  render() {
    if (this.state.error === null) return this.props.children;
    return (
      <main className="screen">
        <h1 className="title">Что-то сломалось</h1>
        <ErrorNote text="Этот экран не открылся из-за ошибки. Обнови приложение или вернись на главную." retry={() => location.reload()} />
        {/* На вложенных экранах нижней панели нет: путь на главную всегда на самом экране. */}
        <Link href="/" className="btn wide">На главную</Link>
      </main>
    );
  }
}
