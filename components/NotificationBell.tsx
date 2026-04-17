// components/NotificationBell.tsx
import React, { useContext, useState } from 'react';
import { Bell, CheckCheck, ArrowRight, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Drawer } from 'vaul';
import { useNotifications } from '../context/NotificationContext';
import { supabase } from '../services/supabaseClient';
import { AppNotification } from '../types';
import { markReplacementResolved } from '../services/replacementService';
import { createNotification } from '../services/notificationService';
import { useAuth } from '../context/AuthContext';
import { AppContext } from '../App';
import { activityLogService } from '../services/activityLogService';

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
      let activityName: string | undefined;

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

        // Fetch slot details for rich notification body
        const { data: reqDetails } = await supabase
          .from('replacement_requests')
          .select('slot_date, period, activity_name')
          .eq('id', requestId)
          .single();
        slotDate     = reqDetails?.slot_date;
        period       = reqDetails?.period;
        activityName = reqDetails?.activity_name;

        await activityLogService.addLog({
          userId: profile?.id || '',
          userEmail: profile?.email || '',
          userName: (profile as any).doctor_name || profile?.email || '',
          action: 'REPLACEMENT_ACCEPT',
          description: `Demande de remplacement acceptée`,
          weekKey: '',
          category: 'REMPLACEMENT',
        });

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
          .select('slot_id, slot_type, requester_doctor_id, slot_date, period, activity_name')
          .eq('id', requestId)
          .single();
        console.log('[BELL] 1️⃣ SELECT:', { reqRow, selErr });
        slotId            = reqRow?.slot_id;
        slotType          = reqRow?.slot_type ?? '';
        requesterDoctorId = reqRow?.requester_doctor_id;
        slotDate          = reqRow?.slot_date;
        period            = reqRow?.period;
        activityName      = reqRow?.activity_name;
        await markReplacementResolved(requestId, 'REJECTED');
        console.log('[BELL] 1️⃣ marked REJECTED ✅');

        await activityLogService.addLog({
          userId: profile?.id || '',
          userEmail: profile?.email || '',
          userName: (profile as any).doctor_name || profile?.email || '',
          action: 'REPLACEMENT_REJECT',
          description: `Demande de remplacement refusée`,
          weekKey: '',
          category: 'REMPLACEMENT',
        });
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
            body: (() => {
              const fmtDate = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
              const verb = status === 'ACCEPTED' ? 'accepté' : 'refusé';
              const who = currentDoctorName ? `Dr. ${currentDoctorName} a ` : '';
              const what = activityName ? ` — ${activityName}` : '';
              const when = slotDate ? `, le ${fmtDate(slotDate)}` : '';
              const per = period ? ` (${period})` : '';
              return `${who}${verb} votre demande de remplacement${what}${when}${per}.`;
            })(),
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
        confirmed === 'ACCEPTED' ? 'bg-green-100 text-green-700' : 'bg-danger/10 text-danger'
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
        className="text-xs bg-danger/10 text-danger px-3 py-1 rounded-full hover:bg-danger/20 disabled:opacity-50 font-medium">
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
      className={`px-4 py-3 hover:bg-muted cursor-pointer transition-colors
        ${!notification.read ? 'bg-primary/5' : ''}`}
    >
      <div className="flex items-start gap-2">
        <span className="text-lg mt-0.5 shrink-0">{icon}</span>
        <div className="flex-1 min-w-0">
          <p className={`text-sm ${!notification.read ? 'font-semibold text-text-base' : 'text-text-base'}`}>
            {notification.title}
          </p>
          <p className="text-xs text-text-muted mt-0.5 line-clamp-2">{notification.body}</p>
          <p className="text-xs text-text-muted mt-1">{date}</p>
          {notification.type === 'REPLACEMENT_REQUEST' && requestId && (
            notification.data?.resolution ? (
              <div className={`mt-2 text-xs px-3 py-1.5 rounded-lg font-medium inline-flex items-center gap-1 ${notification.data.resolution === 'ACCEPTED' ? 'bg-green-100 text-green-700' : 'bg-danger/10 text-danger'}`}>
                {notification.data.resolution === 'ACCEPTED' ? '✅ Vous avez accepté' : '❌ Vous avez refusé'}
              </div>
            ) : (
              <ReplacementActions notificationId={notification.id} requestId={requestId} onResolved={onRead} />
            )
          )}
        </div>
        {!notification.read && (
          <span className="w-2 h-2 bg-primary rounded-full mt-1.5 shrink-0" />
        )}
      </div>
    </div>
  );
};

