-- Migration 24: Enable Supabase Realtime for the notifications table.
-- Without this, postgres_changes subscriptions on this table never fire —
-- the subscription callback is dead code and toasts/bell never update live.
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- REPLICA IDENTITY FULL is required so non-primary-key column filters
-- (e.g. user_id=eq.xxx) work correctly in Realtime subscriptions.
-- Without this, the WAL only exposes the PK, and the column filter silently
-- matches no rows or all rows instead of the intended ones.
ALTER TABLE notifications REPLICA IDENTITY FULL;
