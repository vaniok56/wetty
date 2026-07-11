/* terminal-cactuz service worker */

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

/**
 * Deliberately network-only. A terminal is useless offline, and caching the app
 * shell would eventually serve stale JS against a newer socket protocol. Not
 * calling respondWith() lets the browser do its normal fetch; the handler
 * exists only because installability criteria want one.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-function
self.addEventListener('fetch', () => {});

self.addEventListener('push', event => {
  let payload = { title: 'terminal', body: 'Your terminal wants attention.' };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    /* non-JSON payload */
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: new URL('client/icons/icon-192.png', self.registration.scope).href,
      badge: new URL('client/icons/icon-192.png', self.registration.scope).href,
      tag: 'cactuz-bell',
      renotify: true,
      vibrate: [40, 60, 40],
    }),
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = self.registration.scope;

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        for (const client of clientList) {
          if (client.url.startsWith(target) && 'focus' in client) {
            return client.focus();
          }
        }
        return self.clients.openWindow(target);
      }),
  );
});
