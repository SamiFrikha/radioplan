// components/PersonalAgendaMonth.tsx
import React, { useMemo, useContext, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { AppContext } from '../App';
import { useAuth } from '../context/AuthContext';
import { generateScheduleForWeek } from '../services/scheduleService';
import { SlotType, Period } from '../types';

const SLOT_BG: Record<string, string> = {
  [SlotType.CONSULTATION]: 'bg-blue-500 text-white',
  [SlotType.RCP]:          'bg-violet-500 text-white',
  [SlotType.ACTIVITY]:     'bg-orange-500 text-white',
};

const SLOT_DOT: Record<string, string> = {
  [SlotType.CONSULTATION]: 'bg-blue-500',
  [SlotType.RCP]:          'bg-violet-500',
  [SlotType.ACTIVITY]:     'bg-orange-500',
};

const getLabel = (slot: any): string => {
  if (slot.type === SlotType.CONSULTATION) return 'Consultation';
  if (slot.type === SlotType.RCP) return slot.subType || 'RCP';
  if (slot.type === SlotType.ACTIVITY) return slot.subType || slot.location || 'Activité';
  return '?';
};

const toKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

// Pill shown in the compact month grid cell
const SlotPill: React.FC<{ slot: any }> = ({ slot }) => {
  const label = getLabel(slot);
  const bg = SLOT_BG[slot.type] ?? 'bg-gray-400 text-white';
  return (
    <div
      className={`text-[8px] rounded px-1 py-0.5 font-semibold leading-tight truncate w-full ${bg}`}
      title={label}
    >
      {label}
    </div>
  );
};

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
        if (slot.assignedDoctorId !== doctorId && !slot.secondaryDoctorIds?.includes(doctorId)) continue;
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
        <button onClick={prevMonth} className="p-1 hover:bg-gray-100 rounded-lg"><ChevronLeft size={18} /></button>
        <span className="text-sm font-semibold text-gray-700 capitalize">{monthLabel}</span>
        <button onClick={nextMonth} className="p-1 hover:bg-gray-100 rounded-lg"><ChevronRight size={18} /></button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'].map((d, i) => (
          <div key={i} className="text-xs text-center text-gray-400 font-medium py-1">{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-0.5">
        {weeks.flat().map((date, i) => {
          const key = toKey(date);
          const slots = scheduleByDate[key] ?? [];
          const onLeave = unavailabilities.some(u =>
            u.doctorId === doctorId && key >= u.startDate && key <= u.endDate
          );
          const isCurrentMonth = date.getMonth() === month;
          const isToday = key === toKey(today);
          const isSelected = key === selectedDate;
          const isWeekend = date.getDay() === 0 || date.getDay() === 6;

          const morningSlots = slots.filter((s: any) => s.period === Period.MORNING);
          const afternoonSlots = slots.filter((s: any) => s.period === Period.AFTERNOON);

          return (
            <div key={i}
              onClick={() => isCurrentMonth && !isWeekend && setSelectedDate(isSelected ? null : key)}
              className={`min-h-[72px] rounded-lg p-1 transition-colors flex flex-col
                ${isCurrentMonth && !isWeekend ? 'cursor-pointer hover:bg-gray-50' : 'cursor-default'}
                ${isWeekend || !isCurrentMonth ? 'opacity-30 bg-gray-50' : 'bg-white'}
                ${isToday ? 'ring-2 ring-blue-400' : ''}
                ${isSelected ? 'ring-2 ring-indigo-500 bg-indigo-50' : ''}
              `}>
              {/* Day number */}
              <div className={`text-xs text-center font-medium mb-0.5 ${isToday ? 'text-blue-600 font-bold' : 'text-gray-600'}`}>
                {date.getDate()}
              </div>

              {onLeave && isCurrentMonth && !isWeekend ? (
                <div className="text-[8px] bg-gray-200 text-gray-500 rounded px-1 py-0.5 text-center font-medium leading-tight">
                  Congé
                </div>
              ) : (
                <div className="flex flex-col gap-0.5 flex-1">
                  {/* Morning slots — all of them */}
                  {morningSlots.length > 0 && (
                    <div className="space-y-0.5">
                      {morningSlots.map((s: any) => (
                        <SlotPill key={s.id} slot={s} />
                      ))}
                    </div>
                  )}
                  {/* Divider between AM and PM if both have slots */}
                  {morningSlots.length > 0 && afternoonSlots.length > 0 && (
                    <div className="border-t border-gray-100 my-0.5" />
                  )}
                  {/* Afternoon slots — all of them */}
                  {afternoonSlots.length > 0 && (
                    <div className="space-y-0.5">
                      {afternoonSlots.map((s: any) => (
                        <SlotPill key={s.id} slot={s} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex gap-4 mt-3 flex-wrap">
        {[
          { dot: SLOT_DOT[SlotType.CONSULTATION], label: 'Consultation' },
          { dot: SLOT_DOT[SlotType.RCP], label: 'RCP' },
          { dot: SLOT_DOT[SlotType.ACTIVITY], label: 'Activité' },
          { dot: 'bg-gray-300', label: 'Congé' },
        ].map(({ dot, label }) => (
          <div key={label} className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className={`w-2.5 h-2.5 rounded-full inline-block shrink-0 ${dot}`} />
            {label}
          </div>
        ))}
      </div>

      {/* Selected day detail panel */}
      {selectedDate && (
        <div className="mt-3 p-4 bg-gray-50 rounded-xl border border-gray-200 text-sm">
          <p className="font-semibold text-gray-700 mb-3 capitalize">
            {new Date(selectedDate + 'T12:00:00').toLocaleDateString('fr-FR', {
              weekday: 'long', day: '2-digit', month: 'long'
            })}
          </p>
          {(() => {
            const daySlots = scheduleByDate[selectedDate] ?? [];
            const onLeave = unavailabilities.some(u =>
              u.doctorId === doctorId && selectedDate >= u.startDate && selectedDate <= u.endDate
            );
            if (onLeave) return <p className="text-gray-500 italic text-sm">Congé / Indisponibilité</p>;
            if (daySlots.length === 0) return <p className="text-gray-400 italic text-sm">Aucune activité planifiée</p>;

            const morningSlots = daySlots.filter((s: any) => s.period === Period.MORNING);
            const afternoonSlots = daySlots.filter((s: any) => s.period === Period.AFTERNOON);

            return (
              <div className="space-y-3">
                {morningSlots.length > 0 && (
                  <div>
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">🌅 Matin</p>
                    {morningSlots.map((s: any) => (
                      <div key={s.id} className="flex items-center gap-2 py-1">
                        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${SLOT_DOT[s.type] ?? 'bg-gray-300'}`} />
                        <span className="text-gray-700 font-medium">{getLabel(s)}</span>
                        {s.location && s.location !== s.subType && (
                          <span className="text-gray-400 text-xs">— {s.location}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {afternoonSlots.length > 0 && (
                  <div>
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">🌇 Après-midi</p>
                    {afternoonSlots.map((s: any) => (
                      <div key={s.id} className="flex items-center gap-2 py-1">
                        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${SLOT_DOT[s.type] ?? 'bg-gray-300'}`} />
                        <span className="text-gray-700 font-medium">{getLabel(s)}</span>
                        {s.location && s.location !== s.subType && (
                          <span className="text-gray-400 text-xs">— {s.location}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
};

export default PersonalAgendaMonth;
