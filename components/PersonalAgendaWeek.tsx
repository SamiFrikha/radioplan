// components/PersonalAgendaWeek.tsx
import React, { useMemo, useContext } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { AppContext } from '../App';
import { useAuth } from '../context/AuthContext';
import { generateScheduleForWeek } from '../services/scheduleService';
import { DayOfWeek, Period, SlotType } from '../types';
import { Badge } from '../src/components/ui';
import { getDoctorHexColor } from './DoctorBadge';

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

// Clinical hex constants — used via inline style where Tailwind opacity modifiers are unreliable
const SLOT_COLORS = {
  CONSULT:          '#3B6FD4',
  RCP_PENDING:      '#D97706',
  RCP_DONE:         '#059669',
  RCP_NONE:         '#7C3AED',
  ACT_ASTREINTE:    '#DC4E3A',
  ACT_WORKFLOW:     '#0F766E',
  ACT_UNITY:        '#6D28D9',
  LEAVE:            '#64748B',
};

// Named-activity color map — matched case-insensitively via includes/startsWith
const ACTIVITY_COLOR_MAP: Array<{ match: string; color: string }> = [
  { match: 'astreinte', color: SLOT_COLORS.ACT_ASTREINTE },
  { match: 'workflow',  color: SLOT_COLORS.ACT_WORKFLOW  },
  { match: 'unity',     color: SLOT_COLORS.ACT_UNITY     },
];

const getActivityColor = (slot: any, actDef: any): string => {
  const name = (slot.subType || actDef?.name || '').toLowerCase();
  for (const { match, color } of ACTIVITY_COLOR_MAP) {
    if (name.includes(match) || name.startsWith(match)) return color;
  }
  return getDoctorHexColor(actDef?.color) || '#F59E0B';
};

// Base styles — leave only; consultation uses inline style; activity uses activityDef.color
const BASE_STYLE: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  LEAVE: { bg: 'bg-muted', border: 'border-border', text: 'text-text-muted', dot: 'bg-border' },
};

