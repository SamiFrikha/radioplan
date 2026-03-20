-- Migration 16: push_subscriptions
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    endpoint    text NOT NULL,
    p256dh      text NOT NULL,
    auth        text NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE(user_id, endpoint)
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own subscriptions"
    ON public.push_subscriptions FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role reads all subscriptions"
    ON public.push_subscriptions FOR SELECT
    USING (true);
