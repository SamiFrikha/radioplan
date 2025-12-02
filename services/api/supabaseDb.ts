
import { supabase } from '../supabaseClient';
import { Doctor, Unavailability, ManualOverrides, RcpAttendance } from '../../types';

/* 
   === SUPABASE SQL SCHEMA ===
   Run this in your Supabase SQL Editor to ensure types match (UUID vs Text):

   create table if not exists public.unavailabilities (
     id uuid default gen_random_uuid() primary key,
     doctor_id uuid references public.profiles(id) on delete cascade,
     start_date text,
     end_date text,
     period text,
     reason text
   );

   create table if not exists public.assignments (
     slot_id text primary key,
     doctor_id uuid references public.profiles(id) on delete set null,
     is_closed boolean default false,
     updated_at timestamp with time zone default now()
   );

   create table if not exists public.rcp_attendance (
     id uuid default gen_random_uuid() primary key,
     slot_id text,
     doctor_id uuid references public.profiles(id) on delete cascade,
     status text,
     unique(slot_id, doctor_id)
   );

   create table if not exists public.configurations (
     key text primary key,
     data jsonb,
     updated_at timestamp with time zone default now()
   );

   alter publication supabase_realtime add table profiles, unavailabilities, assignments, rcp_attendance, configurations;
*/

// Mapping Helper: Snake_case DB -> CamelCase Frontend
const mapProfileFromDb = (p: any): Doctor => ({
    id: p.id,
    name: p.name,
    email: p.email,
    role: p.role_id, 
    specialty: p.specialty || [],
    color: p.color || 'bg-slate-200 text-slate-800',
    tempsDeTravail: p.temps_de_travail || 1.0,
    excludedDays: p.excluded_days || [],
    excludedActivities: p.excluded_activities || [],
    excludedSlotTypes: p.excluded_slot_types || [],
    password: '', 
    avatar: p.avatar_url
});

