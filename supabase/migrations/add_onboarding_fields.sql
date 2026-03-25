-- Add onboarding fields to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS onboarding_complete boolean DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS genres text[] DEFAULT '{}';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS region text DEFAULT 'US';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS streaming_providers jsonb DEFAULT '[]';
-- streaming_providers shape: [{ id: number, name: string, logo_path: string }]
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS taste_profile text;
