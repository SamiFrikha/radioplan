
import { ActivityDefinition, DayOfWeek, Doctor, Holiday, Period, ScheduleTemplateSlot, SlotType } from './types';

export const INITIAL_DOCTORS: Doctor[] = [
  { id: 'd1', name: 'Pr BELKACEMI', specialty: ['Senologie', 'Urologie'], color: 'bg-blue-100 text-blue-800', excludedDays: [], excludedActivities: [], excludedSlotTypes: [] },
  { id: 'd2', name: 'Dr TO', specialty: ['Dermato', 'Neuro-oncologie'], color: 'bg-green-100 text-green-800', excludedDays: [], excludedActivities: [], excludedSlotTypes: [] },
  { id: 'd3', name: 'Dr BOUKHOBZA', specialty: ['Digestif', 'Neuro-oncologie'], color: 'bg-purple-100 text-purple-800', excludedDays: [], excludedActivities: [], excludedSlotTypes: [] },
  { id: 'd4', name: 'Dr CHERIF', specialty: ['Digestif', 'Neuro-oncologie'], color: 'bg-yellow-100 text-yellow-800', excludedDays: [], excludedActivities: [], excludedSlotTypes: [] },
  { id: 'd5', name: 'Dr BENNASSI', specialty: ['Senologie', 'Vasculaire'], color: 'bg-red-100 text-red-800', excludedDays: [], excludedActivities: [], excludedSlotTypes: [] },
  { id: 'd6', name: 'Dr BELAIDI', specialty: ['Senologie'], color: 'bg-indigo-100 text-indigo-800', excludedDays: [], excludedActivities: [], excludedSlotTypes: [] },
  { id: 'd7', name: 'Dr RIDA', specialty: ['OS', 'Hepato'], color: 'bg-pink-100 text-pink-800', excludedDays: [], excludedActivities: [], excludedSlotTypes: [] },
  { id: 'd8', name: 'Dr CORAGGIO', specialty: ['OS', 'Hepato'], color: 'bg-orange-100 text-orange-800', excludedDays: [], excludedActivities: [], excludedSlotTypes: [] },
  { id: 'd9', name: 'Dr GRELLIER', specialty: ['Dermato', 'Pneumologie'], color: 'bg-teal-100 text-teal-800', excludedDays: [], excludedActivities: [], excludedSlotTypes: [] },
  { id: 'd10', name: 'Dr DEBBI', specialty: ['Dermato', 'Oncologie'], color: 'bg-cyan-100 text-cyan-800', excludedDays: [], excludedActivities: [], excludedSlotTypes: [] },
  { id: 'd11', name: 'Dr LASAR', specialty: ['OS', 'Digestif'], color: 'bg-muted text-text-base', excludedDays: [], excludedActivities: [], excludedSlotTypes: [] },
];

