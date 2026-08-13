-- ─────────────────────────────────────────────────────────────────────────────
-- 018: completed_sets.local_day — bucket training days by the USER'S day
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY / THE BUG THIS FIXES
-- Streaks, days-this-week and the trend charts bucketed sets by the UTC date
-- of logged_at. For anyone west of UTC that boundary is late afternoon local
-- time — an ordinary 4:40–5:40pm session in California straddled two UTC days
-- and counted as TWO training days (and two chart points at half volume each).
-- The offline outbox made it worse by stamping each set's true performed_at.
-- The client now sends the local calendar day it saw at tap time; aggregates
-- read it, falling back to the UTC day for legacy rows.
--
-- Idempotent and re-runnable, per house rules.
begin;

ALTER TABLE completed_sets ADD COLUMN IF NOT EXISTS local_day DATE;

-- Backfill history with the UTC day — the best available approximation, and
-- exactly what the aggregates were already computing for these rows.
UPDATE completed_sets
SET local_day = (logged_at AT TIME ZONE 'utc')::date
WHERE local_day IS NULL;

commit;
