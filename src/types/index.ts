export type MuscleGroup =
  | 'Shoulders'
  | 'Chest'
  | 'Biceps'
  | 'Triceps'
  | 'Forearms'
  | 'Abs'
  | 'Quads'
  | 'Adductors'
  | 'Traps'
  | 'Lats'
  | 'Lower Back'
  | 'Glutes'
  | 'Hamstrings'
  | 'Abductors'
  | 'Calves'
  | 'Full Body';

export type Equipment =
  | 'Barbell'
  | 'Dumbbell'
  | 'Machine'
  | 'Cable'
  | 'Bodyweight'
  | 'Kettlebell';

/** Coach personality presets — mirrors the backend enum (app/agents/personalities.py). */
export type CoachPersonality = 'classic' | 'supportive' | 'energetic';

export type Units = 'lbs' | 'kg';

export interface Exercise {
  id: string;
  name: string;
  muscleGroup: MuscleGroup;
  equipment: Equipment;
  description: string;
  cues: string[];
  thumbnailColor: string;
}

export interface PlannedSet {
  id: string;
  exerciseId: string;
  targetReps: number;
  /** Top of the rep range when the plan prescribes one (e.g. 8–12). */
  repsHigh?: number;
  weight: number;
  achievedReps?: number;
  completed?: boolean;
}

export interface PlannedExercise {
  exerciseId: string;
  /** Denormalized display name — the fallback when exerciseId isn't in the library. */
  name?: string;
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
  /** Server id of the plan (absent for local/legacy plans). */
  planId?: string;
  startDate: string;
  workouts: PlannedWorkout[];
  restDays: string[];
}

export interface ChatMessage {
  id: string;
  author: 'user' | 'sync';
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
}
