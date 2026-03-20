// components/PersonalAgendaMonth.tsx
import React, { useMemo, useContext, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { AppContext } from '../App';
import { useAuth } from '../context/AuthContext';
import { generateScheduleForWeek } from '../services/scheduleService';
import { SlotType } from '../types';

const DOT_COLOR: Record<string, string> = {
  [SlotType.CONSULTATION]: 'bg-blue-400',
  [SlotType.RCP]:          'bg-green-400',
  [SlotType.ACTIVITY]:     'bg-orange-400',
  LEAVE:                   'bg-gray-400',
};

const toKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

const PersonalAgendaMonth: React.FC = () => {
  const {
    doctors, template, unavailabilities,
    activityDefinitions, rcpTypes, rcpAttendance, rcpExceptions,
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
      const slots = generateScheduleForWeek(
        monday,
        template,
        unavailabilities,
        doctors,
        activityDefinitions,
        rcpTypes,
        false,
        {},
        rcpAttendance,
        rcpExceptions,
      );
      for (const slot of slots) {
        if (slot.assignedDoctorId !== doctorId && !slot.secondaryDoctorIds?.includes(doctorId)) continue;
        const key = slot.date;
        if (!result[key]) result[key] = [];
        result[key].push(slot);
      }
    }
    return result;
  }, [year, month, doctorId, template, unavailabilities, doctors, activityDefinitions, rcpTypes, rcpAttendance, rcpExceptions, weeks]);

  const monthLabel = new Date(year, month).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <button onClick={prevMonth} className="p-1 hover:bg-gray-100 rounded-lg"><ChevronLeft size={18} /></button>
        <span className="text-sm font-semibold text-gray-700 capitalize">{monthLabel}</span>
        <button onClick={nextMonth} className="p-1 hover:bg-gray-100 rounded-lg"><ChevronRight size={18} /></button>
      </div>

      <div className="grid grid-cols-7 mb-1">
        {['L','M','M','J','V','S','D'].map((d, i) => (
          <div key={i} className="text-xs text-center text-gray-400 font-medium py-1">{d}</div>
        ))}
      </div>

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
          const dotTypes = [...new Set([...(onLeave ? ['LEAVE'] : []), ...slots.map((s: any) => s.type)])].slice(0, 3);

          return (
            <div key={i}
              onClick={() => setSelectedDate(isSelected ? null : key)}
              className={`min-h-[52px] rounded-lg p-1 cursor-pointer transition-colors
                ${isCurrentMonth ? 'bg-white hover:bg-gray-50' : 'bg-gray-50 opacity-40'}
                ${isToday ? 'ring-2 ring-blue-400' : ''}
                ${isSelected ? 'ring-2 ring-indigo-400 bg-indigo-50' : ''}
              `}>
              <div className={`text-xs text-center mb-1 ${isToday ? 'font-bold text-blue-600' : 'text-gray-600'}`}>
                {date.getDate()}
              </div>
              <div className="flex flex-wrap gap-0.5 justify-center">
                {dotTypes.map((type, j) => (
                  <span key={j} className={`w-1.5 h-1.5 rounded-full ${DOT_COLOR[type as string] ?? 'bg-gray-300'}`} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {selectedDate && (
        <div className="mt-3 p-3 bg-gray-50 rounded-xl border border-gray-200 text-sm">
          <p className="font-semibold text-gray-700 mb-2 capitalize">
            {new Date(selectedDate + 'T12:00:00').toLocaleDateString('fr-FR', {
              weekday: 'long', day: '2-digit', month: 'long'
            })}
          </p>
          {(() => {
            const daySlots = scheduleByDate[selectedDate] ?? [];
            const onLeave = unavailabilities.some(u =>
              u.doctorId === doctorId && selectedDate >= u.startDate && selectedDate <= u.endDate
            );
            if (onLeave) return <p className="text-gray-500">Congé / Indisponibilité</p>;
            if (daySlots.length === 0) return <p className="text-gray-400">Aucune activité</p>;
            return daySlots.map((s: any) => (
              <div key={s.id} className="flex items-center gap-2 py-1">
                <span className={`w-2 h-2 rounded-full shrink-0 ${DOT_COLOR[s.type] ?? 'bg-gray-300'}`} />
                <span className="text-gray-700">{s.location}</span>
                {s.subType && <span className="text-gray-400">— {s.subType}</span>}
                <span className="text-gray-400 text-xs ml-auto">{s.period}</span>
              </div>
            ));
          })()}
        </div>
      )}
    </div>
  );
};

export default PersonalAgendaMonth;