// Main Bell component
const NotificationBell: React.FC = () => {
  const { notifications, unreadCount, markRead, markAllRead, clearAll, loading } = useNotifications();
  const [isOpen, setIsOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const navigate = useNavigate();

  const handleSeeAll = () => {
    setIsOpen(false);
    navigate('/profile');
  };

  const handleClearAll = async () => {
    setClearing(true);
    try { await clearAll(); } finally { setClearing(false); }
  };

  return (
    <>
      <button
        className="w-9 h-9 rounded-btn-sm bg-primary/10 hover:bg-primary/15 text-primary flex items-center justify-center relative press-scale transition-colors"
        aria-label="Notifications"
        onClick={() => {
          const opening = !isOpen;
          setIsOpen(opening);
          if (opening) markAllRead();
        }}
      >
        <Bell className="w-5 h-5 text-primary" aria-hidden="true" />
        {unreadCount > 0 && !isOpen && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-danger border-2 border-surface flex items-center justify-center text-[10px] font-bold text-white leading-none px-0.5" aria-hidden="true">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      <Drawer.Root open={isOpen} onOpenChange={setIsOpen} dismissible>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/40 z-modal" />
          <Drawer.Content
            className="fixed bottom-0 left-0 right-0 z-modal bg-surface rounded-t-2xl
                       border-t border-border outline-none overflow-hidden
                       md:left-auto md:right-4 md:bottom-14 md:top-auto md:w-80 md:rounded-card md:border"
            data-vaul-custom-container="true"
          >
            {/* Drag handle — mobile only */}
            <div className="w-8 h-1 bg-border rounded-full mx-auto mt-3 mb-2 md:hidden" aria-hidden="true" />

            {/* Header */}
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <h2 className="font-heading font-semibold text-sm text-text-base">Notifications</h2>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <>
                    <span className="text-[11px] font-medium text-text-muted">{unreadCount} non lue(s)</span>
                    <button onClick={markAllRead}
                      className="text-xs text-primary hover:underline flex items-center gap-1">
                      <CheckCheck size={12} /> Tout lu
                    </button>
                  </>
                )}
                {notifications.length > 0 && (
                  <button onClick={handleClearAll} disabled={clearing}
                    className="text-xs text-danger hover:opacity-80 flex items-center gap-1 disabled:opacity-50">
                    <Trash2 size={12} /> Vider
                  </button>
                )}
              </div>
            </div>

            {/* Notification list */}
            <div className="overflow-y-auto max-h-[50vh] md:max-h-80 divide-y divide-border">
              {loading && (
                <p className="text-center py-8 text-text-muted text-sm">Chargement...</p>
              )}
              {!loading && notifications.length === 0 && (
                <p className="text-center py-8 text-text-muted text-sm">Aucune notification</p>
              )}
              {notifications.slice(0, 5).map(n => (
                <NotificationItem key={n.id} notification={n} onRead={() => markRead(n.id)} />
              ))}
            </div>

            {/* Footer */}
            <button
              onClick={handleSeeAll}
              className="w-full flex items-center justify-center gap-1.5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-sm text-primary font-medium hover:bg-primary/5 transition-colors border-t border-border"
            >
              Voir toutes les notifications
              <ArrowRight size={14} />
            </button>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </>
  );
};

export default NotificationBell;
