// components/NotificationBell.tsx
import React, { useContext, useState } from 'react';
import { Bell, CheckCheck, ArrowRight, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '../context/NotificationContext';
import { supabase } from '../services/supabaseClient';
import { AppNotification } from '../types';
import { markReplacementResolved } from '../services/replacementService';
import { createNotification } from '../services/notificationService';
import { useAuth } from '../context/AuthContext';
import { AppContext } from '../App';

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
  notificationId: string;
  requestId: string;
  onResolved: () => void;
}> = ({ notificationId, requestId, onResolved }) => {
  const [loading, setLoading] = useState(false);
  const [confirmed, setConfirmed] = useState<'ACCEPTED' | 'REJECTED' | null>(null);
  const { profile } = useAuth();
  const { doctors, manualOverrides, setManualOverrides, rcpAttendance, setRcpAttendance } = useContext(AppContext);
  const { refresh } = useNotifications();
  const currentDoctorId = profile?.doctor_id ?? undefined;
  const currentDoctorName = doctors.find(d => d.id === currentDoctorId)?.name;

  const handle = async (status: 'ACCEPTED' | 'REJECTED') => {
    console.log('%c[BELL] ▶ handle click', 'color:cyan;font-weight:bold', { status, requestId, currentDoctorId, notificationId });
    setLoading(true);
    try {
      let slotId: string | undefined;
      let slotType = '';
      let requesterDoctorId: string | undefined;
      let slotDate: string | undefined;
      let period: string | undefined;

      if (status === 'ACCEPTED') {
        if (!currentDoctorId) {
          console.error('[BELL] ❌ currentDoctorId is null — profile has no doctor linked');
          throw new Error('No doctor profile linked to this account');
        }

        console.log('[BELL] 1️⃣ calling RPC accept_replacement…', { requestId, currentDoctorId });
        const { data: result, error: rpcError } = await supabase.rpc('accept_replacement', {
          p_request_id: requestId,
          p_acceptor_doctor_id: currentDoctorId,
        });
        console.log('[BELL] 1️⃣ RPC response:', { result, rpcError });

        if (rpcError) throw rpcError;
        if (result?.error) throw new Error(result.error as string);

        slotId            = result.slot_id as string;
        slotType          = (result.slot_type as string) ?? '';
        requesterDoctorId = result.requester_doctor_id as string;
        console.log('[BELL] 1️⃣ RPC success ✅', { slotId, slotType, requesterDoctorId });

        if (slotId) {
          console.log('[BELL] 2️⃣ syncing React state…', { slotType });
          if (slotType === 'RCP') {
            const currentMap = rcpAttendance[slotId] ?? {};
            const newMap: Record<string, 'PRESENT' | 'ABSENT'> = { ...currentMap };
            if (requesterDoctorId) newMap[requesterDoctorId] = 'ABSENT';
            newMap[currentDoctorId] = 'PRESENT';
            setRcpAttendance({ ...rcpAttendance, [slotId]: newMap });
            console.log('[BELL] 2️⃣ rcpAttendance updated ✅', newMap);
          } else {
            setManualOverrides({ ...manualOverrides, [slotId]: currentDoctorId });
            console.log('[BELL] 2️⃣ manualOverrides updated ✅', { [slotId]: currentDoctorId });
          }
        } else {
          console.warn('[BELL] 2️⃣ slotId missing in RPC result — state NOT synced');
        }
      } else {
        console.log('[BELL] 1️⃣ REJECTED — fetching request info…');
        const { data: reqRow, error: selErr } = await supabase
          .from('replacement_requests')
          .select('slot_id, slot_type, requester_doctor_id, slot_date, period')
          .eq('id', requestId)
          .single();
        console.log('[BELL] 1️⃣ SELECT:', { reqRow, selErr });
        slotId            = reqRow?.slot_id;
        slotType          = reqRow?.slot_type ?? '';
        requesterDoctorId = reqRow?.requester_doctor_id;
        slotDate          = reqRow?.slot_date;
        period            = reqRow?.period;
        await markReplacementResolved(requestId, 'REJECTED');
        console.log('[BELL] 1️⃣ marked REJECTED ✅');
      }

      console.log('[BELL] 3️⃣ notifying requester…', { requesterDoctorId });
      if (requesterDoctorId) {
        const { data: requesterProfile } = await supabase
          .from('profiles').select('id').eq('doctor_id', requesterDoctorId).single();
        if (requesterProfile) {
          await createNotification({
            user_id: requesterProfile.id,
            type: status === 'ACCEPTED' ? 'REPLACEMENT_ACCEPTED' : 'REPLACEMENT_REJECTED',
            title: status === 'ACCEPTED' ? 'Remplacement accepté ✅' : 'Remplacement refusé ❌',
            body: `${currentDoctorName ? `Dr. ${currentDoctorName} a ` : ''}${status === 'ACCEPTED' ? 'accepté' : 'refusé'} votre demande de remplacement${slotDate ? ` pour le ${slotDate}` : ''}${period ? ` (${period})` : ''}.`,
            data: { requestId, slotId, slotType },
            read: false,
          });
          console.log('[BELL] 3️⃣ requester notified ✅');
        } else {
          console.warn('[BELL] 3️⃣ requester profile not found for doctor_id:', requesterDoctorId);
        }
      }

      await supabase.from('notifications')
        .update({ data: { requestId, resolution: status }, read: true })
        .eq('id', notificationId);

      setConfirmed(status);
      onResolved();
      console.log('%c[BELL] ✅ DONE', 'color:lime;font-weight:bold');
      await refresh();
    } catch (e) {
      console.error('%c[BELL] ❌ ERROR', 'color:red;font-weight:bold', e);
    } finally {
      setLoading(false);
    }
  };

  if (confirmed) {
    return (
      <div className={`mt-2 text-xs px-3 py-1.5 rounded-lg font-medium inline-flex items-center gap-1 ${
        confirmed === 'ACCEPTED' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
      }`}>
        {confirmed === 'ACCEPTED' ? '✅ Vous avez accepté' : '❌ Vous avez refusé'}
      </div>
    );
  }

  return (
    <div className="flex gap-2 mt-2">
      <button onClick={() => handle('ACCEPTED')} disabled={loading}
        className="text-xs bg-green-100 text-green-700 px-3 py-1 rounded-full hover:bg-green-200 disabled:opacity-50 font-medium">
        Accepter
      </button>
      <button onClick={() => handle('REJECTED')} disabled={loading}
        className="text-xs bg-red-100 text-red-700 px-3 py-1 rounded-full hover:bg-red-200 disabled:opacity-50 font-medium">
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
            notification.data?.resolution ? (
              <div className={`mt-2 text-xs px-3 py-1.5 rounded-lg font-medium inline-flex items-center gap-1 ${notification.data.resolution === 'ACCEPTED' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                {notification.data.resolution === 'ACCEPTED' ? '✅ Vous avez accepté' : '❌ Vous avez refusé'}
              </div>
            ) : (
              <ReplacementActions notificationId={notification.id} requestId={requestId} onResolved={onRead} />
            )
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
  const { notifications, unreadCount, markRead, markAllRead, clearAll, loading } = useNotifications();
  const [open, setOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const navigate = useNavigate();

  const handleSeeAll = () => {
    setOpen(false);
    navigate('/profile');
  };

  const handleClearAll = async () => {
    setClearing(true);
    try { await clearAll(); } finally { setClearing(false); }
  };

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
          <div className="absolute left-0 top-11 w-80 bg-white rounded-xl shadow-xl border border-gray-200 z-50 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
              <span className="font-semibold text-sm text-gray-700">
                Notifications {unreadCount > 0 && `(${unreadCount})`}
              </span>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button onClick={markAllRead}
                    className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                    <CheckCheck size={12} /> Tout lu
                  </button>
                )}
                {notifications.length > 0 && (
                  <button onClick={handleClearAll} disabled={clearing}
                    className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1 disabled:opacity-50">
                    <Trash2 size={12} /> Vider
                  </button>
                )}
              </div>
            </div>
            <div className="max-h-80 overflow-y-auto divide-y divide-gray-100">
              {loading && (
                <p className="text-center py-8 text-gray-400 text-sm">Chargement...</p>
              )}
              {!loading && notifications.length === 0 && (
                <p className="text-center py-8 text-gray-400 text-sm">Aucune notification</p>
              )}
              {notifications.slice(0, 5).map(n => (
                <NotificationItem key={n.id} notification={n} onRead={() => markRead(n.id)} />
              ))}
            </div>
            <button
              onClick={handleSeeAll}
              className="w-full flex items-center justify-center gap-1.5 py-3 text-sm text-blue-600 font-medium hover:bg-blue-50 transition-colors border-t border-gray-100"
            >
              Voir toutes les notifications
              <ArrowRight size={14} />
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default NotificationBell;
