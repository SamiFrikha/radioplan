-- Migration 20: Allow users to delete their own notifications
-- The initial migration (15) only had SELECT, INSERT, UPDATE policies.
-- Without DELETE, clearAll() is silently blocked by RLS, leaving
-- notifications in the database even after the user clicks "Vider".

CREATE POLICY "Users delete own notifications"
    ON public.notifications FOR DELETE
    USING (auth.uid() = user_id);
