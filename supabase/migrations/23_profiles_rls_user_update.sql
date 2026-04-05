-- Allow authenticated users to update their own profile row
-- Needed for ui_prefs persistence (planning density, etc.)
CREATE POLICY "Users can update own profile"
ON profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);
