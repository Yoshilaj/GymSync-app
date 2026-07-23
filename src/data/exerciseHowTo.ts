/**
 * Short, jargon-free how-to steps for every exercise — written for the detail
 * page's "How to" tab. Four-ish bullets each, plain language, imperative.
 * Falls back to the generated dataset instructions when an id is missing.
 */
export const exerciseHowTo: Record<string, string[]> = {
  'ex-bench': [
    'Lie flat with your feet planted on the floor',
    'Grip the bar a little wider than your shoulders',
    'Lower the bar slowly to your mid-chest',
    'Press back up until your arms are straight',
  ],
  'ex-incline': [
    'Set the bench to a gentle incline (around 30°)',
    'Hold a dumbbell in each hand at shoulder height',
    'Press both up and slightly together until arms are straight',
    'Lower back down slowly to shoulder level',
  ],
  'ex-db-bench': [
    'Lie flat holding a dumbbell in each hand at chest level',
    'Press both dumbbells up until your arms are straight',
    'Lower them slowly back to the sides of your chest',
    'Keep your feet planted and back on the bench',
  ],
  'ex-cable-fly': [
    'Stand between the cables, one handle in each hand',
    'Step forward with a slight lean, arms out wide',
    'Bring your hands together in front of your chest in a hugging arc',
    'Open back up slowly and feel the stretch',
  ],
  'ex-pushup': [
    'Hands on the floor, slightly wider than your shoulders',
    'Keep your body in a straight line from head to heels',
    'Lower your chest until it nearly touches the floor',
    'Push back up without letting your hips sag',
  ],
  'ex-dip': [
    'Grab the bars and lift yourself up, arms straight',
    'Lean your chest slightly forward',
    'Bend your elbows and lower until your shoulders drop below them',
    'Press back up to straight arms',
  ],
  'ex-ohp': [
    'Stand tall with the bar at shoulder height',
    'Squeeze your glutes so your back stays straight',
    'Press the bar straight overhead until arms lock out',
    'Lower it back to your shoulders under control',
  ],
  'ex-lateral': [
    'Stand with a light dumbbell in each hand at your sides',
    'Raise both arms out to the sides, up to shoulder height',
    'Keep a small bend in your elbows the whole way',
    'Lower slowly — no swinging',
  ],
  'ex-face-pull': [
    'Set the cable at face height with the rope handle',
    'Pull the rope toward your face, elbows high and wide',
    'Finish with your hands beside your ears',
    'Let the rope back slowly and repeat',
  ],
  'ex-db-shoulder-press': [
    'Sit upright with a dumbbell at each shoulder',
    'Press both straight up until your arms lock out',
    'Don’t let your lower back arch off the seat',
    'Lower back to your shoulders under control',
  ],
  'ex-curl': [
    'Stand with a dumbbell in each hand, palms facing forward',
    'Curl the weights up toward your shoulders',
    'Keep your elbows pinned to your sides',
    'Lower slowly all the way back down',
  ],
  'ex-hammer-curl': [
    'Hold the dumbbells with your palms facing each other',
    'Curl up toward your shoulders, thumbs on top',
    'Keep your elbows still at your sides',
    'Lower under control and repeat',
  ],
  'ex-preacher': [
    'Rest the backs of your upper arms on the pad',
    'Grip the handles or bar with palms up',
    'Curl up until your forearms are vertical',
    'Lower slowly until your arms are almost straight',
  ],
  'ex-cable-curl': [
    'Stand facing the low cable with a straight bar',
    'Curl the bar up to your shoulders',
    'Keep your elbows at your sides and body still',
    'Lower slowly against the cable’s pull',
  ],
  'ex-tricep': [
    'Stand at the high cable with the bar or rope',
    'Keep your elbows pinned to your sides',
    'Push the handle down until your arms are straight',
    'Let it rise back slowly to chest height',
  ],
  'ex-skull-crusher': [
    'Lie on a bench holding the bar above your chest',
    'Bend only your elbows to lower the bar toward your forehead',
    'Stop just above your head',
    'Straighten your arms back to the start',
  ],
  'ex-overhead-ext': [
    'Face away from the low cable, rope behind your head',
    'Start with elbows bent, hands behind your neck',
    'Extend your arms up and forward until straight',
    'Bend back slowly and feel the stretch',
  ],
  'ex-close-grip': [
    'Lie on the bench and grip the bar at shoulder width or closer',
    'Lower the bar to your lower chest, elbows close to your body',
    'Press back up until your arms are straight',
    'Keep your wrists straight throughout',
  ],
  'ex-reverse-curl': [
    'Hold the bar with your palms facing down',
    'Curl it up toward your shoulders',
    'Keep your elbows at your sides',
    'Lower slowly — this one works the forearms hard',
  ],
  'ex-plank': [
    'Rest on your forearms and toes',
    'Make a straight line from head to heels',
    'Squeeze your stomach and glutes',
    'Hold — don’t let your hips drop or pike up',
  ],
  'ex-hanging': [
    'Hang from a pull-up bar with straight arms',
    'Raise your legs together until they’re parallel to the floor (or higher)',
    'Lower them slowly without swinging',
    'Bend your knees to make it easier',
  ],
  'ex-cable-crunch': [
    'Kneel below the high cable holding the rope beside your head',
    'Crunch down, bringing your elbows toward your knees',
    'Round your back like curling into a ball',
    'Rise back up slowly and repeat',
  ],
  'ex-ab-wheel': [
    'Kneel with both hands on the wheel',
    'Roll forward slowly, keeping your stomach tight',
    'Go only as far as you can without your back arching',
    'Pull yourself back to the start',
  ],
  'ex-squat': [
    'Rest the bar across your upper back, feet shoulder-width',
    'Sit down and back like reaching for a chair',
    'Go as deep as comfortable, knees tracking over toes',
    'Drive through your whole foot to stand back up',
  ],
  'ex-front-squat': [
    'Rest the bar on the front of your shoulders, elbows high',
    'Keep your chest up throughout',
    'Squat down as deep as comfortable',
    'Stand back up without letting your elbows drop',
  ],
  'ex-leg-press': [
    'Sit in the machine with feet shoulder-width on the platform',
    'Lower the platform until your knees near your chest',
    'Press back up without locking your knees hard',
    'Keep your lower back against the seat',
  ],
  'ex-lunge': [
    'Stand with a dumbbell in each hand',
    'Step forward and lower until both knees are bent at 90°',
    'Keep your torso upright',
    'Push off the front foot to step back — then switch legs',
  ],
  'ex-leg-ext': [
    'Sit in the machine with the pad on your shins',
    'Straighten your legs all the way out',
    'Pause a moment at the top',
    'Lower slowly — don’t let the stack slam',
  ],
  'ex-rdl': [
    'Hold the bar in front of your thighs, knees slightly bent',
    'Push your hips back and slide the bar down your legs',
    'Stop when you feel a strong stretch in your hamstrings',
    'Drive your hips forward to stand tall again',
  ],
  'ex-leg-curl': [
    'Sit in the machine with the pad behind your ankles',
    'Curl your heels down and under you',
    'Squeeze at the bottom',
    'Let your legs straighten slowly',
  ],
  'ex-hip-thrust': [
    'Sit with your upper back against a bench, bar over your hips',
    'Plant your feet flat, shoulder-width apart',
    'Drive your hips up until your body is level like a table',
    'Squeeze your glutes hard at the top, then lower',
  ],
  'ex-bulgarian': [
    'Stand a step in front of a bench, one foot resting on it behind you',
    'Hold a dumbbell in each hand',
    'Lower straight down until your front thigh is parallel',
    'Push through the front foot to stand — then switch legs',
  ],
  'ex-adductor': [
    'Sit in the machine with the pads inside your knees',
    'Squeeze your legs together smoothly',
    'Pause briefly when they meet',
    'Open back up slowly against the weight',
  ],
  'ex-abductor': [
    'Sit in the machine with the pads outside your knees',
    'Push your legs apart as far as comfortable',
    'Pause at the widest point',
    'Bring them back together slowly',
  ],
  'ex-calf-raise': [
    'Stand with the balls of your feet on the edge of a step',
    'Rise up onto your toes as high as you can',
    'Pause at the top',
    'Lower your heels below the step for a stretch',
  ],
  'ex-seated-calf': [
    'Sit with the pad on your knees, balls of feet on the platform',
    'Press up onto your toes',
    'Squeeze your calves at the top',
    'Lower your heels slowly for a full stretch',
  ],
  'ex-pullup': [
    'Hang from the bar with hands just wider than your shoulders',
    'Pull yourself up until your chin clears the bar',
    'Lower yourself all the way down slowly',
    'Avoid swinging or kicking for momentum',
  ],
  'ex-lat-pulldown': [
    'Sit with your thighs under the pads, wide grip on the bar',
    'Pull the bar down to the top of your chest',
    'Squeeze your shoulder blades together',
    'Let the bar rise slowly until your arms are straight',
  ],
  'ex-shrug': [
    'Hold the bar in front of your thighs',
    'Lift your shoulders straight up toward your ears',
    'Pause at the top — no rolling',
    'Lower them back down slowly',
  ],
  'ex-db-shrug': [
    'Hold a heavy dumbbell at each side',
    'Shrug your shoulders straight up',
    'Hold the squeeze for a second',
    'Lower slowly and repeat',
  ],
  'ex-deadlift': [
    'Stand with the bar over the middle of your feet',
    'Bend down and grip it just outside your legs',
    'Push the floor away and stand up tall, bar close to your body',
    'Lower it back down by pushing your hips back',
  ],
  'ex-row': [
    'Hold the bar and hinge forward until your torso is near parallel',
    'Let the bar hang at arm’s length',
    'Pull it up to your lower ribs',
    'Lower it slowly without standing up',
  ],
  'ex-tbar': [
    'Lie chest-down on the pad and grip the handles',
    'Pull the weight up toward your chest',
    'Squeeze your shoulder blades together at the top',
    'Lower slowly until your arms are straight',
  ],
  'ex-seated-row': [
    'Sit tall with your feet on the platform, knees slightly bent',
    'Pull the handle to your stomach',
    'Keep your chest up — don’t rock backward',
    'Let the handle return slowly, arms fully extending',
  ],
  'ex-back-ext': [
    'Set your hips on the pad with your ankles locked in',
    'Lower your upper body toward the floor',
    'Lift back up until your body forms a straight line',
    'Don’t swing or over-arch at the top',
  ],
};

export function getExerciseHowTo(id: string): string[] | undefined {
  return exerciseHowTo[id];
}