// RCP inline style helpers — solid fills per spec; UNCONFIRMED keeps rgba/dashed treatment
const RCP_CARD_STYLE = {
  UNCONFIRMED: {
    bg:      { backgroundColor: 'rgba(217,119,6,0.12)' },
    border:  'border border-dashed',
    borderC: { borderColor: 'rgba(217,119,6,0.5)' },
    text:    { color: '#D97706' },
    dotBg:   { backgroundColor: '#D97706' },
  },
  PRESENT: {
    bg:      { backgroundColor: SLOT_COLORS.RCP_DONE },
    border:  'border',
    borderC: { borderColor: SLOT_COLORS.RCP_DONE },
    text:    { color: '#ffffff' },
    dotBg:   { backgroundColor: 'rgba(255,255,255,0.7)' },
  },
  NONE: {
    bg:      { backgroundColor: SLOT_COLORS.RCP_NONE },
    border:  'border',
    borderC: { borderColor: SLOT_COLORS.RCP_NONE },
    text:    { color: '#ffffff' },
    dotBg:   { backgroundColor: 'rgba(255,255,255,0.7)' },
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

  // Detect WEEKLY-granularity activities for this doctor in the current week.
  // Derived from `schedule` directly (not from `days`) per spec.
  const weeklyActivities = useMemo(() => {
    if (!doctorId) return [];
    const seen = new Set<string>();
    const result: Array<{ activityId: string; name: string; color: string }> = [];
    for (const slot of schedule) {
      if (
        slot.type === SlotType.ACTIVITY &&
        slot.assignedDoctorId === doctorId
      ) {
        const actDef = activityDefinitions.find((a: any) => a.id === slot.activityId);
        if (actDef?.granularity === 'WEEKLY' && slot.activityId && !seen.has(slot.activityId)) {
          seen.add(slot.activityId);
          result.push({
            activityId: slot.activityId,
            name: actDef.name || slot.subType || 'Activité',
            color: getActivityColor(slot, actDef),
          });
        }
      }
    }
    return result;
  }, [schedule, doctorId, activityDefinitions]);

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

  // Helper: get Option C dot color for a slot (mobile timeline)
  const getMobileSlotColor = (slot: any): string => {
    if (slot.type === 'LEAVE') return SLOT_COLORS.LEAVE;
    if (slot.type === SlotType.CONSULTATION) return SLOT_COLORS.CONSULT;
    if (slot.type === SlotType.RCP) {
      const st = getRcpStatus(slot);
      if (st === 'UNCONFIRMED') return SLOT_COLORS.RCP_PENDING;
      if (st === 'PRESENT') return SLOT_COLORS.RCP_DONE;
      return SLOT_COLORS.RCP_NONE;
    }
    if (slot.type === SlotType.ACTIVITY) {
      const actDef = activityDefinitions.find((a: any) => a.id === slot.activityId);
      return getActivityColor(slot, actDef);
    }
    return '#94a3b8';
  };

  if (isMobile) {
    return (
      <div className="space-y-4">
        {/* Week selector */}
        <div className="flex items-center justify-between">
          <button onClick={() => onOffsetChange(weekOffset - 1)} className="p-1.5 hover:bg-muted rounded-btn-sm transition-colors">
            <ChevronLeft size={18} />
          </button>
          <div className="text-center">
            <span className="font-heading font-semibold text-sm text-text-base">{weekLabel}</span>
            {weekOffset === 0 && <p className="text-xs text-primary font-medium">Semaine en cours</p>}
            {weekOffset === 1 && <p className="text-xs text-text-muted">Semaine prochaine</p>}
            {weekOffset < 0 && <p className="text-xs text-text-muted">il y a {-weekOffset} semaine{-weekOffset > 1 ? 's' : ''}</p>}
          </div>
          <button onClick={() => onOffsetChange(weekOffset + 1)} className="p-1.5 hover:bg-muted rounded-btn-sm transition-colors">
            <ChevronRight size={18} />
          </button>
        </div>

        {/* Weekly activity banner — same as desktop */}
        {weeklyActivities.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-1 py-1.5 bg-muted/50 rounded-lg border border-border/40">
            {weeklyActivities.map(({ activityId, name, color }) => (
              <span key={activityId}
                className="inline-flex items-center gap-1 rounded-full text-white text-[10px] font-semibold px-2 py-0.5"
                style={{ backgroundColor: color }}>
                <CalendarDays size={9} className="shrink-0" />
                {name}
              </span>
            ))}
            <span className="text-[10px] text-text-muted self-center">— semaine entière</span>
          </div>
        )}

        {!hasAnyActivity && weeklyActivities.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 text-text-muted">
            <CalendarDays size={36} className="mb-2 opacity-30" />
            <p className="text-sm">Aucune activité cette semaine</p>
          </div>
        )}

        {days.map(({ day, date, isToday, periods }) => {
          // Filter out WEEKLY activities — already shown in banner
          const allSlots = periods.flatMap(p => p.slots).filter((s: any) => {
            if (s.type !== SlotType.ACTIVITY) return true;
            const def = activityDefinitions.find((a: any) => a.id === s.activityId);
            return def?.granularity !== 'WEEKLY';
          });
          const dayNumber = date.getDate();
          const dayName = DAY_LABELS[day];
          const monthShort = date.toLocaleDateString('fr-FR', { month: 'short' });
          if (allSlots.length === 0) return null;
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
                  <p className={`text-sm font-${isToday ? 'bold text-primary' : 'semibold text-text-base'}`}>{dayName}</p>
                  <p className="text-xs text-text-muted">{monthShort}</p>
                </div>
              </div>

              {/* Timeline track */}
              <div className="ml-4 border-l-2 border-border pl-4 space-y-1 pb-2">
                {allSlots.map((slot: any) => {
                  const slotColor = getMobileSlotColor(slot);
                  const label = slot.subType || slot.location || (slot.type === SlotType.CONSULTATION ? 'Consultation' : slot.type === SlotType.RCP ? 'RCP' : 'Activité');
                  return (
                    <div key={slot.id} className="relative">
                      {/* Color dot on the timeline */}
                      <div className="w-2.5 h-2.5 rounded-full -ml-[22px] mt-3 flex-shrink-0 absolute border-2 border-surface"
                        style={{ backgroundColor: slotColor }} aria-hidden="true" />
                      <div className="flex items-center gap-3 py-2 px-3 rounded-btn-sm">
                        <span className="text-xs font-semibold text-text-muted tabular-nums w-10 flex-shrink-0">
                          {slot.period === Period.MORNING ? '08h00' : '14h00'}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="text-sm font-medium text-text-base truncate block">{label}</span>
                          {slot.type === SlotType.RCP && (
                            <span className="text-[10px] font-semibold" style={{ color: slotColor }}>
                              {getRcpStatus(slot) === 'UNCONFIRMED' ? '⚠ À confirmer' : getRcpStatus(slot) === 'PRESENT' ? '✓ Confirmé' : 'RCP programmé'}
                            </span>
                          )}
                        </span>
                        {/* Colored type pill */}
                        <span className="rounded-full text-[9px] font-bold px-2 py-0.5 text-white flex-shrink-0"
                          style={{ backgroundColor: slotColor }}>
                          {slot.type === 'LEAVE' ? 'CGÉ' : slot.type === SlotType.CONSULTATION ? 'CS' : slot.type === SlotType.RCP ? 'RCP' : (slot.subType || 'ACT').substring(0, 4).toUpperCase()}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
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

      {/* Weekly activity banner strip */}
      {weeklyActivities.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3 px-1">
          {weeklyActivities.map(({ activityId, name, color }) => (
            <span
              key={activityId}
              className="inline-flex items-center gap-1 rounded-full text-white text-[10px] px-2 py-0.5"
              style={{ backgroundColor: color }}
            >
              <CalendarDays size={10} className="shrink-0" />
              {name} — Semaine entière
            </span>
          ))}
        </div>
      )}

      {!hasAnyActivity && weeklyActivities.length === 0 && (
        <div className="flex flex-col items-center justify-center py-10 text-text-muted">
          <CalendarDays size={36} className="mb-2 opacity-30" />
          <p className="text-sm">Aucune activité cette semaine</p>
        </div>
      )}

      {(hasAnyActivity || weeklyActivities.length > 0) && (
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
              {periods.map(({ period, slots: rawSlots }) => {
                // Filter out WEEKLY-granularity activity slots — they appear in the banner strip above
                const slots = rawSlots.filter((slot: any) => {
                  if (slot.type !== SlotType.ACTIVITY) return true;
                  const actDef = activityDefinitions.find((a: any) => a.id === slot.activityId);
                  return actDef?.granularity !== 'WEEKLY';
                });
                const periodLabel = period === Period.MORNING ? 'AM' : 'PM';
                return (
                  <div key={period} className="min-h-[56px]">
                    <p className="text-[10px] text-text-muted font-medium mb-0.5 text-center">{periodLabel}</p>
                    {slots.length === 0 ? (
                      <div className="h-10 rounded-btn-sm bg-muted border border-dashed border-border" />
                    ) : (
                      slots.map((slot: any) => {
                        // RCP — inline styles for guaranteed color rendering
                        if (slot.type === SlotType.RCP) {
                          const rcpStatus = getRcpStatus(slot);
                          const s = RCP_CARD_STYLE[rcpStatus];
                          return (
                            <div key={slot.id}
                              className={`rounded-btn-sm px-1.5 py-1 mb-0.5 ${s.border}`}
                              style={{ ...s.bg, ...s.borderC }}
                              title={slot.subType || slot.location}>
                              {/* Status badge row — shown for UNCONFIRMED and PRESENT only */}
                              {rcpStatus !== 'NONE' && (
                                <div className="flex items-center gap-0.5 mb-0.5" style={s.text}>
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
                                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={s.dotBg} />
                                <span className="text-[10px] font-semibold truncate flex-1" style={s.text}>
                                  {slot.subType || slot.location}
                                </span>
                              </div>
                              {slot.subType && slot.location && slot.location !== slot.subType && (
                                <p className="text-[9px] opacity-70 truncate ml-2.5" style={s.text}>{slot.location}</p>
                              )}
                            </div>
                          );
                        }

                        // Activity — named-activity map first, then per-definition color
                        if (slot.type === SlotType.ACTIVITY) {
                          const actDef = activityDefinitions.find((a: any) => a.id === slot.activityId);
                          const actColor = getActivityColor(slot, actDef);
                          return (
                            <div key={slot.id}
                              className="rounded-btn-sm border px-1.5 py-1 mb-0.5 text-white"
                              style={{ backgroundColor: actColor, borderColor: actColor }}
                              title={slot.subType || slot.location}>
                              <div className="flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-white/70" />
                                <span className="text-[10px] font-semibold truncate flex-1">
                                  {slot.subType || slot.location}
                                </span>
                              </div>
                              {slot.subType && slot.location && slot.location !== slot.subType && (
                                <p className="text-[9px] opacity-70 truncate ml-2.5">{slot.location}</p>
                              )}
                            </div>
                          );
                        }

                        // Consultation — clinical slate blue (inline style, reliable)
                        if (slot.type === SlotType.CONSULTATION) {
                          return (
                            <div key={slot.id}
                              className="rounded-btn-sm border px-1.5 py-1 mb-0.5 text-white"
                              style={{ backgroundColor: SLOT_COLORS.CONSULT, borderColor: SLOT_COLORS.CONSULT }}
                              title={slot.subType || slot.location || 'Consultation'}>
                              <div className="flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-white/70" />
                                <span className="text-[10px] font-semibold truncate flex-1">
                                  {slot.subType || slot.location || 'Consultation'}
                                </span>
                              </div>
                            </div>
                          );
                        }

                        // Leave / other
                        return (
                          <div key={slot.id}
                            className="rounded-btn-sm border px-1.5 py-1 mb-0.5"
                            style={{ backgroundColor: 'rgba(100,116,139,0.12)', borderColor: 'rgba(100,116,139,0.4)' }}
                            title={slot.subType || slot.location}>
                            <div className="flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: SLOT_COLORS.LEAVE }} />
                              <span className="text-[10px] font-semibold truncate flex-1" style={{ color: SLOT_COLORS.LEAVE }}>
                                {slot.subType || slot.location}
                              </span>
                            </div>
                            {slot.subType && slot.location && slot.location !== slot.subType && (
                              <p className="text-[9px] opacity-70 truncate ml-2.5" style={{ color: SLOT_COLORS.LEAVE }}>{slot.location}</p>
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
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: SLOT_COLORS.CONSULT }} />
          <span className="text-xs text-text-muted">Consultation</span>
        </div>
        <div className="flex items-center gap-1.5">
          <AlertTriangle size={10} style={{ color: SLOT_COLORS.RCP_PENDING }} />
          <span className="text-xs text-text-muted">RCP à confirmer</span>
        </div>
        <div className="flex items-center gap-1.5">
          <CheckCircle2 size={10} style={{ color: SLOT_COLORS.RCP_DONE }} />
          <span className="text-xs text-text-muted">RCP confirmé</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: SLOT_COLORS.ACT_ASTREINTE }} />
          <span className="text-xs text-text-muted">Astreinte</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: SLOT_COLORS.ACT_WORKFLOW }} />
          <span className="text-xs text-text-muted">Workflow</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: SLOT_COLORS.ACT_UNITY }} />
          <span className="text-xs text-text-muted">Unity</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: SLOT_COLORS.LEAVE }} />
          <span className="text-xs text-text-muted">Congé</span>
        </div>
      </div>
    </div>
  );
};

export default PersonalAgendaWeek;
