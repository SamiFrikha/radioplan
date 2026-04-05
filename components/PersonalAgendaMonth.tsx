// components/PersonalAgendaMonth.tsx
import React, { useMemo, useContext, useState } from 'react';
import { ChevronLeft, ChevronRight, AlertTriangle, CheckCircle2, CalendarDays } from 'lucide-react';
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
): 'UNCONFIRMED' | 'PRESENT' | 'NONE' => {
  if (slot.type !== SlotType.RCP) return 'NONE';
  if (slot.isUnconfirmed) return 'UNCONFIRMED';
  if (doctorId && rcpAttendance[slot.id]?.[doctorId] === 'PRESENT') return 'PRESENT';
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
}> = ({ slot, doctorId, rcpAttendance, activityDefinitions }) => {
  const base = "text-[8px] rounded px-1 py-0.5 font-semibold leading-tight truncate w-full";

  if (slot.type === SlotType.RCP) {
    const status = getRcpStatus(slot, doctorId, rcpAttendance);
    if (status === 'UNCONFIRMED') {
      return (
        <div
          className={`${base} border border-dashed flex items-center gap-0.5`}
          style={{ backgroundColor: 'rgba(217,119,6,0.12)', borderColor: 'rgba(217,119,6,0.5)', color: SLOT_COLORS.RCP_PENDING }}
          title={slot.subType || 'RCP — À confirmer'}
        >
          <AlertTriangle size={7} className="shrink-0" />
          <span className="truncate">{slot.subType || 'RCP'}</span>
        </div>
      );
    }
    if (status === 'PRESENT') {
      return (
        <div
          className={`${base} flex items-center gap-0.5 text-white`}
          style={{ backgroundColor: SLOT_COLORS.RCP_DONE }}
          title={slot.subType || 'RCP — Confirmé'}
        >
          <CheckCircle2 size={7} className="shrink-0" />
          <span className="truncate">{slot.subType || 'RCP'}</span>
        </div>
      );
    }
    // Default RCP
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

const PersonalAgendaMonth: React.FC = () => {
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
          (slot.type === SlotType.RCP && rcpAttendance[slot.id]?.[doctorId] === 'PRESENT');
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
    <div>
      {/* Navigation */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={prevMonth} className="p-1 hover:bg-muted rounded-lg"><ChevronLeft size={18} /></button>
        <span className="text-sm font-semibold text-text-base capitalize">{monthLabel}</span>
        <button onClick={nextMonth} className="p-1 hover:bg-muted rounded-lg"><ChevronRight size={18} /></button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'].map((d, i) => (
          <div key={i} className="text-xs text-center text-text-muted font-medium py-1">{d}</div>
        ))}
      </div>

      {/* Calendar grid — weeks rendered individually to support per-week activity banners */}
      <div className="grid grid-cols-7 gap-0.5">
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

                return (
                  <div key={di}
                    onClick={() => isCurrentMonth && !isWeekend && setSelectedDate(isSelected ? null : key)}
                    className={`min-h-[72px] rounded-lg p-1 transition-colors flex flex-col
                      ${isCurrentMonth && !isWeekend ? 'cursor-pointer hover:bg-muted' : 'cursor-default'}
                      ${isWeekend || !isCurrentMonth ? 'opacity-30 bg-muted' : 'bg-surface'}
                      ${isToday ? 'ring-2 ring-primary' : ''}
                      ${isSelected ? 'ring-2 ring-primary bg-primary/10' : ''}
                    `}>
                    {/* Day number */}
                    <div className={`text-xs text-center font-medium mb-0.5 ${isToday ? 'text-primary font-bold' : 'text-text-base'}`}>
                      {date.getDate()}
                    </div>

                    {onLeave && isCurrentMonth && !isWeekend ? (
                      <div
                        className="text-[8px] rounded px-1 py-0.5 text-center font-semibold leading-tight text-white"
                        style={{ backgroundColor: SLOT_COLORS.LEAVE }}
                      >
                        Congé
                      </div>
                    ) : (
                      <div className="flex flex-col gap-0.5 flex-1">
                        {morningSlots.length > 0 && (
                          <div className="space-y-0.5">
                            {morningSlots.map((s: any) => (
                              <SlotPill key={s.id} slot={s} doctorId={doctorId} rcpAttendance={rcpAttendance} activityDefinitions={activityDefinitions} />
                            ))}
                          </div>
                        )}
                        {morningSlots.length > 0 && afternoonSlots.length > 0 && (
                          <div className="border-t border-border my-0.5" />
                        )}
                        {afternoonSlots.length > 0 && (
                          <div className="space-y-0.5">
                            {afternoonSlots.map((s: any) => (
                              <SlotPill key={s.id} slot={s} doctorId={doctorId} rcpAttendance={rcpAttendance} activityDefinitions={activityDefinitions} />
                            ))}
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
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedDate(null)}
        >
          <div
            className="bg-surface rounded-xl shadow-modal max-w-sm w-full p-5 max-h-[80vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <p className="font-semibold text-text-base capitalize">
                {new Date(selectedDate + 'T12:00:00').toLocaleDateString('fr-FR', {
                  weekday: 'long', day: '2-digit', month: 'long'
                })}
              </p>
              <button
                onClick={() => setSelectedDate(null)}
                className="p-1 hover:bg-muted rounded-btn-sm text-text-muted"
              >
                <span className="text-lg leading-none">✕</span>
              </button>
            </div>
            {(() => {
              const daySlots = scheduleByDate[selectedDate] ?? [];
              const onLeave = unavailabilities.some(u =>
                u.doctorId === doctorId && selectedDate >= u.startDate && selectedDate <= u.endDate
              );
              if (onLeave) return <p className="text-text-muted italic text-sm">Congé / Indisponibilité</p>;
              if (daySlots.length === 0) return <p className="text-text-muted italic text-sm">Aucune activité planifiée</p>;

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
                  <div key={s.id} className="flex items-center gap-2 py-1">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: dotHex }} />
                    <span className="text-text-base font-medium text-sm">{getLabel(s)}</span>
                    {s.type === SlotType.RCP && rcpStatus === 'UNCONFIRMED' && (
                      <span className="text-xs text-amber-600 font-medium flex items-center gap-0.5">
                        <AlertTriangle size={10} />À confirmer
                      </span>
                    )}
                    {s.type === SlotType.RCP && rcpStatus === 'PRESENT' && (
                      <span className="text-xs text-green-600 font-medium flex items-center gap-0.5">
                        <CheckCircle2 size={10} />Confirmé
                      </span>
                    )}
                    {s.location && s.location !== s.subType && (
                      <span className="text-text-muted text-xs">— {s.location}</span>
                    )}
                  </div>
                );
              };

              return (
                <div className="space-y-3">
                  {morningSlots.length > 0 && (
                    <div>
                      <p className="text-[11px] font-semibold text-text-muted uppercase tracking-wider mb-1.5">🌅 Matin</p>
                      {morningSlots.map(renderDetailSlot)}
                    </div>
                  )}
                  {afternoonSlots.length > 0 && (
                    <div>
                      <p className="text-[11px] font-semibold text-text-muted uppercase tracking-wider mb-1.5">🌇 Après-midi</p>
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
