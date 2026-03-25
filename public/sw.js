// This file is replaced at build time by vite-plugin-pwa (injectManifest).
// It is only served as-is during `vite dev` (no Workbox precaching in dev).

const CACHE_NAME = 'radioplan-v6';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data?.json() ?? {}; } catch { data = { title: 'RadioPlan', body: event.data?.text() ?? '' }; }
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'RadioPlan', {
      body: data.body ?? '',
      icon: '/radioplan/icon-192.png',
      badge: '/radioplan/badge-96.png',
      data: data.data ?? {},
      tag: 'radioplan-notification',
      renotify: false,
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
