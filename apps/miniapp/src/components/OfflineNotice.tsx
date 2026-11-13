import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import { queryClient } from '../lib/queryClient';
import { useOffline } from '../lib/connection';

const RETRY_MS = 10_000;
const BACK_MS = 2_000;

/**
 * One quiet notice at the safe top while the server cannot be reached, instead of an error on every screen.
 * It retries on its own; the first answer hides it, says «Снова на связи» for two seconds and refreshes the screen.
 */
export function OfflineNotice() {
  const offline = useOffline();
  const [back, setBack] = useState(false);
  const wasOffline = useRef(offline);
  const notice = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (offline) { wasOffline.current = true; setBack(false); return; }
    if (!wasOffline.current) return;
    wasOffline.current = false;
    setBack(true);
    const timer = setTimeout(() => setBack(false), BACK_MS);
    return () => clearTimeout(timer);
  }, [offline]);

  useEffect(() => {
    if (!offline) return;
    // Paused queries resume by themselves when the browser comes back online; failed ones need a new try.
    const retry = () => { if (navigator.onLine !== false) void queryClient.refetchQueries({ type: 'active' }); };
    const timer = setInterval(retry, RETRY_MS);
    window.addEventListener('online', retry);
    return () => { clearInterval(timer); window.removeEventListener('online', retry); };
  }, [offline]);

  const visible = offline || back;
  useEffect(() => {
    const root = document.documentElement;
    const node = notice.current;
    // The screen and toasts step below the notice while it is shown, so it never covers the title or Back.
    root.toggleAttribute('data-offline', visible);
    if (!visible || !node) return () => root.removeAttribute('data-offline');
    // A manual popover paints above open sheets without taking their focus.
    if (node.showPopover && !node.matches(':popover-open')) node.showPopover();
    const measure = () => root.style.setProperty('--connection-height', `${node.offsetHeight}px`);
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(node);
    return () => { observer?.disconnect(); root.removeAttribute('data-offline'); root.style.removeProperty('--connection-height'); };
  }, [visible]);

  // The live region stays mounted, so screen readers announce the text when it arrives.
  return <div className="connection-region" aria-live="polite">
    {visible && <div ref={notice} className={`connection-notice${offline ? '' : ' connection-back'}`} popover="manual">
      <Icon name={offline ? 'offline' : 'check'} />
      <span className="connection-copy">
        <b>{offline ? 'Нет связи' : 'Снова на связи'}</b>
        {offline && <small>Обновим, когда сеть вернётся</small>}
      </span>
    </div>}
  </div>;
}
