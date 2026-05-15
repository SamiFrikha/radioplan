-- Migration 25: corrections système notifications push
--
-- 1. Trigger notify_push_on_notification: ajoute NEW.type dans le payload
--    pour que send-push puisse vérifier les préférences utilisateur.
-- 2. Ajoute reminder_24h_sent_at / reminder_12h_sent_at sur rcp_auto_config
--    pour rendre les rappels idempotents (pas de doublons si le cron est légèrement décalé).
-- 3. Crée les jobs pg_cron pour rcp-auto-assign (toutes les 5 min) et
--    rcp-reminders (toutes les heures). Nécessite l'extension pg_cron.
--    Les functions sont déployées avec verify_jwt=false (config.toml) donc
--    aucune clé d'autorisation n'est nécessaire dans les appels HTTP.

-- Colonnes idempotence sur rcp_auto_config
ALTER TABLE public.rcp_auto_config
  ADD COLUMN IF NOT EXISTS reminder_24h_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_12h_sent_at timestamptz;

-- Trigger mis à jour: passe également NEW.type à send-push
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
      'type',    NEW.type,
      'title',   NEW.title,
      'body',    NEW.body,
      'data',    NEW.data
    )
  );
  RETURN NEW;
END;
$$;

-- pg_cron: vérifier les deadlines expirées toutes les 5 minutes
-- (rcp-auto-assign en mode checkPending)
SELECT cron.schedule(
  'rcp-check-pending',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://sbkwkqqrersznlqpihkg.supabase.co/functions/v1/rcp-auto-assign',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body    := '{"action": "checkPending"}'::jsonb
  );
  $$
);

-- pg_cron: envoyer les rappels RCP toutes les heures
SELECT cron.schedule(
  'rcp-reminders-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://sbkwkqqrersznlqpihkg.supabase.co/functions/v1/rcp-reminders',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body    := '{}'::jsonb
  );
  $$
);
