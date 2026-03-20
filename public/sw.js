// public/sw.js — Service Worker for RadioPlan PWA

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

// Fetch handler — cache-nothing strategy
// Required for Chrome PWA installability. Cache-nothing ensures ESM importmap
// modules (react, lucide-react, etc.) are always fetched fresh.
self.addEventListener('fetch', (event) => {
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
