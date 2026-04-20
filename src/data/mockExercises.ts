import { Exercise, MuscleGroup } from '@/types';

export const mockExercises: Exercise[] = [
  // ----- Chest -----
  {
    id: 'ex-bench',
    name: 'Barbell Bench Press',
    muscleGroup: 'Chest',
    equipment: 'Barbell',
    thumbnailColor: '#B23A1E',
    description:
      'The standard compound press for horizontal upper-body strength. Develops the pecs, front delts, and triceps through heavy loading.',
    cues: [
      'Retract shoulder blades and pin them to the bench.',
      'Unrack with straight arms, lower the bar to mid-chest.',
      'Drive feet into floor, press in a slight arc toward the rack.',
    ],
  },
  {
    id: 'ex-incline',
    name: 'Incline Dumbbell Press',
    muscleGroup: 'Chest',
    equipment: 'Dumbbell',
    thumbnailColor: '#A84B2C',
    description:
      'An upper-chest biased press that also loads the anterior deltoid. The dumbbell variant allows a deeper stretch than a barbell.',
    cues: [
      'Bench at 30°.',
      'DBs above upper chest line.',
      'Control the descent — pause briefly before pressing.',
    ],
  },
  {
    id: 'ex-db-bench',
    name: 'Dumbbell Bench Press',
    muscleGroup: 'Chest',
    equipment: 'Dumbbell',
    thumbnailColor: '#9B2D1E',
    description:
      'A flat-bench press with independent arms. Great for chest hypertrophy and shoulder-friendly ROM.',
    cues: [
      'DBs at chest height, slight arch.',
      'Press and squeeze at the top.',
      'Full range — let elbows drop just below shoulder line.',
    ],
  },
  {
    id: 'ex-cable-fly',
    name: 'Cable Chest Fly',
    muscleGroup: 'Chest',
    equipment: 'Cable',
    thumbnailColor: '#C04A2E',
    description:
      'An isolation movement for the pecs with constant tension throughout the range of motion.',
    cues: [
      'Slight bend in elbows, keep it fixed.',
      'Pull handles in an arc until hands meet.',
      'Squeeze the chest hard at the mid-line.',
    ],
  },
  {
    id: 'ex-pushup',
    name: 'Push-Up',
    muscleGroup: 'Chest',
    equipment: 'Bodyweight',
    thumbnailColor: '#A04030',
    description:
      'Fundamental bodyweight push. Loads chest, triceps, and anterior core stability.',
    cues: [
      'Body in a straight line, hands under shoulders.',
      'Lower chest to the floor with elbows at ~45°.',
      'Push the ground away, full lockout at the top.',
    ],
  },
  {
    id: 'ex-dip',
    name: 'Parallel Bar Dip',
    muscleGroup: 'Chest',
    equipment: 'Bodyweight',
    thumbnailColor: '#8E3524',
    description:
      'A heavy pushing movement that blends chest and triceps. Lean forward to bias chest, upright to bias triceps.',
    cues: [
      'Start locked out, shoulders down and packed.',
      'Lower until upper arm is parallel to the floor.',
      'Press back up without locking completely at the top if training hypertrophy.',
    ],
  },

  // ----- Shoulders -----
  {
    id: 'ex-ohp',
    name: 'Overhead Press',
    muscleGroup: 'Shoulders',
    equipment: 'Barbell',
    thumbnailColor: '#6E3CBC',
    description:
      'The king of pressing. Builds vertical pressing strength through the delts, triceps, and upper chest.',
    cues: [
      'Elbows slightly in front of the bar.',
      'Squeeze glutes, press straight up through the bar path.',
      'Finish with the bar over the back of the neck.',
    ],
  },
  {
    id: 'ex-lateral',
    name: 'Dumbbell Lateral Raise',
    muscleGroup: 'Shoulders',
    equipment: 'Dumbbell',
    thumbnailColor: '#5C3C99',
    description:
      'The essential side-delt builder. Go light, go strict, feel the side head do the work.',
    cues: [
      'Slight bend in elbows, don\u2019t lock out.',
      'Lead with elbows, not hands.',
      'Pause briefly at the top.',
    ],
  },
  {
    id: 'ex-face-pull',
    name: 'Cable Face Pull',
    muscleGroup: 'Shoulders',
    equipment: 'Cable',
    thumbnailColor: '#7E5AAE',
    description:
      'A rear-delt and upper-back movement that also reinforces external rotation and shoulder health.',
    cues: [
      'Rope at forehead height.',
      'Pull to the face, elbows high.',
      'External rotation at the end — T-pose finish.',
    ],
  },
  {
    id: 'ex-arnold',
    name: 'Arnold Press',
    muscleGroup: 'Shoulders',
    equipment: 'Dumbbell',
    thumbnailColor: '#5E3EA7',
    description:
      'A rotating dumbbell press that lengthens the time under tension for the front and side delts.',
    cues: [
      'Start with palms facing you at chin height.',
      'Rotate and press overhead simultaneously.',
      'Reverse the motion on the way down.',
    ],
  },
  {
    id: 'ex-db-shoulder-press',
    name: 'Seated Dumbbell Press',
    muscleGroup: 'Shoulders',
    equipment: 'Dumbbell',
    thumbnailColor: '#6A43B3',
    description:
      'Bench-supported shoulder press. Independent arms allow natural joint path and stronger lockouts.',
    cues: [
      'Bench set to ~85°, feet planted.',
      'Press DBs in a slight arc, meet at the top.',
      'Control the descent to ear level.',
    ],
  },
  {
    id: 'ex-rear-fly',
    name: 'Rear Delt Fly',
    muscleGroup: 'Shoulders',
    equipment: 'Dumbbell',
    thumbnailColor: '#8263C6',
    description:
      'Isolation for the posterior deltoid. Critical for pulling balance and shoulder posture.',
    cues: [
      'Hinge at hips, flat back.',
      'Lead with elbows outward and back.',
      'Squeeze the rear delts at the top, don\u2019t swing.',
    ],
  },

  // ----- Biceps -----
  {
    id: 'ex-curl',
    name: 'Dumbbell Biceps Curl',
    muscleGroup: 'Biceps',
    equipment: 'Dumbbell',
    thumbnailColor: '#8A5A2B',
    description:
      'The staple biceps builder. Supinating as you curl emphasizes the biceps brachii.',
    cues: [
      'Elbows pinned at sides.',
      'Supinate as you curl.',
      'Slow the eccentric — 2 seconds down.',
    ],
  },
  {
    id: 'ex-hammer-curl',
    name: 'Hammer Curl',
    muscleGroup: 'Biceps',
    equipment: 'Dumbbell',
    thumbnailColor: '#7D4F20',
    description:
      'A neutral-grip curl that hits the brachialis and brachioradialis alongside the biceps.',
    cues: [
      'Thumbs up the entire rep.',
      'Keep elbows still at the sides.',
      'Control the descent; no shoulder swinging.',
    ],
  },
  {
    id: 'ex-preacher',
    name: 'Preacher Curl',
    muscleGroup: 'Biceps',
    equipment: 'Machine',
    thumbnailColor: '#A06B2D',
    description:
      'Biceps isolation with the upper arm locked. Emphasizes the short head through a long stretch.',
    cues: [
      'Armpit pressed into the top of the pad.',
      'Curl under control; don\u2019t rebound off the bottom.',
      'Full squeeze at the top for 1 count.',
    ],
  },
  {
    id: 'ex-cable-curl',
    name: 'Cable Curl',
    muscleGroup: 'Biceps',
    equipment: 'Cable',
    thumbnailColor: '#97602A',
    description:
      'Constant-tension biceps curl. Keeps the peak contraction loaded throughout the rep.',
    cues: [
      'Stand one step from the pulley, elbows at sides.',
      'Curl without leaning back.',
      'Resist the eccentric — no dropping the stack.',
    ],
  },

  // ----- Triceps -----
  {
    id: 'ex-tricep',
    name: 'Triceps Pushdown',
    muscleGroup: 'Triceps',
    equipment: 'Cable',
    thumbnailColor: '#6E4B22',
    description:
      'Cable triceps isolation. Great for volume without taxing the elbows.',
    cues: [
      'Elbows fixed, only forearm moves.',
      'Full lockout at the bottom.',
      'Lean in slightly if pulley is too light.',
    ],
  },
  {
    id: 'ex-skull-crusher',
    name: 'Skull Crusher',
    muscleGroup: 'Triceps',
    equipment: 'Barbell',
    thumbnailColor: '#7A5428',
    description:
      'An overhead-loaded triceps extension that trains the long head in a stretched position.',
    cues: [
      'EZ bar over the forehead.',
      'Only the forearms move, elbows fixed.',
      'Lower to ears or just past, press back up.',
    ],
  },
  {
    id: 'ex-overhead-ext',
    name: 'Overhead Cable Extension',
    muscleGroup: 'Triceps',
    equipment: 'Cable',
    thumbnailColor: '#88602F',
    description:
      'Overhead triceps extension that places the long head under deep stretch for hypertrophy.',
    cues: [
      'Face away from the pulley, elbows high.',
      'Extend until full lockout behind the head.',
      'Control the stretch; pause briefly at the bottom.',
    ],
  },
  {
    id: 'ex-close-grip',
    name: 'Close-Grip Bench Press',
    muscleGroup: 'Triceps',
    equipment: 'Barbell',
    thumbnailColor: '#6F4E24',
    description:
      'A compound press that lets you load the triceps heavy while still training the chest.',
    cues: [
      'Hands ~shoulder-width on the bar.',
      'Tuck elbows tight at ~30°.',
      'Lower to the sternum and press explosively.',
    ],
  },

  // ----- Forearms -----
  {
    id: 'ex-wrist-curl',
    name: 'Wrist Curl',
    muscleGroup: 'Forearms',
    equipment: 'Dumbbell',
    thumbnailColor: '#776348',
    description:
      'Isolation for the forearm flexors. Small ROM, high reps.',
    cues: [
      'Forearm on a bench, wrist off the edge.',
      'Let the weight roll to the fingertips on the way down.',
      'Curl up with only the wrist.',
    ],
  },
  {
    id: 'ex-reverse-curl',
    name: 'Reverse Barbell Curl',
    muscleGroup: 'Forearms',
    equipment: 'Barbell',
    thumbnailColor: '#7B5640',
    description:
      'A pronated-grip curl that hammers the brachioradialis and wrist extensors.',
    cues: [
      'Overhand grip, shoulder-width.',
      'Elbows pinned, forearms do the work.',
      'Go lighter than a regular curl.',
    ],
  },
  {
    id: 'ex-farmer',
    name: 'Farmer Carry',
    muscleGroup: 'Forearms',
    equipment: 'Dumbbell',
    thumbnailColor: '#575757',
    description:
      'Loaded carry for grip, traps, and full-body stability. Pick heavy weights and walk.',
    cues: [
      'Tall posture, shoulders packed.',
      'Short, steady strides.',
      'Breathe behind the brace.',
    ],
  },

  // ----- Abs -----
  {
    id: 'ex-plank',
    name: 'Plank',
    muscleGroup: 'Abs',
    equipment: 'Bodyweight',
    thumbnailColor: '#4E4E5F',
    description:
      'Isometric core hold. Trains anti-extension stability for the whole trunk.',
    cues: [
      'Forearms and toes, straight line head to heels.',
      'Tuck pelvis slightly, squeeze glutes.',
      'Breathe — don\u2019t hold breath.',
    ],
  },
  {
    id: 'ex-hanging',
    name: 'Hanging Leg Raise',
    muscleGroup: 'Abs',
    equipment: 'Bodyweight',
    thumbnailColor: '#4C5E40',
    description:
      'Lower ab and hip flexor movement. Posterior pelvic tilt is the key to biasing the abs.',
    cues: [
      'Dead hang, posterior pelvic tilt first.',
      'Raise legs until hips flex past 90°.',
      'Lower slowly — no swinging.',
    ],
  },
  {
    id: 'ex-cable-crunch',
    name: 'Cable Crunch',
    muscleGroup: 'Abs',
    equipment: 'Cable',
    thumbnailColor: '#595D46',
    description:
      'Loaded flexion of the upper abs. Progressive overload for the rectus abdominis.',
    cues: [
      'Kneel below the pulley, rope at forehead.',
      'Crunch down with the abs, not the arms.',
      'Pause for a beat at full contraction.',
    ],
  },
  {
    id: 'ex-ab-wheel',
    name: 'Ab Wheel Rollout',
    muscleGroup: 'Abs',
    equipment: 'Bodyweight',
    thumbnailColor: '#4C5743',
    description:
      'Advanced anti-extension exercise. Tough on the abs, obliques, and lats.',
    cues: [
      'Start on knees, wheel under shoulders.',
      'Roll out only as far as you can keep a flat back.',
      'Contract the abs to return — no hip pulling.',
    ],
  },

  // ----- Quads -----
  {
    id: 'ex-squat',
    name: 'Back Squat',
    muscleGroup: 'Quads',
    equipment: 'Barbell',
    thumbnailColor: '#2E5C8A',
    description:
      'The foundational lower-body lift. Develops the entire lower body with heavy systemic demand.',
    cues: [
      'Brace hard before unracking.',
      'Sit between your heels, chest up.',
      'Drive through mid-foot on the way up, knees tracking toes.',
    ],
  },
  {
    id: 'ex-front-squat',
    name: 'Front Squat',
    muscleGroup: 'Quads',
    equipment: 'Barbell',
    thumbnailColor: '#2D6B9D',
    description:
      'A more quad-dominant squat variant. Upright torso demands core bracing and mobility.',
    cues: [
      'Bar across the front delts, elbows high.',
      'Keep torso tall the entire rep.',
      'Hit depth without breaking forward.',
    ],
  },
  {
    id: 'ex-leg-press',
    name: 'Leg Press',
    muscleGroup: 'Quads',
    equipment: 'Machine',
    thumbnailColor: '#2A4E74',
    description:
      'Loaded quad-dominant press with a stable back. Perfect for adding volume after heavy squats.',
    cues: [
      'Feet shoulder-width, toes slightly out.',
      'Lower until knees near chest — no lower back rounding.',
      'Don\u2019t lock knees at the top.',
    ],
  },
  {
    id: 'ex-goblet',
    name: 'Goblet Squat',
    muscleGroup: 'Quads',
    equipment: 'Kettlebell',
    thumbnailColor: '#2F6374',
    description:
      'Single-load squat great for learning the pattern and warming up the quads.',
    cues: [
      'Hold weight at chest, elbows inside knees.',
      'Sit straight down between your feet.',
      'Drive up through heels.',
    ],
  },
  {
    id: 'ex-lunge',
    name: 'Walking Lunge',
    muscleGroup: 'Quads',
    equipment: 'Dumbbell',
    thumbnailColor: '#355B7D',
    description:
      'Unilateral lower-body movement. Builds the quads, glutes, and single-leg stability.',
    cues: [
      'Long step, back knee descends toward the floor.',
      'Drive up through the front heel.',
      'Torso stays tall, don\u2019t lean forward.',
    ],
  },
  {
    id: 'ex-leg-ext',
    name: 'Leg Extension',
    muscleGroup: 'Quads',
    equipment: 'Machine',
    thumbnailColor: '#3A6A90',
    description:
      'Isolation for the quads. Useful for finishing work and rehab-style volume.',
    cues: [
      'Pad above ankles, back flat on the seat.',
      'Extend fully, squeeze for a beat.',
      'Lower under control — don\u2019t clang the stack.',
    ],
  },

  // ----- Hamstrings -----
  {
    id: 'ex-rdl',
    name: 'Romanian Deadlift',
    muscleGroup: 'Hamstrings',
    equipment: 'Barbell',
    thumbnailColor: '#3F5E7A',
    description:
      'Hip hinge that loads the hamstrings in a stretched position. Core of posterior-chain training.',
    cues: [
      'Soft knees, hinge at hips.',
      'Bar travels along thighs.',
      'Feel the stretch in hamstrings before driving up.',
    ],
  },
  {
    id: 'ex-leg-curl',
    name: 'Seated Leg Curl',
    muscleGroup: 'Hamstrings',
    equipment: 'Machine',
    thumbnailColor: '#456683',
    description:
      'Isolation for knee-flexion of the hamstrings. Complements RDLs for full ham development.',
    cues: [
      'Pad above ankles, thighs locked down.',
      'Curl all the way to contraction.',
      'Control the eccentric for 3 seconds.',
    ],
  },
  {
    id: 'ex-nordic',
    name: 'Nordic Curl',
    muscleGroup: 'Hamstrings',
    equipment: 'Bodyweight',
    thumbnailColor: '#3C556F',
    description:
      'Eccentric-focused hamstring exercise. Brutal for strength and injury prevention.',
    cues: [
      'Anchor feet, start kneeling tall.',
      'Lower forward as slowly as possible.',
      'Catch with hands, push back up to start.',
    ],
  },

  // ----- Glutes -----
  {
    id: 'ex-hip-thrust',
    name: 'Barbell Hip Thrust',
    muscleGroup: 'Glutes',
    equipment: 'Barbell',
    thumbnailColor: '#335E42',
    description:
      'Direct glute loading in the shortened position. The best lift for glute mass.',
    cues: [
      'Upper back on the bench, feet flat and close.',
      'Chin tucked, ribs down.',
      'Squeeze glutes hard at lockout, brief pause.',
    ],
  },
  {
    id: 'ex-bulgarian',
    name: 'Bulgarian Split Squat',
    muscleGroup: 'Glutes',
    equipment: 'Dumbbell',
    thumbnailColor: '#3E6A4D',
    description:
      'Single-leg split squat. Humbles the glutes, quads, and stabilizers.',
    cues: [
      'Rear foot elevated, long stance.',
      'Drop straight down, no big forward drift.',
      'Drive through the front heel to return.',
    ],
  },
  {
    id: 'ex-glute-bridge',
    name: 'Glute Bridge',
    muscleGroup: 'Glutes',
    equipment: 'Bodyweight',
    thumbnailColor: '#2F5A3F',
    description:
      'Floor-based glute activation. Great warm-up before thrusts and lower-body days.',
    cues: [
      'Feet flat, heels close to the glutes.',
      'Tuck pelvis, drive hips up.',
      'Squeeze glutes at the top — no over-extending the lower back.',
    ],
  },

  // ----- Adductors / Abductors -----
  {
    id: 'ex-adductor',
    name: 'Hip Adduction Machine',
    muscleGroup: 'Adductors',
    equipment: 'Machine',
    thumbnailColor: '#4B5F8C',
    description:
      'Isolation for the inner-thigh adductors. Helps squat depth and groin health.',
    cues: [
      'Seat upright, pads on inner knees.',
      'Squeeze legs together against the pads.',
      'Slow eccentric, stop before pain.',
    ],
  },
  {
    id: 'ex-abductor',
    name: 'Hip Abduction Machine',
    muscleGroup: 'Abductors',
    equipment: 'Machine',
    thumbnailColor: '#8C5B7A',
    description:
      'Isolation for the glute medius and outer hip. Critical for knee tracking and stability.',
    cues: [
      'Seat upright, knees against outer pads.',
      'Push pads apart with the outer hips.',
      'Hold for a beat at end-range.',
    ],
  },
  {
    id: 'ex-cossack',
    name: 'Cossack Squat',
    muscleGroup: 'Adductors',
    equipment: 'Bodyweight',
    thumbnailColor: '#566B9E',
    description:
      'Lateral squat that trains the adductors, glutes, and hip mobility.',
    cues: [
      'Very wide stance, toes slightly out.',
      'Shift weight into one leg, squat to that side.',
      'Keep the straight leg\u2019s heel down and toes up.',
    ],
  },

  // ----- Calves -----
  {
    id: 'ex-calf-raise',
    name: 'Standing Calf Raise',
    muscleGroup: 'Calves',
    equipment: 'Machine',
    thumbnailColor: '#6B4A36',
    description:
      'Straight-leg calf raise for the gastrocnemius. Go full stretch, full squeeze.',
    cues: [
      'Shoulders under pads, balls of feet on platform.',
      'Drop heels deep under the step.',
      'Rise to tip-toes and pause 1 count.',
    ],
  },
  {
    id: 'ex-seated-calf',
    name: 'Seated Calf Raise',
    muscleGroup: 'Calves',
    equipment: 'Machine',
    thumbnailColor: '#785A3F',
    description:
      'Bent-knee calf raise that biases the soleus. Slow reps for best results.',
    cues: [
      'Pads on lower quads, feet forward.',
      'Full stretch under the step.',
      'Pause at the top for a 1-count.',
    ],
  },

  // ----- Lats -----
  {
    id: 'ex-pullup',
    name: 'Pull-Up',
    muscleGroup: 'Lats',
    equipment: 'Bodyweight',
    thumbnailColor: '#1F6F4A',
    description:
      'Vertical pull gold standard. Builds the lats, biceps, and upper back.',
    cues: [
      'Start from a dead hang.',
      'Drive elbows to hips, chest to bar.',
      'Control the descent — no kipping.',
    ],
  },
  {
    id: 'ex-lat-pulldown',
    name: 'Lat Pulldown',
    muscleGroup: 'Lats',
    equipment: 'Cable',
    thumbnailColor: '#257A6D',
    description:
      'Vertical pulling substitute when pull-ups are too heavy. Full stretch at the top is key.',
    cues: [
      'Slight lean back, chest up.',
      'Pull the bar to collarbone.',
      'Control the eccentric — no crashing plates.',
    ],
  },
  {
    id: 'ex-straight-arm',
    name: 'Straight-Arm Pulldown',
    muscleGroup: 'Lats',
    equipment: 'Cable',
    thumbnailColor: '#357C63',
    description:
      'Elbows-locked lat isolation. Reinforces the lat contraction without biceps involvement.',
    cues: [
      'Hinge slightly, arms long and locked.',
      'Pull the bar to the thighs with the lats.',
      'Resist the eccentric back to the top.',
    ],
  },

  // ----- Traps -----
  {
    id: 'ex-shrug',
    name: 'Barbell Shrug',
    muscleGroup: 'Traps',
    equipment: 'Barbell',
    thumbnailColor: '#5E3E56',
    description:
      'The classic trap loader. Load heavy, shrug straight up.',
    cues: [
      'Bar in front, shoulders relaxed at the start.',
      'Elevate straight up, not back.',
      'Pause for a 1-count at the top.',
    ],
  },
  {
    id: 'ex-db-shrug',
    name: 'Dumbbell Shrug',
    muscleGroup: 'Traps',
    equipment: 'Dumbbell',
    thumbnailColor: '#6A486A',
    description:
      'Shrug variant with independent arms. Allows greater range and slight rotation.',
    cues: [
      'DBs at sides, relaxed shoulders.',
      'Shrug straight up to the ears.',
      'Squeeze for 1 count; lower fully.',
    ],
  },

  // ----- Back (horizontal pull) -----
  {
    id: 'ex-deadlift',
    name: 'Conventional Deadlift',
    muscleGroup: 'Lower Back',
    equipment: 'Barbell',
    thumbnailColor: '#3A3A52',
    description:
      'The ultimate posterior chain lift. Builds the back, glutes, hamstrings, and grip all at once.',
    cues: [
      'Bar over mid-foot, shins vertical at setup.',
      'Lats tight, take the slack out of the bar.',
      'Push the floor away — hips and shoulders rise together.',
    ],
  },
  {
    id: 'ex-row',
    name: 'Bent-Over Barbell Row',
    muscleGroup: 'Lats',
    equipment: 'Barbell',
    thumbnailColor: '#4A3B2C',
    description:
      'Horizontal pull for total back mass. Demands hinge control and strict form.',
    cues: [
      'Hinge until torso ~45°.',
      'Pull bar to lower chest / upper abs.',
      'No shrugging — lats drive it.',
    ],
  },
  {
    id: 'ex-tbar',
    name: 'T-Bar Row',
    muscleGroup: 'Lats',
    equipment: 'Machine',
    thumbnailColor: '#3F3328',
    description:
      'Chest-supported row for heavy loading without straining the lower back.',
    cues: [
      'Chest on pad, feet planted.',
      'Pull handles to the lower ribs.',
      'Squeeze at the top; full stretch at the bottom.',
    ],
  },
  {
    id: 'ex-seated-row',
    name: 'Seated Cable Row',
    muscleGroup: 'Lats',
    equipment: 'Cable',
    thumbnailColor: '#2E6A7A',
    description:
      'Horizontal cable pull. Constant tension on the mid-back with strict elbow path.',
    cues: [
      'Tall posture, slight lean from the hips.',
      'Pull handle to the sternum.',
      'Allow a controlled stretch forward between reps.',
    ],
  },
  {
    id: 'ex-back-ext',
    name: 'Back Extension',
    muscleGroup: 'Lower Back',
    equipment: 'Machine',
    thumbnailColor: '#4A4034',
    description:
      'Direct work for the spinal erectors and glutes. Excellent for building a resilient lower back.',
    cues: [
      'Hips on the pad, body aligned at the top.',
      'Lower by hinging at the hips, not rounding.',
      'Return to a tall, neutral position.',
    ],
  },

  // ----- Full Body -----
  {
    id: 'ex-clean',
    name: 'Power Clean',
    muscleGroup: 'Full Body',
    equipment: 'Barbell',
    thumbnailColor: '#54494C',
    description:
      'Explosive full-body pull. Builds power across the hips, traps, and upper back.',
    cues: [
      'Set up like a deadlift, bar over mid-foot.',
      'Explode at the top of the pull, shrug hard.',
      'Drop under the bar and catch in a quarter squat.',
    ],
  },
  {
    id: 'ex-kb-swing',
    name: 'Kettlebell Swing',
    muscleGroup: 'Full Body',
    equipment: 'Kettlebell',
    thumbnailColor: '#3F3F3F',
    description:
      'Hip-hinge power movement. Conditions the glutes, hamstrings, and cardiovascular system.',
    cues: [
      'Hinge back, bell between legs.',
      'Drive hips forward powerfully.',
      'Let the bell float to shoulder height; it\u2019s a hinge, not a squat.',
    ],
  },
];

export const muscleGroups: MuscleGroup[] = [
  'Shoulders',
  'Chest',
  'Biceps',
  'Triceps',
  'Forearms',
  'Abs',
  'Quads',
  'Adductors',
  'Traps',
  'Lats',
  'Lower Back',
  'Glutes',
  'Hamstrings',
  'Abductors',
  'Calves',
];

export function getExerciseById(id: string): Exercise | undefined {
  return mockExercises.find((e) => e.id === id);
}
