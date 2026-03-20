-- Migration 19: pg_net push trigger + RLS security fix

-- Enable pg_net extension (available on all Supabase projects)
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Fix: migration 16 created an insecure policy that allowed any authenticated
-- user to read all push_subscriptions rows (USING (true)).
-- The service role bypasses RLS entirely, so no explicit policy is needed.
DROP POLICY IF EXISTS "Service role reads all subscriptions" ON public.push_subscriptions;

-- Trigger function: fires send-push edge function after each notification insert
-- send-push is deployed with verify_jwt=false so no Authorization header is needed
CREATE OR REPLACE FUNCTION notify_push_on_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM net.http_post(
    url     := 'https://sbkwkqqrersznlqpihkg.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body    := jsonb_build_object(
      'user_id', NEW.user_id::text,
      'title',   NEW.title,
      'body',    NEW.body,
      'data',    NEW.data
    )
  );
  RETURN NEW;
END;
$$;

-- Trigger: fires after each INSERT into notifications
-- FOR EACH ROW so each notification row triggers independently
CREATE TRIGGER push_on_notification_insert
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION notify_push_on_notification();
