-- Migration 15: notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    type        text NOT NULL,
    -- Types: RCP_REMINDER_24H, RCP_REMINDER_12H, RCP_AUTO_ASSIGNED,
    --        RCP_SLOT_FILLED, RCP_UNASSIGNED_ALERT,
    --        REPLACEMENT_REQUEST, REPLACEMENT_ACCEPTED, REPLACEMENT_REJECTED
    title       text NOT NULL,
    body        text NOT NULL,
    data        jsonb DEFAULT '{}'::jsonb,
    read        boolean NOT NULL DEFAULT false,
    created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own notifications"
    ON public.notifications FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Service role inserts notifications"
    ON public.notifications FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Users update own notifications"
    ON public.notifications FOR UPDATE
    USING (auth.uid() = user_id);

CREATE INDEX idx_notifications_user_unread
    ON public.notifications(user_id, read, created_at DESC);
