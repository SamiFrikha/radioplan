import { useState, useEffect, useRef } from 'react';
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

  const subscribe = async () => {
    if (!userId) return;
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return;
    if (subscribeInProgress.current) return; // Prevent double-click
    subscribeInProgress.current = true;

    setLoading(true);
    setError(null);

    try {
      // Validate VAPID key before attempting subscription
      const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string;
      if (!vapidPublicKey || vapidPublicKey.length < 10) {
        throw new Error('Clé VAPID manquante — contactez l\'administrateur');
      }

      // Request permission — must be called from a user gesture
      const result = await Notification.requestPermission();
      setPermission(result as PushPermissionState);
      if (result !== 'granted') return;

      // Wait for SW to be ready (with timeout to prevent hanging)
      const registration = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Service worker timeout')), 10000)
        ),
      ]);

      // Subscribe to push
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });

      const { endpoint } = subscription;
      const keys = subscription.toJSON().keys as { p256dh: string; auth: string };

      if (!keys?.p256dh || !keys?.auth) {
        throw new Error('Subscription keys manquantes');
      }

      // Upsert into push_subscriptions — unique on (user_id, endpoint)
      const { error: dbError } = await supabase
        .from('push_subscriptions')
        .upsert(
          { user_id: userId, endpoint, p256dh: keys.p256dh, auth: keys.auth },
          { onConflict: 'user_id,endpoint' }
        );

      if (dbError) throw dbError;

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
  };

  return { permission, isStandalone: standalone, subscribe, loading, error };
}
