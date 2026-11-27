import { useLayoutEffect, useRef, useState } from 'react';

/**
 * Class for content that takes the place of a placeholder: `'reveal'` (fade in place, 220 ms) once `ready`
 * turns true while mounted, until it turns false again. Content already there on mount does not fade.
 * The layout effect adds the class before the browser paints the new content.
 */
export function useRevealAfter(ready: boolean): string | undefined {
  const [fade, setFade] = useState<string | undefined>(undefined);
  const was = useRef(ready);
  useLayoutEffect(() => {
    if (ready === was.current) return;
    was.current = ready;
    setFade(ready ? 'reveal' : undefined);
  }, [ready]);
  return ready ? fade : undefined;
}
