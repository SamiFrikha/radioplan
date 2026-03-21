-- Migration 21: Fix duplicate unavailabilities
-- Root cause: TeamManagement.tsx was calling addUnavailability() after direct DB insert,
-- causing every admin-created absence to be inserted twice.

-- 1. Normalize NULL periods to 'ALL_DAY'
UPDATE public.unavailabilities SET period = 'ALL_DAY' WHERE period IS NULL;

-- 2. Make period NOT NULL with default (required for plain UNIQUE constraint)
ALTER TABLE public.unavailabilities
    ALTER COLUMN period SET DEFAULT 'ALL_DAY',
    ALTER COLUMN period SET NOT NULL;

-- 3. Remove duplicate unavailabilities, keeping the oldest (smallest created_at)
DELETE FROM public.unavailabilities
WHERE id NOT IN (
    SELECT DISTINCT ON (doctor_id, start_date, end_date, period)
        id
    FROM public.unavailabilities
    ORDER BY doctor_id, start_date, end_date, period, created_at ASC
);

-- 4. Add UNIQUE constraint to prevent future duplicates
CREATE UNIQUE INDEX IF NOT EXISTS unavailabilities_unique_entry
ON public.unavailabilities(doctor_id, start_date, end_date, period);
