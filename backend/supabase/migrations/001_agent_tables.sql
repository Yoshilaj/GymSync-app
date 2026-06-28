--Personality Table
'''
primary = userid <- references auth.users
'''
CREATE TABLE IF NOT EXISTS personalities (
  user_id                UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  preset_id              TEXT NOT NULL DEFAULT 'supportive'
                         CHECK (preset_id IN ('classic', 'supportive', 'energetic', 'custom')),
  custom_answers         JSONB,           -- reserved: post-MVP custom personality quiz
  system_prompt_override TEXT,            -- reserved: post-MVP compiled custom prompt
  updated_at             TIMESTAMPTZ DEFAULT now()
);

--Workout plans
'''
Stores the users training programs
plan_data shape mirrors the frontend WeeklyPlan TypeScript type.
 - create separate index : user_id, is_active <-- frequently used
'''
CREATE TABLE IF NOT EXISTS workout_plans (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  name       TEXT NOT NULL,
  plan_data  JSONB NOT NULL,
  is_active  BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS workout_plans_user_active_idx
  ON workout_plans (user_id, is_active);

--Live workout sessions
'''
 - One active row per user at any time.
 - plan_snapshot: copy of plan_data at session start — ensures consistency if the user edits their plan mid-workout.
 - chat_history:  last 20 turns [{role, content, ts}] — survives app restarts.
 - separate index : user_id, is_active 
'''
CREATE TABLE IF NOT EXISTS workout_sessions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  current_exercise TEXT,
  current_goal     INT,                     -- target reps for the current set
  rep_count        INT DEFAULT 0,
  is_active        BOOLEAN DEFAULT true,
  session_data     JSONB DEFAULT '{}',      -- {exercises:[{name, sets:[{reps,weight}]}]}
  plan_snapshot    JSONB,
  chat_history     JSONB DEFAULT '[]',
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS workout_sessions_user_active_idx
  ON workout_sessions (user_id, is_active);
