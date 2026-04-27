import React, { useState, useContext, useMemo } from 'react';
import { AppContext } from '../App';
import PersonalAgendaWeek from '../components/PersonalAgendaWeek';
import PersonalAgendaMonth from '../components/PersonalAgendaMonth';
import ConflictResolverModal from '../components/ConflictResolverModal';
import RcpAttendanceModal from '../components/RcpAttendanceModal';
import { ScheduleSlot, SlotType, Period } from '../types';
import { useAuth } from '../context/AuthContext';
import { activityLogService } from '../services/activityLogService';
import { generateScheduleForWeek } from '../services/scheduleService';

const MonPlanning: React.FC = () => {
  const [agendaView, setAgendaView] = useState<'week' | 'month'>('week');
  const [agendaWeekOffset, setAgendaWeekOffset] = useState(0);
  const [selectedConsultSlot, setSelectedConsultSlot] = useState<ScheduleSlot | null>(null);
  const [selectedRcpSlot, setSelectedRcpSlot] = useState<ScheduleSlot | null>(null);
  const [selectedActivitySlot, setSelectedActivitySlot] = useState<ScheduleSlot | null>(null);
  const [resolvedDetailSlot, setResolvedDetailSlot] = useState<{
    slot: ScheduleSlot;
    replacementDoctorId: string | null;
  } | null>(null);

  const {
    doctors, unavailabilities, manualOverrides, setManualOverrides,
    template, activityDefinitions, rcpTypes, effectiveHistory,
    rcpAttendance, rcpExceptions,
  } = useContext(AppContext);

  const { profile } = useAuth();

  const handleConsultResolve = async (slotId: string, newDoctorId: string) => {
    const slot = selectedConsultSlot;
    setManualOverrides({ ...manualOverrides, [slotId]: newDoctorId });
    setSelectedConsultSlot(null);

    const currentDoctor = doctors.find(d => d.id === profile?.doctor_id);
    await activityLogService.addLog({
      userId: profile?.id || '',
      userEmail: profile?.email || '',
      userName: currentDoctor?.name || '',
      action: 'CONSULT_MODIFY',
      description: `Consultation modifiée (${slot?.location || ''})`,
      weekKey: '',
      category: 'PLANNING',
      targetDate: slot?.date,
    });
  };

  const handleConsultCloseSlot = (slotId: string) => {
    setManualOverrides({ ...manualOverrides, [slotId]: '__CLOSED__' });
    setSelectedConsultSlot(null);
  };

  const handleActivityResolve = async (slotId: string, newDoctorId: string) => {
    const slot = selectedActivitySlot;
    setManualOverrides({ ...manualOverrides, [slotId]: newDoctorId });
    setSelectedActivitySlot(null);

    const currentDoctor = doctors.find(d => d.id === profile?.doctor_id);
    await activityLogService.addLog({
      userId: profile?.id || '',
      userEmail: profile?.email || '',
      userName: currentDoctor?.name || '',
      action: 'ACTIVITY_MODIFY',
      description: `Activité modifiée (${slot?.location || (slot as any)?.activityId || ''})`,
      weekKey: '',
      category: 'PLANNING',
      targetDate: slot?.date,
    });
  };

  const handleActivityCloseSlot = (slotId: string) => {
    setManualOverrides({ ...manualOverrides, [slotId]: '__CLOSED__' });
    setSelectedActivitySlot(null);
  };

  const handleConflictClick = (slot: ScheduleSlot) => {
    if (slot.type === SlotType.CONSULTATION) {
      setSelectedConsultSlot(slot);
    } else {
      setSelectedActivitySlot(slot);
    }
  };

  const handleResolvedConflictClick = (slot: ScheduleSlot, replacementDoctorId: string | null) => {
    setResolvedDetailSlot({ slot, replacementDoctorId });
  };

  // Slot actif (consult ou activité) pour déterminer la semaine à générer
  const activeModalSlot = selectedConsultSlot || selectedActivitySlot;

  // Génère le planning complet (tous médecins) de la semaine du slot sélectionné.
  // Utilisé par ConflictResolverModal pour vérifier qui est déjà pris sur ce créneau.
  // Sans ce calcul, weekSlots était vide → tous les médecins apparaissaient "Disponible"
  // même s'ils étaient déjà assignés à une Unity/Astreinte/Consultation ce demi-journée.
  const weekSlots: ScheduleSlot[] = useMemo(() => {
    if (!activeModalSlot?.date) return [];

    // Calcule le lundi de la semaine du slot
    const slotDate = new Date(activeModalSlot.date + 'T00:00:00');
    const dayOfWeek = slotDate.getDay();
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const weekStart = new Date(slotDate);
    weekStart.setDate(slotDate.getDate() + diffToMonday);

    const generated = generateScheduleForWeek(
      weekStart,
      template,
      unavailabilities,
      doctors,
      activityDefinitions,
      rcpTypes,
      false, // Only use saved overrides — avoids random re-roll from fillAutoActivities diverging from the actual schedule
      effectiveHistory,
      rcpAttendance,
      rcpExceptions,
    );

    // Applique les overrides manuels (sans effacer les assignations d'activités —
    // on veut voir qui est vraiment assigné pour le check de disponibilité)
    return generated.map(slot => {
      const overrideValue = manualOverrides[slot.id];
      if (!overrideValue) return slot;
      if (overrideValue === '__CLOSED__') return { ...slot, assignedDoctorId: null, isLocked: true };
      const isAuto = overrideValue.startsWith('auto:');
      const doctorId = isAuto ? overrideValue.substring(5) : overrideValue;
      return { ...slot, assignedDoctorId: doctorId, isLocked: true };
    });
  }, [
    activeModalSlot?.date,
    template, unavailabilities, doctors, activityDefinitions,
    rcpTypes, effectiveHistory, rcpAttendance, rcpExceptions, manualOverrides,
  ]);

  return (
    <div className="max-w-6xl mx-auto space-y-4 pb-20">
      <div className="bg-surface rounded-card shadow-card border border-border p-4 md:p-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-extrabold text-text-base tracking-tight">Mon planning</h1>
          <div className="flex rounded-btn-sm border border-border overflow-hidden">
            <button
              onClick={() => setAgendaView('week')}
              className={`px-4 py-2 text-sm font-medium transition-colors ${agendaView === 'week' ? 'bg-primary text-white' : 'bg-surface text-text-muted hover:bg-muted'}`}
            >
              Semaine
            </button>
            <button
              onClick={() => setAgendaView('month')}
              className={`px-4 py-2 text-sm font-medium transition-colors ${agendaView === 'month' ? 'bg-primary text-white' : 'bg-surface text-text-muted hover:bg-muted'}`}
            >
              Mois
            </button>
          </div>
        </div>

        {agendaView === 'week' ? (
          <PersonalAgendaWeek
            weekOffset={agendaWeekOffset}
            onOffsetChange={setAgendaWeekOffset}
            onConsultClick={setSelectedConsultSlot}
            onRcpClick={setSelectedRcpSlot}
            onActivityClick={setSelectedActivitySlot}
            onConflictClick={handleConflictClick}
            onResolvedConflictClick={handleResolvedConflictClick}
          />
        ) : (
          <PersonalAgendaMonth
            onRcpClick={setSelectedRcpSlot}
            onActivityClick={setSelectedActivitySlot}
            onConsultClick={setSelectedConsultSlot}
            onConflictClick={handleConflictClick}
            onResolvedConflictClick={handleResolvedConflictClick}
          />
        )}
      </div>

      {selectedConsultSlot && (
        <ConflictResolverModal
          slot={selectedConsultSlot}
          doctors={doctors}
          slots={weekSlots}
          unavailabilities={unavailabilities}
          onClose={() => setSelectedConsultSlot(null)}
          onResolve={handleConsultResolve}
          onCloseSlot={handleConsultCloseSlot}
        />
      )}

      {selectedActivitySlot && (
        <ConflictResolverModal
          slot={selectedActivitySlot}
          doctors={doctors}
          slots={weekSlots}
          unavailabilities={unavailabilities}
          onClose={() => setSelectedActivitySlot(null)}
          onResolve={handleActivityResolve}
          onCloseSlot={handleActivityCloseSlot}
        />
      )}

      {selectedRcpSlot && profile?.doctor_id && (
        <RcpAttendanceModal
          slot={selectedRcpSlot}
          doctorId={profile.doctor_id}
          onClose={() => setSelectedRcpSlot(null)}
        />
      )}

      {resolvedDetailSlot && (() => {
        const { slot, replacementDoctorId } = resolvedDetailSlot;
        const isClosed = replacementDoctorId === null;
        const replacerDoctor = replacementDoctorId
          ? doctors.find(d => d.id === replacementDoctorId)
          : null;
        const absentDoctor = doctors.find(d => d.id === profile?.doctor_id);
        return (
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setResolvedDetailSlot(null)}
          >
            <div
              className="bg-surface rounded-2xl shadow-modal max-w-sm w-full p-5 border border-border/60"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-border">
                <h3 className="font-bold text-base text-text-base">Détail du remplacement</h3>
                <button
                  onClick={() => setResolvedDetailSlot(null)}
                  className="w-8 h-8 flex items-center justify-center hover:bg-muted rounded-lg text-text-muted transition-colors"
                >
                  <span className="text-lg leading-none">✕</span>
                </button>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-text-muted">Activité</span>
                  <span className="font-semibold text-text-base">
                    {slot.subType || slot.location || (
                      slot.type === SlotType.CONSULTATION ? 'Consultation' :
                      slot.type === SlotType.RCP ? 'RCP' : 'Activité'
                    )}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-text-muted">Date</span>
                  <span className="font-semibold text-text-base">
                    {slot.date
                      ? new Date(slot.date + 'T12:00').toLocaleDateString('fr-FR', {
                          weekday: 'short', day: 'numeric', month: 'short',
                        })
                      : slot.day ?? ''}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-text-muted">Créneau</span>
                  <span className="font-semibold text-text-base">
                    {slot.period === Period.MORNING ? 'Matin' : 'Après-midi'}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-text-muted">Médecin absent</span>
                  <span className="font-semibold text-text-base">
                    {absentDoctor?.name ?? 'Vous'}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-text-muted">Remplaçant</span>
                  <span className="font-semibold text-text-base">
                    {isClosed ? 'Créneau fermé' : (replacerDoctor?.name ?? 'Dr. inconnu')}
                  </span>
                </div>
                <div className="flex justify-between text-sm border-t border-border pt-3">
                  <span className="text-text-muted">Statut</span>
                  <span className="font-semibold text-green-600">
                    {isClosed ? '✓ Fermé' : '✓ Résolu'}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setResolvedDetailSlot(null)}
                className="mt-4 w-full py-2 text-sm font-semibold bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
              >
                Fermer
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default MonPlanning;
