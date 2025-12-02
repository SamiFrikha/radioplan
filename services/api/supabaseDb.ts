import { supabase } from '../supabaseClient';
import { Doctor } from '../../types';

// Mapping Helper: Convertit les snake_case de la BDD en camelCase pour le Front
// Added default values for all arrays and color to prevent null pointer exceptions
const mapProfileFromDb = (p: any): Doctor => ({
    id: p.id,
    name: p.name,
    email: p.email,
    role: p.role_id, // Mapping role_id -> role
    specialty: p.specialty || [],
    color: p.color || 'bg-slate-200 text-slate-800',
    tempsDeTravail: p.temps_de_travail || 1.0,
    excludedDays: p.excluded_days || [],
    excludedActivities: p.excluded_activities || [],
    excludedSlotTypes: p.excluded_slot_types || [],
    password: '', // On ne récupère jamais le hash, géré par Supabase Auth
    avatar: p.avatar_url
});

export const supabaseDb = {
    doctors: {
        getAll: async (): Promise<Doctor[]> => {
            const { data, error } = await supabase.from('profiles').select('*');
            if (error) {
                console.error("Supabase Error fetching doctors:", error);
                return [];
            }
            return data.map(mapProfileFromDb);
        },
        create: async (doc: Doctor): Promise<Doctor> => {
            // 1. Création User Auth (optionnel via fonction Edge) ou insertion directe Profil
            // Ici on insère directement dans profiles pour simplifier la migration
            const { data, error } = await supabase.from('profiles').insert([{
                id: doc.id, // Si UUID généré front, sinon laisser null
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
                color: doc.color || 'bg-slate-200 text-slate-800',
                temps_de_travail: doc.tempsDeTravail,
                excluded_days: doc.excludedDays || [],
                excluded_activities: doc.excludedActivities || [],
                excluded_slot_types: doc.excludedSlotTypes || []
            }).eq('id', doc.id).select().single();

            if (error) throw error;
            return mapProfileFromDb(data);
        },
        delete: async (id: string): Promise<void> => {
            const { error } = await supabase.from('profiles').delete().eq('id', id);
            if (error) throw error;
        }
    },
    
    // Gestionnaire générique pour les configurations JSON (Template, Règles, etc.)
    collection: (keyName: string) => ({
        get: async <T>(defaultVal: T): Promise<T> => {
            const { data, error } = await supabase
                .from('configurations')
                .select('data')
                .eq('key', keyName)
                .single();
            
            if (error || !data) {
                // Si pas de données, on retourne la valeur par défaut
                return defaultVal;
            }

            const content = data.data;
            
            // Détection du wrapper (Pattern { __wrapped: true, value: ... })
            // Cela permet de récupérer correctement les nulls et les primitifs
            if (content && typeof content === 'object' && !Array.isArray(content) && '__wrapped' in content) {
                return content.value as T;
            }
            
            // Rétro-compatibilité pour les anciennes données non wrappées (ex: Arrays directs)
            return content as T;
        },
        set: async <T>(data: T): Promise<void> => {
            // On enveloppe systématiquement les données.
            // Cela garantit que 'payload' est toujours un objet JSON valide, même si 'data' est null.
            // Cela évite l'erreur de contrainte NOT NULL sur la colonne jsonb.
            const payload = { __wrapped: true, value: data };

            const { error } = await supabase
                .from('configurations')
                .upsert({ 
                    key: keyName, 
                    data: payload, 
                    updated_at: new Date() 
                }, { onConflict: 'key' });
            
            if (error) {
                console.error(`Error saving ${keyName}:`, JSON.stringify(error, null, 2));
            }
        }
    }),

    importData: async (backupData: any) => {
        console.log("Importing via Supabase...", backupData);
        alert("L'importation via Supabase nécessite une fonction RPC backend. Fonctionnalité à venir.");
    }
};