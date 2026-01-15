-- Migration: Add excluded_half_days column to doctors table
-- This enables granular half-day exclusions for recurring weekly absences
-- (e.g., Monday morning + Thursday afternoon)

-- Add the new column for granular half-day exclusions
-- Stored as JSONB array of objects: [{ "day": "Lundi", "period": "Matin" }, ...]
ALTER TABLE public.doctors 
ADD COLUMN IF NOT EXISTS excluded_half_days JSONB DEFAULT '[]'::jsonb;

-- Add comment for documentation
COMMENT ON COLUMN public.doctors.excluded_half_days IS 
  'Granular half-day exclusions for recurring weekly absences. Format: [{"day": "Lundi", "period": "Matin"}, ...]';

-- Note: The existing excluded_days column is kept for backward compatibility
-- The application will prioritize excluded_half_days if set, falling back to excluded_days
