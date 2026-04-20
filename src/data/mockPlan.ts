import { WeeklyPlan, CalorieGoal, PlannedWorkout, FoodIntakeEntry } from '@/types';

const push: PlannedWorkout = {
  id: 'w-push',
  dayLabel: 'Mon',
  title: 'Push Day',
  estMinutes: 55,
  exercises: [
    {
      exerciseId: 'ex-bench',
      sets: [
        { id: 's1', exerciseId: 'ex-bench', targetReps: 5, weight: 185 },
        { id: 's2', exerciseId: 'ex-bench', targetReps: 5, weight: 185 },
        { id: 's3', exerciseId: 'ex-bench', targetReps: 5, weight: 185 },
      ],
      note: 'Hit 3x5 last week — push for 4x5 today if set 3 felt clean.',
    },
    {
      exerciseId: 'ex-incline',
      sets: [
        { id: 's4', exerciseId: 'ex-incline', targetReps: 10, weight: 55 },
        { id: 's5', exerciseId: 'ex-incline', targetReps: 10, weight: 55 },
        { id: 's6', exerciseId: 'ex-incline', targetReps: 10, weight: 55 },
      ],
    },
    {
      exerciseId: 'ex-lateral',
      sets: [
        { id: 's7', exerciseId: 'ex-lateral', targetReps: 12, weight: 20 },
        { id: 's8', exerciseId: 'ex-lateral', targetReps: 12, weight: 20 },
        { id: 's9', exerciseId: 'ex-lateral', targetReps: 12, weight: 20 },
      ],
    },
    {
      exerciseId: 'ex-tricep',
      sets: [
        { id: 's10', exerciseId: 'ex-tricep', targetReps: 12, weight: 50 },
        { id: 's11', exerciseId: 'ex-tricep', targetReps: 12, weight: 50 },
        { id: 's12', exerciseId: 'ex-tricep', targetReps: 12, weight: 50 },
      ],
    },
  ],
};

const pull: PlannedWorkout = {
  id: 'w-pull',
  dayLabel: 'Tue',
  title: 'Pull Day',
  estMinutes: 60,
  exercises: [
    {
      exerciseId: 'ex-deadlift',
      sets: [
        { id: 's13', exerciseId: 'ex-deadlift', targetReps: 3, weight: 315 },
        { id: 's14', exerciseId: 'ex-deadlift', targetReps: 3, weight: 315 },
        { id: 's15', exerciseId: 'ex-deadlift', targetReps: 3, weight: 315 },
      ],
    },
    {
      exerciseId: 'ex-pullup',
      sets: [
        { id: 's16', exerciseId: 'ex-pullup', targetReps: 8, weight: 0 },
        { id: 's17', exerciseId: 'ex-pullup', targetReps: 8, weight: 0 },
        { id: 's18', exerciseId: 'ex-pullup', targetReps: 8, weight: 0 },
      ],
    },
    {
      exerciseId: 'ex-row',
      sets: [
        { id: 's19', exerciseId: 'ex-row', targetReps: 8, weight: 155 },
        { id: 's20', exerciseId: 'ex-row', targetReps: 8, weight: 155 },
        { id: 's21', exerciseId: 'ex-row', targetReps: 8, weight: 155 },
      ],
    },
    {
      exerciseId: 'ex-curl',
      sets: [
        { id: 's22', exerciseId: 'ex-curl', targetReps: 10, weight: 35 },
        { id: 's23', exerciseId: 'ex-curl', targetReps: 10, weight: 35 },
        { id: 's24', exerciseId: 'ex-curl', targetReps: 10, weight: 35 },
      ],
    },
  ],
};

