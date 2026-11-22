import { useEffect, useState } from 'react';
import { watchHomeScreen, type HomeScreenStatus } from '../lib/tg';

/** Status of the FC Altynka icon on the phone's home screen; null while unknown or outside Telegram. */
export function useHomeScreen(): HomeScreenStatus | null {
  const [status, setStatus] = useState<HomeScreenStatus | null>(null);
  useEffect(() => {
    let live = true;
    const stop = watchHomeScreen(next => { if (live) setStatus(next); });
    return () => { live = false; stop?.(); };
  }, []);
  return status;
}
