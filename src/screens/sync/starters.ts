import type { Ionicons } from '@expo/vector-icons';

/**
 * Quick-action pills on the empty chat screen. Each one is a bot-initiated
 * opener: tapping shows `message` as a Sync bubble and invites a reply —
 * nothing is sent or persisted until the user answers.
 */
export interface Starter {
  id: 'create_plan' | 'swap_exercise' | 'trend_check';
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  message: string;
}

export const STARTERS: Starter[] = [
  {
    id: 'create_plan',
    icon: 'sparkles',
    label: 'Create a new plan',
    message:
      "Let's build a new plan. What's your main goal right now — strength, size, or general fitness — and how many days a week can you train?",
  },
  {
    id: 'swap_exercise',
    icon: 'swap-horizontal',
    label: 'Swap an exercise',
    message:
      'Sure — what exercise in today’s plan would you like to swap out, and is anything driving the change (equipment, soreness, boredom)?',
  },
  {
    id: 'trend_check',
    icon: 'trending-up',
    label: 'Check my progress trends',
    message:
      'Happy to dig into your numbers. Which lift or metric do you want to look at — bench, squat, deadlift, or overall volume?',
  },
];
