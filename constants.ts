
import { ActivityDefinition, DayOfWeek, Doctor, Holiday, Period, ScheduleTemplateSlot, SlotType } from './types';

// EMPTY INITIAL STATE FOR BACKEND READINESS
export const INITIAL_DOCTORS: Doctor[] = [];

// System defaults only
export const INITIAL_ACTIVITIES: ActivityDefinition[] = [
    { id: 'act_astreinte', name: 'Astreinte', granularity: 'HALF_DAY', allowDoubleBooking: false, color: 'bg-red-100 text-red-800', isSystem: true },
    { id: 'act_unity', name: 'UNITY', granularity: 'HALF_DAY', allowDoubleBooking: false, color: 'bg-orange-100 text-orange-800', isSystem: true },
];

// French Holidays (Simplified for 2025/2026)
export const FRENCH_HOLIDAYS: Holiday[] = [
    { date: '2025-01-01', name: 'Jour de l\'An' },
    { date: '2025-04-21', name: 'Lundi de Pâques' },
    { date: '2025-05-01', name: 'Fête du Travail' },
    { date: '2025-05-08', name: 'Victoire 1945' },
    { date: '2025-05-29', name: 'Ascension' },
    { date: '2025-06-09', name: 'Lundi de Pentecôte' },
    { date: '2025-07-14', name: 'Fête Nationale' },
    { date: '2025-08-15', name: 'Assomption' },
    { date: '2025-11-01', name: 'Toussaint' },
    { date: '2025-11-11', name: 'Armistice' },
    { date: '2025-12-25', name: 'Noël' },
];

export const DEFAULT_TEMPLATE: ScheduleTemplateSlot[] = [];
