// context/NotificationContext.tsx
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
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

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const refresh = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const data = await getNotifications(userId);
      setNotifications(data);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    refresh();
    const unsub = subscribeToNotifications(userId, (newNotif) => {
      setNotifications(prev => [newNotif, ...prev]);
      setToasts(prev => [...prev, newNotif]);
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== newNotif.id));
      }, 6000);
    });
    return unsub;
  }, [userId, refresh]);

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
    // Optimistic update: clear immediately so the UI feels instant
    const previous = notifications;
    setNotifications([]);
    try {
      await deleteAllNotifications(userId);
    } catch (err) {
      // Revert if the backend delete failed
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
