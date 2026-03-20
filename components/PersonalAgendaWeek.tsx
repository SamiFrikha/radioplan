// components/PersonalAgendaWeek.tsx
import React, { useMemo, useContext } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { AppContext } from '../App';
import { useAuth } from '../context/AuthContext';
import { generateScheduleForWeek } from '../services/scheduleService';
import { DayOfWeek, Period, SlotType } from '../types';

interface Props {
  weekOffset: number;
  onOffsetChange: (offset: number) => void;
}

const DAY_ORDER = [DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY, DayOfWeek.THURSDAY, DayOfWeek.FRIDAY];
const PERIODS = [Period.MORNING, Period.AFTERNOON];

const TYPE_COLOR: Record<string, string> = {
  [SlotType.CONSULTATION]: 'bg-blue-100 text-blue-800 border-blue-200',
  [SlotType.RCP]:          'bg-green-100 text-green-800 border-green-200',
  [SlotType.ACTIVITY]:     'bg-orange-100 text-orange-800 border-orange-200',
  LEAVE:                   'bg-gray-100 text-gray-600 border-gray-200',
};

const PersonalAgendaWeek: React.FC<Props> = ({ weekOffset, onOffsetChange }) => {
  const {
    doctors, template, unavailabilities,
    activityDefinitions, rcpTypes, rcpAttendance, rcpExceptions,
  } = useContext(AppContext);

  const { profile } = useAuth();
  const doctorId = profile?.doctor_id;

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
    return generateScheduleForWeek(
      weekStart,
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
  }, [weekStart, template, unavailabilities, doctors, activityDefinitions, rcpTypes, rcpAttendance, rcpExceptions, doctorId]);

  const grid = useMemo(() => {
    const result: Record<string, Record<string, any[]>> = {};

    for (const day of DAY_ORDER) {
      result[day] = {};
      for (const period of PERIODS) {
        const d = new Date(weekStart);
        d.setDate(weekStart.getDate() + DAY_ORDER.indexOf(day));
        const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

        const onLeave = unavailabilities.some(u =>
          u.doctorId === doctorId &&
          dateStr >= u.startDate && dateStr <= u.endDate &&
          (!u.period || u.period === 'ALL_DAY' || u.period === period)
        );

        if (onLeave) {
          result[day][period] = [{ id: 'leave-' + dateStr + period, type: 'LEAVE', location: 'Congé / Indispo', date: dateStr }];
        } else {
          result[day][period] = schedule.filter(s =>
            s.day === day && s.period === period &&
            (s.assignedDoctorId === doctorId || s.secondaryDoctorIds?.includes(doctorId!))
          );
        }
      }
    }
    return result;
  }, [schedule, doctorId, unavailabilities, weekStart]);

  const weekLabel = (() => {
    const end = new Date(weekStart);
    end.setDate(weekStart.getDate() + 4);
    const fmt = (d: Date) => d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
    return `${fmt(weekStart)} — ${end.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}`;
  })();

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => onOffsetChange(weekOffset - 1)} className="p-1 hover:bg-gray-100 rounded-lg">
          <ChevronLeft size={18} />
        </button>
        <span className="text-sm font-medium text-gray-700">Semaine du {weekLabel}</span>
        <button onClick={() => onOffsetChange(weekOffset + 1)} className="p-1 hover:bg-gray-100 rounded-lg">
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="grid grid-cols-5 gap-2">
        {DAY_ORDER.map(day => (
          <div key={day}>
            <div className="text-xs font-semibold text-center text-gray-400 uppercase pb-1">
              {day.slice(0, 3)}
            </div>
            {PERIODS.map(period => (
              <div key={period} className="mb-1">
                <div className="text-xs text-gray-400 mb-0.5 text-center">
                  {period === Period.MORNING ? 'AM' : 'PM'}
                </div>
                {grid[day]?.[period]?.length === 0
                  ? <div className="h-12 rounded-lg border border-dashed border-gray-200 bg-gray-50" />
                  : (grid[day]?.[period] ?? []).map((slot: any) => (
                      <div key={slot.id}
                        className={`text-xs rounded-lg border px-1.5 py-1 mb-0.5 ${TYPE_COLOR[slot.type] ?? 'bg-gray-100'}`}>
                        <span className="font-medium truncate block">{slot.location}</span>
                        {slot.subType && <span className="opacity-70 truncate block">{slot.subType}</span>}
                      </div>
                    ))
                }
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

export default PersonalAgendaWeek;