export const supabaseDb = {
    // --- DOCTORS (PROFILES) ---
    doctors: {
        getAll: async (): Promise<Doctor[]> => {
            const { data, error } = await supabase.from('profiles').select('*');
            if (error) {
                console.error("Error fetching doctors:", error);
                return [];
            }
            return data.map(mapProfileFromDb);
        },
        create: async (doc: Doctor): Promise<Doctor> => {
            // Direct Insert to DB. Context will update via Realtime.
            const { data, error } = await supabase.from('profiles').insert([{
                id: doc.id,
                email: doc.email,
                name: doc.name,
                role_id: doc.role,
                specialty: doc.specialty || [],
                color: doc.color || 'bg-slate-200 text-slate-800',
                temps_de_travail: doc.tempsDeTravail,
                excluded_days: doc.excludedDays || [],
                excluded_activities: doc.excludedActivities || [],
                excluded_slot_types: doc.excludedSlotTypes || []
            }]).select().single();

            if (error) throw error;
            return mapProfileFromDb(data);
        },
        update: async (doc: Doctor): Promise<Doctor> => {
            const { data, error } = await supabase.from('profiles').update({
                name: doc.name,
                role_id: doc.role,
                specialty: doc.specialty || [],
                color: doc.color,
                temps_de_travail: doc.tempsDeTravail,
                excluded_days: doc.excludedDays || [],
                excluded_activities: doc.excludedActivities || [],
                excluded_slot_types: doc.excludedSlotTypes || []
            }).eq('id', doc.id).select().single();

            if (error) throw error;
            return mapProfileFromDb(data);
        },
        delete: async (id: string): Promise<void> => {
            // Hard delete. Constraints should ideally handle cascade, 
            // but we ensure application level cleanup in service layer too.
            const { error } = await supabase.from('profiles').delete().eq('id', id);
            if (error) throw error;
        }
    },

    // --- UNAVAILABILITIES (Specific Table) ---
    unavailabilities: {
        getAll: async (): Promise<Unavailability[]> => {
            const { data, error } = await supabase.from('unavailabilities').select('*');
            if (error) return [];
            return data.map((u: any) => ({
                id: u.id,
                doctorId: u.doctor_id,
                startDate: u.start_date,
                endDate: u.end_date,
                period: u.period,
                reason: u.reason
            }));
        },
        create: async (u: Unavailability): Promise<void> => {
            const { error } = await supabase.from('unavailabilities').insert([{
                id: u.id,
                doctor_id: u.doctorId,
                start_date: u.startDate,
                end_date: u.endDate,
                period: u.period,
                reason: u.reason
            }]);
            if (error) throw error;
        },
        delete: async (id: string): Promise<void> => {
            const { error } = await supabase.from('unavailabilities').delete().eq('id', id);
            if (error) throw error;
        }
    },

    // --- ASSIGNMENTS (Schedule/Overrides Table) ---
    assignments: {
        getAll: async (): Promise<ManualOverrides> => {
            const { data, error } = await supabase.from('assignments').select('*');
            if (error) return {};
            const overrides: ManualOverrides = {};
            data.forEach((row: any) => {
                // If is_closed is true, map to special frontend token
                if (row.is_closed) {
                    overrides[row.slot_id] = '__CLOSED__';
                } else if (row.doctor_id) {
                    overrides[row.slot_id] = row.doctor_id;
                }
            });
            return overrides;
        },
        upsert: async (slotId: string, doctorId: string | null): Promise<void> => {
            if (!doctorId) {
                // Remove assignment (reset to Auto)
                const { error } = await supabase.from('assignments').delete().eq('slot_id', slotId);
                if (error) throw error;
            } else {
                // Check if it's the special "CLOSED" token
                const isClosed = doctorId === '__CLOSED__';
                const actualDoctorId = isClosed ? null : doctorId;

                // Upsert assignment
                const { error } = await supabase.from('assignments').upsert({
                    slot_id: slotId,
                    doctor_id: actualDoctorId,
                    is_closed: isClosed,
                    updated_at: new Date()
                }, { onConflict: 'slot_id' });
                if (error) throw error;
            }
        },
        deleteByDoctor: async (doctorId: string): Promise<void> => {
             // Removes all manual assignments for this doctor (resets slots to Auto)
             const { error } = await supabase.from('assignments').delete().eq('doctor_id', doctorId);
             if (error) throw error;
        }
    },

    // --- RCP ATTENDANCE (Specific Table) ---
    attendance: {
        getAll: async (): Promise<RcpAttendance> => {
            const { data, error } = await supabase.from('rcp_attendance').select('*');
            if (error) return {};
            const att: RcpAttendance = {};
            data.forEach((row: any) => {
                if (!att[row.slot_id]) att[row.slot_id] = {};
                att[row.slot_id][row.doctor_id] = row.status;
            });
            return att;
        },
        upsert: async (slotId: string, doctorId: string, status: 'PRESENT' | 'ABSENT'): Promise<void> => {
            // Using a unique composite key logic or deleting prior
            // We assume a composite unique key (slot_id, doctor_id) in DB
            const { error } = await supabase.from('rcp_attendance').upsert({
                slot_id: slotId,
                doctor_id: doctorId,
                status: status
            }, { onConflict: 'slot_id,doctor_id' }); // Requires unique constraint in SQL
            if (error) throw error;
        },
        remove: async (slotId: string, doctorId: string): Promise<void> => {
            const { error } = await supabase.from('rcp_attendance').delete()
                .eq('slot_id', slotId)
                .eq('doctor_id', doctorId);
            if (error) throw error;
        },
        deleteByDoctor: async (doctorId: string): Promise<void> => {
            const { error } = await supabase.from('rcp_attendance').delete().eq('doctor_id', doctorId);
            if (error) throw error;
        }
    },

    // --- CONFIGURATIONS (Legacy Key/Value store for non-transactional definitions) ---
    collection: (keyName: string) => ({
        get: async <T>(defaultVal: T): Promise<T> => {
            const { data, error } = await supabase
                .from('configurations')
                .select('data')
                .eq('key', keyName)
                .single();
            
            if (error || !data) return defaultVal;

            const content = data.data;
            if (content && typeof content === 'object' && !Array.isArray(content) && '__wrapped' in content) {
                return content.value as T;
            }
            return content as T;
        },
        set: async <T>(data: T): Promise<void> => {
            const payload = { __wrapped: true, value: data };
            const { error } = await supabase
                .from('configurations')
                .upsert({ 
                    key: keyName, 
                    data: payload, 
                    updated_at: new Date() 
                }, { onConflict: 'key' });
            
            if (error) console.error(`Error saving ${keyName}`, error);
        }
    }),
    
    // --- IMPORTATION CÔTÉ CLIENT (Sans Edge Function) ---
    importData: async (backupData: any) => {
        const { data } = backupData;
        if (!data) throw new Error("Fichier de sauvegarde invalide.");

        console.log("Starting Client-Side Import...");

        // 1. NETTOYAGE : Suppression des données existantes
        // On supprime d'abord les tables enfants (FK) puis les tables parents
        await supabase.from('rcp_attendance').delete().neq('id', '00000000-0000-0000-0000-000000000000'); // Delete All hack
        await supabase.from('assignments').delete().neq('slot_id', 'placeholder');
        await supabase.from('unavailabilities').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        // Suppression configurations sauf exception système
        await supabase.from('configurations').delete().neq('key', 'keep_alive');
        // Suppression profils
        await supabase.from('profiles').delete().neq('email', 'system@dummy.com');

        // 2. INSERTION : Profils (Médecins)
        if (data.doctors && data.doctors.length > 0) {
            const profilesPayload = data.doctors.map((doc: any) => ({
                id: doc.id,
                email: doc.email,
                name: doc.name,
                role_id: doc.role,
                specialty: doc.specialty || [],
                color: doc.color,
                temps_de_travail: doc.tempsDeTravail,
                excluded_days: doc.excludedDays || [],
                excluded_activities: doc.excludedActivities || [],
                excluded_slot_types: doc.excludedSlotTypes || [],
                avatar_url: doc.avatar
            }));
            const { error: profileErr } = await supabase.from('profiles').insert(profilesPayload);
            if (profileErr) throw new Error("Erreur import médecins: " + profileErr.message);
        }

        // 3. INSERTION : Configurations (JSONB)
        const configEntries = [
            { key: 'radioplan_template', value: data.template },
            { key: 'radioplan_rcpTypes', value: data.rcpTypes },
            { key: 'radioplan_postes', value: data.postes },
            { key: 'radioplan_activities', value: data.activityDefinitions },
            { key: 'radioplan_shiftHistory', value: data.shiftHistory },
            { key: 'radioplan_rcpExceptions', value: data.rcpExceptions },
            { key: 'radioplan_activitiesStartDate', value: data.activitiesStartDate },
            { key: 'radioplan_roles', value: data.roles }
        ];
        
        const validConfigs = configEntries
            .filter(c => c.value !== undefined)
            .map(c => ({
                key: c.key,
                data: { __wrapped: true, value: c.value },
                updated_at: new Date()
            }));

        if (validConfigs.length > 0) {
            const { error: configErr } = await supabase.from('configurations').insert(validConfigs);
            if (configErr) throw new Error("Erreur import configurations: " + configErr.message);
        }

        // 4. INSERTION : Tables Relationnelles
        // a) Unavailabilities
        if (data.unavailabilities && data.unavailabilities.length > 0) {
            const unavPayload = data.unavailabilities.map((u: any) => ({
                id: u.id,
                doctor_id: u.doctorId,
                start_date: u.startDate,
                end_date: u.endDate,
                period: u.period,
                reason: u.reason
            }));
            const { error: unavErr } = await supabase.from('unavailabilities').insert(unavPayload);
            if (unavErr) console.warn("Erreur import absences (possible FK manquant):", unavErr.message);
        }

        // b) Assignments (Transform Object -> Array)
        if (data.manualOverrides && Object.keys(data.manualOverrides).length > 0) {
            const assignmentsPayload = Object.entries(data.manualOverrides).map(([slotId, val]: [string, any]) => ({
                slot_id: slotId,
                doctor_id: val === '__CLOSED__' ? null : val,
                is_closed: val === '__CLOSED__',
                updated_at: new Date()
            }));
            const { error: assignErr } = await supabase.from('assignments').insert(assignmentsPayload);
            if (assignErr) console.warn("Erreur import affectations:", assignErr.message);
        }

        // c) Attendance (Transform Object -> Array)
        if (data.rcpAttendance && Object.keys(data.rcpAttendance).length > 0) {
            const attendancePayload: any[] = [];
            Object.entries(data.rcpAttendance).forEach(([slotId, docMap]: [string, any]) => {
                Object.entries(docMap).forEach(([docId, status]) => {
                    attendancePayload.push({
                        slot_id: slotId,
                        doctor_id: docId,
                        status: status
                    });
                });
            });
            if (attendancePayload.length > 0) {
                const { error: attErr } = await supabase.from('rcp_attendance').insert(attendancePayload);
                if (attErr) console.warn("Erreur import présences RCP:", attErr.message);
            }
        }

        return true;
    }
};
