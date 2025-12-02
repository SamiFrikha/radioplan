
export enum SlotType {
  CONSULTATION = 'Consultation',
  RCP = 'RCP',
  MACHINE = 'Machine', 
  ACTIVITY = 'Activity', 
  OTHER = 'Other'
}

export enum Period {
  MORNING = 'Matin',
  AFTERNOON = 'Après-midi'
}

export enum DayOfWeek {
  MONDAY = 'Lundi',
  TUESDAY = 'Mardi',
  WEDNESDAY = 'Mercredi',
  THURSDAY = 'Jeudi',
  FRIDAY = 'Vendredi'
}

// --- SECURITY & BACKEND MODELS ---

export type UserRole = 'ADMIN' | 'DOCTOR' | 'VIEWER' | string; // Flexible roles

export interface PermissionItem {
    key: string;
    label: string;
    description: string;
}

export interface RoleDefinition {
    id: string;
    name: string;
    isSystem?: boolean; // Cannot be deleted
    permissions: string[]; // List of permission keys
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  password?: string; // New Password Field
  avatar?: string;
  lastLogin?: string;
}

export interface Doctor extends UserProfile {
  specialty: string[];
  color: string;
  // Business Logic Data
  tempsDeTravail: number; // 1.0, 0.8, 0.6
  excludedDays: DayOfWeek[]; 
  excludedActivities: string[]; 
  excludedSlotTypes?: SlotType[];
  // Future DB Relations (IDs only in frontend usually, but keeping full obj for now)
  hospitalId?: string;
}

// --- BUSINESS MODELS ---

export interface Unavailability {
  id: string;
  doctorId: string;
  startDate: string; // ISO string YYYY-MM-DD
  endDate: string;   // ISO string YYYY-MM-DD
  period?: 'ALL_DAY' | Period; 
  reason: string;
}

export interface ActivityDefinition {
  id: string;
  name: string;
  granularity: 'HALF_DAY' | 'WEEKLY'; 
  allowDoubleBooking: boolean; 
  color: string;
  isSystem?: boolean; 
}

export interface RcpManualInstance {
    id: string;
    date: string; // ISO YYYY-MM-DD
    time: string; // HH:MM
    doctorIds: string[]; 
    backupDoctorId?: string | null; 
}

export interface RcpDefinition {
    id: string;
    name: string;
    frequency: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'MANUAL'; 
    weekParity?: 'ODD' | 'EVEN'; 
    monthlyWeekNumber?: number; 
    manualInstances?: RcpManualInstance[]; 
    manualDates?: string[]; 
}

export interface ScheduleTemplateSlot {
  id: string;
  day: DayOfWeek;
  period: Period;
  time?: string;
  location: string;
  type: SlotType;
  defaultDoctorId: string | null;
  secondaryDoctorIds?: string[]; 
  doctorIds?: string[]; 
  backupDoctorId?: string | null; 
  subType?: string;
  isRequired?: boolean;
  isBlocking?: boolean; 
  frequency?: 'WEEKLY' | 'BIWEEKLY';
}

export interface ScheduleSlot {
  id: string;
  date: string;
  day: DayOfWeek;
  period: Period; 
  time?: string; 
  location: string; 
  type: SlotType;
  assignedDoctorId: string | null; 
  secondaryDoctorIds?: string[]; 
  backupDoctorId?: string | null; 
  subType?: string; 
  isGenerated?: boolean;
  activityId?: string; 
  isLocked?: boolean; 
  isBlocking?: boolean; 
  isClosed?: boolean; 
  isUnconfirmed?: boolean; 
}

