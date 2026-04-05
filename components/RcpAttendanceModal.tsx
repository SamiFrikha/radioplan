import React, { useContext, useState } from 'react';
import { X, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { ScheduleSlot } from '../types';
import { AppContext } from '../App';
import { supabase } from '../services/supabaseClient';

interface Props {
  slot: ScheduleSlot;
  doctorId: string;
  onClose: () => void;
}

const RcpAttendanceModal: React.FC<Props> = ({ slot, doctorId, onClose }) => {
  const { rcpAttendance, setRcpAttendance } = useContext(AppContext);
  const [loading, setLoading] = useState<'PRESENT' | 'ABSENT' | null>(null);

  const currentStatus = rcpAttendance[slot.id]?.[doctorId] ?? null;

  const handleChoice = async (status: 'PRESENT' | 'ABSENT') => {
    setLoading(status);
    try {
      if (status === 'PRESENT') {
        const { error } = await supabase
          .from('rcp_attendance')
          .upsert(
            { slot_id: slot.id, doctor_id: doctorId, status: 'PRESENT' },
            { onConflict: 'slot_id, doctor_id' }
          );
        if (error) throw error;
        setRcpAttendance({
          ...rcpAttendance,
          [slot.id]: { ...(rcpAttendance[slot.id] ?? {}), [doctorId]: 'PRESENT' },
        });
      } else {
        const { error } = await supabase
          .from('rcp_attendance')
          .upsert(
            { slot_id: slot.id, doctor_id: doctorId, status: 'ABSENT' },
            { onConflict: 'slot_id, doctor_id' }
          );
        if (error) throw error;
        setRcpAttendance({
          ...rcpAttendance,
          [slot.id]: { ...(rcpAttendance[slot.id] ?? {}), [doctorId]: 'ABSENT' },
        });
      }
    } catch (err) {
      console.error('RcpAttendanceModal error:', err);
      return;
    } finally {
      setLoading(null);
    }
    onClose();
  };

  const slotLabel = slot.subType || slot.location || 'RCP';
  const dateLabel = slot.date
    ? new Date(slot.date + 'T12:00').toLocaleDateString('fr-FR', {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
      })
    : '';

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface rounded-xl shadow-modal w-full max-w-xs p-5"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="font-bold text-text-base text-sm">{slotLabel}</p>
            {dateLabel && (
              <p className="text-xs text-text-muted mt-0.5 capitalize">{dateLabel}</p>
            )}
          </div>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded-btn-sm text-text-muted">
            <X size={16} />
          </button>
        </div>

        {currentStatus && (
          <p className="text-xs text-center text-text-muted mb-3 italic">
            Statut actuel :{' '}
            <span className="font-semibold">
              {currentStatus === 'PRESENT' ? 'Présent' : 'Absent'}
            </span>
          </p>
        )}

        <div className="flex gap-3">
          <button
            onClick={() => handleChoice('PRESENT')}
            disabled={!!loading}
            className="flex-1 py-3 rounded-btn font-semibold text-sm text-white flex items-center justify-center gap-2 transition-all hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: '#059669' }}
          >
            {loading === 'PRESENT' ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <CheckCircle2 size={16} />
            )}
            Présent
          </button>
          <button
            onClick={() => handleChoice('ABSENT')}
            disabled={!!loading}
            className="flex-1 py-3 rounded-btn font-semibold text-sm text-white flex items-center justify-center gap-2 transition-all hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: '#DC2626' }}
          >
            {loading === 'ABSENT' ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <XCircle size={16} />
            )}
            Absent
          </button>
        </div>
      </div>
    </div>
  );
};

export default RcpAttendanceModal;
