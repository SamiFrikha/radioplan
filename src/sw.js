// src/sw.js — Service Worker for RadioPlan PWA
// v4 — Workbox precaching (injected by vite-plugin-pwa) + custom strategies

import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';

// Workbox injects the precache manifest here at build time (all hashed JS/CSS/HTML/assets).
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

const CACHE_NAME = 'radioplan-v6';

// ─── Install: activate immediately ───────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

// ─── Activate: clean old non-Workbox caches and claim all clients ─────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => k !== CACHE_NAME && !k.startsWith('workbox-'))
          .map(k => caches.delete(k))
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
      badge: '/radioplan/badge-96.png',
      data: data.data ?? {},
      tag: 'radioplan-notification',
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
// Workbox handles precached assets automatically above.
// This handler covers runtime requests (API responses, non-precached assets).
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

  event.respondWith(
    caches.open(CACHE_NAME).then(async cache => {
      const cached = await cache.match(event.request);

      const refresh = networkWithTimeout(event.request)
        .then(response => {
          if (response.ok) cache.put(event.request, response.clone());
          return response;
        })
        .catch(() => {/* silently ignore network errors */});

      if (cached) {
        event.waitUntil(refresh);
        return cached;
      }

      return refresh.then(response => {
        if (response) return response;
        return cache.match('/radioplan/').then(r => r ?? new Response('Offline', { status: 503 }));
      });
    })
  );
});

// ─── Push subscription rotated by browser ────────────────────────────────────
self.addEventListener('pushsubscriptionchange', (event) => {
  if (!event.oldSubscription) return;
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
