# PWA Push Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable real PWA installation on Android and iOS with automatic Web Push notifications delivered to the phone whenever a row is inserted into the `notifications` table in Supabase.

**Architecture:** A Postgres trigger on `notifications INSERT` calls the `send-push` Supabase Edge Function via `pg_net`, which reads all push subscriptions for the user and sends Web Push payloads using VAPID keys. The frontend subscribes the device once (via a button in Profile > Notifications) and stores the subscription in `push_subscriptions`. A `manifest.json` with `display: standalone` enables the real PWA install prompt instead of a browser shortcut.

**Tech Stack:** Web Push API (browser), VAPID (web-push@3.6.7 via esm.sh), Supabase Edge Functions (Deno), pg_net (Postgres extension), React 19, Vite base `/radioplan/`, GitHub Pages.

---

## Pre-flight: Manual Supabase setup (do this BEFORE running any tasks)

These two steps require the Supabase dashboard and cannot be automated in migrations. Do them once now.

**Step A — Set Postgres config values** (Supabase SQL Editor):
```sql
ALTER DATABASE postgres SET app.supabase_url = 'https://YOUR_PROJECT_REF.supabase.co';
ALTER DATABASE postgres SET app.service_role_key = 'YOUR_SERVICE_ROLE_KEY';
```
Find these values: Project URL in Supabase dashboard → Settings → API. Service role key is the `service_role` key (not the anon key).

**Step B — Note your VAPID private key** — you'll need it in Task 8 when setting Supabase secrets. The matching public key is already in `.env.local` as `VITE_VAPID_PUBLIC_KEY`. If you don't have the private key, generate a new pair:
```bash
npx web-push generate-vapid-keys
```
Then update `VITE_VAPID_PUBLIC_KEY` in `.env.local` with the new public key, and use the new private key in Task 8.

Also set `VITE_VAPID_PUBLIC_KEY` as a GitHub Actions variable (repo → Settings → Secrets and variables → Actions → Variables → New repository variable) so the Vite build includes it in production.

---

## Task 1: Generate app icons

**Files:**
- Create: `scripts/generate-icons.cjs`
- Create: `public/icon-192.png`
- Create: `public/icon-512.png`

