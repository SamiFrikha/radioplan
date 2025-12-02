
import { createClient } from '@supabase/supabase-js';

// --- CONFIGURATION SUPABASE ---
// Les clés ci-dessous sont utilisées si aucune variable d'environnement n'est détectée.
const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL || 'https://sbkwkqqrersznlqpihkg.supabase.co';
const SUPABASE_ANON_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNia3drcXFyZXJzem5scXBpaGtnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ2ODU0NzIsImV4cCI6MjA4MDI2MTQ3Mn0.xG8lmwRoSZq5Ehj9a6Apqlew5K4DenMOg8BtJOmn4Tc';

// Vérification basique de l'URL
const isValidUrl = (url: string) => {
    try { return Boolean(new URL(url)); } catch(e) { return false; }
};

const options = {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
    }
};

// Initialisation du client
// Si l'URL est invalide, on crée un client "bidon" pour éviter le crash au chargement, 
// mais l'application basculera en mode Mock grâce à isSupabaseConfigured()
export const supabase = isValidUrl(SUPABASE_URL) 
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, options)
    : createClient('https://placeholder.supabase.co', 'placeholder', options);

// Helper pour confirmer que la connexion est prête
export const isSupabaseConfigured = () => {
    // On vérifie juste qu'on a une URL valide et une clé qui n'est pas le mot 'placeholder'
    return isValidUrl(SUPABASE_URL) && SUPABASE_ANON_KEY.length > 20 && SUPABASE_ANON_KEY !== 'placeholder';
};
