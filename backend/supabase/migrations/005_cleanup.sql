-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 005_cleanup.sql — Drop legacy columns now replaced by normalized tables. ║
-- ║                                                                          ║
-- ║ DO NOT APPLY until the agent/DB refactor lands. These columns are still  ║
-- ║     read by the current code; dropping them first breaks the backend:    ║
-- ║       • workout_plans.plan_data   → read in routers/session.py           ║
-- ║       • workout_sessions.session_data / rep_count / current_goal         ║
-- ║         → read in agents/tools.py and agents/core.py                     ║
-- ║                                                                          ║
-- ║ Apply ONLY after:                                                        ║
-- ║  1.tools.py log_set/add_exercise/get_current_session_state read & write  ║
-- ║    completed_sets (not session_data); update_rep_ui + rep_count removed. ║
-- ║  2.core.py _load_session_context no longer selects current_goal/rep_count║
-- ║      /session_data.                                                      ║
-- ║  3.session.py builds plan_snapshot from plan_workouts/plan_exercises and ║
-- ║      drops current_goal/rep_count from SessionPatch.                     ║
-- ║  4. Backfill row counts verified (plan_exercises / completed_sets).      ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- Replaced by completed_sets (normalized set log).
ALTER TABLE workout_sessions DROP COLUMN IF EXISTS session_data;
-- Rep-counting feature dropped from the MVP entirely.
ALTER TABLE workout_sessions DROP COLUMN IF EXISTS rep_count;
ALTER TABLE workout_sessions DROP COLUMN IF EXISTS current_goal;

-- Replaced by plan_workouts + plan_exercises (normalized plan structure).
ALTER TABLE workout_plans DROP COLUMN IF EXISTS plan_data;

-- Kept intentionally: workout_sessions.plan_snapshot, chat_history,
-- current_exercise, session_overrides.
