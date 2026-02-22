-- Activity Logs Table
-- Tracks all changes made in the Activities section (astreinte, unity, workflow assignments)

CREATE TABLE IF NOT EXISTS public.activity_logs (
    id text PRIMARY KEY,
    timestamp timestamptz NOT NULL DEFAULT now(),
    user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    user_email text NOT NULL,
    user_name text NOT NULL,
    action text NOT NULL,           -- MANUAL_ASSIGN, AUTO_RECALCULATE, VALIDATE_WEEK, UNVALIDATE_WEEK, CLEAR_CHOICES, WEEKLY_ASSIGN, CREATE_ACTIVITY, DELETE_ACTIVITY, EDIT_ACTIVITY
    description text NOT NULL,      -- Human-readable description
    week_key text NOT NULL,         -- Week identifier (YYYY-MM-DD of Monday)
    activity_name text,             -- Name of the activity involved
    doctor_name text,               -- Name of the doctor involved
    details text,                   -- Additional JSON details
    created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- Everyone can read logs
CREATE POLICY "Activity logs are viewable by everyone"
    ON public.activity_logs FOR SELECT
    USING (true);

-- Authenticated users can insert logs
CREATE POLICY "Authenticated users can insert logs"
    ON public.activity_logs FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

-- Only admins can delete logs
CREATE POLICY "Only admins can delete logs"
    ON public.activity_logs FOR DELETE
    USING (public.is_admin());

-- Index for fast week-based queries
CREATE INDEX IF NOT EXISTS idx_activity_logs_week_key ON public.activity_logs(week_key);
CREATE INDEX IF NOT EXISTS idx_activity_logs_timestamp ON public.activity_logs(timestamp DESC);
