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
  /**
   * What this movement is called when it's programmed with no external load —
   * a Back Squat with no bar is just a squat. Undefined when the lift is
   * meaningless unloaded (Leg Press, Cable Fly). The backend swaps the name in
   * for users without the equipment; the id never changes, so the illustration,
   * cues and detail page all still resolve. Mirrors `exercises.bodyweight_name`
   * (016_catalog_sync.sql) — keep the two in sync.
   */
  bodyweightName?: string;
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
  /**
   * Server row id (plan_exercises.id) — what delete addresses. Optional
   * because a plan cached before this field existed is parsed straight back
   * into this type; such a row simply isn't editable until the next refresh.
   */
  id?: string;
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
  /** Per-date edits, keyed `${workoutId}|${YYYY-MM-DD}` — each value REPLACES
   * that workout's exercises on exactly that calendar day. Dates without an
   * entry render the weekly template. */
  overrides?: Record<string, PlannedExercise[]>;
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
