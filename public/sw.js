// public/sw.js — Service Worker for RadioPlan PWA
// v3 — network timeout + cache-first assets + robust error handling

const CACHE_NAME = 'radioplan-v3';
const APP_SHELL = ['/radioplan/', '/radioplan/index.html'];

// ─── Install: cache the app shell ────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
      .catch(err => console.warn('[SW] Install cache failed:', err))
  );
});

// ─── Activate: clean old caches and claim all clients ────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ─── Push: show notification robustly ────────────────────────────────────────
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data?.json() ?? {};
  } catch {
    data = { title: 'RadioPlan', body: event.data?.text() ?? '' };
  }

  event.waitUntil(
    self.registration.showNotification(data.title ?? 'RadioPlan', {
      body: data.body ?? '',
      icon: '/radioplan/icon-192.png',
      badge: '/radioplan/icon-192.png',
      data: data.data ?? {},
      tag: 'radioplan-notification',        // Replace instead of stacking
      renotify: false,
    }).catch(err => console.warn('[SW] showNotification failed:', err))
  );
});

// ─── Notification click: focus existing PWA window or open one ───────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(windowClients => {
        for (const client of windowClients) {
          if (client.url.includes('/radioplan') && 'focus' in client) {
            return client.focus();
          }
        }
        return self.clients.openWindow('/radioplan/');
      })
      .catch(err => console.warn('[SW] notificationclick error:', err))
  );
});

// ─── Fetch: cache-first with network timeout so app never hangs ──────────────
//
// ROOT CAUSE OF FREEZING: fetch() on mobile can hang for 30+ seconds before
// timing out. We fix this with a 4-second race: if the network doesn't reply,
// we serve from cache immediately.
//
// Strategy:
//   Navigation (HTML)  → cache-first (instant load) + background network refresh
//   Static assets      → cache-first (instant) + background refresh
//   Supabase / cross-origin → bypass SW entirely (always fresh data)

const networkWithTimeout = (request, timeoutMs = 4000) =>
  Promise.race([
    fetch(request),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('SW network timeout')), timeoutMs)
    ),
  ]);

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET, Supabase API, and cross-origin (CDN, analytics, etc.)
  if (event.request.method !== 'GET') return;
  if (url.hostname.includes('supabase.co')) return;
  if (url.origin !== self.location.origin) return;

  // Cache-first for everything: serve cached instantly, refresh in background.
  // This prevents ALL network-induced freezing.
  event.respondWith(
    caches.open(CACHE_NAME).then(async cache => {
      const cached = await cache.match(event.request);

      // Background refresh (fire-and-forget, never blocks response)
      const refresh = networkWithTimeout(event.request)
        .then(response => {
          if (response.ok) cache.put(event.request, response.clone());
          return response;
        })
        .catch(() => {/* silently ignore network errors */});

      // Return cached immediately if available, otherwise wait for network
      if (cached) {
        event.waitUntil(refresh); // update cache in background
        return cached;
      }

      // First visit: must wait for network (nothing cached yet)
      return refresh.then(response => {
        if (response) return response;
        // Absolute last resort: serve index shell
        return cache.match('/radioplan/') ?? new Response('Offline', { status: 503 });
      });
    })
  );
});

// ─── Push subscription rotated by browser ────────────────────────────────────
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    self.registration.pushManager
      .subscribe(event.oldSubscription.options)
      .then(() => console.log('[SW] Push subscription rotated successfully'))
      .catch(err => console.warn('[SW] Failed to resubscribe:', err))
  );
});

// ─── Message: handle reload requests from the app ────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