export interface Conflict {
  id: string;
  slotId: string;
  doctorId: string;
  type: 'DOUBLE_BOOKING' | 'UNAVAILABLE' | 'COMPETENCE_MISMATCH';
  description: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface ReplacementSuggestion {
  originalDoctorId: string;
  suggestedDoctorId: string;
  reasoning: string;
  score: number;
}

export interface Holiday {
    date: string; // YYYY-MM-DD
    name: string;
}

export type ShiftHistory = Record<string, Record<string, number>>;
export type ManualOverrides = Record<string, string>;
export type RcpStatus = 'PRESENT' | 'ABSENT';
export type RcpAttendance = Record<string, Record<string, RcpStatus>>;

export interface RcpException {
    rcpTemplateId: string;
    originalDate: string; 
    newDate?: string; 
    newPeriod?: Period; 
    isCancelled?: boolean;
    newTime?: string; 
    customDoctorIds?: string[]; 
}

// Global Config Object (for Admin Panel)
export interface GlobalConfiguration {
    showWeekends: boolean;
    autoDistribute: boolean;
    weights: {
        unity: number;
        astreinte: number;
    }
}

export interface GlobalBackupData {
    metadata: {
        version: string;
        appName: string;
        exportDate: string;
    };
    data: {
        doctors: Doctor[];
        template: ScheduleTemplateSlot[];
        rcpTypes: RcpDefinition[];
        postes: string[];
        activityDefinitions: ActivityDefinition[];
        unavailabilities: Unavailability[];
        shiftHistory: ShiftHistory;
        manualOverrides: ManualOverrides;
        rcpAttendance: RcpAttendance;
        rcpExceptions: RcpException[];
        activitiesStartDate?: string | null; 
        roles?: RoleDefinition[];
    }
}

// --- CONTEXT TYPE ---
export interface AppContextType {
  // Auth
  user: Doctor | null;
  isLoading: boolean;
  login: (email: string, password?: string) => Promise<void>;
  logout: () => void;
  hasPermission: (permission: string) => boolean;
  isCloudMode: boolean; // Indicates if connected to Supabase

  // Roles & Permissions (New)
  roles: RoleDefinition[];
  updateRole: (role: RoleDefinition) => void;
  addRole: (name: string) => Promise<void>;
  removeRole: (id: string) => Promise<void>;

  // Data
  doctors: Doctor[];
  addDoctor: (d: Doctor) => Promise<void>;
  updateDoctor: (d: Doctor) => Promise<void>;
  removeDoctor: (id: string) => Promise<void>; 
  
  currentUser: Doctor | null; // This is the "Selected Profile" in UI, distinct from Logged User
  setCurrentUser: (d: Doctor | null) => void;

  schedule: ScheduleSlot[]; 
  template: ScheduleTemplateSlot[];
  unavailabilities: Unavailability[];
  conflicts: Conflict[];
  rcpTypes: RcpDefinition[];
  postes: string[]; 
  addPoste: (name: string) => void;
  removePoste: (name: string) => void; 
  activityDefinitions: ActivityDefinition[];
  addActivityDefinition: (a: ActivityDefinition) => void;
  updateSchedule: (newSchedule: ScheduleSlot[]) => void;
  updateTemplate: (newTemplate: ScheduleTemplateSlot[]) => void;
  addUnavailability: (u: Unavailability) => void;
  removeUnavailability: (id: string) => void;
  
  addRcpType: (name: string) => void;
  updateRcpDefinition: (def: RcpDefinition) => void;
  removeRcpType: (id: string) => void;
  renameRcpType: (oldName: string, newName: string) => void;
  
  shiftHistory: ShiftHistory; 
  manualOverrides: ManualOverrides;
  setManualOverrides: (overrides: ManualOverrides) => void;
  
  importConfiguration: (data: any) => void;
  
  rcpAttendance: RcpAttendance; 
  setRcpAttendance: (att: RcpAttendance) => void; 
  rcpExceptions: RcpException[]; 
  addRcpException: (ex: RcpException) => void; 
  removeRcpException: (templateId: string, originalDate: string) => void; 
  
  activitiesStartDate: string | null; 
  setActivitiesStartDate: (date: string | null) => void; 
}
