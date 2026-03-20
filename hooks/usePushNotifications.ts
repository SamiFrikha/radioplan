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
