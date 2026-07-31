-- Normalize the workout domain for the MVP pivot
--  - Strategy: ADD new normalized tables + seed the exercise catalog + backfill from the legacy JSONB blobs
--  - reusing columns :
--     - workout_plans.plan_data
--     - workout_sessions.session_data
--     - rep_count
--     - current_goal
--     (dropped only in a later cleanup migration after backfill is verified)
--  - Isolation note: the backend connects with the service-role key (BYPASSRLS) over a pooled connection,
--  so the REAL per-user boundary is a mandatory `.eq("user_id", user_id)` filter in the app layer.
--  - user_id is denormalized onto every child table to make that filter (and future partitioning) cheap
--  - RLS is added as defense-in-depth only (see personal_chunks in 003)

--Profiles
CREATE TABLE IF NOT EXISTS profiles (
  user_id      UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  display_name TEXT,
  units        TEXT NOT NULL DEFAULT 'lbs' CHECK (units IN ('lbs', 'kg')),
  experience   TEXT CHECK (experience IN ('beginner', 'intermediate', 'advanced')),
  goals        TEXT[] NOT NULL DEFAULT '{}',
  preferences  JSONB  NOT NULL DEFAULT '{}',   -- variable shape, read whole
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

--Exercise catalog (shared + user-created)
--  - id is a stable TEXT key so it matches the frontend exerciseId ('ex-bench')
--  - makes plan/session backfill a direct join
--  - created_by NULL = shared catalog row; non-NULL = user-created (Q3 decision).
--  - is_active drives soft-delete; reads filter is_active = true (Q3 decision).
CREATE TABLE IF NOT EXISTS exercises (
  id              TEXT PRIMARY KEY DEFAULT ('usr-' || gen_random_uuid()),
  name            TEXT NOT NULL,
  muscle_group    TEXT NOT NULL,
  equipment       TEXT NOT NULL,
  movement        TEXT CHECK (movement IN
                    ('push','pull','hinge','squat','lunge','carry','core','isolation')),
  description     TEXT,
  cues            JSONB NOT NULL DEFAULT '[]',
  thumbnail_color TEXT,
  created_by      UUID REFERENCES auth.users ON DELETE CASCADE,   -- NULL = shared
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now()
);
--Drives swap_exercise lookups (same muscle/equipment, alternate movement).
CREATE INDEX IF NOT EXISTS exercises_muscle_equipment_idx ON exercises (muscle_group, equipment) WHERE is_active;
CREATE INDEX IF NOT EXISTS exercises_created_by_idx ON exercises (created_by) WHERE created_by IS NOT NULL;

--Normalized plan structure
--  - exists in 001 as workout_plans
--  - workout_plans.plan_data (legacy JSONB) is KEPT <-- these tables are backfilled from it below.
CREATE TABLE IF NOT EXISTS plan_workouts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id     UUID NOT NULL REFERENCES workout_plans ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  day_label   TEXT,
  title       TEXT,
  est_minutes INT,
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS plan_workouts_plan_idx ON plan_workouts (plan_id, sort_order);
CREATE INDEX IF NOT EXISTS plan_workouts_user_idx ON plan_workouts (user_id);

CREATE TABLE IF NOT EXISTS plan_exercises (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_workout_id UUID NOT NULL REFERENCES plan_workouts ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  exercise_id     TEXT REFERENCES exercises (id),     -- may be NULL for ad-hoc
  exercise_name   TEXT,                               -- fallback / denormalized label
  target_sets     JSONB NOT NULL DEFAULT '[]',        -- variable shape, read whole
  note            TEXT,
  sort_order      INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS plan_exercises_workout_idx ON plan_exercises (plan_workout_id, sort_order);
CREATE INDEX IF NOT EXISTS plan_exercises_user_idx ON plan_exercises (user_id);


-- Workout Sessions
--  - add session_overrides --> enforce one active session per user
--  - alter table from 001, avoid recreation
ALTER TABLE workout_sessions
  ADD COLUMN IF NOT EXISTS session_overrides JSONB NOT NULL DEFAULT '{}';
-- One active session per user (partial unique). If existing data has >1 active row per user this will fail — resolve duplicates before applying.
CREATE UNIQUE INDEX IF NOT EXISTS workout_sessions_one_active_idx ON workout_sessions (user_id) WHERE is_active;

-- Completed sets
--  - normalized set log (replaces session_data blob)
--  - makes log_set a single INSERT (today read-modify-write of a growing JSONB blob is a lost-update hazard)
--  - makes progress/PR/volume indexed SQL
--  - rpe is KEPT nullable with no UI (Q4 decision) — substrate for autoregulation.
CREATE TABLE IF NOT EXISTS completed_sets (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, --BIGINT: auto-incrementing integer key 
  user_id       UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  session_id    UUID REFERENCES workout_sessions ON DELETE CASCADE,
  exercise_id   TEXT REFERENCES exercises (id),
  exercise_name TEXT NOT NULL,
  set_index     INT NOT NULL DEFAULT 0,
  reps          INT,
  weight        NUMERIC,
  weight_unit   TEXT DEFAULT 'lbs' CHECK (weight_unit IN ('lbs', 'kg')),
  rpe           SMALLINT,                              -- nullable, no UI (Q4)
  logged_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS completed_sets_user_time_idx ON completed_sets (user_id, logged_at DESC); --useful for "show my recent sets inquiry"
CREATE INDEX IF NOT EXISTS completed_sets_session_idx   ON completed_sets (session_id);
CREATE INDEX IF NOT EXISTS completed_sets_user_ex_idx   ON completed_sets (user_id, exercise_id);

--Injuries (feeds Personal RAG + the live safety layer)
CREATE TABLE IF NOT EXISTS injuries (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  body_part           TEXT NOT NULL,
  kind                TEXT,
  severity            TEXT CHECK (severity IN ('mild', 'moderate', 'severe')),
  status              TEXT NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active', 'recovering', 'resolved')),
  avoid_movements     TEXT[] NOT NULL DEFAULT '{}',
  notes               TEXT,
  reported_in_session UUID REFERENCES workout_sessions ON DELETE SET NULL,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS injuries_user_status_idx ON injuries (user_id, status);

--Constraints (persistent equipment/time/preference)
CREATE TABLE IF NOT EXISTS constraints (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  kind       TEXT NOT NULL,                 -- 'equipment' | 'time' | 'preference'
  detail     JSONB NOT NULL DEFAULT '{}',
  active     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS constraints_user_active_idx ON constraints (user_id, active);


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Seed: shared exercise catalog (created_by = NULL) from mockExercises.ts. ║
-- ║ Idempotent via ON CONFLICT (id) DO NOTHING.                              ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
INSERT INTO exercises (id, name, muscle_group, equipment, movement, description, cues, thumbnail_color) VALUES
-- Chest
('ex-bench','Barbell Bench Press','Chest','Barbell','push','The standard compound press for horizontal upper-body strength. Develops the pecs, front delts, and triceps through heavy loading.','["Retract shoulder blades and pin them to the bench.","Unrack with straight arms, lower the bar to mid-chest.","Drive feet into floor, press in a slight arc toward the rack."]','#B23A1E'),
('ex-incline','Incline Dumbbell Press','Chest','Dumbbell','push','An upper-chest biased press that also loads the anterior deltoid. The dumbbell variant allows a deeper stretch than a barbell.','["Bench at 30°.","DBs above upper chest line.","Control the descent — pause briefly before pressing."]','#A84B2C'),
('ex-db-bench','Dumbbell Bench Press','Chest','Dumbbell','push','A flat-bench press with independent arms. Great for chest hypertrophy and shoulder-friendly ROM.','["DBs at chest height, slight arch.","Press and squeeze at the top.","Full range — let elbows drop just below shoulder line."]','#9B2D1E'),
('ex-cable-fly','Cable Chest Fly','Chest','Cable','isolation','An isolation movement for the pecs with constant tension throughout the range of motion.','["Slight bend in elbows, keep it fixed.","Pull handles in an arc until hands meet.","Squeeze the chest hard at the mid-line."]','#C04A2E'),
('ex-pushup','Push-Up','Chest','Bodyweight','push','Fundamental bodyweight push. Loads chest, triceps, and anterior core stability.','["Body in a straight line, hands under shoulders.","Lower chest to the floor with elbows at ~45°.","Push the ground away, full lockout at the top."]','#A04030'),
('ex-dip','Parallel Bar Dip','Chest','Bodyweight','push','A heavy pushing movement that blends chest and triceps. Lean forward to bias chest, upright to bias triceps.','["Start locked out, shoulders down and packed.","Lower until upper arm is parallel to the floor.","Press back up without locking completely at the top if training hypertrophy."]','#8E3524'),
-- Shoulders
('ex-ohp','Overhead Press','Shoulders','Barbell','push','The king of pressing. Builds vertical pressing strength through the delts, triceps, and upper chest.','["Elbows slightly in front of the bar.","Squeeze glutes, press straight up through the bar path.","Finish with the bar over the back of the neck."]','#6E3CBC'),
('ex-lateral','Dumbbell Lateral Raise','Shoulders','Dumbbell','isolation','The essential side-delt builder. Go light, go strict, feel the side head do the work.','["Slight bend in elbows, don’t lock out.","Lead with elbows, not hands.","Pause briefly at the top."]','#5C3C99'),
('ex-face-pull','Cable Face Pull','Shoulders','Cable','pull','A rear-delt and upper-back movement that also reinforces external rotation and shoulder health.','["Rope at forehead height.","Pull to the face, elbows high.","External rotation at the end — T-pose finish."]','#7E5AAE'),
('ex-arnold','Arnold Press','Shoulders','Dumbbell','push','A rotating dumbbell press that lengthens the time under tension for the front and side delts.','["Start with palms facing you at chin height.","Rotate and press overhead simultaneously.","Reverse the motion on the way down."]','#5E3EA7'),
('ex-db-shoulder-press','Seated Dumbbell Press','Shoulders','Dumbbell','push','Bench-supported shoulder press. Independent arms allow natural joint path and stronger lockouts.','["Bench set to ~85°, feet planted.","Press DBs in a slight arc, meet at the top.","Control the descent to ear level."]','#6A43B3'),
('ex-rear-fly','Rear Delt Fly','Shoulders','Dumbbell','isolation','Isolation for the posterior deltoid. Critical for pulling balance and shoulder posture.','["Hinge at hips, flat back.","Lead with elbows outward and back.","Squeeze the rear delts at the top, don’t swing."]','#8263C6'),
-- Biceps
('ex-curl','Dumbbell Biceps Curl','Biceps','Dumbbell','isolation','The staple biceps builder. Supinating as you curl emphasizes the biceps brachii.','["Elbows pinned at sides.","Supinate as you curl.","Slow the eccentric — 2 seconds down."]','#8A5A2B'),
('ex-hammer-curl','Hammer Curl','Biceps','Dumbbell','isolation','A neutral-grip curl that hits the brachialis and brachioradialis alongside the biceps.','["Thumbs up the entire rep.","Keep elbows still at the sides.","Control the descent; no shoulder swinging."]','#7D4F20'),
('ex-preacher','Preacher Curl','Biceps','Machine','isolation','Biceps isolation with the upper arm locked. Emphasizes the short head through a long stretch.','["Armpit pressed into the top of the pad.","Curl under control; don’t rebound off the bottom.","Full squeeze at the top for 1 count."]','#A06B2D'),
('ex-cable-curl','Cable Curl','Biceps','Cable','isolation','Constant-tension biceps curl. Keeps the peak contraction loaded throughout the rep.','["Stand one step from the pulley, elbows at sides.","Curl without leaning back.","Resist the eccentric — no dropping the stack."]','#97602A'),
-- Triceps
('ex-tricep','Triceps Pushdown','Triceps','Cable','isolation','Cable triceps isolation. Great for volume without taxing the elbows.','["Elbows fixed, only forearm moves.","Full lockout at the bottom.","Lean in slightly if pulley is too light."]','#6E4B22'),
('ex-skull-crusher','Skull Crusher','Triceps','Barbell','isolation','An overhead-loaded triceps extension that trains the long head in a stretched position.','["EZ bar over the forehead.","Only the forearms move, elbows fixed.","Lower to ears or just past, press back up."]','#7A5428'),
('ex-overhead-ext','Overhead Cable Extension','Triceps','Cable','isolation','Overhead triceps extension that places the long head under deep stretch for hypertrophy.','["Face away from the pulley, elbows high.","Extend until full lockout behind the head.","Control the stretch; pause briefly at the bottom."]','#88602F'),
('ex-close-grip','Close-Grip Bench Press','Triceps','Barbell','push','A compound press that lets you load the triceps heavy while still training the chest.','["Hands ~shoulder-width on the bar.","Tuck elbows tight at ~30°.","Lower to the sternum and press explosively."]','#6F4E24'),
-- Forearms
('ex-wrist-curl','Wrist Curl','Forearms','Dumbbell','isolation','Isolation for the forearm flexors. Small ROM, high reps.','["Forearm on a bench, wrist off the edge.","Let the weight roll to the fingertips on the way down.","Curl up with only the wrist."]','#776348'),
('ex-reverse-curl','Reverse Barbell Curl','Forearms','Barbell','isolation','A pronated-grip curl that hammers the brachioradialis and wrist extensors.','["Overhand grip, shoulder-width.","Elbows pinned, forearms do the work.","Go lighter than a regular curl."]','#7B5640'),
('ex-farmer','Farmer Carry','Forearms','Dumbbell','carry','Loaded carry for grip, traps, and full-body stability. Pick heavy weights and walk.','["Tall posture, shoulders packed.","Short, steady strides.","Breathe behind the brace."]','#575757'),
-- Abs
('ex-plank','Plank','Abs','Bodyweight','core','Isometric core hold. Trains anti-extension stability for the whole trunk.','["Forearms and toes, straight line head to heels.","Tuck pelvis slightly, squeeze glutes.","Breathe — don’t hold breath."]','#4E4E5F'),
('ex-hanging','Hanging Leg Raise','Abs','Bodyweight','core','Lower ab and hip flexor movement. Posterior pelvic tilt is the key to biasing the abs.','["Dead hang, posterior pelvic tilt first.","Raise legs until hips flex past 90°.","Lower slowly — no swinging."]','#4C5E40'),
('ex-cable-crunch','Cable Crunch','Abs','Cable','core','Loaded flexion of the upper abs. Progressive overload for the rectus abdominis.','["Kneel below the pulley, rope at forehead.","Crunch down with the abs, not the arms.","Pause for a beat at full contraction."]','#595D46'),
('ex-ab-wheel','Ab Wheel Rollout','Abs','Bodyweight','core','Advanced anti-extension exercise. Tough on the abs, obliques, and lats.','["Start on knees, wheel under shoulders.","Roll out only as far as you can keep a flat back.","Contract the abs to return — no hip pulling."]','#4C5743'),
-- Quads
('ex-squat','Back Squat','Quads','Barbell','squat','The foundational lower-body lift. Develops the entire lower body with heavy systemic demand.','["Brace hard before unracking.","Sit between your heels, chest up.","Drive through mid-foot on the way up, knees tracking toes."]','#2E5C8A'),
('ex-front-squat','Front Squat','Quads','Barbell','squat','A more quad-dominant squat variant. Upright torso demands core bracing and mobility.','["Bar across the front delts, elbows high.","Keep torso tall the entire rep.","Hit depth without breaking forward."]','#2D6B9D'),
('ex-leg-press','Leg Press','Quads','Machine','squat','Loaded quad-dominant press with a stable back. Perfect for adding volume after heavy squats.','["Feet shoulder-width, toes slightly out.","Lower until knees near chest — no lower back rounding.","Don’t lock knees at the top."]','#2A4E74'),
('ex-goblet','Goblet Squat','Quads','Kettlebell','squat','Single-load squat great for learning the pattern and warming up the quads.','["Hold weight at chest, elbows inside knees.","Sit straight down between your feet.","Drive up through heels."]','#2F6374'),
('ex-lunge','Walking Lunge','Quads','Dumbbell','lunge','Unilateral lower-body movement. Builds the quads, glutes, and single-leg stability.','["Long step, back knee descends toward the floor.","Drive up through the front heel.","Torso stays tall, don’t lean forward."]','#355B7D'),
('ex-leg-ext','Leg Extension','Quads','Machine','isolation','Isolation for the quads. Useful for finishing work and rehab-style volume.','["Pad above ankles, back flat on the seat.","Extend fully, squeeze for a beat.","Lower under control — don’t clang the stack."]','#3A6A90'),
-- Hamstrings
('ex-rdl','Romanian Deadlift','Hamstrings','Barbell','hinge','Hip hinge that loads the hamstrings in a stretched position. Core of posterior-chain training.','["Soft knees, hinge at hips.","Bar travels along thighs.","Feel the stretch in hamstrings before driving up."]','#3F5E7A'),
('ex-leg-curl','Seated Leg Curl','Hamstrings','Machine','isolation','Isolation for knee-flexion of the hamstrings. Complements RDLs for full ham development.','["Pad above ankles, thighs locked down.","Curl all the way to contraction.","Control the eccentric for 3 seconds."]','#456683'),
('ex-nordic','Nordic Curl','Hamstrings','Bodyweight','isolation','Eccentric-focused hamstring exercise. Brutal for strength and injury prevention.','["Anchor feet, start kneeling tall.","Lower forward as slowly as possible.","Catch with hands, push back up to start."]','#3C556F'),
-- Glutes
('ex-hip-thrust','Barbell Hip Thrust','Glutes','Barbell','hinge','Direct glute loading in the shortened position. The best lift for glute mass.','["Upper back on the bench, feet flat and close.","Chin tucked, ribs down.","Squeeze glutes hard at lockout, brief pause."]','#335E42'),
('ex-bulgarian','Bulgarian Split Squat','Glutes','Dumbbell','lunge','Single-leg split squat. Humbles the glutes, quads, and stabilizers.','["Rear foot elevated, long stance.","Drop straight down, no big forward drift.","Drive through the front heel to return."]','#3E6A4D'),
('ex-glute-bridge','Glute Bridge','Glutes','Bodyweight','hinge','Floor-based glute activation. Great warm-up before thrusts and lower-body days.','["Feet flat, heels close to the glutes.","Tuck pelvis, drive hips up.","Squeeze glutes at the top — no over-extending the lower back."]','#2F5A3F'),
-- Adductors / Abductors
('ex-adductor','Hip Adduction Machine','Adductors','Machine','isolation','Isolation for the inner-thigh adductors. Helps squat depth and groin health.','["Seat upright, pads on inner knees.","Squeeze legs together against the pads.","Slow eccentric, stop before pain."]','#4B5F8C'),
('ex-abductor','Hip Abduction Machine','Abductors','Machine','isolation','Isolation for the glute medius and outer hip. Critical for knee tracking and stability.','["Seat upright, knees against outer pads.","Push pads apart with the outer hips.","Hold for a beat at end-range."]','#8C5B7A'),
('ex-cossack','Cossack Squat','Adductors','Bodyweight','lunge','Lateral squat that trains the adductors, glutes, and hip mobility.','["Very wide stance, toes slightly out.","Shift weight into one leg, squat to that side.","Keep the straight leg’s heel down and toes up."]','#566B9E'),
-- Calves
('ex-calf-raise','Standing Calf Raise','Calves','Machine','isolation','Straight-leg calf raise for the gastrocnemius. Go full stretch, full squeeze.','["Shoulders under pads, balls of feet on platform.","Drop heels deep under the step.","Rise to tip-toes and pause 1 count."]','#6B4A36'),
('ex-seated-calf','Seated Calf Raise','Calves','Machine','isolation','Bent-knee calf raise that biases the soleus. Slow reps for best results.','["Pads on lower quads, feet forward.","Full stretch under the step.","Pause at the top for a 1-count."]','#785A3F'),
-- Lats
('ex-pullup','Pull-Up','Lats','Bodyweight','pull','Vertical pull gold standard. Builds the lats, biceps, and upper back.','["Start from a dead hang.","Drive elbows to hips, chest to bar.","Control the descent — no kipping."]','#1F6F4A'),
('ex-lat-pulldown','Lat Pulldown','Lats','Cable','pull','Vertical pulling substitute when pull-ups are too heavy. Full stretch at the top is key.','["Slight lean back, chest up.","Pull the bar to collarbone.","Control the eccentric — no crashing plates."]','#257A6D'),
('ex-straight-arm','Straight-Arm Pulldown','Lats','Cable','isolation','Elbows-locked lat isolation. Reinforces the lat contraction without biceps involvement.','["Hinge slightly, arms long and locked.","Pull the bar to the thighs with the lats.","Resist the eccentric back to the top."]','#357C63'),
('ex-row','Bent-Over Barbell Row','Lats','Barbell','pull','Horizontal pull for total back mass. Demands hinge control and strict form.','["Hinge until torso ~45°.","Pull bar to lower chest / upper abs.","No shrugging — lats drive it."]','#4A3B2C'),
('ex-tbar','T-Bar Row','Lats','Machine','pull','Chest-supported row for heavy loading without straining the lower back.','["Chest on pad, feet planted.","Pull handles to the lower ribs.","Squeeze at the top; full stretch at the bottom."]','#3F3328'),
('ex-seated-row','Seated Cable Row','Lats','Cable','pull','Horizontal cable pull. Constant tension on the mid-back with strict elbow path.','["Tall posture, slight lean from the hips.","Pull handle to the sternum.","Allow a controlled stretch forward between reps."]','#2E6A7A'),
-- Traps
('ex-shrug','Barbell Shrug','Traps','Barbell','isolation','The classic trap loader. Load heavy, shrug straight up.','["Bar in front, shoulders relaxed at the start.","Elevate straight up, not back.","Pause for a 1-count at the top."]','#5E3E56'),
('ex-db-shrug','Dumbbell Shrug','Traps','Dumbbell','isolation','Shrug variant with independent arms. Allows greater range and slight rotation.','["DBs at sides, relaxed shoulders.","Shrug straight up to the ears.","Squeeze for 1 count; lower fully."]','#6A486A'),
-- Lower Back
('ex-deadlift','Conventional Deadlift','Lower Back','Barbell','hinge','The ultimate posterior chain lift. Builds the back, glutes, hamstrings, and grip all at once.','["Bar over mid-foot, shins vertical at setup.","Lats tight, take the slack out of the bar.","Push the floor away — hips and shoulders rise together."]','#3A3A52'),
('ex-back-ext','Back Extension','Lower Back','Machine','hinge','Direct work for the spinal erectors and glutes. Excellent for building a resilient lower back.','["Hips on the pad, body aligned at the top.","Lower by hinging at the hips, not rounding.","Return to a tall, neutral position."]','#4A4034'),
-- Full Body
('ex-clean','Power Clean','Full Body','Barbell','hinge','Explosive full-body pull. Builds power across the hips, traps, and upper back.','["Set up like a deadlift, bar over mid-foot.","Explode at the top of the pull, shrug hard.","Drop under the bar and catch in a quarter squat."]','#54494C'),
('ex-kb-swing','Kettlebell Swing','Full Body','Kettlebell','hinge','Hip-hinge power movement. Conditions the glutes, hamstrings, and cardiovascular system.','["Hinge back, bell between legs.","Drive hips forward powerfully.","Let the bell float to shoulder height; it’s a hinge, not a squat."]','#3F3F3F')
ON CONFLICT (id) DO NOTHING;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Backfill: explode legacy JSONB into the normalized tables.               ║
-- ║ Both blocks are idempotent (skip a parent that already has children).    ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- workout_plans.plan_data → plan_workouts + plan_exercises
DO $$
DECLARE
  p      RECORD;
  w      JSONB;
  e      JSONB;
  pw_id  UUID;
  w_ord  INT;
  e_ord  INT;
BEGIN
  FOR p IN SELECT id, user_id, plan_data FROM workout_plans LOOP
    IF jsonb_typeof(p.plan_data -> 'workouts') <> 'array' THEN CONTINUE; END IF;
    IF EXISTS (SELECT 1 FROM plan_workouts WHERE plan_id = p.id) THEN CONTINUE; END IF;

    w_ord := 0;
    FOR w IN SELECT * FROM jsonb_array_elements(p.plan_data -> 'workouts') LOOP
      pw_id := gen_random_uuid();
      INSERT INTO plan_workouts (id, plan_id, user_id, day_label, title, est_minutes, sort_order)
      VALUES (pw_id, p.id, p.user_id, w ->> 'dayLabel', w ->> 'title',
              NULLIF(w ->> 'estMinutes', '')::int, w_ord);

      e_ord := 0;
      FOR e IN SELECT * FROM jsonb_array_elements(COALESCE(w -> 'exercises', '[]'::jsonb)) LOOP
        INSERT INTO plan_exercises
          (plan_workout_id, user_id, exercise_id, exercise_name, target_sets, note, sort_order)
        VALUES
          (pw_id, p.user_id, e ->> 'exerciseId',
           (SELECT name FROM exercises WHERE id = e ->> 'exerciseId'),
           COALESCE(e -> 'sets', '[]'::jsonb), e ->> 'note', e_ord);
        e_ord := e_ord + 1;
      END LOOP;
      w_ord := w_ord + 1;
    END LOOP;
  END LOOP;
END $$;

-- workout_sessions.session_data → completed_sets
DO $$
DECLARE
  sess    RECORD;
  ex      JSONB;
  st      JSONB;
  set_ord INT;
BEGIN
  FOR sess IN SELECT id, user_id, session_data FROM workout_sessions LOOP
    IF jsonb_typeof(sess.session_data -> 'exercises') <> 'array' THEN CONTINUE; END IF;
    IF EXISTS (SELECT 1 FROM completed_sets WHERE session_id = sess.id) THEN CONTINUE; END IF;

    FOR ex IN SELECT * FROM jsonb_array_elements(sess.session_data -> 'exercises') LOOP
      set_ord := 0;
      FOR st IN SELECT * FROM jsonb_array_elements(COALESCE(ex -> 'sets', '[]'::jsonb)) LOOP
        INSERT INTO completed_sets
          (user_id, session_id, exercise_id, exercise_name, set_index, reps, weight, weight_unit)
        VALUES
          (sess.user_id, sess.id,
           (SELECT id FROM exercises WHERE lower(name) = lower(ex ->> 'name') LIMIT 1),
           ex ->> 'name', set_ord,
           NULLIF(st ->> 'reps', '')::int,
           NULLIF(st ->> 'weight', '')::numeric,
           COALESCE(st ->> 'weight_unit', 'lbs'));
        set_ord := set_ord + 1;
      END LOOP;
    END LOOP;
  END LOOP;
END $$;
