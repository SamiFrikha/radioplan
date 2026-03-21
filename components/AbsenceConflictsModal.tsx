import React, { useState, useMemo } from 'react';
import { Calendar, AlertTriangle, CheckCircle2, ChevronRight } from 'lucide-react';
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

  // Generate schedule for each week in the absence range, find slots assigned to this doctor
  const conflictingSlots = useMemo(() => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const allSlots: ScheduleSlot[] = [];

    // Find the Monday of the week containing startDate
    const firstMonday = new Date(start);
    const dow = firstMonday.getDay();
    firstMonday.setDate(firstMonday.getDate() - (dow === 0 ? 6 : dow - 1));

    // Find the Monday of the week containing endDate
    const lastMonday = new Date(end);
    const dow2 = lastMonday.getDay();
    lastMonday.setDate(lastMonday.getDate() - (dow2 === 0 ? 6 : dow2 - 1));

    // Generate schedule for each week
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

    return allSlots.filter(slot => {
      // Must be within the absence date range
      if (slot.date < startDate || slot.date > endDate) return false;

      // Check period overlap
      if (period !== 'ALL_DAY' && slot.period !== period) return false;

      // Check if doctor is assigned
      const isPrimary = slot.assignedDoctorId === doctorId;
      const isSecondary = slot.secondaryDoctorIds?.includes(doctorId) ?? false;
      return isPrimary || isSecondary;
    })
    .filter(slot => !slot.isClosed && !slot.isCancelled)
    .sort((a, b) => a.date.localeCompare(b.date) || a.period.localeCompare(b.period));
  }, [startDate, endDate, period, doctorId, template, unavailabilities, doctors, activityDefinitions, rcpTypes, shiftHistory, rcpAttendance, rcpExceptions]);

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
        slots={conflictingSlots}
        unavailabilities={unavailabilities}
        onClose={() => setActiveConflictSlot(null)}
        onResolve={handleResolve}
        onCloseSlot={handleCloseSlot}
      />
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="p-4 border-b bg-amber-50 rounded-t-xl">
          <div className="flex items-center gap-2 text-amber-700">
            <AlertTriangle className="w-5 h-5" />
            <h2 className="font-bold text-lg">Créneaux impactés</h2>
          </div>
          <p className="text-sm text-amber-600 mt-1">
            Vous avez {conflictingSlots.length} créneau{conflictingSlots.length > 1 ? 'x' : ''} pendant votre absence.
            Trouvez un remplaçant ou fermez chaque créneau.
          </p>
        </div>

        {/* Conflict list */}
        <div className="overflow-y-auto flex-1 p-3 space-y-3">
          {conflictingSlots.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-green-500" />
              <p className="font-medium">Aucun créneau impacté</p>
              <p className="text-sm">Vous n'avez aucune activité planifiée pendant cette période.</p>
            </div>
          ) : (
            groupedByDate.map(([date, slots]) => (
              <div key={date}>
                <div className="flex items-center gap-2 mb-1">
                  <Calendar className="w-4 h-4 text-blue-500" />
                  <span className="text-sm font-semibold text-gray-700 capitalize">{formatDate(date)}</span>
                </div>
                <div className="space-y-1 ml-6">
                  {slots.map(slot => {
                    const isResolved = resolvedSlots.has(slot.id);
                    return (
                      <button
                        key={slot.id}
                        onClick={() => !isResolved && setActiveConflictSlot(slot)}
                        disabled={isResolved}
                        className={`w-full text-left flex items-center justify-between p-2 rounded-lg border transition-colors ${
                          isResolved
                            ? 'bg-green-50 border-green-200 opacity-60'
                            : 'bg-white border-gray-200 hover:bg-blue-50 hover:border-blue-300 cursor-pointer'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            slot.period === 'Matin' ? 'bg-yellow-100 text-yellow-700' : 'bg-orange-100 text-orange-700'
                          }`}>
                            {slot.period}
                          </span>
                          <span className="text-sm font-medium text-gray-800">
                            {SLOT_TYPE_LABELS[slot.type] || slot.type}
                          </span>
                          {slot.location && (
                            <span className="text-xs text-gray-500">— {slot.location}</span>
                          )}
                          {slot.subType && (
                            <span className="text-xs text-gray-400">({slot.subType})</span>
                          )}
                        </div>
                        {isResolved ? (
                          <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
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
        <div className="p-3 border-t bg-gray-50 rounded-b-xl flex justify-between items-center">
          <span className="text-xs text-gray-500">
            {resolvedSlots.size}/{conflictingSlots.length} résolu{resolvedSlots.size > 1 ? 's' : ''}
          </span>
          <button
            onClick={onDismiss}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
          >
            {conflictingSlots.length === 0 || resolvedSlots.size === conflictingSlots.length ? 'Terminé' : 'Passer pour le moment'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AbsenceConflictsModal;
