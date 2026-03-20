-- Migration 18: rcp_auto_config
CREATE TABLE IF NOT EXISTS public.rcp_auto_config (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    week_start_date date NOT NULL UNIQUE,
    deadline_at     timestamptz NOT NULL,
    executed_at     timestamptz,
    created_by      uuid REFERENCES public.profiles(id),
    created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.rcp_auto_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users read config"
    ON public.rcp_auto_config FOR SELECT
    USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins manage config"
    ON public.rcp_auto_config FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());
