
import { Doctor } from "../../types";
import { db } from "./index";
import { supabase } from "../supabaseClient";

// Helper to check mode
const USE_SUPABASE = process.env.REACT_APP_USE_SUPABASE === 'true';

export const authService = {
    login: async (email: string, password?: string): Promise<Doctor> => {
        
        // --- SYSTEM ADMIN BACKDOOR (Always active for safety) ---
        if (email === 'admin@system.com' && password === 'admin123') {
            return {
                id: 'admin_master',
                name: 'Administrateur Système',
                email: 'admin@system.com',
                role: 'ADMIN',
                color: 'bg-slate-800 text-white',
                specialty: [],
                excludedDays: [],
                excludedActivities: [],
                tempsDeTravail: 1.0,
                password: 'admin'
            } as Doctor;
        }

        if (USE_SUPABASE) {
            // --- SUPABASE AUTH FLOW ---
            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password: password || ''
            });

            if (error) throw new Error(error.message);
            if (!data.user) throw new Error("Erreur inconnue lors de la connexion");

            // Fetch Profile Linked to Auth User
            // Note: In a real app, 'id' in profiles should match auth.users.id
            // For now, we query by email to link them
            const doctors = await db.doctors.getAll();
            const userProfile = doctors.find(d => d.email.toLowerCase() === email.toLowerCase());
            
            if (!userProfile) throw new Error("Profil introuvable pour cet utilisateur.");
            
            return userProfile;

        } else {
            // --- MOCK AUTH FLOW ---
            // Simulate network delay
            await new Promise(r => setTimeout(r, 500));
            const doctors = await db.doctors.getAll();
            const user = doctors.find(d => d.email.toLowerCase() === email.toLowerCase() || d.name.toLowerCase() === email.toLowerCase());
            
            if (!user) {
                throw new Error("Utilisateur non trouvé");
            }
            if (user.password && user.password !== password) {
                throw new Error("Mot de passe incorrect");
            }
            return user;
        }
    },

    me: async (): Promise<Doctor | null> => {
        if (USE_SUPABASE) {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.user) return null;
            
            const doctors = await db.doctors.getAll();
            return doctors.find(d => d.email === session.user.email) || null;
        } else {
            const stored = localStorage.getItem('radioplan_auth_token');
            if (stored) {
                try {
                    return JSON.parse(stored);
                } catch {
                    return null;
                }
            }
            return null;
        }
    },

    logout: async () => {
        if (USE_SUPABASE) {
            await supabase.auth.signOut();
        }
        localStorage.removeItem('radioplan_auth_token');
    }
};
