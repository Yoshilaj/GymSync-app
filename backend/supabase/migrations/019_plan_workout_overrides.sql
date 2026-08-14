-- ─────────────────────────────────────────────────────────────────────────────
-- 019: plan_workout_overrides — edit ONE date without rewriting every week
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY / THE BUG THIS FIXES
-- The plan is a weekly-recurring template: every Monday on the calendar is a
-- view of the same plan_workouts row, so adding an exercise to "Upper A" from
-- Aug 24 changed Upper A everywhere, past and future. This table is the
-- calendar-app "edit this occurrence" layer: a row here is the COMPLETE
-- exercise list for one (workout, date); dates without a row keep rendering
-- the template. The template itself is only changed by plan generation.
--
-- `exercises` holds tree-shaped exercise dicts (same keys build_plan_tree
-- emits for plan_exercises rows: id, exercise_id, exercise_name, target_sets,
-- note, sort_order — target_sets in the camelCase PlannedSet shape, kg).
--
-- Idempotent and re-runnable, per house rules.
begin;

CREATE TABLE IF NOT EXISTS plan_workout_overrides (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  plan_workout_id UUID NOT NULL REFERENCES plan_workouts ON DELETE CASCADE,
  day             DATE NOT NULL,
  exercises       JSONB NOT NULL DEFAULT '[]',
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE (plan_workout_id, day)
);

CREATE INDEX IF NOT EXISTS plan_workout_overrides_user_day_idx
  ON plan_workout_overrides (user_id, day);

ALTER TABLE plan_workout_overrides ENABLE ROW LEVEL SECURITY;

commit;
