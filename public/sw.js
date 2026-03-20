// public/sw.js — Service Worker for RadioPlan PWA

// Take control immediately so navigator.serviceWorker.ready resolves without
// waiting for old tabs to close (prevents push subscription hanging).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

// Push notification received (sent by send-push edge function)
self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {};
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'RadioPlan', {
      body: data.body ?? '',
      icon: '/radioplan/icon-192.png',
      badge: '/radioplan/icon-192.png',
      data: data.data ?? {},
    })
  );
});

// User taps the notification — open the app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  // Fix: was '/' which is a blank page on GitHub Pages at /radioplan/
  event.waitUntil(clients.openWindow('/radioplan/'));
});

// Fetch handler — required for Chrome PWA installability.
// Only intercept same-origin requests; let CDN requests (tailwind, esm.sh, etc.)
// pass through untouched so they don't break in standalone PWA mode.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(fetch(event.request));
});

// Browser rotated the push subscription — re-subscribe silently.
// The DB record will be refreshed next time the user visits Profile → Notifications.
// (A dedicated push-resubscribe endpoint is out of scope for this implementation.)
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    self.registration.pushManager
      .subscribe(event.oldSubscription.options)
      .then(() => console.log('[SW] Push subscription rotated — will refresh on next app visit'))
      .catch((err) => console.warn('[SW] Failed to resubscribe after rotation:', err))
  );
});
