-- Drop the unused nickname column from user_profiles
ALTER TABLE user_profiles DROP COLUMN IF EXISTS nickname;
