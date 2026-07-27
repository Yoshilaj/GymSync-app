/**
 * Coach matching.
 *
 * The backend ships three personalities (classic / supportive / energetic).
 * Asking "which one do you want?" makes the user pick a label, not a coach —
 * so instead we ask four questions *about them* and derive the answer.
 *
 * The derivation is real: every option carries a weight vector, the vectors
 * sum, and the winner is the argmax. Nothing is faked, and the reveal copy
 * says "matched", never "built just for you".
 *
 * Weights are deliberately NOT one-hot. Each option leans toward one preset
 * but feeds the others, so four answers genuinely combine instead of letting
 * the last one decide.
 */
import type { ChoiceOption } from '@/components/ui';
import type { CoachPersonality } from '@/types';

type Weights = Record<CoachPersonality, number>;

export interface CoachQuestion {
  id: string;
  title: string;
  subtitle?: string;
  options: (ChoiceOption<string> & { weights: Weights })[];
}

const w = (
  classic: number,
  supportive: number,
  energetic: number,
): Weights => ({ classic, supportive, energetic });

export const COACH_QUESTIONS: CoachQuestion[] = [
  {
    id: 'drive',
    title: 'When a session gets hard, what keeps you going?',
    options: [
      {
        value: 'numbers',
        label: 'Hitting the numbers I planned',
        description: 'The set is the set',
        weights: w(3, 1, 0),
      },
      {
        value: 'permission',
        label: 'Knowing an off day is allowed',
        description: 'Showing up matters more than the score',
        weights: w(0, 3, 1),
      },
      {
        value: 'corner',
        label: 'Someone in my corner',
        description: 'A voice pushing me through the last rep',
        weights: w(0, 1, 3),
      },
    ],
  },
  {
    id: 'setback',
    title: "Your last workout didn't go well. What do you do?",
    options: [
      {
        value: 'analyse',
        label: 'Check the log and find what changed',
        description: 'Sleep, food, load — something explains it',
        weights: w(3, 1, 0),
      },
      {
        value: 'reset',
        label: 'Take it easy and go again tomorrow',
        description: 'One session is just one session',
        weights: w(1, 3, 0),
      },
      {
        value: 'attack',
        label: 'Come back and beat it',
        description: 'Use it as fuel',
        weights: w(0, 0, 4),
      },
    ],
  },
  {
    id: 'room',
    title: "Pick the gym you'd rather train in.",
    options: [
      {
        value: 'quiet',
        label: 'Quiet, early, barely anyone there',
        description: 'Just you and the bar',
        weights: w(3, 1, 0),
      },
      {
        value: 'company',
        label: 'A friend spotting you between sets',
        description: 'Good company, no pressure',
        weights: w(0, 3, 1),
      },
      {
        value: 'loud',
        label: 'Loud music, everyone going hard',
        description: 'The room carries you',
        weights: w(0, 0, 4),
      },
    ],
  },
  {
    id: 'pride',
    title: 'Six months from now, what would make you proudest?',
    options: [
      {
        value: 'lifts',
        label: 'The numbers on the bar',
        description: 'Measurable, undeniable progress',
        weights: w(4, 0, 1),
      },
      {
        value: 'consistency',
        label: 'That I kept showing up',
        description: 'The habit stuck',
        weights: w(1, 4, 0),
      },
      {
        value: 'feeling',
        label: 'Feeling unstoppable',
        description: 'Walking in like the place is yours',
        weights: w(0, 1, 4),
      },
    ],
  },
];

/**
 * Ties break toward `supportive` — it's the server's own default and the
 * safest coach to be wrong about.
 */
const TIE_BREAK: CoachPersonality[] = ['supportive', 'classic', 'energetic'];

/** Sum the chosen options' weight vectors and take the argmax. */
export function matchCoach(answers: Record<string, string>): CoachPersonality {
  const totals: Weights = { classic: 0, supportive: 0, energetic: 0 };

  for (const question of COACH_QUESTIONS) {
    const chosen = question.options.find((o) => o.value === answers[question.id]);
    if (!chosen) continue;
    totals.classic += chosen.weights.classic;
    totals.supportive += chosen.weights.supportive;
    totals.energetic += chosen.weights.energetic;
  }

  return TIE_BREAK.reduce((best, preset) =>
    totals[preset] > totals[best] ? preset : best,
  );
}

/** Reveal copy — how each coach introduces itself, in its own register. */
export const COACH_PROFILES: Record<
  CoachPersonality,
  { name: string; tagline: string; sample: string; behaviour: string }
> = {
  classic: {
    name: 'Classic',
    tagline: 'Precise and to the point',
    sample: '"Bar path drifted forward. Reset your brace and take it again."',
    behaviour: 'Short technical cues, real numbers, no filler between sets.',
  },
  supportive: {
    name: 'Supportive',
    tagline: 'Steady and encouraging',
    sample: '"That was a good set. Take your time — no rush on the next one."',
    behaviour: 'Checks in on how you feel and adjusts before you burn out.',
  },
  energetic: {
    name: 'Energetic',
    tagline: 'Loud and in your corner',
    sample: '"Two more. You\'ve got these — let\'s go!"',
    behaviour: 'Drives the pace and celebrates every rep you earn.',
  },
};