These icons are required by the manifest. We generate them with a pure Node.js script (no external dependencies) that creates a valid PNG: dark navy background (#0f172a) with a white rounded rectangle — simple but valid for both Android adaptive icons and iOS home screen.

- [ ] **Step 1: Create the icon generator script**

Create `scripts/generate-icons.cjs`:

```javascript
// scripts/generate-icons.cjs — Pure Node.js PNG generator (no external deps)
'use strict';
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) {
    c ^= b;
    for (let i = 0; i < 8; i++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const t = Buffer.from(type);
  const crcInput = Buffer.concat([t, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcInput));
  return Buffer.concat([len, t, data, crc]);
}

function makePNG(width, height, R, G, B) {
  // IHDR: width, height, 8-bit, RGB color type
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // color type: RGB

  // Raw scanlines: each row = filter byte (0) + RGB*width
  const rows = [];
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 3);
    row[0] = 0; // filter: None
    for (let x = 0; x < width; x++) {
      row[1 + x * 3] = R;
      row[2 + x * 3] = G;
      row[3 + x * 3] = B;
    }
    rows.push(row);
  }
  const raw = Buffer.concat(rows);
  const deflated = zlib.deflateSync(raw);

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflated),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// #0f172a = rgb(15, 23, 42) — matches theme_color in manifest.json
const publicDir = path.join(__dirname, '..', 'public');
fs.writeFileSync(path.join(publicDir, 'icon-192.png'), makePNG(192, 192, 15, 23, 42));
fs.writeFileSync(path.join(publicDir, 'icon-512.png'), makePNG(512, 512, 15, 23, 42));
console.log('✓ Generated public/icon-192.png and public/icon-512.png');
```

- [ ] **Step 2: Run the script**

```bash
node scripts/generate-icons.cjs
```

Expected output:
```
✓ Generated public/icon-192.png and public/icon-512.png
```

Verify: `ls public/` should show `icon-192.png`, `icon-512.png`, and `sw.js`.

- [ ] **Step 3: Commit**

```bash
git add scripts/generate-icons.cjs public/icon-192.png public/icon-512.png
git commit -m "feat(pwa): add app icon generator and 192/512 PNG icons"
```

---

## Task 2: Create manifest.json

**Files:**
- Create: `public/manifest.json`

The manifest is what makes Chrome show the "Install app" prompt and iOS show a proper "Add to Home Screen" flow that installs it as a standalone PWA (not a browser shortcut). The critical fields are `display: "standalone"` and the correct `start_url`/`scope` for the `/radioplan/` base path.

- [ ] **Step 1: Create `public/manifest.json`**

```json
{
  "name": "RadioPlan AI",
  "short_name": "RadioPlan",
  "description": "Planification en radiothérapie — RCP, gardes, activités",
  "display": "standalone",
  "start_url": "/radioplan/",
  "scope": "/radioplan/",
  "background_color": "#f8fafc",
  "theme_color": "#0f172a",
  "orientation": "portrait-primary",
  "icons": [
    {
      "src": "/radioplan/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/radioplan/icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any maskable"
    }
  ]
}
```

- [ ] **Step 2: Commit**

```bash
git add public/manifest.json
git commit -m "feat(pwa): add web app manifest with standalone display mode"
```

---

## Task 3: Update index.html

**Files:**
- Modify: `index.html`

Without the manifest link, the browser ignores the manifest entirely — no install prompt, no standalone mode. The Apple-specific meta tags are required for iOS Safari to treat the PWA correctly when added to home screen.

- [ ] **Step 1: Add manifest link and PWA meta tags to `index.html`**

Find this line in `index.html`:
```html
<meta name="viewport" content="width=device-width, initial-scale=1" />
```

Add the following lines directly after it:
```html
    <link rel="manifest" href="/radioplan/manifest.json" />
    <link rel="apple-touch-icon" href="/radioplan/icon-192.png" />
    <meta name="theme-color" content="#0f172a" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="RadioPlan" />
```

- [ ] **Step 2: Verify the result**

The `<head>` section should now contain all six new tags after the viewport meta. Open `index.html` and confirm visually.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat(pwa): add manifest link and iOS PWA meta tags to index.html"
```

---

## Task 4: Fix service worker (sw.js)

**Files:**
- Modify: `public/sw.js`

Three bugs to fix + two handlers to add:
1. `openWindow('/')` → `openWindow('/radioplan/')` — currently opens a blank GitHub Pages 404
2. Add `fetch` handler (cache-nothing) — required by Chrome's PWA installability checklist
3. Add `pushsubscriptionchange` handler — re-subscribes when the browser rotates the push token

- [ ] **Step 1: Rewrite `public/sw.js` with all fixes**

Replace the entire content of `public/sw.js` with:

```javascript
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
```

- [ ] **Step 2: Commit**

```bash
git add public/sw.js
git commit -m "fix(pwa): fix sw.js openWindow path, add fetch handler and pushsubscriptionchange"
```

---

## Task 5: Fix service worker registration path

**Files:**
- Modify: `index.tsx` (line 12)

The SW is currently registered at `/sw.js` (root scope), which is out of scope for pages served under `/radioplan/`. Push events never fire. Fix: register at `/radioplan/sw.js`.

- [ ] **Step 1: Fix the SW registration path in `index.tsx`**

Find line 12:
```typescript
  navigator.serviceWorker.register('/sw.js').catch(console.error);
```

Replace with:
```typescript
  navigator.serviceWorker.register('/radioplan/sw.js').catch(console.error);
```

- [ ] **Step 2: Commit**

```bash
git add index.tsx
git commit -m "fix(pwa): register service worker at correct /radioplan/sw.js path"
```

---

## Task 6: Create usePushNotifications hook

**Files:**
- Create: `hooks/usePushNotifications.ts`

This hook handles the full push subscription lifecycle: detect standalone mode, request permission (on user gesture only), subscribe via PushManager, and upsert the subscription to Supabase. It returns state for the UI to render the correct button/message.

**Important iOS note:** On iOS, `Notification.requestPermission()` must be called from a user gesture (button click). Calling it on component mount will silently fail. This hook returns a `subscribe()` function that the button's onClick must call — never call it automatically.

**Important standalone note:** On iOS, push subscriptions only work when the PWA is installed to the home screen and running in standalone mode. Calling `pushManager.subscribe()` in the browser tab will throw `NotSupportedError`. The hook detects this and returns `isStandalone: false` so the UI can show an install-first prompt.

- [ ] **Step 1: Create the hooks directory and `usePushNotifications.ts`**

Create `hooks/usePushNotifications.ts`:

```typescript
import { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';

// Converts the base64url VAPID public key to the Uint8Array required by PushManager.subscribe()
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

function isStandaloneMode(): boolean {
  // iOS webkit-specific flag
  if ((window.navigator as any).standalone === true) return true;
  // Standard display-mode check (Android Chrome, desktop)
  if (window.matchMedia('(display-mode: standalone)').matches) return true;
  return false;
}

export type PushPermissionState = 'unsupported' | 'not-standalone' | 'default' | 'granted' | 'denied';

interface UsePushNotificationsResult {
  permission: PushPermissionState;
  isStandalone: boolean;
  subscribe: () => Promise<void>;
  loading: boolean;
  error: string | null;
}

export function usePushNotifications(userId: string | undefined): UsePushNotificationsResult {
  const [permission, setPermission] = useState<PushPermissionState>('default');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const standalone = isStandaloneMode();

  useEffect(() => {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      setPermission('unsupported');
      return;
    }
    if (!standalone) {
      setPermission('not-standalone');
      return;
    }
    // Read current browser permission state
    setPermission(Notification.permission as PushPermissionState);
  }, [standalone]);

  const subscribe = async () => {
    if (!userId) return;
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return;

    setLoading(true);
    setError(null);

    try {
      // Request permission — must be called from a user gesture
      const result = await Notification.requestPermission();
      setPermission(result as PushPermissionState);
      if (result !== 'granted') return;

      // Get service worker registration
      const registration = await navigator.serviceWorker.ready;

      // Subscribe to push — applicationServerKey is the VAPID public key
      const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });

      // Extract subscription fields
      const { endpoint } = subscription;
      const keys = subscription.toJSON().keys as { p256dh: string; auth: string };

      // Upsert into push_subscriptions — unique on (user_id, endpoint)
      const { error: dbError } = await supabase
        .from('push_subscriptions')
        .upsert(
          { user_id: userId, endpoint, p256dh: keys.p256dh, auth: keys.auth },
          { onConflict: 'user_id,endpoint' }
        );

      if (dbError) throw dbError;
    } catch (err: any) {
      console.error('Push subscription failed:', err);
      setError(err.message ?? 'Erreur lors de l\'activation des notifications');
    } finally {
      setLoading(false);
    }
  };

  return { permission, isStandalone: standalone, subscribe, loading, error };
}
```

- [ ] **Step 2: Commit**

```bash
git add hooks/usePushNotifications.ts
git commit -m "feat(pwa): add usePushNotifications hook with iOS standalone detection"
```

---

## Task 7: Add push subscription UI to Profile > Notifications tab

**Files:**
- Modify: `pages/Profile.tsx`

The push subscription button lives at the top of the `NotificationSection` component (defined inside Profile.tsx around line 30). It shows different content based on permission state. The `subscribe()` function must be called directly from the button's `onClick` — it cannot be deferred or wrapped in a timeout, because iOS requires it to be called from within a synchronous user gesture handler.

- [ ] **Step 1: Add import for usePushNotifications at the top of Profile.tsx**

Find the existing imports at the top of `pages/Profile.tsx`. Add this import after the existing imports:

```typescript
import { usePushNotifications } from '../hooks/usePushNotifications';
```

- [ ] **Step 2: Use the hook inside the NotificationSection component**

The `NotificationSection` component is defined inside Profile.tsx and receives `notifications`, `unreadCount`, `markRead`, `markAllRead`, `clearAll`, `loading`, and `currentDoctorName` as props. It needs the current user's ID for push subscriptions.

First, add `userId` to the `NotificationSection` props. Find the `NotificationSection` function signature (it starts around line 30 with something like `function NotificationSection({ notifications, ... })`).

Add `userId` to the props type and destructuring:
```typescript
// Add to the props destructuring:
userId,
// Add to the props type (if typed):
userId?: string;
```

Then add the hook call inside `NotificationSection`, after the existing `useState` calls:
```typescript
const { permission, isStandalone, subscribe, loading: pushLoading, error: pushError } = usePushNotifications(userId);
```

- [ ] **Step 3: Add the push notification UI block to NotificationSection's render**

Find the `return (` inside `NotificationSection`. After the opening `<div className="space-y-3">` (first line of the return), add this block before the existing header `<div>`:

```tsx
{/* Push notification subscription */}
<div className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex items-center justify-between gap-3">
  <div className="flex items-center gap-2 text-sm text-slate-600 min-w-0">
    <span className="text-base flex-shrink-0">
      {permission === 'granted' ? '🔔' : '🔕'}
    </span>
    <span className="truncate">Notifications push</span>
  </div>
  <div className="flex-shrink-0">
    {permission === 'not-standalone' && (
      <span className="text-xs text-amber-600 text-right block max-w-[160px]">
        Installez l'app sur votre écran d'accueil pour activer
      </span>
    )}
    {permission === 'unsupported' && (
      <span className="text-xs text-slate-400">Non supporté</span>
    )}
    {permission === 'default' && (
      <button
        onClick={subscribe}
        disabled={pushLoading}
        className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        {pushLoading ? 'Activation...' : 'Activer'}
      </button>
    )}
    {permission === 'granted' && (
      <span className="text-xs text-green-600 font-medium">Activées ✓</span>
    )}
    {permission === 'denied' && (
      <span className="text-xs text-red-500 text-right block max-w-[160px]">
        Bloquées — vérifiez les paramètres du navigateur
      </span>
    )}
  </div>
</div>
{pushError && (
  <p className="text-xs text-red-500">{pushError}</p>
)}
```

- [ ] **Step 4: Pass userId from the Profile component to NotificationSection**

Find where `NotificationSection` is used in the Profile render (around line 782):
```tsx
<NotificationSection
    notifications={notifications}
    unreadCount={unreadCount}
    markRead={markRead}
    markAllRead={markAllRead}
    clearAll={clearAll}
    loading={notifLoading}
    currentDoctorName={...}
/>
```

Add `userId={profile?.id}` to the props:
```tsx
<NotificationSection
    notifications={notifications}
    unreadCount={unreadCount}
    markRead={markRead}
    markAllRead={markAllRead}
    clearAll={clearAll}
    loading={notifLoading}
    currentDoctorName={doctors.find(d => d.id === profile?.doctor_id)?.name}
    userId={profile?.id}
/>
```

- [ ] **Step 5: Commit**

```bash
git add pages/Profile.tsx
git commit -m "feat(pwa): add push subscription button to Profile Notifications tab"
```

---

## Task 8: Create send-push Edge Function

**Files:**
- Create: `supabase/functions/send-push/index.ts`

This function receives `{ user_id, title, body, data }` from the DB trigger, fetches all push subscriptions for that user, and sends Web Push payloads. It uses `web-push` via esm.sh (same pattern as `rcp-auto-assign`). On HTTP 410 (expired/revoked subscription), it deletes the subscription from the DB.

- [ ] **Step 1: Create `supabase/functions/send-push/index.ts`**

```typescript
// supabase/functions/send-push/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'https://esm.sh/web-push@3.6.7';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT')!,           // e.g. "mailto:admin@radioplan.fr"
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!
);

