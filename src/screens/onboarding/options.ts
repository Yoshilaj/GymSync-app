/**
 * Every answer set in the onboarding flow, in one reviewable place.
 *
 * Screens stay thin on purpose: the copy is the product here, and it should be
 * editable without opening a component. Token values (goals, equipment,
 * activity levels) must keep matching the backend vocabulary — the labels are
 * free to change, the values are not.
 */
import type { ChoiceOption } from '@/components/ui';
import type { ActivityLevel, ExperienceLevel, Sex } from '@/api/profile';

export type TrainingPlace = 'gym' | 'home' | 'bodyweight';

/** Matches the `equipment` vocabulary in the exercises catalog. */
export const EQUIPMENT_TOKENS = [
  'Barbell',
  'Dumbbell',
  'Cable',
  'Machine',
  'Kettlebell',
  'Bodyweight',
] as const;

export const GOALS: ChoiceOption<string>[] = [
  { value: 'muscle', label: 'Build muscle', description: 'Add size and shape', icon: 'body-outline' },
  { value: 'strength', label: 'Get stronger', description: 'Move heavier weight', icon: 'barbell-outline' },
  { value: 'fat_loss', label: 'Lose fat', description: 'Lean out, keep the muscle', icon: 'flame-outline' },
  { value: 'general_fitness', label: 'General fitness', description: 'Feel good, stay healthy', icon: 'heart-outline' },
  { value: 'endurance', label: 'Endurance', description: 'Last longer, recover faster', icon: 'pulse-outline' },
];

export const EXPERIENCE: ChoiceOption<ExperienceLevel>[] = [
  { value: 'beginner', label: 'New to this', description: 'Less than six months of training' },
  { value: 'intermediate', label: 'Some experience', description: "Comfortable with the main lifts" },
  { value: 'advanced', label: 'Experienced', description: 'Years of consistent training' },
];

export const SOURCES: ChoiceOption<string>[] = [
  { value: 'instagram', label: 'Instagram', icon: 'logo-instagram' },
  { value: 'tiktok', label: 'TikTok', icon: 'musical-notes-outline' },
  { value: 'youtube', label: 'YouTube', icon: 'logo-youtube' },
  { value: 'app_store', label: 'App Store', icon: 'apps-outline' },
  { value: 'friend', label: 'Friend or family', icon: 'people-outline' },
  { value: 'other', label: 'Somewhere else', icon: 'ellipsis-horizontal' },
];

export const TRAINING_DAYS: ChoiceOption<number>[] = [
  { value: 1, label: '1 day', description: 'One focused full-body session' },
  { value: 2, label: '2 days', description: 'Enough to make real progress' },
  { value: 3, label: '3 days', description: 'A solid, sustainable base' },
  { value: 4, label: '4 days', description: 'Room to train each area properly' },
  { value: 5, label: '5 days', description: 'Serious volume, focused sessions' },
  { value: 6, label: '6 days', description: 'Short sessions, most days' },
  { value: 7, label: '7 days', description: 'Every day — recovery built into the plan' },
];

export const TRAINING_PLACES: ChoiceOption<TrainingPlace>[] = [
  { value: 'gym', label: 'A full gym', description: 'Racks, machines, the lot', icon: 'business-outline' },
  { value: 'home', label: 'Home with equipment', description: "You'll tell us what you have", icon: 'home-outline' },
  { value: 'bodyweight', label: 'Bodyweight only', description: 'No equipment needed', icon: 'walk-outline' },
];

export const HOME_EQUIPMENT: ChoiceOption<string>[] = [
  { value: 'Dumbbell', label: 'Dumbbells', icon: 'barbell-outline' },
  { value: 'Kettlebell', label: 'Kettlebells', icon: 'fitness-outline' },
  { value: 'Barbell', label: 'Barbell and plates', icon: 'barbell-outline' },
  { value: 'Cable', label: 'Bands or cables', icon: 'git-commit-outline' },
  { value: 'Machine', label: 'A machine or two', icon: 'cog-outline' },
  { value: 'Bodyweight', label: 'Just a bar or bench', icon: 'walk-outline' },
];

export const SEXES: ChoiceOption<Sex | 'skip'>[] = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'skip', label: 'Prefer not to say', description: "We'll use a neutral average" },
];

export const ACTIVITY_LEVELS: ChoiceOption<ActivityLevel>[] = [
  { value: 'sedentary', label: 'Mostly sitting', description: 'Desk job, little walking' },
  { value: 'light', label: 'Lightly active', description: 'On your feet some of the day' },
  { value: 'moderate', label: 'Moderately active', description: 'Walking or moving most days' },
  { value: 'very_active', label: 'Very active', description: 'Physical job or lots of movement' },
  { value: 'athlete', label: 'Athlete', description: 'Training hard on top of an active day' },
];

export const INJURY_AREAS: ChoiceOption<string>[] = [
  { value: 'lower_back', label: 'Lower back' },
  { value: 'knees', label: 'Knees' },
  { value: 'shoulders', label: 'Shoulders' },
  { value: 'elbows', label: 'Elbows' },
  { value: 'wrists', label: 'Wrists' },
  { value: 'neck', label: 'Neck' },
  { value: 'hips', label: 'Hips' },
  { value: 'ankles', label: 'Ankles' },
];

/** A training place implies its equipment; only "home" needs a follow-up. */
export function equipmentForPlace(place: TrainingPlace): string[] {
  if (place === 'gym') return [...EQUIPMENT_TOKENS];
  if (place === 'bodyweight') return ['Bodyweight'];
  return [];
}
