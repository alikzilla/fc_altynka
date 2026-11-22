import { createElement, lazy, useState, type ComponentType } from 'react';

/**
 * React.lazy that can be loaded ahead of time. Once loaded, a newly mounted view renders at once instead of
 * suspending for a tick, so a view transition captures the screen itself rather than its skeleton.
 * A mounted view keeps the component type it started with, so loading never remounts it.
 */
export function preloadable<P extends object>(load: () => Promise<ComponentType<P>>) {
  let loaded: ComponentType<P> | null = null;
  let pending: Promise<ComponentType<P>> | null = null;
  const start = () => pending ??= load().then(component => (loaded = component), error => { pending = null; throw error; });
  const Lazy = lazy(() => start().then(component => ({ default: component })));
  function View(props: P) {
    const [direct] = useState(() => loaded);
    return direct ? createElement(direct, props) : createElement(Lazy, props);
  }
  return Object.assign(View, { preload: () => { void start().catch(() => {}); } });
}
