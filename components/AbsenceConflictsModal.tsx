import React, { useState, useMemo } from 'react';
import { Calendar, AlertTriangle, CheckCircle2, ChevronRight, X } from 'lucide-react';
import { Button } from '../src/components/ui/Button';
import { ScheduleTemplateSlot, ScheduleSlot, Doctor, ActivityDefinition, Unavailability, Conflict, Period, ShiftHistory, RcpDefinition, RcpAttendance, RcpException } from '../types';
import { generateScheduleForWeek } from '../services/scheduleService';
import ConflictResolverModal from './ConflictResolverModal';

interface AbsenceConflictsModalProps {
  doctorId: string;
  doctorName: string;
  startDate: string;
  endDate: string;
  period: 'ALL_DAY' | Period;
  doctors: Doctor[];
  template: ScheduleTemplateSlot[];
  unavailabilities: Unavailability[];
  activityDefinitions: ActivityDefinition[];
  shiftHistory: ShiftHistory;
  rcpTypes: RcpDefinition[];
  rcpAttendance: RcpAttendance;
  rcpExceptions: RcpException[];
  onResolve: (slotId: string, newDoctorId: string) => void;
  onCloseSlot: (slotId: string) => void;
  onDismiss: () => void;
}

const SLOT_TYPE_LABELS: Record<string, string> = {
  CONSULTATION: 'Consultation',
  RCP: 'RCP',
  MACHINE: 'Machine',
  ACTIVITY: 'Activité',
  OTHER: 'Autre',
};

const formatDate = (dateStr: string) => {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
};

