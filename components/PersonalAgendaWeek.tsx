// components/PersonalAgendaWeek.tsx
import React, { useMemo, useContext } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { AppContext } from '../App';
import { useAuth } from '../context/AuthContext';
import { generateScheduleForWeek } from '../services/scheduleService';
import { DayOfWeek, Period, SlotType } from '../types';
import { Badge } from '../src/components/ui';

interface Props {
  weekOffset: number;
  onOffsetChange: (offset: number) => void;
}

const DAY_ORDER = [DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY, DayOfWeek.THURSDAY, DayOfWeek.FRIDAY];
const DAY_LABELS: Record<string, string> = {
  [DayOfWeek.MONDAY]: 'Lun',
  [DayOfWeek.TUESDAY]: 'Mar',
  [DayOfWeek.WEDNESDAY]: 'Mer',
  [DayOfWeek.THURSDAY]: 'Jeu',
  [DayOfWeek.FRIDAY]: 'Ven',
};
const PERIODS = [Period.MORNING, Period.AFTERNOON];

// Base styles — used for all slot types except RCP which has dynamic status styles
const BASE_STYLE: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  [SlotType.CONSULTATION]: { bg: 'bg-primary/5',  border: 'border-primary/30',  text: 'text-primary',        dot: 'bg-primary' },
  [SlotType.ACTIVITY]:     { bg: 'bg-warning/10', border: 'border-warning/20',  text: 'text-warning',        dot: 'bg-warning' },
  LEAVE:                   { bg: 'bg-muted',       border: 'border-border',      text: 'text-text-muted',     dot: 'bg-border' },
};

// RCP styles vary by confirmation status
const RCP_STYLES = {
  // À confirmer — look very different from confirmed (amber/warning)
  UNCONFIRMED: {
    bg:     'bg-warning/10',
    border: 'border-warning/20 border-dashed',
    text:   'text-warning',
    dot:    'bg-warning',
    subtext:'text-warning',
  },
  // Confirmé présent — clearly green
  PRESENT: {
    bg:     'bg-success/10',
    border: 'border-success/20 border-2',
    text:   'text-success',
    dot:    'bg-success',
    subtext:'text-success',
  },
  // Aucun statut (RCP programmée, sans confirmation individuelle)
  NONE: {
    bg:     'bg-secondary/10',
    border: 'border-secondary/20',
    text:   'text-secondary',
    dot:    'bg-secondary',
    subtext:'text-secondary',
  },
};

