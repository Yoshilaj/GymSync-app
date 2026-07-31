-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 016_catalog_sync.sql — reconcile the two exercise catalogs, and let      ║
-- ║ loaded lifts be prescribed unloaded.                                    ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- THE BUG THIS FIXES. A home-workout plan came back containing Glute Bridge,
-- Nordic Curl, and Cossack Squat — none of which exist in the app's exercise
-- library. The agent had not invented them: all three are real rows seeded by
-- 002, and list_exercises reads that table. The problem is that the app ships
-- its OWN catalog, src/data/mockExercises.ts, and the two have drifted. They
-- share 45 ids; 11 are server-only and 10 are client-only.
--
-- A server-only exercise has no illustration in assets/exercises/, no how-to,
-- and no library row, so it degrades to a grey "Full Body" placeholder, its
-- detail page reads "Exercise not found", and DayDetailScreen drops it from
-- logged history entirely.
--
-- Home plans hit this every time. Of the 9 Bodyweight rows, the only
-- lower-body ones are exactly Nordic Curl, Glute Bridge and Cossack Squat —
-- all three server-only. Every other leg movement carries a Barbell/Dumbbell/
-- Machine tag, and the proposal validator only ever treats Bodyweight as
-- universally allowed, so the model had nothing else to program legs with.
--
-- Three changes below: retire the server-only rows, adopt the client-only
-- rows, and give the loaded lifts a bodyweight identity so a home leg day has
-- somewhere to go.

-- ── 1. Retire the 11 server-only rows ────────────────────────────────────────
-- Deactivated rather than deleted: plan_exercises.exercise_id and
-- completed_sets.exercise_id are real FKs, so existing rows must keep pointing
-- somewhere. _load_catalog and list_exercises both filter is_active, so this
-- alone stops the agent surfacing them. Flip one back to true once it has an
-- illustration and a mockExercises.ts entry.
UPDATE exercises SET is_active = false
WHERE created_by IS NULL
  AND id IN (
    'ex-arnold', 'ex-clean', 'ex-cossack', 'ex-farmer', 'ex-glute-bridge',
    'ex-goblet', 'ex-kb-swing', 'ex-nordic', 'ex-rear-fly', 'ex-straight-arm',
    'ex-wrist-curl'
  );

-- ── 2. Adopt the 10 client-only rows ─────────────────────────────────────────
-- These ids exist in mockExercises.ts but had no row, and exercise_id is a real
-- FK — so roughly one manual Plan-tab pick in five silently degraded to an
-- ad-hoc row (see plan_store._resolve_catalog_id). Copy verbatim from the
-- client catalog; `movement` is the one field the client doesn't carry.
INSERT INTO exercises (id, name, muscle_group, equipment, movement, description, cues, thumbnail_color) VALUES
-- Chest
('ex-incline-barbell','Incline Barbell Press','Chest','Barbell','push','A barbell press on an incline bench that emphasizes the upper chest and front delts under heavy load.','["Bench at ~30°, retract the shoulder blades.","Lower the bar to the upper chest.","Press up and slightly back over the shoulders."]','#B0432A'),
('ex-chest-press','Chest Press (Machine)','Chest','Machine','push','A seated machine press that trains the chest through a fixed path. Great for volume without a spotter.','["Handles at mid-chest height, back on the pad.","Press until arms are nearly straight.","Control the negative — don’t let the stack drop."]','#C0502F'),
('ex-pec-fly','Pec Fly Machine','Chest','Machine','isolation','A machine isolation for the pecs with a fixed arc. Constant tension and easy to overload safely.','["Back flat on the pad, elbows slightly bent.","Bring the handles together in front of the chest.","Squeeze at the mid-line, control the return."]','#9E3520'),
-- Back
('ex-cable-pullover','Cable Pullover','Lats','Cable','isolation','A straight-arm cable pullover that isolates the lats through a long overhead stretch.','["Face the high pulley, arms long and locked.","Pull the bar down in an arc to the thighs.","Feel the lats stretch at the top, resist the return."]','#2C7368'),
-- Legs
('ex-hack-squat','Hack Squat','Quads','Machine','squat','A machine squat with the back braced against an angled sled. Quad-dominant with a stable, fixed path for heavy loading.','["Shoulders under the pads, back flat on the sled.","Feet shoulder-width, descend to at least parallel.","Drive through mid-foot; keep the knees soft at the top."]','#2C5A86'),
-- Arms / forearms
('ex-barbell-curl','Underhand Barbell Curl','Forearms','Barbell','isolation','A supinated-grip barbell curl that loads the inner forearm (wrist flexors) alongside the biceps. Palms face up throughout.','["Underhand grip, palms facing up, shoulder-width.","Elbows pinned at the sides, curl the bar up.","Lower under control — feel the inner forearm work."]','#8F5E2E'),
('ex-cable-wrist-curl','Cable Wrist Curl','Forearms','Cable','isolation','Constant-tension curl for the wrist flexors — the front/inner forearm. Palms face up as the wrist curls the handle.','["Kneel or sit at a low pulley, forearms braced on the thighs.","Palms up, let the handle roll to the fingertips.","Curl up with the wrist only — full squeeze at the top."]','#7C6749'),
('ex-cable-reverse-wrist-curl','Cable Reverse Wrist Curl','Forearms','Cable','isolation','Constant-tension curl for the wrist extensors — the back/outer forearm. Palms face down as the wrist lifts the handle.','["Forearms braced, palms facing down over a low pulley.","Lift the back of the hand toward you.","Lower slowly — keep the forearms still throughout."]','#83654B'),
-- Abs
('ex-crunch','Crunches','Abs','Bodyweight','core','The classic ab flexion movement. A short-range curl-up that targets the upper abs.','["Knees bent, feet flat, hands by the head.","Curl the shoulder blades off the floor.","Squeeze the abs at the top, lower with control."]','#55584A'),
('ex-leg-raise','Lying Leg Raises','Abs','Bodyweight','core','A floor-based lower-ab movement. Raising the legs against gravity trains the rectus abdominis.','["Lie flat, hands under the lower back or by the sides.","Raise straight legs toward vertical.","Lower slowly without arching the lower back."]','#505E44')
ON CONFLICT (id) DO NOTHING;

