import { ProgressData } from '@/types';

const days = (n: number) => {
  const out: string[] = [];
  const today = new Date('2026-04-17');
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    out.push(d.toISOString().slice(5, 10));
  }
  return out;
};

const weeklyDates = days(14);

export const mockProgress: ProgressData = {
  estimated1RM: weeklyDates.map((date, i) => ({
    date,
    value: 225 + Math.round(i * 1.5 + Math.sin(i) * 3),
  })),
  weightLifted: weeklyDates.map((date, i) => ({
    date,
    value: 8500 + i * 250 + (i % 3) * 400,
  })),
  dailyCalories: weeklyDates.map((date, i) => ({
    date,
    value: 2500 + Math.round(Math.sin(i * 0.8) * 200 + (i % 2 ? 150 : -100)),
  })),
  calorieTarget: 2750,
  bodyweight: weeklyDates.map((date, i) => ({
    date,
    value: 178 + i * 0.08,
  })),
  volumeByMuscle: [
    { muscle: 'Chest', volume: 14200 },
    { muscle: 'Back', volume: 18400 },
    { muscle: 'Legs', volume: 22600 },
    { muscle: 'Shoulders', volume: 7800 },
    { muscle: 'Arms', volume: 6200 },
    { muscle: 'Core', volume: 2100 },
  ],
  prsThisMonth: 4,
  currentStreak: 11,
  daysTrainedThisWeek: 3,
};
