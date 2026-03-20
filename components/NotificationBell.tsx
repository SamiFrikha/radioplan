// components/NotificationBell.tsx
import React, { useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { useNotifications } from '../context/NotificationContext';
import { supabase } from '../services/supabaseClient';
import { AppNotification } from '../types';
import { resolveReplacementRequest } from '../services/replacementService';
import { createNotification } from '../services/notificationService';

const NOTIF_ICON: Record<string, string> = {
  RCP_AUTO_ASSIGNED: '🎲',
  RCP_SLOT_FILLED: '✅',
  RCP_REMINDER_24H: '⏰',
  RCP_REMINDER_12H: '⚠️',
  RCP_UNASSIGNED_ALERT: '🚨',
  REPLACEMENT_REQUEST: '🔄',
  REPLACEMENT_ACCEPTED: '✅',
  REPLACEMENT_REJECTED: '❌',
};

// Sub-component: Accept/Reject buttons for replacement requests
const ReplacementActions: React.FC<{
  requestId: string;
  onResolved: () => void;
}> = ({ requestId, onResolved }) => {
  const [loading, setLoading] = useState(false);

  const handle = async (status: 'ACCEPTED' | 'REJECTED') => {
    setLoading(true);
    try {
      const resolved = await resolveReplacementRequest(requestId, status);

      // Notify the requester
      const { data: requesterProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('doctor_id', resolved.requesterDoctorId)
        .single();

      if (requesterProfile) {
        await createNotification({
          user_id: requesterProfile.id,
          type: status === 'ACCEPTED' ? 'REPLACEMENT_ACCEPTED' : 'REPLACEMENT_REJECTED',
          title: status === 'ACCEPTED' ? 'Remplacement accepté ✅' : 'Remplacement refusé ❌',
          body: `Votre demande de remplacement pour le ${resolved.slotDate} (${resolved.period}) a été ${status === 'ACCEPTED' ? 'acceptée' : 'refusée'}.`,
          data: { requestId, slotId: resolved.slotId },
          read: false,
        });
      }

      onResolved();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex gap-2 mt-2">
      <button onClick={() => handle('ACCEPTED')} disabled={loading}
        className="text-xs bg-green-100 text-green-700 px-3 py-1 rounded-full hover:bg-green-200 disabled:opacity-50">
        Accepter
      </button>
      <button onClick={() => handle('REJECTED')} disabled={loading}
        className="text-xs bg-red-100 text-red-700 px-3 py-1 rounded-full hover:bg-red-200 disabled:opacity-50">
        Refuser
      </button>
    </div>
  );
};

// Notification item
const NotificationItem: React.FC<{
  notification: AppNotification;
  onRead: () => void;
}> = ({ notification, onRead }) => {
  const icon = NOTIF_ICON[notification.type] ?? '🔔';
  const date = new Date(notification.created_at).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
  const requestId = notification.data?.requestId as string | undefined;

  return (
    <div
      onClick={onRead}
      className={`px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors
        ${!notification.read ? 'bg-blue-50' : ''}`}
    >
      <div className="flex items-start gap-2">
        <span className="text-lg mt-0.5 shrink-0">{icon}</span>
        <div className="flex-1 min-w-0">
          <p className={`text-sm ${!notification.read ? 'font-semibold text-gray-800' : 'text-gray-700'}`}>
            {notification.title}
          </p>
          <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{notification.body}</p>
          <p className="text-xs text-gray-400 mt-1">{date}</p>
          {notification.type === 'REPLACEMENT_REQUEST' && requestId && (
            <ReplacementActions requestId={requestId} onResolved={onRead} />
          )}
        </div>
        {!notification.read && (
          <span className="w-2 h-2 bg-blue-500 rounded-full mt-1.5 shrink-0" />
        )}
      </div>
    </div>
  );
};

// Main Bell component
const NotificationBell: React.FC = () => {
  const { notifications, unreadCount, markRead, markAllRead, loading } = useNotifications();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="relative p-2 rounded-full hover:bg-gray-100 transition-colors"
        aria-label="Notifications"
      >
        <Bell size={20} className="text-gray-600" />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 bg-red-500 text-white text-xs rounded-full
                           min-w-[18px] h-[18px] flex items-center justify-center px-1 leading-none font-medium">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-11 w-80 bg-white rounded-xl shadow-xl border border-gray-200 z-50 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
              <span className="font-semibold text-sm text-gray-700">
                Notifications {unreadCount > 0 && `(${unreadCount})`}
              </span>
              {unreadCount > 0 && (
                <button onClick={markAllRead}
                  className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                  <CheckCheck size={12} /> Tout lu
                </button>
              )}
            </div>
            <div className="max-h-96 overflow-y-auto divide-y divide-gray-100">
              {loading && (
                <p className="text-center py-8 text-gray-400 text-sm">Chargement...</p>
              )}
              {!loading && notifications.length === 0 && (
                <p className="text-center py-8 text-gray-400 text-sm">Aucune notification</p>
              )}
              {notifications.map(n => (
                <NotificationItem key={n.id} notification={n} onRead={() => markRead(n.id)} />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default NotificationBell;