const PersonalAgendaWeek: React.FC<Props> = ({ weekOffset, onOffsetChange }) => {
  const {
    doctors, template, unavailabilities,
    activityDefinitions, rcpTypes, rcpAttendance, rcpExceptions, manualOverrides,
  } = useContext(AppContext);

  const { profile } = useAuth();
  const doctorId = profile?.doctor_id;

  // Returns RCP confirmation status for the current doctor on a given slot
  const getRcpStatus = (slot: any): 'UNCONFIRMED' | 'PRESENT' | 'NONE' => {
    if (slot.type !== SlotType.RCP) return 'NONE';
    if (slot.isUnconfirmed) return 'UNCONFIRMED';
    if (doctorId && rcpAttendance[slot.id]?.[doctorId] === 'PRESENT') return 'PRESENT';
    return 'NONE';
  };

  const weekStart = useMemo(() => {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(now);
    monday.setDate(diff + weekOffset * 7);
    monday.setHours(0, 0, 0, 0);
    return monday;
  }, [weekOffset]);

  const schedule = useMemo(() => {
    if (!doctorId) return [];
    const generated = generateScheduleForWeek(
      weekStart, template, unavailabilities, doctors,
      activityDefinitions, rcpTypes, false, {}, rcpAttendance, rcpExceptions,
    );
    // Apply manual overrides so activity assignments are visible
    return generated.map(slot => {
      const overrideValue = manualOverrides[slot.id];
      if (!overrideValue || overrideValue === '__CLOSED__') return slot;
      const isAuto = overrideValue.startsWith('auto:');
      const assignedId = isAuto ? overrideValue.substring(5) : overrideValue;
      return { ...slot, assignedDoctorId: assignedId };
    });
  }, [weekStart, template, unavailabilities, doctors, activityDefinitions, rcpTypes, rcpAttendance, rcpExceptions, manualOverrides, doctorId]);

  // Build per-day, per-period data including dates
  const days = useMemo(() => {
    return DAY_ORDER.map((day, i) => {
      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + i);
      const dateStr = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
      const isToday = dateStr === todayStr;

      const onLeave = unavailabilities.some(u =>
        u.doctorId === doctorId &&
        dateStr >= u.startDate && dateStr <= u.endDate
      );

      const periods = PERIODS.map(period => {
        if (onLeave) {
          return { period, slots: [{ id: 'leave-'+dateStr+period, type: 'LEAVE', location: 'Congé', date: dateStr }] };
        }
        return {
          period,
          slots: schedule.filter(s =>
            s.day === day && s.period === period &&
            (
              s.assignedDoctorId === doctorId ||
              s.secondaryDoctorIds?.includes(doctorId!) ||
              // Include RCP slots where the doctor was recorded as replacement (PRESENT)
              (s.type === SlotType.RCP && rcpAttendance[s.id]?.[doctorId!] === 'PRESENT')
            )
          ),
        };
      });

      return { day, date, dateStr, isToday, onLeave, periods };
    });
  }, [schedule, doctorId, unavailabilities, weekStart, rcpAttendance]);

  const hasAnyActivity = days.some(d => d.periods.some(p => p.slots.length > 0));

  const weekLabel = (() => {
    const end = new Date(weekStart);
    end.setDate(weekStart.getDate() + 4);
    const fmt = (d: Date) => d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
    return `${fmt(weekStart)} — ${end.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}`;
  })();

  const [isMobile, setIsMobile] = React.useState(() => window.innerWidth < 768);
  React.useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  // Maps slot type + RCP status to a Badge variant
  const getSlotBadgeVariant = (slot: any): 'green' | 'red' | 'amber' | 'blue' | 'gray' => {
    if (slot.type === 'LEAVE') return 'gray';
    if (slot.type === SlotType.RCP) {
      const rcpStatus = getRcpStatus(slot);
      if (rcpStatus === 'PRESENT') return 'green';
      if (rcpStatus === 'UNCONFIRMED') return 'amber';
      return 'blue';
    }
    if (slot.type === SlotType.CONSULTATION) return 'blue';
    if (slot.type === SlotType.ACTIVITY) return 'amber';
    return 'gray';
  };

  // Returns a short label for the badge
  const getSlotBadgeLabel = (slot: any): string => {
    if (slot.type === 'LEAVE') return 'Congé';
    if (slot.type === SlotType.RCP) {
      const rcpStatus = getRcpStatus(slot);
      if (rcpStatus === 'PRESENT') return 'Confirmé';
      if (rcpStatus === 'UNCONFIRMED') return 'À confirmer';
      return 'RCP';
    }
    if (slot.type === SlotType.CONSULTATION) return 'Consultation';
    if (slot.type === SlotType.ACTIVITY) return 'Activité';
    return slot.type || 'Créneau';
  };

  if (isMobile) {
    return (
      <div className="space-y-4">
        {/* Week selector */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => onOffsetChange(weekOffset - 1)}
            className="p-1.5 hover:bg-muted rounded-btn-sm transition-colors"
          >
            <ChevronLeft size={18} />
          </button>
          <div className="text-center">
            <span className="font-heading font-semibold text-sm text-text-base">{weekLabel}</span>
            {weekOffset === 0 && <p className="text-xs text-primary font-medium">Semaine en cours</p>}
            {weekOffset === 1 && <p className="text-xs text-text-muted">Semaine prochaine</p>}
            {weekOffset < 0 && <p className="text-xs text-text-muted">il y a {-weekOffset} semaine{-weekOffset > 1 ? 's' : ''}</p>}
          </div>
          <button
            onClick={() => onOffsetChange(weekOffset + 1)}
            className="p-1.5 hover:bg-muted rounded-btn-sm transition-colors"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        {!hasAnyActivity && (
          <div className="flex flex-col items-center justify-center py-10 text-text-muted">
            <CalendarDays size={36} className="mb-2 opacity-30" />
            <p className="text-sm">Aucune activité cette semaine</p>
          </div>
        )}

        {days.map(({ day, date, dateStr, isToday, periods }) => {
          const allSlots = periods.flatMap(p => p.slots);
          const dayNumber = date.getDate();
          const dayName = DAY_LABELS[day];
          const monthLabel = date.toLocaleDateString('fr-FR', { month: 'short' });
          return (
            <div key={day}>
              {/* Day header — Medical Diary style */}
              <div className="flex items-center gap-3 mb-2">
                {isToday ? (
                  <div className="w-9 h-9 rounded-full bg-gradient-primary flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-bold text-white tabular-nums">{dayNumber}</span>
                  </div>
                ) : (
                  <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-medium text-text-muted tabular-nums">{dayNumber}</span>
                  </div>
                )}
                <div>
                  {isToday ? (
                    <>
                      <p className="text-sm font-bold text-primary">{dayName}</p>
                      <p className="text-xs text-text-muted">{monthLabel}</p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-semibold text-text-base">{dayName}</p>
                      <p className="text-xs text-text-muted">{monthLabel}</p>
                    </>
                  )}
                </div>
              </div>

              {/* Timeline track */}
              {allSlots.length > 0 ? (
                <div className="ml-4 border-l-2 border-border pl-4 space-y-1 pb-2">
                  {allSlots.map((slot: any) => (
                    <div key={slot.id} className="relative">
                      {/* Indigo dot on the hairline */}
                      <div className="w-2 h-2 rounded-full bg-primary/40 -ml-[21px] mt-3 flex-shrink-0 absolute" aria-hidden="true" />
                      <button className="flex items-center gap-3 w-full text-left py-2.5 px-3 rounded-btn-sm hover:bg-primary/5 press-scale transition-all group">
                        <span className="text-xs font-semibold text-text-muted tabular-nums w-10 flex-shrink-0">
                          {slot.period === Period.MORNING ? '08h00' : '14h00'}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="text-sm font-medium text-text-base truncate block">
                            {slot.subType || slot.location || slot.type}
                          </span>
                        </span>
                        <Badge variant={getSlotBadgeVariant(slot)}>
                          {getSlotBadgeLabel(slot)}
                        </Badge>
                        <ChevronRight className="w-4 h-4 text-text-muted group-hover:text-primary flex-shrink-0 transition-colors" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-text-muted py-2 px-1 ml-12">Aucun créneau</p>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div>
      {/* Week navigation */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => onOffsetChange(weekOffset - 1)}
          className="p-1.5 hover:bg-muted rounded-btn-sm transition-colors">
          <ChevronLeft size={18} />
        </button>
        <div className="text-center">
          <p className="text-sm font-semibold text-text-base">{weekLabel}</p>
          {weekOffset === 0 && <p className="text-xs text-primary font-medium">Semaine en cours</p>}
          {weekOffset === 1 && <p className="text-xs text-text-muted">Semaine prochaine</p>}
          {weekOffset < 0 && <p className="text-xs text-text-muted">il y a {-weekOffset} semaine{-weekOffset > 1 ? 's' : ''}</p>}
        </div>
        <button onClick={() => onOffsetChange(weekOffset + 1)}
          className="p-1.5 hover:bg-muted rounded-btn-sm transition-colors">
          <ChevronRight size={18} />
        </button>
      </div>

      {!hasAnyActivity && (
        <div className="flex flex-col items-center justify-center py-10 text-text-muted">
          <CalendarDays size={36} className="mb-2 opacity-30" />
          <p className="text-sm">Aucune activité cette semaine</p>
        </div>
      )}

      {hasAnyActivity && (
        <div className="grid grid-cols-5 gap-2">
          {days.map(({ day, date, isToday, periods }) => (
            <div key={day} className="flex flex-col gap-1">
              {/* Day header */}
              <div className={`text-center rounded-card py-1.5 px-1 ${isToday ? 'bg-gradient-primary' : 'bg-muted'}`}>
                <p className={`text-xs font-bold uppercase tracking-wide ${isToday ? 'text-white' : 'text-text-muted'}`}>
                  {DAY_LABELS[day]}
                </p>
                <p className={`text-sm font-semibold ${isToday ? 'text-white' : 'text-text-base'}`}>
                  {date.getDate()}
                </p>
              </div>

              {/* AM / PM slots */}
              {periods.map(({ period, slots }) => {
                const periodLabel = period === Period.MORNING ? 'AM' : 'PM';
                return (
                  <div key={period} className="min-h-[56px]">
                    <p className="text-[10px] text-text-muted font-medium mb-0.5 text-center">{periodLabel}</p>
                    {slots.length === 0 ? (
                      <div className="h-10 rounded-btn-sm bg-muted border border-dashed border-border" />
                    ) : (
                      slots.map((slot: any) => {
                        // RCP gets dynamic styling based on confirmation status
                        if (slot.type === SlotType.RCP) {
                          const rcpStatus = getRcpStatus(slot);
                          const s = RCP_STYLES[rcpStatus];
                          return (
                            <div key={slot.id}
                              className={`rounded-btn-sm border px-1.5 py-1 mb-0.5 ${s.bg} ${s.border}`}
                              title={slot.subType || slot.location}>
                              {/* Status badge row */}
                              {rcpStatus !== 'NONE' && (
                                <div className={`flex items-center gap-0.5 mb-0.5 ${s.subtext}`}>
                                  {rcpStatus === 'UNCONFIRMED' ? (
                                    <>
                                      <AlertTriangle size={8} className="shrink-0" />
                                      <span className="text-[8px] font-bold uppercase tracking-wide">À confirmer</span>
                                    </>
                                  ) : (
                                    <>
                                      <CheckCircle2 size={8} className="shrink-0" />
                                      <span className="text-[8px] font-bold uppercase tracking-wide">Confirmé</span>
                                    </>
                                  )}
                                </div>
                              )}
                              {/* Slot name */}
                              <div className="flex items-center gap-1">
                                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.dot}`} />
                                <span className={`text-[10px] font-semibold truncate flex-1 ${s.text}`}>
                                  {slot.subType || slot.location}
                                </span>
                              </div>
                              {slot.subType && slot.location && slot.location !== slot.subType && (
                                <p className={`text-[9px] opacity-70 truncate ml-2.5 ${s.text}`}>{slot.location}</p>
                              )}
                            </div>
                          );
                        }

                        // Non-RCP slots (consultation, activity, leave)
                        const style = BASE_STYLE[slot.type] ?? BASE_STYLE[SlotType.CONSULTATION];
                        return (
                          <div key={slot.id}
                            className={`rounded-btn-sm border px-1.5 py-1 mb-0.5 ${style.bg} ${style.border}`}
                            title={slot.subType || slot.location}>
                            <div className="flex items-center gap-1">
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${style.dot}`} />
                              <span className={`text-[10px] font-semibold truncate flex-1 ${style.text}`}>
                                {slot.subType || slot.location}
                              </span>
                            </div>
                            {slot.subType && slot.location && slot.location !== slot.subType && (
                              <p className={`text-[9px] opacity-70 truncate ml-2.5 ${style.text}`}>{slot.location}</p>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-2 mt-4 pt-3 border-t border-border">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-primary" />
          <span className="text-xs text-text-muted">Consultation</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-secondary" />
          <span className="text-xs text-text-muted">RCP</span>
        </div>
        <div className="flex items-center gap-1.5">
          <AlertTriangle size={10} className="text-warning" />
          <span className="text-xs text-text-muted">RCP à confirmer</span>
        </div>
        <div className="flex items-center gap-1.5">
          <CheckCircle2 size={10} className="text-success" />
          <span className="text-xs text-text-muted">RCP confirmé</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-warning" />
          <span className="text-xs text-text-muted">Activité</span>
        </div>
      </div>
    </div>
  );
};

export default PersonalAgendaWeek;
