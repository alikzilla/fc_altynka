/** Keeps the screen on while a match timer runs: Screen Wake Lock, or a silent looping video where it is missing. */
export function keepAwake(): { release(): void } {
  let released = false;
  let sentinel: WakeLockSentinel | null = null;
  let video: HTMLVideoElement | null = null;

  const startVideo = () => {
    if (video || released) return;
    video = document.createElement('video');
    video.src = '/sounds/keepawake.mp4';
    video.muted = true; video.loop = true; video.playsInline = true;
    video.setAttribute('aria-hidden', 'true');
    video.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0.01;pointer-events:none;';
    document.body.appendChild(video);
    void video.play().catch(() => {});
  };
  let pending = false;
  const request = () => {
    if (released || pending) return;
    if (!navigator.wakeLock) { startVideo(); return; }
    pending = true;
    navigator.wakeLock.request('screen').then(
      (s) => { pending = false; if (released) void s.release().catch(() => {}); else sentinel = s; },
      () => { pending = false; /* e.g. NotAllowedError while hidden: retry on the next visible event. */ },
    );
  };
  const onVisible = () => {
    if (document.visibilityState === 'visible' && !released && !video && (!sentinel || sentinel.released)) request();
  };

  document.addEventListener('visibilitychange', onVisible);
  request();
  return {
    release() {
      if (released) return;
      released = true;
      document.removeEventListener('visibilitychange', onVisible);
      void sentinel?.release().catch(() => {}); sentinel = null;
      if (video) { video.pause(); video.remove(); video = null; }
    },
  };
}