Deno.serve(async (req) => {
  const { user_id, title, body, data } = await req.json();

  if (!user_id || !title) {
    return new Response(JSON.stringify({ error: 'user_id and title required' }), { status: 400 });
  }

  // Fetch all push subscriptions for this user
  const { data: subscriptions, error: fetchError } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', user_id);

  if (fetchError) {
    console.error('Failed to fetch subscriptions:', fetchError);
    return new Response(JSON.stringify({ error: 'DB error' }), { status: 500 });
  }

  if (!subscriptions || subscriptions.length === 0) {
    return new Response(JSON.stringify({ sent: 0, failed: 0, reason: 'no subscriptions' }));
  }

  const payload = JSON.stringify({ title, body: body ?? '', data: data ?? {} });
  let sent = 0;
  let failed = 0;

  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      );
      sent++;
    } catch (err: any) {
      // HTTP 410 = subscription expired or revoked — delete it
      if (err.statusCode === 410) {
        await supabase.from('push_subscriptions').delete().eq('id', sub.id);
        console.log(`Deleted expired subscription ${sub.id}`);
      } else {
        console.error(`Push failed for subscription ${sub.id}:`, err.message);
        failed++;
      }
    }
  }

  return new Response(JSON.stringify({ sent, failed }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
```

- [ ] **Step 2: Set Supabase secrets**

Run these commands from the project root (requires Supabase CLI logged in):

```bash
supabase secrets set VAPID_PRIVATE_KEY="YOUR_VAPID_PRIVATE_KEY"
supabase secrets set VAPID_SUBJECT="mailto:admin@radioplan.fr"
supabase secrets set VAPID_PUBLIC_KEY="BDnvagmVCsvMMJVisBRUgDlw5D1kXRuaJqE1hWWYvXjdCJJVlPgRsuDjgi2IWJsQhz_3Bti3yjJyumSUam4JgN0"
```

Replace `YOUR_VAPID_PRIVATE_KEY` with your actual private key (see Pre-flight Step B).
The public key value above is from `.env.local` — use it unless you regenerated the key pair.

- [ ] **Step 3: Deploy the edge function**

Since `supabase/config.toml` does not exist, pass the project ref explicitly. Find your project ref in Supabase dashboard → Settings → General.

```bash
supabase functions deploy send-push --project-ref YOUR_PROJECT_REF
```

Expected: `Deployed send-push successfully`

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/send-push/index.ts
git commit -m "feat(push): add send-push edge function with VAPID web push delivery"
```

---

## Task 9: Remove inline push code from rcp-auto-assign

**Files:**
- Modify: `supabase/functions/rcp-auto-assign/index.ts`

This function currently sends push directly (lines 2, 9-13, 149-162). Once the DB trigger (Task 10) is live, every insert into `notifications` will fire a push automatically. These lines must be removed **before** applying migration 19, otherwise `RCP_AUTO_ASSIGNED` notifications will deliver the push twice — once inline and once via the trigger.

**What to remove:**
- Line 2: `import webpush from 'https://esm.sh/web-push@3.6.7';`
- Lines 9-13: `webpush.setVapidDetails(...)` block
- Lines 149-162: the `push_subscriptions` query + `webpush.sendNotification` loop

The `notifications.insert` on line 141 stays — the trigger will pick it up.

- [ ] **Step 1: Remove the web-push import (line 2)**

Find and remove:
```typescript
import webpush from 'https://esm.sh/web-push@3.6.7';
```

- [ ] **Step 2: Remove the setVapidDetails block (lines 9-13)**

Find and remove:
```typescript
webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT')!,
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!
);
```

- [ ] **Step 3: Remove the inline push block (lines 149-162)**

Find and remove this entire block (it comes after the `notifications.insert` for the picked doctor):
```typescript
      // Push notification
      const { data: pushSubs } = await supabase
        .from('push_subscriptions')
        .select('endpoint, p256dh, auth')
        .eq('user_id', pickedProfile.id);

      for (const sub of (pushSubs ?? [])) {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            JSON.stringify({ title: 'RadioPlan — RCP assigné', body: `RCP du ${dateStr}` })
          );
        } catch { /* expired subscription */ }
      }
```

The result should be that the `notifications.insert` block (lines 140-148) stands alone — the trigger will fire the push.

**Important:** Line 163 (the closing `}` for the `if (pickedProfile) {` block opened at line 140) must be **kept**. Only remove the push block inside it. After the edit, the structure should look like:
```typescript
    if (pickedProfile) {
      await supabase.from('notifications').insert({ ... });
      // (push block removed — trigger handles it)
    }   ← keep this closing brace
```

- [ ] **Step 4: Deploy the updated function**

```bash
supabase functions deploy rcp-auto-assign --project-ref YOUR_PROJECT_REF
```

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/rcp-auto-assign/index.ts
git commit -m "refactor(push): remove inline push code from rcp-auto-assign, trigger handles it"
```

---

## Task 10: Create DB trigger migration

**Files:**
- Create: `supabase/migrations/19_push_trigger.sql`

This migration does two things:
1. Fixes a security issue in migration 16: the `"Service role reads all subscriptions"` policy used `USING (true)`, which allowed any authenticated user to read other users' push subscriptions. We drop it — the service role bypasses RLS entirely, so no policy is needed.
2. Creates the `pg_net`-based trigger that fires `send-push` after every notification insert.

**IMPORTANT:** The Pre-flight step must be done before this migration runs. The trigger function calls `current_setting('app.supabase_url')` and `current_setting('app.service_role_key')` — if these are not set in the database, the trigger will throw an error on every notification insert.

- [ ] **Step 1: Create `supabase/migrations/19_push_trigger.sql`**

```sql
-- Migration 19: pg_net push trigger + RLS security fix

-- Enable pg_net extension (available on all Supabase projects)
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Fix: migration 16 created an insecure policy that allowed any authenticated
-- user to read all push_subscriptions rows (USING (true)).
-- The service role bypasses RLS entirely, so no explicit policy is needed.
DROP POLICY IF EXISTS "Service role reads all subscriptions" ON public.push_subscriptions;

-- Trigger function: fires send-push edge function after each notification insert
CREATE OR REPLACE FUNCTION notify_push_on_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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

-- Trigger: fires after each INSERT into notifications
-- FOR EACH ROW so each notification row triggers independently
CREATE TRIGGER push_on_notification_insert
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION notify_push_on_notification();
```

- [ ] **Step 2: Verify pg_net is available**

In the Supabase SQL Editor:
```sql
SELECT name, installed_version FROM pg_available_extensions WHERE name = 'pg_net';
```
Expected: one row showing `pg_net` with a version. If no row appears, enable pg_net in Supabase dashboard → Project Settings → Database → Extensions → search "pg_net" → Enable.

- [ ] **Step 3: Apply the migration**

Verify the Pre-flight ALTER DATABASE commands were run first (check with `SHOW app.supabase_url;`). Then apply:

```bash
supabase db push --project-ref YOUR_PROJECT_REF
```

Or apply directly in the Supabase SQL Editor by pasting the migration content (simpler since config.toml is absent).

- [ ] **Step 4: Verify the trigger exists**

In the Supabase SQL Editor:
```sql
SELECT trigger_name, event_manipulation, event_object_table
FROM information_schema.triggers
WHERE trigger_name = 'push_on_notification_insert';
```

Expected: one row with `push_on_notification_insert`, `INSERT`, `notifications`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/19_push_trigger.sql
git commit -m "feat(push): add pg_net trigger to fire send-push on notification insert"
```

---

## Task 11: Deploy frontend + end-to-end verification

**Files:** None (deploy + test)

- [ ] **Step 1: Build and verify the manifest is included**

```bash
npm run build
```

Check `dist/` contains:
- `manifest.json` (or linked from `index.html`)
- `icon-192.png`, `icon-512.png`
- `sw.js`

```bash
grep "manifest" dist/index.html
```

Expected: `<link rel="manifest" href="/radioplan/manifest.json" />`

- [ ] **Step 2: Push to GitHub to deploy**

```bash
git push origin main
```

Wait for GitHub Actions to deploy (usually 1-2 minutes).

- [ ] **Step 3: Verify PWA installability on Android**

1. Open the app URL in Chrome on Android
2. Chrome should show an "Add to Home Screen" install banner or an install icon in the address bar
3. Install it — it should open without the browser address bar (standalone mode)

- [ ] **Step 4: Verify PWA installability on iOS**

1. Open the app URL in Safari on iOS 16.4+
2. Tap the Share button → "Add to Home Screen"
3. The app name should be "RadioPlan" (from manifest)
4. Install it — it should open fullscreen without Safari navigation bars

- [ ] **Step 5: Test push subscription**

1. Open the installed PWA (from home screen — not from browser)
2. Go to Profile → Notifications tab
3. On Android: the "Activer" button should be visible
4. On iOS: the "Activer" button should be visible (requires standalone mode)
5. Tap "Activer" → browser shows permission prompt → Allow
6. Button should change to "Activées ✓"
7. In Supabase dashboard, check `push_subscriptions` table — a row should appear for your user

- [ ] **Step 6: Test end-to-end push delivery**

Manually insert a notification for your user in the Supabase SQL Editor:
```sql
INSERT INTO public.notifications (user_id, type, title, body)
VALUES (
  'YOUR_USER_UUID',
  'RCP_REMINDER_24H',
  'Test notification RadioPlan',
  'Ceci est un test de notification push'
);
```

Expected: within a few seconds, the phone should receive a push notification even if the PWA is closed/backgrounded.

Check `net.http_request_queue` to debug if push doesn't arrive:
```sql
SELECT * FROM net.http_request_queue ORDER BY created DESC LIMIT 5;
```

- [ ] **Step 7: Final commit (if any cleanup needed)**

```bash
git add -A
git commit -m "feat(pwa): complete PWA push notification implementation"
```

---

## Troubleshooting

**Push not received after inserting notification:**
1. Check `net.http_request_queue` in Supabase SQL Editor — the request should appear
2. Check Supabase Edge Function logs for `send-push` — any errors?
3. Verify `app.supabase_url` and `app.service_role_key` are set: `SHOW app.supabase_url;`
4. Verify VAPID secrets are set: `supabase secrets list`

**"Activer" button not showing on iOS:**
- The app must be running in standalone mode (installed to home screen). If opened in Safari browser tab, the hook returns `not-standalone` and shows the install warning instead.

**Android install banner not appearing:**
- Chrome requires the app to be served over HTTPS, have a manifest with `display: standalone`, and a registered service worker. Check DevTools → Application → Manifest for any errors.

**SW registration fails:**
- Check browser console for ServiceWorker errors. Verify `/radioplan/sw.js` returns a 200 with `Content-Type: application/javascript` (not 404).
