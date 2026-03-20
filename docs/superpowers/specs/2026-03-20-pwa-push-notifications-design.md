# PWA Push Notifications — Design Spec
**Date:** 2026-03-20
**Status:** Approved

## Problem

The app deployed on GitHub Pages at `/radioplan/` is currently only accessible as a browser shortcut on mobile — not as a real installed PWA. Web Push notifications cannot be delivered to the device when the app is closed. The goal is to enable real PWA installation (Android + iOS) and automatic push notifications triggered whenever a `notifications` row is inserted in the database.

---

## Scope

- Android (Chrome-based) and iOS (Safari, requires iOS 16.4+ with PWA installed to home screen)
- Push for all notification types: RCP reminders (24h/12h), schedule changes, conflicts, replacement requests
- Trigger architecture: DB trigger on `notifications` INSERT → `send-push` edge function → Web Push API
- The existing `rcp-reminders` function already inserts into `notifications` → the trigger picks it up automatically (no changes needed)
- **`rcp-auto-assign` has inline push code (lines 149-162) that must be removed** before applying migration 19 to avoid double-delivery. The trigger replaces it.

---

## Existing state (already applied, do not re-apply)

- Migration 15: `notifications` table — exists
- Migration 16: `push_subscriptions` table — exists (see RLS fix below)
- Migration 17: `replacement_requests` — exists
- Migration 18: `rcp_auto_config` — exists
- `public/sw.js` — exists but incomplete (no fetch handler, wrong openWindow URL, no pushsubscriptionchange)
- `index.tsx` line 12: SW registered at `/sw.js` — **currently broken** (wrong path, must be fixed)
- VAPID public key: already in `.env.local` as `VITE_VAPID_PUBLIC_KEY`

---

## Architecture

```
Any edge function inserts into notifications
        ↓ AFTER INSERT trigger (pg_net)
send-push Edge Function
        ↓ Web Push API (VAPID)
Google/Apple push servers
        ↓
User's phone — even if app is closed
```

---

## Piece 1 — manifest.json + PWA installability

**Files changed:**
- `public/manifest.json` (new)
- `public/icon-192.png` and `public/icon-512.png` (new, generated)
- `index.html` — add manifest link, apple-touch-icon, meta tags
- `public/sw.js` — fix existing bugs + add fetch handler and pushsubscriptionchange
- `index.tsx` — fix SW registration path (currently broken)

### manifest.json
```json
{
  "name": "RadioPlan AI",
  "short_name": "RadioPlan",
  "display": "standalone",
  "start_url": "/radioplan/",
  "scope": "/radioplan/",
  "background_color": "#f8fafc",
  "theme_color": "#0f172a",
  "icons": [
    { "src": "/radioplan/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/radioplan/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```
`start_url` and `scope` must be `/radioplan/` because the app is deployed at `https://[user].github.io/radioplan/`.

### index.html additions
```html
<link rel="manifest" href="/radioplan/manifest.json" />
<link rel="apple-touch-icon" href="/radioplan/icon-192.png" />
<meta name="theme-color" content="#0f172a" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
```

### sw.js fixes + additions
Three changes to the existing `sw.js`:
1. Fix `openWindow('/')` → `openWindow('/radioplan/')` in the `notificationclick` handler (currently opens blank page on GitHub Pages)
2. Add fetch handler with cache-nothing strategy (required for Chrome installability; cache-nothing ensures ESM importmap modules are always fresh)
3. Add `pushsubscriptionchange` handler to re-subscribe when browser rotates the push token

```js
// Fix existing notificationclick:
// clients.openWindow('/') → clients.openWindow('/radioplan/')

// Add:
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});

self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    self.registration.pushManager.subscribe(event.oldSubscription.options)
      .then(sub => fetch('/radioplan/functions/v1/push-resubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          old_endpoint: event.oldSubscription.endpoint,
          subscription: sub.toJSON()
        })
      }))
  );
});
```

### index.tsx fix
**Currently broken:** `navigator.serviceWorker.register('/sw.js')` is at root scope, out of scope for pages under `/radioplan/`.
**Fix:** Change to `navigator.serviceWorker.register('/radioplan/sw.js')` so the SW scope covers the deployed app.

---

## Piece 2 — Frontend push subscription

**File:** `hooks/usePushNotifications.ts` (new)

**VAPID public key source:** `import.meta.env.VITE_VAPID_PUBLIC_KEY` — already present in `.env.local`. Must also be set in GitHub Pages environment variables (repo Settings → Secrets → Variables) for the build to include it.

**Flow:**
1. On mount: read `Notification.permission` → set initial UI state
2. User clicks button (user gesture required — cannot call `requestPermission` on mount, especially on iOS)
3. Detect standalone mode:
   - `(window.navigator as any).standalone === true` (iOS webkit-specific)
   - OR `window.matchMedia('(display-mode: standalone)').matches` (standard)
   - If neither: show install-first warning, no permission request
4. `Notification.requestPermission()` → if `'granted'`:
5. Get SW registration → `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VITE_VAPID_PUBLIC_KEY) })`
6. Extract `endpoint`, `keys.p256dh`, `keys.auth` from the PushSubscription
7. Upsert into `push_subscriptions` (user_id + endpoint unique) using Supabase client

