// public/sw.js — Service Worker for RadioPlan PWA

const CACHE_NAME = 'radioplan-v2';

// Precache the app shell so the app loads instantly on subsequent opens,
// even if the network is slow or temporarily unavailable on mobile.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(['/radioplan/', '/radioplan/index.html']))
      .then(() => self.skipWaiting())
  );
});

// Delete old caches when a new SW takes over, then claim all clients.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

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

// Fetch handler — cache-aware strategy so the installed app never freezes
// on slow or intermittent mobile networks.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET, Supabase API calls (always need fresh data), and cross-origin.
  if (event.request.method !== 'GET') return;
  if (url.hostname.includes('supabase.co')) return;
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === 'navigate') {
    // Navigation (HTML): try network first so we always get the latest deploy,
    // fall back to cached index if offline.
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request) || caches.match('/radioplan/'))
    );
    return;
  }

  // Static assets (JS, CSS, images): stale-while-revalidate.
  // Serve from cache immediately (instant load), refresh in background.
  event.respondWith(
    caches.open(CACHE_NAME).then(cache =>
      cache.match(event.request).then(cached => {
        const networkFetch = fetch(event.request).then(response => {
          if (response.ok) cache.put(event.request, response.clone());
          return response;
        }).catch(() => cached);
        return cached ?? networkFetch;
      })
    )
  );
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
