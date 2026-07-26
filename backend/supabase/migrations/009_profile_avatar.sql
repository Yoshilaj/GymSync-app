-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 009_profile_avatar.sql — profile picture URL.                            ║
-- ║ Points at an object in the `avatars` Storage bucket (public URL). NULL   ║
-- ║ = use the initials avatar.                                               ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