const legs: PlannedWorkout = {
  id: 'w-legs',
  dayLabel: 'Thu',
  title: 'Legs Day',
  estMinutes: 65,
  exercises: [
    {
      exerciseId: 'ex-squat',
      sets: [
        { id: 's25', exerciseId: 'ex-squat', targetReps: 5, weight: 245 },
        { id: 's26', exerciseId: 'ex-squat', targetReps: 5, weight: 245 },
        { id: 's27', exerciseId: 'ex-squat', targetReps: 5, weight: 245 },
        { id: 's28', exerciseId: 'ex-squat', targetReps: 5, weight: 245 },
      ],
    },
    {
      exerciseId: 'ex-rdl',
      sets: [
        { id: 's29', exerciseId: 'ex-rdl', targetReps: 8, weight: 185 },
        { id: 's30', exerciseId: 'ex-rdl', targetReps: 8, weight: 185 },
        { id: 's31', exerciseId: 'ex-rdl', targetReps: 8, weight: 185 },
      ],
    },
    {
      exerciseId: 'ex-leg-press',
      sets: [
        { id: 's32', exerciseId: 'ex-leg-press', targetReps: 12, weight: 270 },
        { id: 's33', exerciseId: 'ex-leg-press', targetReps: 12, weight: 270 },
      ],
    },
  ],
};

const upper: PlannedWorkout = {
  id: 'w-upper',
  dayLabel: 'Fri',
  title: 'Upper Day',
  estMinutes: 50,
  exercises: [
    {
      exerciseId: 'ex-db-bench',
      sets: [
        { id: 's34', exerciseId: 'ex-db-bench', targetReps: 10, weight: 70 },
        { id: 's35', exerciseId: 'ex-db-bench', targetReps: 10, weight: 70 },
        { id: 's36', exerciseId: 'ex-db-bench', targetReps: 10, weight: 70 },
      ],
    },
    {
      exerciseId: 'ex-lat-pulldown',
      sets: [
        { id: 's37', exerciseId: 'ex-lat-pulldown', targetReps: 10, weight: 140 },
        { id: 's38', exerciseId: 'ex-lat-pulldown', targetReps: 10, weight: 140 },
        { id: 's39', exerciseId: 'ex-lat-pulldown', targetReps: 10, weight: 140 },
      ],
    },
    {
      exerciseId: 'ex-face-pull',
      sets: [
        { id: 's40', exerciseId: 'ex-face-pull', targetReps: 15, weight: 40 },
        { id: 's41', exerciseId: 'ex-face-pull', targetReps: 15, weight: 40 },
      ],
    },
  ],
};

export const mockPlan: WeeklyPlan = {
  startDate: '2026-04-13',
  workouts: [push, pull, legs, upper],
  restDays: ['Wed', 'Sat', 'Sun'],
};

export const mockCalorieGoal: CalorieGoal = {
  dailyKcal: 2750,
  proteinG: 185,
  carbsG: 300,
  fatG: 80,
};

export function getTodaysWorkout(): PlannedWorkout {
  return push;
}

