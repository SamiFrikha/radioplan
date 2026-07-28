-- Migration: DECT phone numbers for doctors + global display preferences
--
-- 1. doctors.dect        : 5-digit internal DECT extension (nullable, no number = no display)
-- 2. app_settings.dect_display : where the number is prefixed before the doctor's name

-- ── 1. Doctor DECT number ────────────────────────────────────────────────
ALTER TABLE public.doctors
ADD COLUMN IF NOT EXISTS dect TEXT;

COMMENT ON COLUMN public.doctors.dect IS
  'Internal DECT phone extension. Exactly 5 digits, or NULL when the doctor has none.';

-- Empty strings are normalised to NULL so the CHECK below stays simple.
UPDATE public.doctors SET dect = NULL WHERE dect IS NOT NULL AND btrim(dect) = '';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'doctors_dect_format'
    ) THEN
        ALTER TABLE public.doctors
        ADD CONSTRAINT doctors_dect_format
        CHECK (dect IS NULL OR dect ~ '^[0-9]{5}$');
    END IF;
END $$;

-- ── 2. Global DECT display preferences ───────────────────────────────────
-- Shape: { "planningGlobal": bool, "planningGlobalPdf": bool,
--          "monPlanning": bool, "dashboard": bool,
--          "position": "before"|"after", "style": "brackets"|... }
-- Missing surface keys read as false, so the default '{}' means "display nowhere";
-- missing format keys fall back to before/brackets.
ALTER TABLE public.app_settings
ADD COLUMN IF NOT EXISTS dect_display JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.app_settings.dect_display IS
  'How and where the DECT number is shown next to a doctor name. Surface keys (absent = false): planningGlobal, planningGlobalPdf, monPlanning, dashboard. Format keys: position (before|after, default before), style (brackets|parentheses|plain|dot|dash|label|phone, default brackets).';

-- Existing singleton row predates the column and would hold NULL.
UPDATE public.app_settings SET dect_display = '{}'::jsonb WHERE dect_display IS NULL;

-- RLS: no new policies needed. Migration 26 already restricts writes on both
-- tables to admins, while all authenticated users keep read access.
