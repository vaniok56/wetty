import type { Session } from './session';

/**
 * Mobile browsers freeze and then discard backgrounded tabs, which tears down
 * the websocket. bfcache does not keep it open either. So rather than fighting
 * for the socket, we expect to lose it and make coming back cheap: reconnect on
 * resume and let the server replay a snapshot.
 *
 * Notably absent: the `beforeunload` handler the old build installed. It asked
 * "Are you sure?" on every navigation and, worse, made the page ineligible for
 * bfcache — so returning to the tab meant a full reload every time.
 */
export function initLifecycle(session: Session): void {
  const resume = (): void => {
    session.setVisible(true);
    session.reconnect();
  };

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') resume();
    else session.setVisible(false);
  });

  // Restored from bfcache: the socket was severed on the way in.
  window.addEventListener('pageshow', event => {
    if ((event as PageTransitionEvent).persisted) resume();
  });

  window.addEventListener('online', () => session.reconnect());

  // Chromium only. Fires just before JS is suspended.
  document.addEventListener('freeze', () => session.setVisible(false));
  document.addEventListener('resume', resume);

  initWakeLock();
}

/**
 * Keeps the screen awake while the terminal is in the foreground, so a long
 * command does not get cut short by the display sleeping. The lock is released
 * automatically whenever the page is hidden, so it must be re-acquired.
 */
function initWakeLock(): void {
  if (!('wakeLock' in navigator)) return;
  let lock: WakeLockSentinel | null = null;

  const acquire = async (): Promise<void> => {
    if (document.visibilityState !== 'visible' || lock) return;
    try {
      lock = await navigator.wakeLock.request('screen');
      lock.addEventListener('release', () => {
        lock = null;
      });
    } catch {
      /* denied, low battery, or unsupported */
    }
  };

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void acquire();
    else lock = null;
  });
  void acquire();
}
