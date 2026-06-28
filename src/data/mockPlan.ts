import { WeeklyPlan, PlannedWorkout } from '@/types';

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

export function getTodaysWorkout(): PlannedWorkout {
  return push;
}
