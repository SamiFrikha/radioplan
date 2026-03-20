// services/notificationService.ts
import { supabase } from './supabaseClient';
import { AppNotification } from '../types';

export const getNotifications = async (userId: string): Promise<AppNotification[]> => {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return data as AppNotification[];
};

export const markAsRead = async (notificationId: string): Promise<void> => {
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('id', notificationId);
  if (error) throw error;
};

export const markAllAsRead = async (userId: string): Promise<void> => {
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('user_id', userId)
    .eq('read', false);
  if (error) throw error;
};

export const createNotification = async (
  notification: Omit<AppNotification, 'id' | 'created_at'>
): Promise<void> => {
  const { error } = await supabase.from('notifications').insert(notification);
  if (error) throw error;
};

export const deleteAllNotifications = async (userId: string): Promise<void> => {
  const { error } = await supabase.from('notifications').delete().eq('user_id', userId);
  if (error) throw error;
};

export const subscribeToNotifications = (
  userId: string,
  onNew: (n: AppNotification) => void
): (() => void) => {
  const channel = supabase
    .channel(`notifications:${userId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => onNew(payload.new as AppNotification)
    )
    .subscribe();
  return () => { supabase.removeChannel(channel); };
};
