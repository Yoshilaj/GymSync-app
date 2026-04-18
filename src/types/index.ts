export type MuscleGroup =
  | 'Chest'
  | 'Back'
  | 'Legs'
  | 'Shoulders'
  | 'Arms'
  | 'Core'
  | 'Full Body';

export type Equipment =
  | 'Barbell'
  | 'Dumbbell'
  | 'Machine'
  | 'Cable'
  | 'Bodyweight'
  | 'Kettlebell';

export type CoachPersonality = 'supportive' | 'intense' | 'roast_light';

export type Units = 'lbs' | 'kg';

export interface Exercise {
  id: string;
  name: string;
  muscleGroup: MuscleGroup;
  equipment: Equipment;
  cues: string[];
  thumbnailColor: string;
}

export interface PlannedSet {
  id: string;
  exerciseId: string;
  targetReps: number;
  weight: number;
  achievedReps?: number;
  completed?: boolean;
}

export interface PlannedExercise {
  exerciseId: string;
  sets: PlannedSet[];
  note?: string;
}

export interface PlannedWorkout {
  id: string;
  dayLabel: string;
  title: string;
  estMinutes: number;
  exercises: PlannedExercise[];
}

export interface WeeklyPlan {
  startDate: string;
  workouts: PlannedWorkout[];
  restDays: string[];
}

export interface CalorieGoal {
  dailyKcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface ChatMessage {
  id: string;
  author: 'user' | 'homie';
  text: string;
  timestamp: string;
}

export interface ProgressPoint {
  date: string;
  value: number;
}

export interface ProgressData {
  weightLifted: ProgressPoint[];
  estimated1RM: ProgressPoint[];
  dailyCalories: ProgressPoint[];
  calorieTarget: number;
  bodyweight: ProgressPoint[];
  volumeByMuscle: { muscle: MuscleGroup; volume: number }[];
  prsThisMonth: number;
  currentStreak: number;
  daysTrainedThisWeek: number;
}

export interface UserProfile {
  displayName: string;
  coachPersonality: CoachPersonality;
  units: Units;
  notificationsWorkout: boolean;
  notificationsMeal: boolean;
}
