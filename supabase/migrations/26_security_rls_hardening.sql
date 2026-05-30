-- 26_security_rls_hardening.sql
-- Closes a critical privilege-escalation hole and tightens over-permissive write
-- policies discovered during the full-app security sweep.
--
-- FINDINGS FIXED:
--  1. CRITICAL — profiles: the "Users can update own profile" policy (migration 23,
--     added for ui_prefs persistence) lets a user update ANY column of their own
--     row, including role / role_id. Any authenticated user could self-promote to
--     Admin. RLS row policies cannot compare OLD vs NEW columns, so we guard the
--     role columns with a BEFORE UPDATE trigger instead. Legitimate ui_prefs /
--     notification_preferences updates keep working.
--  2. HIGH — doctors & app_settings: permissive "authenticated => true" write
--     policies coexisted with admin-only policies. Because RLS OR-combines
--     permissive policies, the loose ones won: any logged-in user could delete the
--     whole doctor roster or overwrite the schedule config. We drop the loose write
--     policies; admins (and the service role) retain full management; everyone
--     keeps read access.
--  3. LOW — pin search_path on SECURITY DEFINER helper functions (advisor warning).

-- ─── 1. CRITICAL: block non-admin role changes on profiles ───────────────────
CREATE OR REPLACE FUNCTION public.prevent_profile_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Backend/service-role contexts have no end-user JWT (auth.uid() IS NULL):
  -- the admin-create-user Edge Function legitimately sets roles this way.
  -- Admins may also change roles. Everyone else may NOT touch role/role_id.
  IF auth.uid() IS NULL OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.role_id IS DISTINCT FROM OLD.role_id
     OR NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Permission refusée : seuls les administrateurs peuvent modifier le rôle.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_profile_role_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_profile_role_escalation
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_profile_role_escalation();

-- ─── 2. HIGH: remove over-permissive write policies (admins only) ─────────────
-- doctors: drop the blanket authenticated write policies.
DROP POLICY IF EXISTS "Allow authenticated users to insert doctors" ON public.doctors;
DROP POLICY IF EXISTS "Allow authenticated users to update doctors" ON public.doctors;
DROP POLICY IF EXISTS "Allow authenticated users to delete doctors" ON public.doctors;
-- (Read policies "Doctors are viewable by everyone" / "Allow authenticated users
--  to view doctors" remain. Admin management via "Admins can manage doctors" and
--  service-role access remain.)

-- app_settings: drop blanket authenticated writes, add admin-only management.
DROP POLICY IF EXISTS "Allow insert access to authenticated users" ON public.app_settings;
DROP POLICY IF EXISTS "Allow update access to authenticated users" ON public.app_settings;

DROP POLICY IF EXISTS "Admins manage app_settings" ON public.app_settings;
CREATE POLICY "Admins manage app_settings"
ON public.app_settings
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());
-- (Read policy "Allow read access to authenticated users" remains: all users can
--  still load the schedule config; only admins can modify it.)

-- ─── 3. LOW: pin search_path on SECURITY DEFINER helpers (hardening) ──────────
ALTER FUNCTION public.is_admin() SET search_path = public;
ALTER FUNCTION public.is_doctor() SET search_path = public;
ALTER FUNCTION public.notify_push_on_notification() SET search_path = public;
