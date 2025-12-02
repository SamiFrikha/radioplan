
import { mockDb } from './mockDb';
import { supabaseDb } from './supabaseDb';
import { isSupabaseConfigured } from '../supabaseClient';

// DETECTION AUTOMATIQUE
// Si les clés sont présentes dans supabaseClient.ts, on active le mode Cloud.
const HAS_KEYS = isSupabaseConfigured();

// On force l'utilisation si les clés sont valides, sinon on reste en local
const USE_SUPABASE = HAS_KEYS;

if (!HAS_KEYS) {
    console.warn("⚠️ RADIO PLAN AI : Clés Supabase non détectées ou invalides. L'application tourne en mode Local (Mémoire).");
} else {
    console.log("✅ RADIO PLAN AI : Connexion Supabase active.");
}

// On exporte l'implémentation choisie. 
export const db = USE_SUPABASE ? supabaseDb : mockDb;

// Helper pour l'UI
export const isCloudMode = () => USE_SUPABASE;
