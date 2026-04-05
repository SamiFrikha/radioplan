-- 22_add_ui_prefs_to_profiles.sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ui_prefs JSONB DEFAULT '{}';
