-- Set slots become addressable: one row per (session, exercise, set_index).
-- The voice coach's log_set can now target a specific set ("the first set was
-- 60kg for 5") and corrections overwrite instead of appending; both logging
-- paths (agent tool + manual POST /sets) upsert on this key.

-- 1) Dedupe existing collisions (keep the newest write per slot). NULL
--    session_id rows can't collide — the join below excludes them, and the
--    unique index treats NULLs as distinct.
DELETE FROM completed_sets a
USING completed_sets b
WHERE a.session_id = b.session_id
  AND a.exercise_name = b.exercise_name
  AND a.set_index = b.set_index
  AND (a.logged_at < b.logged_at
       OR (a.logged_at = b.logged_at AND a.id < b.id));

-- 2) Enforce the slot key. Non-partial so PostgREST on_conflict upserts work.
CREATE UNIQUE INDEX IF NOT EXISTS completed_sets_slot_uidx
  ON completed_sets (session_id, exercise_name, set_index);
