/**
 * Service worker + web push.
 *
 * The push half exists for one workflow: start something long (a Claude Code
 * run, a build), lock the phone, and get told when it wants you. The server
 * watches its headless terminal for a BEL and pushes only when no visible
 * client is attached.
 */

/** VAPID keys are base64url; PushManager wants raw bytes. */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(normalized);
  return Uint8Array.from([...raw].map(ch => ch.charCodeAt(0)));
}

async function subscribe(
  registration: ServiceWorkerRegistration,
  base: string,
): Promise<void> {
  if (!('PushManager' in window) || !('Notification' in window)) return;

  const res = await fetch(`${base}/api/push/key`);
  if (!res.ok) return; // push not configured on the server
  const { publicKey } = (await res.json()) as { publicKey: string };

  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    }));

  // The server keeps subscriptions in memory only, so re-register every load.
  await fetch(`${base}/api/push/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(subscription),
  });
}

export function initPwa(base: string): void {
  if (!('serviceWorker' in navigator)) return;

  void navigator.serviceWorker
    .register(`${base}/sw.js`)
    .then(async registration => {
      if (!('Notification' in window)) return;

      if (Notification.permission === 'granted') {
        await subscribe(registration, base);
        return;
      }
      if (Notification.permission === 'denied') return;

      // Safari, and increasingly Chrome, only honour a permission request that
      // happens inside a user gesture. Wait for the first real touch.
      const ask = async (): Promise<void> => {
        window.removeEventListener('pointerdown', ask);
        try {
          if ((await Notification.requestPermission()) === 'granted') {
            await subscribe(registration, base);
          }
        } catch {
          /* dismissed */
        }
      };
      window.addEventListener('pointerdown', ask, { once: true });
    })
    .catch(() => {
      /* no service worker: everything else still works */
    });
}