const AbsenceConflictsModal: React.FC<AbsenceConflictsModalProps> = ({
  doctorId, doctorName, startDate, endDate, period,
  doctors, template, unavailabilities, activityDefinitions,
  shiftHistory, rcpTypes, rcpAttendance, rcpExceptions,
  onResolve, onCloseSlot, onDismiss,
}) => {
  const [resolvedSlots, setResolvedSlots] = useState<Set<string>>(new Set());
  const [activeConflictSlot, setActiveConflictSlot] = useState<ScheduleSlot | null>(null);

  // Generate full schedule (all doctors) for every week covered by the absence.
  // Used by ConflictResolverModal to check real availability (who is already assigned).
  const allWeekSlots = useMemo(() => {
    const firstMonday = new Date(startDate + 'T00:00:00');
    const dow = firstMonday.getDay();
    firstMonday.setDate(firstMonday.getDate() - (dow === 0 ? 6 : dow - 1));

    const lastMonday = new Date(endDate + 'T00:00:00');
    const dow2 = lastMonday.getDay();
    lastMonday.setDate(lastMonday.getDate() - (dow2 === 0 ? 6 : dow2 - 1));

    const allSlots: ScheduleSlot[] = [];
    for (let monday = new Date(firstMonday); monday <= lastMonday; monday.setDate(monday.getDate() + 7)) {
      try {
        const weekSlots = generateScheduleForWeek(
          new Date(monday), template, unavailabilities, doctors,
          activityDefinitions, rcpTypes, false, shiftHistory, rcpAttendance, rcpExceptions
        );
        allSlots.push(...weekSlots);
      } catch {
        // Skip weeks that fail to generate
      }
    }
    return allSlots;
  }, [startDate, endDate, template, unavailabilities, doctors, activityDefinitions, rcpTypes, shiftHistory, rcpAttendance, rcpExceptions]);

  // Filtered to slots where the absent doctor is assigned — used for display only.
  const conflictingSlots = useMemo(() => {
    return allWeekSlots.filter(slot => {
      if (slot.date < startDate || slot.date > endDate) return false;
      if (period !== 'ALL_DAY' && slot.period !== period) return false;
      const isPrimary = slot.assignedDoctorId === doctorId;
      const isSecondary = slot.secondaryDoctorIds?.includes(doctorId) ?? false;
      return (isPrimary || isSecondary) && !slot.isClosed && !slot.isCancelled;
    }).sort((a, b) => a.date.localeCompare(b.date) || a.period.localeCompare(b.period));
  }, [allWeekSlots, startDate, endDate, period, doctorId]);

  // Group by date for display
  const groupedByDate = useMemo(() => {
    const groups: Record<string, ScheduleSlot[]> = {};
    for (const slot of conflictingSlots) {
      (groups[slot.date] ??= []).push(slot);
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [conflictingSlots]);

  const handleResolve = (slotId: string, newDoctorId: string) => {
    onResolve(slotId, newDoctorId);
    setResolvedSlots(prev => new Set(prev).add(slotId));
    setActiveConflictSlot(null);
  };

  const handleCloseSlot = (slotId: string) => {
    onCloseSlot(slotId);
    setResolvedSlots(prev => new Set(prev).add(slotId));
    setActiveConflictSlot(null);
  };

  // If resolving a specific conflict, show ConflictResolverModal
  if (activeConflictSlot) {
    const conflict: Conflict = {
      id: `absence-${activeConflictSlot.id}`,
      slotId: activeConflictSlot.id,
      doctorId: doctorId,
      type: 'UNAVAILABLE',
      description: `${doctorName} est absent(e) — remplacement nécessaire`,
      severity: 'HIGH',
    };

    return (
      <ConflictResolverModal
        slot={activeConflictSlot}
        conflict={conflict}
        doctors={doctors}
        slots={allWeekSlots}
        unavailabilities={unavailabilities}
        onClose={() => setActiveConflictSlot(null)}
        onResolve={handleResolve}
        onCloseSlot={handleCloseSlot}
      />
    );
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-modal flex items-end md:items-center justify-center p-0 md:p-4"
      onClick={onDismiss}
    >
      <div
        className="bg-surface rounded-t-modal md:rounded-modal shadow-modal border border-border/40 overflow-hidden w-full md:max-w-[540px] mx-auto max-h-[90dvh] overflow-y-auto flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title-absence"
        onClick={e => e.stopPropagation()}
      >
        {/* Mobile drag handle */}
        <div className="w-10 h-1 rounded-full bg-border mx-auto mt-3 mb-1 md:hidden" aria-hidden="true" />

        {/* Gradient header */}
        <div className="gradient-primary px-5 py-4 flex items-center justify-between">
          <h2 id="modal-title-absence" className="text-base font-bold text-white">
            Créneaux impactés
          </h2>
          <button
            onClick={onDismiss}
            aria-label="Fermer"
            className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Sub-header description */}
        <div className="px-4 pt-3 pb-1">
          <p className="text-sm text-text-muted">
            Vous avez {conflictingSlots.length} créneau{conflictingSlots.length > 1 ? 'x' : ''} pendant votre absence.
            Trouvez un remplaçant ou fermez chaque créneau.
          </p>
        </div>

        {/* Conflict list */}
        <div className="px-4 py-4 overflow-y-auto flex-1 space-y-3">
          {conflictingSlots.length === 0 ? (
            <div className="text-center py-8 text-text-muted">
              <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-accent-green" />
              <p className="font-medium">Aucun créneau impacté</p>
              <p className="text-sm">Vous n'avez aucune activité planifiée pendant cette période.</p>
            </div>
          ) : (
            groupedByDate.map(([date, slots]) => (
              <div key={date}>
                <div className="flex items-center gap-2 mb-1">
                  <Calendar className="w-4 h-4 text-primary" />
                  <span className="text-sm font-semibold text-text-base capitalize">{formatDate(date)}</span>
                </div>
                <div className="space-y-1 ml-6">
                  {slots.map(slot => {
                    const isResolved = resolvedSlots.has(slot.id);
                    return (
                      <button
                        key={slot.id}
                        onClick={() => !isResolved && setActiveConflictSlot(slot)}
                        disabled={isResolved}
                        className={`w-full text-left flex items-center justify-between p-2 rounded-card border transition-colors ${
                          isResolved
                            ? 'bg-green-50 border-green-200 opacity-60'
                            : 'bg-surface border-border hover:bg-muted hover:border-primary cursor-pointer'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-badge text-xs font-medium ${
                            slot.period === 'Matin' ? 'bg-yellow-100 text-yellow-700' : 'bg-orange-100 text-orange-700'
                          }`}>
                            {slot.period}
                          </span>
                          <span className="text-sm font-medium text-text-base">
                            {SLOT_TYPE_LABELS[slot.type] || slot.type}
                          </span>
                          {slot.location && (
                            <span className="text-xs text-text-muted">— {slot.location}</span>
                          )}
                          {slot.subType && (
                            <span className="text-xs text-text-muted">({slot.subType})</span>
                          )}
                        </div>
                        {isResolved ? (
                          <CheckCircle2 className="w-4 h-4 text-accent-green flex-shrink-0" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-text-muted flex-shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border flex justify-between items-center">
          <span className="text-xs text-text-muted">
            {resolvedSlots.size}/{conflictingSlots.length} résolu{resolvedSlots.size > 1 ? 's' : ''}
          </span>
          <Button variant="primary" size="md" onClick={onDismiss}>
            {conflictingSlots.length === 0 || resolvedSlots.size === conflictingSlots.length ? 'Terminé' : 'Passer pour le moment'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AbsenceConflictsModal;
