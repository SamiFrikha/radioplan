// components/PersonalAgendaMonth.tsx
import React, { useMemo, useContext, useState, useRef } from 'react';
import { ChevronLeft, ChevronRight, AlertTriangle, CheckCircle2, CalendarDays, XCircle } from 'lucide-react';
import { AppContext } from '../App';
import { useAuth } from '../context/AuthContext';
import { generateScheduleForWeek } from '../services/scheduleService';
import { SlotType, Period } from '../types';
import { getDoctorHexColor } from './DoctorBadge';

// RCP status helper
const getRcpStatus = (
  slot: any,
  doctorId: string | undefined,
  rcpAttendance: Record<string, Record<string, string>>
): 'UNCONFIRMED' | 'PRESENT' | 'ABSENT' | 'NONE' => {
  if (slot.type !== SlotType.RCP) return 'NONE';
  // Check explicit attendance first — takes priority over isUnconfirmed flag
  if (doctorId && rcpAttendance[slot.id]?.[doctorId] === 'PRESENT') return 'PRESENT';
  if (doctorId && rcpAttendance[slot.id]?.[doctorId] === 'ABSENT') return 'ABSENT';
  if (slot.isUnconfirmed) return 'UNCONFIRMED';
  return 'NONE';
};

// Clinical hex constants (shared with week view)
const SLOT_COLORS = {
  CONSULT:       '#3B6FD4',
  RCP_PENDING:   '#D97706',
  RCP_DONE:      '#059669',
  RCP_NONE:      '#7C3AED',
  ACT_ASTREINTE: '#DC4E3A',
  ACT_WORKFLOW:  '#0F766E',
  ACT_UNITY:     '#6D28D9',
  LEAVE:         '#64748B',
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

// Pill shown in the compact month grid cell — Option C clinical palette (inline styles for reliability)
const SlotPill: React.FC<{
  slot: any;
  doctorId: string | undefined;
  rcpAttendance: Record<string, Record<string, string>>;
  activityDefinitions: any[];
  doctors?: any[];
}> = ({ slot, doctorId, rcpAttendance, activityDefinitions, doctors = [] }) => {
  const base = "text-[8px] rounded px-1 py-0.5 font-semibold leading-tight truncate w-full";

  if (slot.type === SlotType.RCP) {
    const status = getRcpStatus(slot, doctorId, rcpAttendance);

    // Other attendees sub-indicator (shown for UNCONFIRMED, PRESENT, ABSENT)
    const AttendeesRow = () => {
      const others = Object.entries(rcpAttendance[slot.id] || {}).filter(([id]) => id !== doctorId);
      if (others.length === 0) return null;
      return (
        <div className="mt-0.5 flex flex-wrap gap-0.5">
          {others.map(([id, st]) => {
            const doc = doctors.find((d: any) => d.id === id);
            if (!doc) return null;
            return (
              <span key={id} className="text-[7px] px-0.5 rounded-sm leading-tight"
                style={st === 'PRESENT'
                  ? { backgroundColor: 'rgba(5,150,105,0.18)', color: '#059669' }
                  : { backgroundColor: 'rgba(220,78,58,0.18)', color: '#DC4E3A' }
                }>
                {st === 'PRESENT' ? '✓' : '✗'} {doc.name.replace(/^Dr\.?\s*/i, '').split(' ')[0] || doc.name}
              </span>
            );
          })}
        </div>
      );
    };

    if (status === 'UNCONFIRMED') {
      return (
        <div
          className={`${base} border border-dashed flex flex-col`}
          style={{ backgroundColor: 'rgba(217,119,6,0.12)', borderColor: 'rgba(217,119,6,0.5)', color: SLOT_COLORS.RCP_PENDING }}
          title={slot.subType || 'RCP — À confirmer'}
        >
          <div className="flex items-center gap-0.5">
            <AlertTriangle size={7} className="shrink-0" />
            <span className="truncate">{slot.subType || 'RCP'}</span>
          </div>
        </div>
      );
    }
    if (status === 'PRESENT') {
      return (
        <div
          className={`${base} flex flex-col text-white`}
          style={{ backgroundColor: SLOT_COLORS.RCP_DONE }}
          title={slot.subType || 'RCP — Confirmé'}
        >
          <div className="flex items-center gap-0.5">
            <CheckCircle2 size={7} className="shrink-0" />
            <span className="truncate">{slot.subType || 'RCP'}</span>
          </div>
        </div>
      );
    }
    if (status === 'ABSENT') {
      return (
        <div
          className={`${base} border border-dashed flex flex-col`}
          style={{ backgroundColor: 'rgba(220,78,58,0.07)', borderColor: 'rgba(220,78,58,0.4)', color: '#DC4E3A' }}
          title={slot.subType || 'RCP — Absent'}
        >
          <div className="flex items-center gap-0.5">
            <XCircle size={7} className="shrink-0" />
            <span className="truncate">{slot.subType || 'RCP'}</span>
          </div>
        </div>
      );
    }
    // Default RCP (NONE)
    return (
      <div
        className={`${base} text-white`}
        style={{ backgroundColor: '#7C3AED' }}
        title={slot.subType || 'RCP'}
      >
        {slot.subType || 'RCP'}
      </div>
    );
  }

  // Activity — named-activity map first, then per-definition color
  if (slot.type === SlotType.ACTIVITY) {
    const actDef = activityDefinitions.find((a: any) => a.id === slot.activityId);
    const actColor = getActivityColor(slot, actDef);
    const label = slot.subType || slot.location || 'Activité';
    return (
      <div
        className={`${base} text-white`}
        style={{ backgroundColor: actColor }}
        title={label}
      >
        {label}
      </div>
    );
  }

  // Consultation — clinical slate blue
  if (slot.type === SlotType.CONSULTATION) {
    return (
      <div
        className={`${base} text-white`}
        style={{ backgroundColor: SLOT_COLORS.CONSULT }}
        title="Consultation"
      >
        Consultation
      </div>
    );
  }

  return (
    <div className={`${base} bg-muted text-text-muted`}>
      {slot.subType || '?'}
    </div>
  );
};

const SLOT_DOT: Record<string, string> = {
  [SlotType.CONSULTATION]: 'bg-slot-consult',
  [SlotType.RCP]:          'bg-secondary',
  [SlotType.ACTIVITY]:     'bg-warning',
};

const getLabel = (slot: any): string => {
  if (slot.type === SlotType.CONSULTATION) return 'Consultation';
  if (slot.type === SlotType.RCP) return slot.subType || 'RCP';
  if (slot.type === SlotType.ACTIVITY) return slot.subType || slot.location || 'Activité';
  return '?';
};

const toKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

interface Props {
  onRcpClick?: (slot: any) => void;
  onActivityClick?: (slot: any) => void;
  onConsultClick?: (slot: any) => void;
}

const PersonalAgendaMonth: React.FC<Props> = ({ onRcpClick, onActivityClick, onConsultClick }) => {
  const {
    doctors, template, unavailabilities,
    activityDefinitions, rcpTypes, rcpAttendance, rcpExceptions, manualOverrides,
  } = useContext(AppContext);

  const { profile } = useAuth();
  const doctorId = profile?.doctor_id;

  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const prevMonth = () => { if (month === 0) { setYear(y => y-1); setMonth(11); } else setMonth(m => m-1); };
  const nextMonth = () => { if (month === 11) { setYear(y => y+1); setMonth(0); } else setMonth(m => m+1); };

  const touchStartX = useRef<number>(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) {
      if (diff > 0) nextMonth();
      else prevMonth();
    }
  };

  const weeks: Date[][] = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const offset = (firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1);
    const start = new Date(firstDay);
    start.setDate(firstDay.getDate() - offset);
    return Array.from({ length: 6 }, (_, w) =>
      Array.from({ length: 7 }, (_, d) => {
        const date = new Date(start);
        date.setDate(start.getDate() + w * 7 + d);
        return date;
      })
    );
  }, [year, month]);

  const scheduleByDate = useMemo(() => {
    if (!doctorId) return {};
    const result: Record<string, any[]> = {};
    const mondays = weeks.map(w => w[0]);
    for (const monday of mondays) {
      const generated = generateScheduleForWeek(
        monday, template, unavailabilities, doctors,
        activityDefinitions, rcpTypes, false, {}, rcpAttendance, rcpExceptions,
      );
      // Apply manual overrides so activity assignments are visible
      const slots = generated.map((slot: any) => {
        const overrideValue = manualOverrides[slot.id];
        if (!overrideValue || overrideValue === '__CLOSED__') return slot;
        const isAuto = overrideValue.startsWith('auto:');
        const assignedId = isAuto ? overrideValue.substring(5) : overrideValue;
        return { ...slot, assignedDoctorId: assignedId };
      });
      for (const slot of slots) {
        // Show slot if doctor is assigned, secondary, or confirmed present via rcp_attendance
        const isVisible =
          slot.assignedDoctorId === doctorId ||
          slot.secondaryDoctorIds?.includes(doctorId) ||
          (slot.type === SlotType.RCP && (
            rcpAttendance[slot.id]?.[doctorId] === 'PRESENT' ||
            rcpAttendance[slot.id]?.[doctorId] === 'ABSENT'
          ));
        if (!isVisible) continue;
        const key = slot.date;
        if (!result[key]) result[key] = [];
        result[key].push(slot);
      }
    }
    return result;
  }, [year, month, doctorId, template, unavailabilities, doctors, activityDefinitions, rcpTypes, rcpAttendance, rcpExceptions, manualOverrides, weeks]);

  const monthLabel = new Date(year, month).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

  return (
    <div onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      {/* Navigation */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={prevMonth} className="p-2 hover:bg-muted rounded-lg transition-colors"><ChevronLeft size={22} /></button>
        <span className="text-xl font-bold text-text-base capitalize">{monthLabel}</span>
        <button onClick={nextMonth} className="p-2 hover:bg-muted rounded-lg transition-colors"><ChevronRight size={22} /></button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1 bg-muted/60 rounded-lg overflow-hidden">
        {['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'].map((d, i) => (
          <div key={i} className="text-xs text-center text-text-base font-bold py-1.5 tracking-wide">{d}</div>
        ))}
      </div>

      {/* Calendar grid — weeks rendered individually to support per-week activity banners */}
      <div className="grid grid-cols-7 gap-px bg-border/20 rounded-lg overflow-hidden border border-border/30">
        {weeks.map((week, wi) => {
          // Detect WEEKLY activities for this week (from Monday's schedule, deduped)
          const mondayKey = toKey(week[0]);
          const mondaySlots = scheduleByDate[mondayKey] ?? [];
          const seenAct = new Set<string>();
          const weeklyActs = mondaySlots
            .filter((s: any) => {
              if (s.type !== SlotType.ACTIVITY) return false;
              const def = activityDefinitions.find((a: any) => a.id === s.activityId);
              return def?.granularity === 'WEEKLY';
            })
            .filter((s: any) => {
              if (seenAct.has(s.activityId)) return false;
              seenAct.add(s.activityId);
              return true;
            })
            .map((s: any) => {
              const def = activityDefinitions.find((a: any) => a.id === s.activityId);
              return { id: s.activityId, name: def?.name || s.subType || 'Activité', color: getActivityColor(s, def) };
            });

          return (
            <React.Fragment key={wi}>
              {/* Per-week WEEKLY activity banner — spans all 7 columns */}
              {weeklyActs.length > 0 && (
                <div className="col-span-7 flex flex-wrap gap-1 px-1 py-1 mb-0.5 bg-muted/50 rounded-lg border border-border/40">
                  {weeklyActs.map(act => (
                    <span
                      key={act.id}
                      className="inline-flex items-center gap-1 rounded-full text-[9px] font-semibold px-2 py-0.5 text-white"
                      style={{ backgroundColor: act.color }}
                    >
                      <CalendarDays size={8} className="shrink-0" />
                      {act.name}
                    </span>
                  ))}
                  <span className="text-[9px] text-text-muted self-center ml-0.5">— semaine entière</span>
                </div>
              )}

              {/* Day cells for this week */}
              {week.map((date, di) => {
                const key = toKey(date);
                const allSlots = scheduleByDate[key] ?? [];
                // Filter out WEEKLY activities — shown in banner above
                const slots = allSlots.filter((s: any) => {
                  if (s.type !== SlotType.ACTIVITY) return true;
                  const def = activityDefinitions.find((a: any) => a.id === s.activityId);
                  return def?.granularity !== 'WEEKLY';
                });
                const onLeave = unavailabilities.some((u: any) =>
                  u.doctorId === doctorId && key >= u.startDate && key <= u.endDate
                );
                const isCurrentMonth = date.getMonth() === month;
                const isToday = key === toKey(today);
                const isSelected = key === selectedDate;
                const isWeekend = date.getDay() === 0 || date.getDay() === 6;

                const morningSlots = slots.filter((s: any) => s.period === Period.MORNING);
                const afternoonSlots = slots.filter((s: any) => s.period === Period.AFTERNOON);

                // Compute display color for a slot (for the bigger inline pills)
                const getSlotDisplayColor = (s: any): string => {
                  if (s.type === SlotType.RCP) {
                    const status = getRcpStatus(s, doctorId, rcpAttendance);
                    if (status === 'PRESENT') return SLOT_COLORS.RCP_DONE;
                    if (status === 'UNCONFIRMED') return SLOT_COLORS.RCP_PENDING;
                    if (status === 'ABSENT') return '#94a3b8';
                    return SLOT_COLORS.RCP_NONE;
                  }
                  if (s.type === SlotType.CONSULTATION) return SLOT_COLORS.CONSULT;
                  if (s.type === SlotType.ACTIVITY) {
                    const def = activityDefinitions.find((a: any) => a.id === s.activityId);
                    return getActivityColor(s, def);
                  }
                  return SLOT_COLORS.LEAVE;
                };

                const getSlotLabel = (s: any): string => {
                  if (s.type === SlotType.CONSULTATION) return 'Consult.';
                  if (s.type === SlotType.RCP) return s.subType || 'RCP';
                  if (s.type === SlotType.ACTIVITY) return s.subType || s.location || 'Activité';
                  return '?';
                };

                return (
                  <div key={di}
                    onClick={() => isCurrentMonth && !isWeekend && setSelectedDate(isSelected ? null : key)}
                    className={`min-h-[72px] sm:min-h-[90px] rounded-none p-1 transition-colors flex flex-col
                      ${isCurrentMonth && !isWeekend ? 'cursor-pointer hover:bg-muted' : 'cursor-default'}
                      ${isWeekend || !isCurrentMonth ? 'opacity-30 bg-muted' : 'bg-surface'}
                      ${isToday ? 'ring-2 ring-inset ring-primary' : ''}
                      ${isSelected ? 'ring-2 ring-inset ring-primary bg-primary/10' : ''}
                    `}>
                    {/* Day number */}
                    <div className={`mb-0.5 ${
                      isToday
                        ? 'w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-primary text-white flex items-center justify-center mx-auto text-[10px] sm:text-xs font-bold'
                        : 'text-xs sm:text-sm text-center font-medium text-text-base'
                    }`}>
                      {date.getDate()}
                    </div>

                    {onLeave && isCurrentMonth && !isWeekend ? (
                      <div
                        className="text-[9px] sm:text-[10px] rounded px-1 py-0.5 text-center font-semibold leading-tight text-white mt-0.5"
                        style={{ backgroundColor: SLOT_COLORS.LEAVE }}
                      >
                        Congé
                      </div>
                    ) : (
                      <div className="flex flex-col flex-1">
                        {morningSlots.length > 0 && (
                          <div className="space-y-0.5">
                            {morningSlots.slice(0, 2).map((s: any) => {
                              const rcpStatus = s.type === SlotType.RCP ? getRcpStatus(s, doctorId, rcpAttendance) : null;
                              const isAbsent = rcpStatus === 'ABSENT';
                              const color = isAbsent ? '#DC4E3A' : getSlotDisplayColor(s);
                              const label = getSlotLabel(s);
                              return isCurrentMonth ? (
                                <div
                                  key={s.id}
                                  className={`text-[9px] sm:text-[10px] font-medium leading-tight truncate max-w-full overflow-hidden px-1 py-0.5 rounded mt-0.5 flex items-center gap-0.5${isAbsent ? ' border border-dashed' : ''}`}
                                  style={isAbsent
                                    ? { backgroundColor: 'rgba(220,78,58,0.1)', color: '#DC4E3A', borderColor: 'rgba(220,78,58,0.4)' }
                                    : { backgroundColor: color + '22', color }
                                  }
                                  title={label}
                                >
                                  {isAbsent && <XCircle size={7} className="shrink-0" />}
                                  {label}
                                </div>
                              ) : (
                                <SlotPill key={s.id} slot={s} doctorId={doctorId} rcpAttendance={rcpAttendance} activityDefinitions={activityDefinitions} doctors={doctors} />
                              );
                            })}
                            {morningSlots.length > 2 && (
                              <div className="text-[8px] text-text-muted mt-0.5">+{morningSlots.length - 2}</div>
                            )}
                          </div>
                        )}
                        {morningSlots.length > 0 && afternoonSlots.length > 0 && (
                          <div className="border-t border-border my-0.5" />
                        )}
                        {afternoonSlots.length > 0 && (
                          <div className="space-y-0.5">
                            {afternoonSlots.slice(0, 2).map((s: any) => {
                              const rcpStatus = s.type === SlotType.RCP ? getRcpStatus(s, doctorId, rcpAttendance) : null;
                              const isAbsent = rcpStatus === 'ABSENT';
                              const color = isAbsent ? '#DC4E3A' : getSlotDisplayColor(s);
                              const label = getSlotLabel(s);
                              return isCurrentMonth ? (
                                <div
                                  key={s.id}
                                  className={`text-[9px] sm:text-[10px] font-medium leading-tight truncate max-w-full overflow-hidden px-1 py-0.5 rounded mt-0.5 flex items-center gap-0.5${isAbsent ? ' border border-dashed' : ''}`}
                                  style={isAbsent
                                    ? { backgroundColor: 'rgba(220,78,58,0.1)', color: '#DC4E3A', borderColor: 'rgba(220,78,58,0.4)' }
                                    : { backgroundColor: color + '22', color }
                                  }
                                  title={label}
                                >
                                  {isAbsent && <XCircle size={7} className="shrink-0" />}
                                  {label}
                                </div>
                              ) : (
                                <SlotPill key={s.id} slot={s} doctorId={doctorId} rcpAttendance={rcpAttendance} activityDefinitions={activityDefinitions} doctors={doctors} />
                              );
                            })}
                            {afternoonSlots.length > 2 && (
                              <div className="text-[8px] text-text-muted mt-0.5">+{afternoonSlots.length - 2}</div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </React.Fragment>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex gap-3 mt-3 flex-wrap text-xs text-text-muted">
        <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: SLOT_COLORS.CONSULT }} />Consultation</div>
        <div className="flex items-center gap-1.5"><AlertTriangle size={10} style={{ color: SLOT_COLORS.RCP_PENDING }} />RCP à confirmer</div>
        <div className="flex items-center gap-1.5"><CheckCircle2 size={10} style={{ color: SLOT_COLORS.RCP_DONE }} />RCP confirmé</div>
        <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: SLOT_COLORS.ACT_ASTREINTE }} />Astreinte</div>
        <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: SLOT_COLORS.ACT_WORKFLOW }} />Workflow</div>
        <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: SLOT_COLORS.ACT_UNITY }} />Unity</div>
        <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: SLOT_COLORS.LEAVE }} />Congé</div>
      </div>

      {selectedDate && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedDate(null)}
        >
          <div
            className="bg-surface rounded-2xl shadow-modal max-w-sm w-full p-5 max-h-[85vh] overflow-y-auto border border-border/60"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-border">
              <p className="font-bold text-base text-text-base capitalize">
                {new Date(selectedDate + 'T12:00:00').toLocaleDateString('fr-FR', {
                  weekday: 'long', day: '2-digit', month: 'long'
                })}
              </p>
              <button
                onClick={() => setSelectedDate(null)}
                className="w-8 h-8 flex items-center justify-center hover:bg-muted rounded-lg text-text-muted transition-colors"
              >
                <span className="text-lg leading-none">✕</span>
              </button>
            </div>
            {(() => {
              const daySlots = scheduleByDate[selectedDate] ?? [];
              const onLeave = unavailabilities.some(u =>
                u.doctorId === doctorId && selectedDate >= u.startDate && selectedDate <= u.endDate
              );
              if (onLeave) return (
                <div className="flex items-center gap-2 py-2 px-3 rounded-lg bg-muted">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: SLOT_COLORS.LEAVE }} />
                  <p className="text-text-muted italic text-sm">Congé / Indisponibilité</p>
                </div>
              );
              if (daySlots.length === 0) return <p className="text-text-muted italic text-sm py-2">Aucune activité planifiée</p>;

              const morningSlots = daySlots.filter((s: any) => s.period === Period.MORNING);
              const afternoonSlots = daySlots.filter((s: any) => s.period === Period.AFTERNOON);

              const renderDetailSlot = (s: any) => {
                const rcpStatus = getRcpStatus(s, doctorId, rcpAttendance);
                const dotHex = (() => {
                  if (s.type === SlotType.RCP) {
                    if (rcpStatus === 'PRESENT') return SLOT_COLORS.RCP_DONE;
                    if (rcpStatus === 'UNCONFIRMED') return SLOT_COLORS.RCP_PENDING;
                    return SLOT_COLORS.RCP_NONE;
                  }
                  if (s.type === SlotType.CONSULTATION) return SLOT_COLORS.CONSULT;
                  if (s.type === 'LEAVE') return SLOT_COLORS.LEAVE;
                  if (s.type === SlotType.ACTIVITY) {
                    const name = (s.subType || s.location || '').toLowerCase();
                    if (name.includes('astreinte')) return SLOT_COLORS.ACT_ASTREINTE;
                    if (name.includes('workflow')) return SLOT_COLORS.ACT_WORKFLOW;
                    if (name.includes('unity')) return SLOT_COLORS.ACT_UNITY;
                    return '#F59E0B';
                  }
                  return SLOT_COLORS.LEAVE;
                })();
                return (
                  <div
                    key={s.id}
                    className="rounded-lg p-3 mb-2 border"
                    style={{ backgroundColor: dotHex + '11', borderColor: dotHex + '33' }}
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: dotHex }} />
                      <span className="text-text-base font-semibold text-sm">{getLabel(s)}</span>
                      {s.type === SlotType.RCP && rcpStatus === 'UNCONFIRMED' && (
                        <span className="text-xs font-medium flex items-center gap-0.5 ml-auto" style={{ color: SLOT_COLORS.RCP_PENDING }}>
                          <AlertTriangle size={11} />À confirmer
                        </span>
                      )}
                      {s.type === SlotType.RCP && rcpStatus === 'PRESENT' && (
                        <span className="text-xs font-medium flex items-center gap-0.5 ml-auto" style={{ color: SLOT_COLORS.RCP_DONE }}>
                          <CheckCircle2 size={11} />Confirmé
                        </span>
                      )}
                    </div>
                    {s.location && s.location !== s.subType && (
                      <p className="text-text-muted text-xs mt-1 ml-4">{s.location}</p>
                    )}
                    {/* Other attendees for RCP */}
                    {s.type === SlotType.RCP && rcpStatus !== 'NONE' && (() => {
                      const others = Object.entries(rcpAttendance[s.id] || {}).filter(([id]) => id !== doctorId);
                      if (others.length === 0) return null;
                      return (
                        <div className="mt-2 flex flex-wrap gap-1.5 ml-4">
                          {others.map(([id, st]) => {
                            const doc = doctors.find((d: any) => d.id === id);
                            if (!doc) return null;
                            return (
                              <span key={id} className="text-xs px-2 py-0.5 rounded-full border font-medium"
                                style={st === 'PRESENT'
                                  ? { backgroundColor: 'rgba(5,150,105,0.12)', color: '#059669', borderColor: 'rgba(5,150,105,0.3)' }
                                  : { backgroundColor: 'rgba(220,78,58,0.12)', color: '#DC4E3A', borderColor: 'rgba(220,78,58,0.3)' }
                                }>
                                {st === 'PRESENT' ? '✓' : '✗'} {doc.name.replace(/^Dr\.?\s*/i, '').split(' ')[0] || doc.name}
                              </span>
                            );
                          })}
                        </div>
                      );
                    })()}
                    {onRcpClick && s.type === SlotType.RCP && (
                      <button
                        onClick={() => { onRcpClick(s); setSelectedDate(null); }}
                        className="mt-2 w-full text-sm font-semibold py-2 rounded-lg bg-primary/10 text-primary border border-primary/25 hover:bg-primary/20 transition-colors"
                      >
                        Confirmer ma présence
                      </button>
                    )}
                    {onActivityClick && s.type === SlotType.ACTIVITY && s.assignedDoctorId === doctorId && (
                      <button
                        onClick={() => { onActivityClick(s); setSelectedDate(null); }}
                        className="mt-2 w-full text-sm font-semibold py-2 rounded-lg bg-primary/10 text-primary border border-primary/25 hover:bg-primary/20 transition-colors"
                      >
                        Voir les détails
                      </button>
                    )}
                    {onConsultClick && s.type === SlotType.CONSULTATION && s.assignedDoctorId === doctorId && (
                      <button
                        onClick={() => { onConsultClick(s); setSelectedDate(null); }}
                        className="mt-2 w-full text-sm font-semibold py-2 rounded-lg bg-primary/10 text-primary border border-primary/25 hover:bg-primary/20 transition-colors"
                      >
                        Voir les détails
                      </button>
                    )}
                  </div>
                );
              };

              return (
                <div>
                  {morningSlots.length > 0 && (
                    <div className="mb-3">
                      <p className="text-[11px] font-bold text-text-muted uppercase tracking-wider mb-2">Matin</p>
                      {morningSlots.map(renderDetailSlot)}
                    </div>
                  )}
                  {afternoonSlots.length > 0 && (
                    <div>
                      <p className="text-[11px] font-bold text-text-muted uppercase tracking-wider mb-2">Après-midi</p>
                      {afternoonSlots.map(renderDetailSlot)}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
};

export default PersonalAgendaMonth;