-- Re-activate in case a prior run of this migration (or a manual edit) left one
-- of the adopted ids inactive — the INSERT above is a no-op on conflict.
UPDATE exercises SET is_active = true
WHERE created_by IS NULL
  AND is_active = false
  AND id IN (
    'ex-barbell-curl', 'ex-cable-pullover', 'ex-cable-reverse-wrist-curl',
    'ex-cable-wrist-curl', 'ex-chest-press', 'ex-crunch', 'ex-hack-squat',
    'ex-incline-barbell', 'ex-leg-raise', 'ex-pec-fly'
  );

-- ── 3. Reconcile the shared rows ─────────────────────────────────────────────
-- The ids matched but eight rows disagreed on name or equipment. Names are the
-- damaging half: log_set and POST /sets resolve a set to its exercise by
-- case-insensitive name, so a client sending "Lateral Raises" never matched
-- the row called "Dumbbell Lateral Raise" and every one of those sets stored
-- exercise_id = NULL and dropped out of the progress charts.
--
-- The client wins in all eight cases: its name is what the user reads in the
-- library and on every screen, and both equipment overrides are deliberate
-- (mockExercises.ts carries a comment on each — the artwork shows an EZ bar on
-- a preacher bench and a bodyweight raise on a step, not machines).
UPDATE exercises SET name = v.name
FROM (VALUES
  ('ex-ohp',        'Barbell Overhead Press'),
  ('ex-lateral',    'Lateral Raises'),
  ('ex-curl',       'Dumbbell Curl'),
  ('ex-tricep',     'Tricep Pushdown'),
  ('ex-close-grip', 'Narrow Bench Press'),
  ('ex-hanging',    'Hanging Leg Raises')
) AS v(id, name)
WHERE exercises.id = v.id AND exercises.created_by IS NULL;

UPDATE exercises SET equipment = v.equipment
FROM (VALUES
  ('ex-preacher',  'Barbell'),
  ('ex-calf-raise','Bodyweight')
) AS v(id, equipment)
WHERE exercises.id = v.id AND exercises.created_by IS NULL;

-- ── 4. Bodyweight identities for loaded lifts ────────────────────────────────
-- `equipment` is a single hard tag, which made every leg movement except the
-- three retired above unreachable for a home user. But most of them are
-- perfectly good unloaded — a Back Squat with no bar is just a squat.
--
-- A non-null bodyweight_name means "this movement is worth programming with no
-- load, under this name". The backend swaps the name in when the user doesn't
-- own the equipment; the id is unchanged, so the illustration, muscle group,
-- cues and detail page all still resolve. Keep this list in sync with
-- `bodyweightName` in src/data/mockExercises.ts.
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS bodyweight_name TEXT;

COMMENT ON COLUMN exercises.bodyweight_name IS
  'Display name when this movement is programmed with no external load, or '
  'NULL if it is meaningless unloaded (Leg Press, Cable Fly). Set by the '
  'proposal validator when the user does not own `equipment`.';

-- Standing Calf Raise isn't here: step 3 retags it as Bodyweight outright, so
-- it needs no alternate identity.
UPDATE exercises SET bodyweight_name = v.bw
FROM (VALUES
  ('ex-squat',       'Bodyweight Squat'),
  ('ex-hip-thrust',  'Bodyweight Hip Thrust'),
  ('ex-lunge',       'Walking Lunge'),
  ('ex-bulgarian',   'Bulgarian Split Squat')
) AS v(id, bw)
WHERE exercises.id = v.id AND exercises.created_by IS NULL;
