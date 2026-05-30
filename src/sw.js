// src/sw.js — Service Worker for RadioPlan PWA
// v6 — Workbox precaching (injected by vite-plugin-pwa) + custom strategies
//      Push: unique tag per notification so batched RCP alerts no longer collapse silently.
//      Rotation: notify clients on pushsubscriptionchange so the DB endpoint stays current.

import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';

// Workbox injects the precache manifest here at build time (all hashed JS/CSS/HTML/assets).
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

const CACHE_NAME = 'radioplan-v8';

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

  // Unique tag per notification type + slot. Previously every push used the same
  // static tag with renotify:false, so a batch of RCP notifications (one per slot)
  // collapsed into a single SILENT replacement — the user was alerted for at most
  // one and never noticed the rest. A per-notification tag keeps distinct events
  // independent; renotify:true re-alerts even when an identical-tag update arrives.
  const tag =
    [data.type, data.data?.slotId].filter(Boolean).join('-') ||
    `radioplan-${Date.now()}`;

  event.waitUntil(
    self.registration.showNotification(data.title ?? 'RadioPlan', {
      body: data.body ?? '',
      icon: '/radioplan/icon-192.png',
      badge: '/radioplan/badge-96.png',
      data: data.data ?? {},
      tag,
      renotify: true,
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
// Re-subscribe in the SW AND tell every open client so it can persist the new
// endpoint in the DB. Without the postMessage, the browser ends up with a fresh
// subscription the server never learns about — the old endpoint then 410s, gets
// deleted server-side, and the user silently stops receiving pushes.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    self.registration.pushManager
      .subscribe(
        event.oldSubscription?.options ?? { userVisibleOnly: true }
      )
      .catch(err => console.warn('[SW] Failed to resubscribe:', err))
      .finally(() =>
        self.clients
          .matchAll({ type: 'window', includeUncontrolled: true })
          .then(clients =>
            clients.forEach(c => c.postMessage({ type: 'PUSH_SUBSCRIPTION_CHANGED' }))
          )
      )
  );
});

// ─── Message: handle reload requests from the app ────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
