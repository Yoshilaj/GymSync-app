import { Exercise } from '@/types';

export const mockExercises: Exercise[] = [
  {
    id: 'ex-bench',
    name: 'Barbell Bench Press',
    muscleGroup: 'Chest',
    equipment: 'Barbell',
    thumbnailColor: '#B23A1E',
    cues: [
      'Retract shoulder blades and pin them to the bench.',
      'Unrack with straight arms, lower the bar to mid-chest.',
      'Drive feet into floor, press in a slight arc toward the rack.',
    ],
  },
  {
    id: 'ex-squat',
    name: 'Back Squat',
    muscleGroup: 'Legs',
    equipment: 'Barbell',
    thumbnailColor: '#2E5C8A',
    cues: [
      'Brace hard before unracking.',
      'Sit between your heels, chest up.',
      'Drive through mid-foot on the way up, knees tracking toes.',
    ],
  },
  {
    id: 'ex-deadlift',
    name: 'Conventional Deadlift',
    muscleGroup: 'Back',
    equipment: 'Barbell',
    thumbnailColor: '#3A3A52',
    cues: [
      'Bar over mid-foot, shins vertical at setup.',
      'Lats tight, take the slack out of the bar.',
      'Push the floor away — hips and shoulders rise together.',
    ],
  },
  {
    id: 'ex-ohp',
    name: 'Overhead Press',
    muscleGroup: 'Shoulders',
    equipment: 'Barbell',
    thumbnailColor: '#6E3CBC',
    cues: [
      'Elbows slightly in front of the bar.',
      'Squeeze glutes, press straight up through the bar path.',
      'Finish with the bar over the back of the neck.',
    ],
  },
  {
    id: 'ex-pullup',
    name: 'Pull-Up',
    muscleGroup: 'Back',
    equipment: 'Bodyweight',
    thumbnailColor: '#1F6F4A',
    cues: [
      'Start from a dead hang.',
      'Drive elbows to hips, chest to bar.',
      'Control the descent — no kipping.',
    ],
  },
  {
    id: 'ex-rdl',
    name: 'Romanian Deadlift',
    muscleGroup: 'Legs',
    equipment: 'Barbell',
    thumbnailColor: '#3F5E7A',
    cues: [
      'Soft knees, hinge at hips.',
      'Bar travels along thighs.',
      'Feel the stretch in hamstrings before driving up.',
    ],
  },
  {
    id: 'ex-row',
    name: 'Bent-Over Row',
    muscleGroup: 'Back',
    equipment: 'Barbell',
    thumbnailColor: '#4A3B2C',
    cues: [
      'Hinge until torso ~45°.',
      'Pull bar to lower chest / upper abs.',
      'No shrugging — lats drive it.',
    ],
  },
  {
    id: 'ex-db-bench',
    name: 'Dumbbell Bench Press',
    muscleGroup: 'Chest',
    equipment: 'Dumbbell',
    thumbnailColor: '#9B2D1E',
    cues: [
      'DBs at chest height, slight arch.',
      'Press and squeeze at the top.',
      'Full range — let elbows drop just below shoulder line.',
    ],
  },
  {
    id: 'ex-lat-pulldown',
    name: 'Lat Pulldown',
    muscleGroup: 'Back',
    equipment: 'Cable',
    thumbnailColor: '#257A6D',
    cues: [
      'Slight lean back, chest up.',
      'Pull the bar to collarbone.',
      'Control the eccentric — no crashing plates.',
    ],
  },
  {
    id: 'ex-curl',
    name: 'Dumbbell Curl',
    muscleGroup: 'Arms',
    equipment: 'Dumbbell',
    thumbnailColor: '#8A5A2B',
    cues: [
      'Elbows pinned at sides.',
      'Supinate as you curl.',
      'Slow the eccentric — 2 seconds down.',
    ],
  },
  {
    id: 'ex-tricep',
    name: 'Triceps Pushdown',
    muscleGroup: 'Arms',
    equipment: 'Cable',
    thumbnailColor: '#6E4B22',
    cues: [
      'Elbows fixed, only forearm moves.',
      'Full lockout at the bottom.',
      'Lean in slightly if pulley is too light.',
    ],
  },
  {
    id: 'ex-lateral',
    name: 'Dumbbell Lateral Raise',
    muscleGroup: 'Shoulders',
    equipment: 'Dumbbell',
    thumbnailColor: '#5C3C99',
    cues: [
      'Slight bend in elbows, don’t lock out.',
      'Lead with elbows, not hands.',
      'Pause briefly at the top.',
    ],
  },
  {
    id: 'ex-leg-press',
    name: 'Leg Press',
    muscleGroup: 'Legs',
    equipment: 'Machine',
    thumbnailColor: '#2A4E74',
    cues: [
      'Feet shoulder-width, toes slightly out.',
      'Lower until knees near chest — no lower back rounding.',
      'Don’t lock knees at the top.',
    ],
  },
  {
    id: 'ex-hip-thrust',
    name: 'Barbell Hip Thrust',
    muscleGroup: 'Legs',
    equipment: 'Barbell',
    thumbnailColor: '#335E42',
    cues: [
      'Upper back on the bench, feet flat and close.',
      'Chin tucked, ribs down.',
      'Squeeze glutes hard at lockout, brief pause.',
    ],
  },
  {
    id: 'ex-plank',
    name: 'Plank',
    muscleGroup: 'Core',
    equipment: 'Bodyweight',
    thumbnailColor: '#4E4E5F',
    cues: [
      'Forearms and toes, straight line head to heels.',
      'Tuck pelvis slightly, squeeze glutes.',
      'Breathe — don’t hold breath.',
    ],
  },
  {
    id: 'ex-incline',
    name: 'Incline Dumbbell Press',
    muscleGroup: 'Chest',
    equipment: 'Dumbbell',
    thumbnailColor: '#A84B2C',
    cues: [
      'Bench at 30°.',
      'DBs above upper chest line.',
      'Control the descent — pause briefly before pressing.',
    ],
  },
  {
    id: 'ex-face-pull',
    name: 'Cable Face Pull',
    muscleGroup: 'Shoulders',
    equipment: 'Cable',
    thumbnailColor: '#7E5AAE',
    cues: [
      'Rope at forehead height.',
      'Pull to the face, elbows high.',
      'External rotation at the end — T-pose finish.',
    ],
  },
  {
    id: 'ex-goblet',
    name: 'Goblet Squat',
    muscleGroup: 'Legs',
    equipment: 'Kettlebell',
    thumbnailColor: '#2F6374',
    cues: [
      'Hold weight at chest, elbows inside knees.',
      'Sit straight down between your feet.',
      'Drive up through heels.',
    ],
  },
  {
    id: 'ex-hanging',
    name: 'Hanging Leg Raise',
    muscleGroup: 'Core',
    equipment: 'Bodyweight',
    thumbnailColor: '#4C5E40',
    cues: [
      'Dead hang, posterior pelvic tilt first.',
      'Raise legs until hips flex past 90°.',
      'Lower slowly — no swinging.',
    ],
  },
  {
    id: 'ex-farmer',
    name: 'Farmer Carry',
    muscleGroup: 'Full Body',
    equipment: 'Dumbbell',
    thumbnailColor: '#575757',
    cues: [
      'Tall posture, shoulders packed.',
      'Short, steady strides.',
      'Breathe behind the brace.',
    ],
  },
];

export const muscleGroups: Array<import('@/types').MuscleGroup> = [
  'Chest',
  'Back',
  'Legs',
  'Shoulders',
  'Arms',
  'Core',
  'Full Body',
];

export function getExerciseById(id: string): Exercise | undefined {
  return mockExercises.find((e) => e.id === id);
}
