// This file is replaced at build time by vite-plugin-pwa (injectManifest).
// It is only served as-is during `vite dev` (no Workbox precaching in dev).

const CACHE_NAME = 'radioplan-v7';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data?.json() ?? {}; } catch { data = { title: 'RadioPlan', body: event.data?.text() ?? '' }; }

  // Use a unique tag per notification type + slot to group same-slot updates
  // but keep different slots/types independent (no silent overwrites).
  const tag = [data.type, data.data?.slotId].filter(Boolean).join('-') || `radioplan-${Date.now()}`;

  event.waitUntil(
    self.registration.showNotification(data.title ?? 'RadioPlan', {
      body: data.body ?? '',
      icon: '/radioplan/icon-192.png',
      badge: '/radioplan/badge-96.png',
      data: data.data ?? {},
      tag,
      renotify: true,   // always alert the user even when replacing a same-tag notification
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      for (const c of clients) {
        if (c.url.includes('/radioplan') && 'focus' in c) return c.focus();
      }
      return self.clients.openWindow('/radioplan/');
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

// When the browser rotates the push subscription token, notify the app
// so it can re-subscribe with the new endpoint and update the DB.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      clients.forEach(c => c.postMessage({ type: 'PUSH_SUBSCRIPTION_CHANGED' }));
    })
  );
});
