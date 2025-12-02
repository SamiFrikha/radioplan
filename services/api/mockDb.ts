import { Doctor, GlobalBackupData, ScheduleTemplateSlot, ActivityDefinition, RcpDefinition, Unavailability, ManualOverrides, ShiftHistory, RcpAttendance, RcpException, UserRole, RoleDefinition } from "../../types";
import { INITIAL_DOCTORS, DEFAULT_TEMPLATE, INITIAL_ACTIVITIES } from "../../constants";
import { PERMISSION_KEYS } from "../../config/permissions";

// Helper to simulate network delay
export const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const DB_KEYS = {
    DOCTORS: 'radioplan_doctors',
    TEMPLATE: 'radioplan_template',
    ACTIVITIES: 'radioplan_activities',
    RCP_TYPES: 'radioplan_rcpTypes',
    UNAVAILABILITIES: 'radioplan_unavailabilities',
    OVERRIDES: 'radioplan_overrides',
    HISTORY: 'radioplan_shiftHistory',
    ATTENDANCE: 'radioplan_rcpAttendance',
    EXCEPTIONS: 'radioplan_rcpExceptions',
    POSTES: 'radioplan_postes',
    START_DATE: 'radioplan_activitiesStartDate',
    ROLES: 'radioplan_roles'
};

const DEFAULT_ROLES: RoleDefinition[] = [
    {
        id: 'ADMIN',
        name: 'Administrateur',
        isSystem: true,
        permissions: Object.values(PERMISSION_KEYS) // All permissions
    }
];

// Internal Helper to read/write from localStorage (The "Disk")
const read = <T>(key: string, defaultVal: T): T => {
    try {
        const item = localStorage.getItem(key);
        if (item) {
            const parsed = JSON.parse(item);
            if (parsed !== null && parsed !== undefined) return parsed;
        }
    } catch (e) {
        console.error(`DB Read Error for ${key}`, e);
    }
    return defaultVal;
};

const write = (key: string, data: any) => {
    localStorage.setItem(key, JSON.stringify(data));
};

// --- DATABASE INTERFACE ---
export const mockDb = {
    doctors: {
        getAll: async (): Promise<Doctor[]> => {
            await delay(200);
            const docs = read<Doctor[]>(DB_KEYS.DOCTORS, INITIAL_DOCTORS);
            // Ensure data integrity (roles, emails, arrays, colors) for legacy/null data
            return docs.map(d => ({
                ...d,
                role: d.role || 'DOCTOR',
                email: d.email || `${d.name.toLowerCase().replace(/\s/g, '.')}@hopital.fr`,
                tempsDeTravail: d.tempsDeTravail || 1.0,
                specialty: d.specialty || [],
                excludedDays: d.excludedDays || [],
                excludedActivities: d.excludedActivities || [],
                excludedSlotTypes: d.excludedSlotTypes || [],
                color: d.color || 'bg-slate-200 text-slate-800' // Prevent null color
            }));
        },
        create: async (doc: Doctor): Promise<Doctor> => {
            await delay(300);
            const current = read<Doctor[]>(DB_KEYS.DOCTORS, []);
            const newDoc = { 
                ...doc, 
                id: doc.id || `doc_${Date.now()}`,
                specialty: doc.specialty || [],
                excludedDays: doc.excludedDays || [],
                excludedActivities: doc.excludedActivities || [],
                excludedSlotTypes: doc.excludedSlotTypes || [],
                color: doc.color || 'bg-slate-200 text-slate-800'
            };
            write(DB_KEYS.DOCTORS, [...current, newDoc]);
            return newDoc;
        },
        update: async (doc: Doctor): Promise<Doctor> => {
            await delay(200);
            const current = read<Doctor[]>(DB_KEYS.DOCTORS, []);
            const safeDoc = {
                ...doc,
                specialty: doc.specialty || [],
                excludedDays: doc.excludedDays || [],
                excludedActivities: doc.excludedActivities || [],
                excludedSlotTypes: doc.excludedSlotTypes || [],
                color: doc.color || 'bg-slate-200 text-slate-800'
            };
            write(DB_KEYS.DOCTORS, current.map(d => d.id === safeDoc.id ? safeDoc : d));
            return safeDoc;
        },
        delete: async (id: string): Promise<void> => {
            await delay(300);
            const current = read<Doctor[]>(DB_KEYS.DOCTORS, []);
            write(DB_KEYS.DOCTORS, current.filter(d => d.id !== id));
        }
    },
    // Generic getter for other collections
    collection: (keyName: keyof typeof DB_KEYS) => ({
        get: async <T>(defaultVal: T): Promise<T> => {
            await delay(100);
            if (keyName === 'ROLES') {
                 // For roles, we also need to sanitize permissions array if it comes from legacy storage
                 const roles = read<RoleDefinition[]>(DB_KEYS.ROLES, DEFAULT_ROLES);
                 return roles.map(r => ({
                     ...r,
                     permissions: r.permissions || []
                 })) as unknown as T;
            }
            return read<T>(DB_KEYS[keyName], defaultVal);
        },
        set: async <T>(data: T): Promise<void> => {
            await delay(100);
            write(DB_KEYS[keyName], data);
        }
    }),
    
    // Import Logic
    importData: async (backupData: GlobalBackupData) => {
        await delay(500);
        if (backupData.data) {
            write(DB_KEYS.DOCTORS, backupData.data.doctors);
            write(DB_KEYS.TEMPLATE, backupData.data.template);
            write(DB_KEYS.RCP_TYPES, backupData.data.rcpTypes);
            write(DB_KEYS.POSTES, backupData.data.postes);
            write(DB_KEYS.ACTIVITIES, backupData.data.activityDefinitions);
            write(DB_KEYS.UNAVAILABILITIES, backupData.data.unavailabilities);
            write(DB_KEYS.HISTORY, backupData.data.shiftHistory);
            write(DB_KEYS.OVERRIDES, backupData.data.manualOverrides);
            write(DB_KEYS.ATTENDANCE, backupData.data.rcpAttendance);
            write(DB_KEYS.EXCEPTIONS, backupData.data.rcpExceptions);
            write(DB_KEYS.START_DATE, backupData.data.activitiesStartDate);
            if (backupData.data.roles) {
                write(DB_KEYS.ROLES, backupData.data.roles);
            }
        }
    }
};