export const INITIAL_ACTIVITIES: ActivityDefinition[] = [
    { id: 'act_astreinte', name: 'Astreinte', granularity: 'HALF_DAY', allowDoubleBooking: false, color: 'bg-red-100 text-red-800', isSystem: true },
    { id: 'act_unity', name: 'UNITY', granularity: 'HALF_DAY', allowDoubleBooking: false, color: 'bg-orange-100 text-orange-800', isSystem: true },
    { id: 'act_workflow', name: 'Supervision Workflow', granularity: 'WEEKLY', allowDoubleBooking: true, color: 'bg-emerald-100 text-emerald-800', isSystem: true },
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

export const DEFAULT_TEMPLATE: ScheduleTemplateSlot[] = [
  // --- LUNDI (RCP Service) ---
  { id: 't_lundi_matin_rcp', day: DayOfWeek.MONDAY, period: Period.MORNING, location: 'Salle de Conférence', type: SlotType.RCP, defaultDoctorId: 'd1', subType: 'RCP SERVICE' },
  
  // Lundi Après-midi 
  { id: 't4', day: DayOfWeek.MONDAY, period: Period.AFTERNOON, location: 'Box 1', type: SlotType.CONSULTATION, defaultDoctorId: 'd2', subType: 'Consultation' },
  { id: 't5', day: DayOfWeek.MONDAY, period: Period.AFTERNOON, location: 'Box 2', type: SlotType.CONSULTATION, defaultDoctorId: 'd5', subType: 'Consultation' },
  { id: 't6', day: DayOfWeek.MONDAY, period: Period.AFTERNOON, location: 'Box 3', type: SlotType.CONSULTATION, defaultDoctorId: 'd3', subType: 'Consultation' },

  // --- MARDI ---
  { id: 't7', day: DayOfWeek.TUESDAY, period: Period.MORNING, location: 'Box 1', type: SlotType.CONSULTATION, defaultDoctorId: 'd1', subType: 'Consultation' },
  { id: 't8', day: DayOfWeek.TUESDAY, period: Period.MORNING, location: 'Box 2', type: SlotType.CONSULTATION, defaultDoctorId: 'd2', subType: 'Consultation' },
  { id: 't9', day: DayOfWeek.TUESDAY, period: Period.MORNING, location: 'Box 3', type: SlotType.CONSULTATION, defaultDoctorId: 'd6', subType: 'Consultation' },
  { id: 't10', day: DayOfWeek.TUESDAY, period: Period.AFTERNOON, location: 'Box 1', type: SlotType.CONSULTATION, defaultDoctorId: 'd1', subType: 'Consultation' },

  // --- MERCREDI ---
  { id: 't11', day: DayOfWeek.WEDNESDAY, period: Period.MORNING, location: 'Box 1', type: SlotType.CONSULTATION, defaultDoctorId: 'd1', subType: 'Consultation' },
  { id: 't12', day: DayOfWeek.WEDNESDAY, period: Period.MORNING, location: 'Box 2', type: SlotType.CONSULTATION, defaultDoctorId: 'd3', subType: 'Consultation' },
  { id: 't13', day: DayOfWeek.WEDNESDAY, period: Period.MORNING, location: 'Box 3', type: SlotType.CONSULTATION, defaultDoctorId: 'd4', subType: 'Consultation' },
  { id: 't14', day: DayOfWeek.WEDNESDAY, period: Period.AFTERNOON, location: 'Box 1', type: SlotType.CONSULTATION, defaultDoctorId: 'd4', subType: 'Consultation' },
  { id: 't15', day: DayOfWeek.WEDNESDAY, period: Period.AFTERNOON, location: 'Box 2', type: SlotType.CONSULTATION, defaultDoctorId: 'd7', subType: 'Consultation' },

  // --- JEUDI ---
  { id: 't16', day: DayOfWeek.THURSDAY, period: Period.MORNING, location: 'Box 1', type: SlotType.CONSULTATION, defaultDoctorId: 'd8', subType: 'Consultation' },
  { id: 't17', day: DayOfWeek.THURSDAY, period: Period.MORNING, location: 'Box 2', type: SlotType.CONSULTATION, defaultDoctorId: 'd10', subType: 'Consultation' },
  { id: 't18', day: DayOfWeek.THURSDAY, period: Period.AFTERNOON, location: 'Box 1', type: SlotType.CONSULTATION, defaultDoctorId: 'd9', subType: 'Consultation' },
  { id: 't19', day: DayOfWeek.THURSDAY, period: Period.AFTERNOON, location: 'Box 2', type: SlotType.CONSULTATION, defaultDoctorId: 'd5', subType: 'Consultation' },

  // --- VENDREDI ---
  { id: 't20', day: DayOfWeek.FRIDAY, period: Period.MORNING, location: 'Box 1', type: SlotType.CONSULTATION, defaultDoctorId: 'd7', subType: 'Consultation' },
  { id: 't21', day: DayOfWeek.FRIDAY, period: Period.MORNING, location: 'Box 2', type: SlotType.CONSULTATION, defaultDoctorId: 'd10', subType: 'Consultation' },
  { id: 't22', day: DayOfWeek.FRIDAY, period: Period.AFTERNOON, location: 'Box 1', type: SlotType.CONSULTATION, defaultDoctorId: 'd2', subType: 'Consultation' },
  { id: 't23', day: DayOfWeek.FRIDAY, period: Period.AFTERNOON, location: 'Box 2', type: SlotType.CONSULTATION, defaultDoctorId: 'd4', subType: 'Consultation' },
  { id: 't24', day: DayOfWeek.FRIDAY, period: Period.AFTERNOON, location: 'Box 3', type: SlotType.CONSULTATION, defaultDoctorId: 'd8', subType: 'Consultation' },
];
