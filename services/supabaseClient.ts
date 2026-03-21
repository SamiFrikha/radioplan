import { createClient } from '@supabase/supabase-js';

const sb_u = 'https://sbkwkqqrersznlqpihkg.supabase.co';
const sb_k = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNia3drcXFyZXJzem5scXBpaGtnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ2ODU0NzIsImV4cCI6MjA4MDI2MTQ3Mn0.xG8lmwRoSZq5Ehj9a6Apqlew5K4DenMOg8BtJOmn4Tc';

// Wrap fetch with a 15-second timeout so Supabase calls never hang indefinitely
// on poor mobile connections. Without this, Promise.all([...8 requests]) can
// block the entire app for 60+ seconds while the network is unresponsive.
const fetchWithTimeout = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), 15000);
  return fetch(input, { ...init, signal: controller.signal })
    .finally(() => clearTimeout(tid));
};

export const supabase = createClient(sb_u, sb_k, {
  global: { fetch: fetchWithTimeout },
});
