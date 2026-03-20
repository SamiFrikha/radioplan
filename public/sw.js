// public/sw.js — Service Worker for Web Push
self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {};
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'RadioPlan', {
      body: data.body ?? '',
      icon: '/favicon.ico',
      data: data.data ?? {},
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow('/'));
});
