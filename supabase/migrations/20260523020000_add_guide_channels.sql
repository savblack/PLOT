-- Add guide_channels to profiles: separate from streaming_providers,
-- controls which channels appear in the Guide view.
-- shape: [{ id: number, name: string, logo_path: string }]
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS guide_channels jsonb DEFAULT '[]';
