// context/NotificationContext.tsx
import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { AppNotification } from '../types';
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteAllNotifications,
  subscribeToNotifications,
} from '../services/notificationService';
import { useAuth } from './AuthContext';

interface NotificationContextType {
  notifications: AppNotification[];
  unreadCount: number;
  loading: boolean;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  clearAll: () => Promise<void>;
  refresh: () => Promise<void>;
  toasts: AppNotification[];
  dismissToast: (id: string) => void;
}

const NotificationContext = createContext<NotificationContextType>({
  notifications: [],
  unreadCount: 0,
  loading: false,
  markRead: async () => {},
  markAllRead: async () => {},
  clearAll: async () => {},
  refresh: async () => {},
  toasts: [],
  dismissToast: () => {},
});

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [toasts, setToasts] = useState<AppNotification[]>([]);

  // Track every notification ID we have ever shown — prevents duplicate toasts
  // regardless of whether the notification came from real-time, visibility refresh,
  // or the 30-second polling fallback.
  const knownIds = useRef(new Set<string>());

  // Set to true after the first successful load so we don't toast old notifications
  // that already existed when the user opened the app.
  const firstLoadDone = useRef(false);

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // Show a toast for a notification — idempotent (knownIds deduplicates).
  // Safe to call from both real-time callback and polling/visibility refresh.
  const addToast = useCallback((notif: AppNotification) => {
    if (knownIds.current.has(notif.id)) return;
    knownIds.current.add(notif.id);
    if (!firstLoadDone.current) return; // initial load: mark as known but don't toast
    setToasts(prev => [...prev, notif]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== notif.id));
    }, 6000);
  }, []);

  const refresh = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const data = await getNotifications(userId);
      // addToast is a no-op for IDs already in knownIds, and correctly skips
      // toasting during the first load (firstLoadDone.current is still false).
      data.forEach(n => addToast(n));
      setNotifications(data);
      firstLoadDone.current = true;
    } finally {
      setLoading(false);
    }
  }, [userId, addToast]);

  useEffect(() => {
    if (!userId) return;

    // Initial load — marks all existing notifications as known (no toasts for old ones)
    refresh();

    // Real-time path: fires instantly when Supabase Realtime is properly configured
    // (requires migration 24: ALTER PUBLICATION supabase_realtime ADD TABLE notifications
    //  + ALTER TABLE notifications REPLICA IDENTITY FULL)
    const unsub = subscribeToNotifications(userId, (newNotif) => {
      setNotifications(prev => [newNotif, ...prev]);
      addToast(newNotif);
    });

    // Fallback 1: re-check when the tab becomes visible after being hidden.
    // Catches all notifications that arrived while the app was in the background.
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisibility);

    // Fallback 2: poll every 30 s in case the WebSocket connection dropped.
    const interval = setInterval(refresh, 30_000);

    return () => {
      unsub();
      document.removeEventListener('visibilitychange', onVisibility);
      clearInterval(interval);
    };
  }, [userId, refresh, addToast]);

  const markRead = async (id: string) => {
    await markAsRead(id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const markAllRead = async () => {
    if (!userId) return;
    await markAllAsRead(userId);
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const clearAll = async () => {
    if (!userId) return;
    const previous = notifications;
    setNotifications([]);
    try {
      await deleteAllNotifications(userId);
    } catch (err) {
      console.error('[notifications] clearAll failed:', err);
      setNotifications(previous);
    }
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, loading, markRead, markAllRead, clearAll, refresh, toasts, dismissToast }}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => useContext(NotificationContext);
