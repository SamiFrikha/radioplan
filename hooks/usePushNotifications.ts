import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';

// Converts the base64url VAPID public key to the Uint8Array required by PushManager.subscribe()
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

function isStandaloneMode(): boolean {
  if ((window.navigator as any).standalone === true) return true;
  if (window.matchMedia('(display-mode: standalone)').matches) return true;
  if (window.matchMedia('(display-mode: fullscreen)').matches) return true;
  return false;
}

// Ensures the device's CURRENT push subscription is persisted in the DB.
// Reuses an existing browser subscription if present (refreshing the stored
// endpoint after a token rotation), otherwise creates one. Safe to call without
// a user gesture as long as Notification.permission is already 'granted'.
// This is the core self-healing primitive: every app open re-runs it, so a
// subscription that was lost (rotated, expired and deleted on HTTP 410, or
// whose initial save silently failed) is automatically re-created.
async function registerSubscription(userId: string): Promise<void> {
  const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string;
  if (!vapidPublicKey || vapidPublicKey.length < 10) {
    throw new Error('Clé VAPID manquante — contactez l\'administrateur');
  }

  // Wait for the SW to be ready (with timeout so we never hang).
  const registration = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Service worker timeout')), 10000)
    ),
  ]);

  // Reuse the existing browser subscription when there is one; only subscribe
  // afresh when none exists. getSubscription() returns the rotated endpoint
  // after the browser renews it, so upserting it heals stale DB rows.
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });
  }

  const { endpoint } = subscription;
  const keys = subscription.toJSON().keys as { p256dh: string; auth: string };
  if (!keys?.p256dh || !keys?.auth) {
    throw new Error('Subscription keys manquantes');
  }

  const { error: dbError } = await supabase
    .from('push_subscriptions')
    .upsert(
      { user_id: userId, endpoint, p256dh: keys.p256dh, auth: keys.auth },
      { onConflict: 'user_id,endpoint' }
    );
  if (dbError) throw dbError;
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
  const subscribeInProgress = useRef(false); // Prevents double-click race condition
  const healInProgress = useRef(false);       // Prevents overlapping auto-heal runs

  const standalone = isStandaloneMode();

  // Sync permission state with the actual browser state on mount and visibility change
  useEffect(() => {
    const syncPermission = () => {
      if (!('Notification' in window) || !('serviceWorker' in navigator)) {
        setPermission('unsupported');
        return;
      }
      if (!standalone) {
        setPermission('not-standalone');
        return;
      }
      // Re-read the actual browser permission each time (handles revocation)
      const actual = Notification.permission;
      setPermission(actual as PushPermissionState);
    };

    syncPermission();

    // Re-check when user comes back to the tab (they may have changed settings)
    document.addEventListener('visibilitychange', syncPermission);
    return () => document.removeEventListener('visibilitychange', syncPermission);
  }, [standalone]);

  // ─── Self-healing reconciliation ──────────────────────────────────────────
  // The browser permission being 'granted' does NOT guarantee the DB still has
  // a valid subscription: the push token rotates over time, expired endpoints
  // get deleted server-side on HTTP 410, and an initial save can fail silently.
  // When that happens the UI still shows "granted" but the server has nothing to
  // push to. So whenever we are granted + standalone, silently (re)persist the
  // current subscription. Runs on mount, when permission flips to granted, and
  // when the user returns to the foreground.
  useEffect(() => {
    if (!userId || !standalone) return;
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return;

    const heal = () => {
      if (Notification.permission !== 'granted') return;
      if (healInProgress.current) return;
      healInProgress.current = true;
      registerSubscription(userId)
        .catch((err) => console.warn('[Push] Auto-heal subscription failed:', err))
        .finally(() => { healInProgress.current = false; });
    };

    heal();
    document.addEventListener('visibilitychange', heal);
    return () => document.removeEventListener('visibilitychange', heal);
  }, [userId, standalone, permission]);

  // Listen for pushsubscriptionchange message from the service worker.
  // When the browser rotates the push token, the SW sends this message
  // so we can re-subscribe transparently and update the DB.
  useEffect(() => {
    if (!userId || !('serviceWorker' in navigator)) return;

    const onSwMessage = (event: MessageEvent) => {
      if (event.data?.type === 'PUSH_SUBSCRIPTION_CHANGED') {
        registerSubscription(userId).catch((err) =>
          console.warn('[Push] Auto-renew subscription failed:', err)
        );
      }
    };

    navigator.serviceWorker.addEventListener('message', onSwMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onSwMessage);
  }, [userId]);

  const subscribe = useCallback(async () => {
    if (!userId) return;
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return;
    if (subscribeInProgress.current) return; // Prevent double-click
    subscribeInProgress.current = true;

    setLoading(true);
    setError(null);

    try {
      // Request permission — must be called from a user gesture
      const result = await Notification.requestPermission();
      setPermission(result as PushPermissionState);
      if (result !== 'granted') return;

      // Create + persist the subscription (shared with the auto-heal path)
      await registerSubscription(userId);

      // Confirm success
      setPermission('granted');
    } catch (err: any) {
      console.error('[Push] Subscription failed:', err);
      setError(err.message ?? 'Erreur lors de l\'activation des notifications');
      // Re-sync permission state in case something changed
      if ('Notification' in window) {
        setPermission(Notification.permission as PushPermissionState);
      }
    } finally {
      setLoading(false);
      subscribeInProgress.current = false;
    }
  }, [userId]);

  return { permission, isStandalone: standalone, subscribe, loading, error };
}
