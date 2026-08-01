-- 017 — completed_sets.weight becomes canonical kilograms.
--
-- WHY
-- ---
-- The table stored whatever unit the user spoke, in `weight`, with the unit in
-- `weight_unit`. Nothing that aggregates ever read that column: progress
-- summary's PR detection and the per-exercise Epley 1RM series both compare raw
-- `weight` values. So 75 kg and 165 lbs — the same lift — were ranked as 165 >
-- 75, and any user who mixed units got a Progress tab full of nonsense.
--
-- Found the day voice logging shipped: "75 kg" was stored correctly as kg while
-- the profile was lbs, and the app displayed 75 lbs.
--
-- The rest of the schema already stores metric (profiles.weight_kg,
-- body_weight_logs.weight_kg). This aligns completed_sets with it and enforces
-- the invariant in the database rather than trusting every future query to
-- remember.
--
-- SAFETY
-- ------
-- Idempotent, and safe to re-run: rows are only converted when weight_unit
-- still says lbs, and the flag is flipped in the same statement.

begin;

-- 1. Convert every lbs row to kilograms. 0.45359237 is the exact definition,
--    not an approximation.
update completed_sets
   set weight = round((weight * 0.45359237)::numeric, 2),
       weight_unit = 'kg'
 where weight is not null
   and lower(weight_unit) in ('lb', 'lbs', 'pound', 'pounds');

-- 2. Rows with no weight (bodyweight movements) still carry a unit label that
--    now means nothing. Normalise them so the constraint below can be trusted.
update completed_sets
   set weight_unit = 'kg'
 where weight_unit is null
    or lower(weight_unit) <> 'kg';

-- 3. Make it an invariant, not a convention.
--
--    The column is deliberately KEPT rather than dropped: dropping it would
--    break a rolled-back deploy the moment older code tried to write 'lbs',
--    with no way back. Constrained to 'kg' it is self-documenting — anyone
--    reading a row sees the unit, and anyone writing the wrong one gets an
--    error instead of silently poisoning someone's PR history.
alter table completed_sets
  drop constraint if exists completed_sets_weight_unit_canonical;

alter table completed_sets
  add constraint completed_sets_weight_unit_canonical
  check (weight_unit = 'kg');

alter table completed_sets
  alter column weight_unit set default 'kg';

comment on column completed_sets.weight is
  'Kilograms, always. Convert at the API boundary (app/units.py); never store a user-facing unit here.';
comment on column completed_sets.weight_unit is
  'Always ''kg'' — retained as an explicit marker of the canonical unit, enforced by completed_sets_weight_unit_canonical.';

commit;