**Utility:** `urlBase64ToUint8Array(base64String: string): Uint8Array` — standard conversion required by the Web Push API.

**UI states in Profile > Notifications tab:**

| Condition | Display |
|---|---|
| Not standalone | Warning: "Installez l'application depuis votre navigateur pour activer les notifications" |
| `permission === 'default'` + standalone | Button: "Activer les notifications sur cet appareil" |
| `permission === 'granted'` | Text: "Notifications activées ✓" (no button) |
| `permission === 'denied'` | Warning: "Notifications bloquées — vérifiez les paramètres du navigateur" |

**Multiple devices:** Each device gets its own row in `push_subscriptions` (unique by `endpoint`). `send-push` delivers to all rows for a `user_id`. One device's expired/revoked subscription does not block delivery to others.

---

## Piece 3 — send-push Edge Function

**File:** `supabase/functions/send-push/index.ts`

**Input (POST body):**
```json
{
  "user_id": "uuid",
  "title": "string",
  "body": "string",
  "data": {}
}
```

**Notification payload schema** (sent to SW, must match `event.data.json()` in sw.js):
```json
{ "title": "string", "body": "string", "data": {} }
```

**Import:** `import webpush from "https://esm.sh/web-push@3.6.7"` — consistent with all other edge functions in this project (which use esm.sh CDN imports, not npm: specifiers). No deno.json needed.

**Logic:**
1. Read all `push_subscriptions` for `user_id` (service role key — bypasses RLS)
2. For each subscription (independently, errors do not block others):
   - Send Web Push payload via `webpush.sendNotification()` with VAPID details
   - On HTTP 410 → delete the subscription row
3. Return `{ sent: N, failed: M }`

**Secrets (set via `supabase secrets set` CLI before deploying):**
- `VAPID_PRIVATE_KEY` — private key matching `.env.local` public key
- `VAPID_SUBJECT` — must be a `mailto:` URI, e.g. `mailto:admin@radioplan.fr`

---

## Piece 4 — DB trigger

**File:** `supabase/migrations/19_push_trigger.sql`

**Pre-requisite setup** (run once in Supabase SQL editor before applying migration — not in the migration file for security):
```sql
ALTER DATABASE postgres SET app.supabase_url = 'https://YOUR_PROJECT_REF.supabase.co';
ALTER DATABASE postgres SET app.service_role_key = 'YOUR_SERVICE_ROLE_KEY';
```

**Migration content:**
```sql
-- Enable pg_net (available on all Supabase projects)
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Fix insecure RLS policy on push_subscriptions (migration 16 left USING (true))
DROP POLICY IF EXISTS "Service role reads all subscriptions" ON public.push_subscriptions;
-- Service role bypasses RLS entirely, so no explicit policy needed for service role reads.
-- Authenticated users already have a restrictive own-row policy.

-- Trigger function
CREATE OR REPLACE FUNCTION notify_push_on_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  PERFORM net.http_post(
    url     := current_setting('app.supabase_url') || '/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key')
    ),
    body    := jsonb_build_object(
      'user_id', NEW.user_id::text,
      'title',   NEW.title,
      'body',    NEW.body,
      'data',    NEW.data
    )
  );
  RETURN NEW;
END;
$$;

-- Trigger
CREATE TRIGGER push_on_notification_insert
  AFTER INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION notify_push_on_notification();
```

**Reliability:** `pg_net` calls are fire-and-forget (async). Push delivery failure is non-critical — the in-app notification bell is the primary system, push is a convenience layer. No retry needed.

---

## iOS-specific notes

- iOS 16.4+ required for Web Push in PWA
- App **must** be installed to home screen (standalone mode) before push tokens are valid
- User must open the app at least once after installation before push tokens activate (normal first-launch flow)
- `usePushNotifications` detects standalone via `navigator.standalone` + `matchMedia` and blocks the permission request if not installed

---

## What is NOT in scope

- In-app notification bell / unread count (already exists)
- Notification preferences per type (future)
- Silent push / background sync
- Push delivery analytics or retry queues
- `push-resubscribe` edge function for `pushsubscriptionchange` (sw.js calls it; can be added as a follow-up)

---

## Files to create / modify

| File | Action | Notes |
|---|---|---|
| `public/manifest.json` | Create | start_url + scope = /radioplan/ |
| `public/icon-192.png` | Create | 192×192 PNG |
| `public/icon-512.png` | Create | 512×512 PNG maskable |
| `index.html` | Modify | manifest link, apple-touch-icon, meta tags |
| `public/sw.js` | Modify | Fix openWindow path + add fetch + pushsubscriptionchange |
| `index.tsx` | Modify | Fix SW path: /sw.js → /radioplan/sw.js |
| `hooks/usePushNotifications.ts` | Create | Permission + subscribe + upsert logic |
| Profile Notifications tab | Modify | Add subscribe button with all states |
| `supabase/functions/rcp-auto-assign/index.ts` | Modify | Remove: line 2 (web-push import), lines 9-13 (setVapidDetails), lines 149-162 (inline push block) — all replaced by DB trigger |
| `supabase/functions/send-push/index.ts` | Create | Web Push sender (esm.sh/web-push@3.6.7) |
| `supabase/migrations/19_push_trigger.sql` | Create | pg_net trigger + RLS fix |
