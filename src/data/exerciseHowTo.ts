/**
 * Short, jargon-free how-to steps for every exercise — written for the detail
 * page's "How to" tab. Four-ish bullets each, plain language, imperative.
 *
 * Every step is capped at ~42 characters so it renders on a single line, and
 * every entry was checked against its illustration in assets/exercises/ —
 * equipment and body position describe what the picture actually shows.
 */
export const exerciseHowTo: Record<string, string[]> = {
  // ---- Chest ----
  'ex-bench': [
    'Lie flat, feet planted on the floor',
    'Grip the bar just wider than shoulders',
    'Lower the bar to your mid-chest',
    'Press up until your arms lock out',
  ],
  'ex-incline': [
    'Set the bench to a low incline',
    'Hold a dumbbell in each hand',
    'Press both up until arms are straight',
    'Lower slowly to shoulder level',
  ],
  'ex-db-bench': [
    'Lie flat, a dumbbell in each hand',
    'Press both up until arms are straight',
    'Lower to the sides of your chest',
    'Keep feet planted, back on bench',
  ],
  'ex-cable-fly': [
    'Grab a handle from each high pulley',
    'Stand tall, step forward slightly',
    'Sweep hands together in an arc',
    'Open slowly and feel the stretch',
  ],
  'ex-pushup': [
    'Hands under shoulders on the floor',
    'Keep body straight, head to heels',
    'Lower chest toward the floor',
    'Push back up, no hip sag',
  ],
  'ex-dip': [
    'Hold the bars, push to straight arms',
    'Lean your chest forward',
    'Bend elbows, lower down slowly',
    'Press back up to straight arms',
  ],
  'ex-chest-press': [
    'Sit with handles at chest height',
    'Back flat against the pad',
    'Press forward until arms are straight',
    'Return slowly, control the weight',
  ],
  'ex-incline-barbell': [
    'Set the bench to a low incline',
    'Grip the bar wider than shoulders',
    'Lower the bar to your upper chest',
    'Press up and slightly back',
  ],
  'ex-pec-fly': [
    'Sit with back flat on the pad',
    'Grip the handles, elbows soft',
    'Bring the handles together in front',
    'Squeeze, then return slowly',
  ],
  'ex-cable-pullover': [
    'Face the high pulley, grip the bar',
    'Hinge forward, arms long and straight',
    'Pull the bar down in an arc',
    'Feel the lats, return slowly',
  ],

  // ---- Shoulders ----
  'ex-ohp': [
    'Sit tall, bar at shoulder height',
    'Press the bar straight overhead',
    'Lock out your arms at the top',
    'Lower it back to your shoulders',
  ],
  'ex-lateral': [
    'Stand with a dumbbell in each hand',
    'Raise arms out to shoulder height',
    'Keep a slight bend in your elbows',
    'Lower slowly with no swinging',
  ],
  'ex-face-pull': [
    'Set the rope at face height',
    'Pull the rope toward your face',
    'Keep your elbows high and wide',
    'Let the rope back slowly',
  ],
  'ex-db-shoulder-press': [
    'Sit tall, a dumbbell at each shoulder',
    'Press both straight up overhead',
    'Lock out your arms at the top',
    'Lower to shoulder height slowly',
  ],

  // ---- Biceps ----
  'ex-curl': [
    'Stand with a dumbbell in each hand',
    'Curl the weights to your shoulders',
    'Keep elbows pinned at your sides',
    'Lower slowly all the way down',
  ],
  'ex-hammer-curl': [
    'Hold a dumbbell in each hand',
    'Curl up with palms facing in',
    'Keep your elbows still at your sides',
    'Lower under control and repeat',
  ],
  'ex-preacher': [
    'Rest your arms on the angled pad',
    'Grip the EZ bar with palms up',
    'Curl the bar toward your shoulders',
    'Lower until your arms are straight',
  ],
  'ex-cable-curl': [
    'Stand facing the low cable pulley',
    'Grip the straight bar, palms up',
    'Curl the bar up to your shoulders',
    'Lower slowly against the pull',
  ],

  // ---- Triceps ----
  'ex-tricep': [
    'Stand at the high cable with a rope',
    'Keep elbows pinned at your sides',
    'Push the rope down until arms lock',
    'Let it rise back slowly',
  ],
  'ex-skull-crusher': [
    'Lie on the bench, EZ bar overhead',
    'Bend elbows, lower toward forehead',
    'Stop just above your forehead',
    'Straighten your arms back up',
  ],
  'ex-overhead-ext': [
    'Stand facing away from the cable',
    'Hold the rope behind your head',
    'Extend your arms straight overhead',
    'Lower slowly behind your head',
  ],
  'ex-close-grip': [
    'Lie flat, hands close on the bar',
    'Lower the bar to your lower chest',
    'Keep elbows tucked close to body',
    'Press up until your arms lock out',
  ],

  // ---- Forearms ----
  'ex-reverse-curl': [
    'Hold a barbell, palms facing down',
    'Curl it up toward your shoulders',
    'Keep your elbows at your sides',
    'Lower slowly under control',
  ],
  'ex-barbell-curl': [
    'Hold the bar with palms facing up',
    'Curl the bar up to your shoulders',
    'Keep elbows pinned at your sides',
    'Lower slowly to work the forearms',
  ],
  'ex-cable-wrist-curl': [
    'Stand holding the bar, palms forward',
    'Let the bar roll down your fingers',
    'Curl the bar up using your wrists',
    'Squeeze the top, then lower slowly',
  ],
  'ex-cable-reverse-wrist-curl': [
    'Stand holding the bar, palms down',
    'Let your wrists drop down',
    'Lift the back of your hands up',
    'Lower slowly under control',
  ],

  // ---- Abs ----
  'ex-plank': [
    'Rest on your forearms and toes',
    'Straight line from head to heels',
    'Squeeze your abs and glutes',
    "Hold steady, don't let hips drop",
  ],
  'ex-hanging': [
    'Hang from the bar, arms straight',
    'Raise your legs up in front of you',
    'Bring them to about waist height',
    'Lower slowly without swinging',
  ],
  'ex-cable-crunch': [
    'Kneel below the high cable',
    'Hold the rope beside your head',
    'Crunch down toward the floor',
    'Rise back up slowly',
  ],
  'ex-ab-wheel': [
    'Kneel and grip the ab wheel',
    'Roll forward, keep your abs tight',
    'Go as far as you can hold',
    'Pull back to the start',
  ],
  'ex-crunch': [
    'Lie back with your knees bent',
    'Hands lightly behind your head',
    'Curl your shoulders off the floor',
    'Lower slowly and repeat',
  ],
  'ex-leg-raise': [
    'Lie flat with your legs straight',
    'Rest your hands by your sides',
    'Raise your legs up together',
    'Lower slowly without arching',
  ],

  // ---- Quads ----
  'ex-squat': [
    'Rest the bar on your upper back',
    'Feet shoulder-width, brace hard',
    'Sit down and back, chest up',
    'Drive through your feet to stand',
  ],
  'ex-front-squat': [
    'Rest the bar on your front delts',
    'Keep elbows high, chest tall',
    'Squat down while staying upright',
    "Stand up, don't drop your elbows",
  ],
  'ex-leg-press': [
    'Sit back, feet on the platform',
    'Lower the platform toward your chest',
    'Press until legs are nearly straight',
    "Don't lock your knees at the top",
  ],
  'ex-lunge': [
    'Hold a dumbbell, step into a lunge',
    'Lower until both knees bend deep',
    'Keep your torso tall and upright',
    'Push through the front foot to rise',
  ],
  'ex-leg-ext': [
    'Sit with the pad on your shins',
    'Straighten your legs all the way',
    'Squeeze hard at the top',
    'Lower slowly under control',
  ],
  'ex-hack-squat': [
    'Set shoulders under the pads',
    'Back flat on the angled sled',
    'Bend knees to at least parallel',
    'Drive up, keep your knees soft',
  ],
  'ex-bulgarian': [
    'Rest your rear foot on a bench',
    'Hold a dumbbell, stand in a lunge',
    'Lower straight down, front leg bent',
    'Push through the front heel to rise',
  ],

  // ---- Hamstrings / Glutes ----
  'ex-rdl': [
    'Hold the bar in front of your thighs',
    'Push your hips back, soft knees',
    'Slide the bar down your legs',
    'Drive hips forward to stand tall',
  ],
  'ex-leg-curl': [
    'Sit, pad on your lower shins',
    'Lock the thigh pad over your legs',
    'Curl your heels down and back',
    'Straighten your legs slowly',
  ],
  'ex-hip-thrust': [
    'Rest your upper back on a bench',
    'Set the bar across your hips',
    'Plant your feet flat, knees bent',
    'Drive hips up, squeeze your glutes',
  ],

  // ---- Adductors / Abductors ----
  'ex-adductor': [
    'Sit, pads inside your knees',
    'Squeeze your legs together smoothly',
    'Pause briefly when they meet',
    'Open back up slowly, no bouncing',
  ],
  'ex-abductor': [
    'Sit, pads against your outer knees',
    'Push your legs apart into the pads',
    'Pause at the widest point',
    'Bring them back together slowly',
  ],

  // ---- Calves ----
  'ex-calf-raise': [
    'Stand tall on a step, hands on hips',
    'Balls of your feet on the edge',
    'Rise up onto your toes, pause high',
    'Lower your heels below the step',
  ],
  'ex-seated-calf': [
    'Sit with the pad across your knees',
    'Balls of your feet on the platform',
    'Press onto your toes and squeeze',
    'Lower your heels for a full stretch',
  ],

  // ---- Traps ----
  'ex-shrug': [
    'Hold the barbell in front of you',
    'Lift shoulders toward your ears',
    'Pause at the top, no rolling',
    'Lower them slowly',
  ],
  'ex-db-shrug': [
    'A dumbbell in each hand at sides',
    'Shrug your shoulders straight up',
    'Squeeze at the top for a second',
    'Lower slowly and repeat',
  ],

  // ---- Lats / Back ----
  'ex-pullup': [
    'Hang, hands just past shoulders',
    'Pull up, chin over the bar',
    'Lower all the way down slowly',
    'Avoid swinging for momentum',
  ],
  'ex-lat-pulldown': [
    'Sit, thighs under the pads',
    'Grip the wide bar overhead',
    'Pull the bar to your upper chest',
    'Let it rise until arms straight',
  ],
  'ex-row': [
    'Hinge forward, torso near parallel',
    "Let the bar hang at arm's length",
    'Pull the bar up to your lower ribs',
    'Lower slowly without standing up',
  ],
  'ex-tbar': [
    'Rest your chest on the angled pad',
    'Grip the handles below you',
    'Pull the weight up to your chest',
    'Lower slowly until arms straight',
  ],
  'ex-seated-row': [
    'Sit tall, feet on the platform',
    'Pull the handle to your stomach',
    "Chest up, don't rock back",
    'Return slowly, arms straight',
  ],

  // ---- Lower back ----
  'ex-deadlift': [
    'Set the bar over your mid-foot',
    'Bend, grip just outside your legs',
    'Push the floor away, stand tall',
    'Lower by pushing your hips back',
  ],
  'ex-back-ext': [
    'Hips on the pad, ankles hooked in',
    'Cross arms, lower your torso',
    'Lift back up to a straight line',
    "Don't swing or over-arch the top",
  ],
};

export function getExerciseHowTo(id: string): string[] | undefined {
  return exerciseHowTo[id];
}