export const mockFoodIntake: FoodIntakeEntry[] = [
  {
    id: 'fi-1',
    dayLabel: 'Mon',
    time: '7:20 AM',
    title: 'Greek yogurt bowl',
    description: 'honey, granola, blueberries',
    emoji: '🥣',
    thumbnailColor: '#F3E8C8',
    imageUrl:
      'https://images.unsplash.com/photo-1488477181946-6428a0291777?auto=format&fit=crop&w=800&q=80',
    kcal: 420,
    proteinG: 28,
    carbsG: 52,
    fatG: 10,
  },
  {
    id: 'fi-2',
    dayLabel: 'Mon',
    time: '12:45 PM',
    title: 'Chicken rice bowl',
    description: 'grilled chicken, brown rice, avocado',
    emoji: '🍱',
    thumbnailColor: '#DDE8C9',
    imageUrl:
      'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=800&q=80',
    kcal: 680,
    proteinG: 52,
    carbsG: 78,
    fatG: 18,
  },
  {
    id: 'fi-3',
    dayLabel: 'Mon',
    time: '4:10 PM',
    title: 'Poke avocado bowl',
    description: 'salmon, avocado, edamame, rice',
    emoji: '🍣',
    thumbnailColor: '#E4DDF4',
    imageUrl:
      'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=800&q=80',
    kcal: 620,
    proteinG: 38,
    carbsG: 58,
    fatG: 22,
  },
  {
    id: 'fi-4',
    dayLabel: 'Tue',
    time: '8:35 AM',
    title: 'Eggs & toast',
    description: 'eggs, toast, side salad',
    emoji: '🍳',
    thumbnailColor: '#F7E2C2',
    imageUrl:
      'https://images.unsplash.com/photo-1525351484163-7529414344d8?auto=format&fit=crop&w=800&q=80',
    kcal: 440,
    proteinG: 24,
    carbsG: 38,
    fatG: 22,
  },
  {
    id: 'fi-5',
    dayLabel: 'Tue',
    time: '1:05 PM',
    title: 'Salmon & greens',
    description: 'baked salmon, broccoli, quinoa',
    emoji: '🐟',
    thumbnailColor: '#E9D9CE',
    imageUrl:
      'https://images.unsplash.com/photo-1467003909585-2f8a72700288?auto=format&fit=crop&w=800&q=80',
    kcal: 580,
    proteinG: 46,
    carbsG: 42,
    fatG: 24,
  },
  {
    id: 'fi-6',
    dayLabel: 'Wed',
    time: '7:55 AM',
    title: 'Overnight oats',
    description: 'peanut butter, chia, maple',
    emoji: '🥜',
    thumbnailColor: '#EADCC6',
    imageUrl:
      'https://images.unsplash.com/photo-1517673400267-0251440c45dc?auto=format&fit=crop&w=800&q=80',
    kcal: 450,
    proteinG: 22,
    carbsG: 60,
    fatG: 16,
  },
  {
    id: 'fi-7',
    dayLabel: 'Wed',
    time: '1:30 PM',
    title: 'Failed to scan the food',
    description: 'tap to try again',
    emoji: '⚠️',
    thumbnailColor: '#F4DCD5',
    kcal: 0,
    proteinG: 0,
    carbsG: 0,
    fatG: 0,
    failed: true,
  },
  {
    id: 'fi-8',
    dayLabel: 'Thu',
    time: '8:05 AM',
    title: 'Avocado toast',
    description: 'sourdough, chili flakes, egg',
    emoji: '🥑',
    thumbnailColor: '#DCE7D1',
    imageUrl:
      'https://images.unsplash.com/photo-1525351484163-7529414344d8?auto=format&fit=crop&w=800&q=80',
    kcal: 380,
    proteinG: 18,
    carbsG: 42,
    fatG: 14,
  },
  {
    id: 'fi-9',
    dayLabel: 'Thu',
    time: '6:40 PM',
    title: 'Steak & sweet potato',
    description: 'ribeye, roasted yam, asparagus',
    emoji: '🥩',
    thumbnailColor: '#E6CFC7',
    imageUrl:
      'https://images.unsplash.com/photo-1558030006-450675393462?auto=format&fit=crop&w=800&q=80',
    kcal: 720,
    proteinG: 58,
    carbsG: 44,
    fatG: 32,
  },
  {
    id: 'fi-10',
    dayLabel: 'Fri',
    time: '7:30 AM',
    title: 'Berry smoothie',
    description: 'whey, mixed berries, spinach',
    emoji: '🫐',
    thumbnailColor: '#D9D2EE',
    imageUrl:
      'https://images.unsplash.com/photo-1553530666-ba11a7da3888?auto=format&fit=crop&w=800&q=80',
    kcal: 330,
    proteinG: 34,
    carbsG: 32,
    fatG: 8,
  },
  {
    id: 'fi-11',
    dayLabel: 'Fri',
    time: '12:50 PM',
    title: 'Turkey wrap',
    description: 'turkey, hummus, spinach, tomato',
    emoji: '🌯',
    thumbnailColor: '#EADDC1',
    imageUrl:
      'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?auto=format&fit=crop&w=800&q=80',
    kcal: 520,
    proteinG: 38,
    carbsG: 54,
    fatG: 16,
  },
];

export function getIntakeForDay(dayLabel: string): FoodIntakeEntry[] {
  return mockFoodIntake.filter((f) => f.dayLabel === dayLabel);
}
