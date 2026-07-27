import { useRoute, type RouteProp } from '@react-navigation/native';
import { ChoiceList } from '@/components/ui';
import { OnboardingStep } from './OnboardingStep';
import { useOnboarding } from './OnboardingContext';
import { COACH_QUESTIONS } from './coachMatch';

type QuizRoute = RouteProp<Record<string, { qIndex?: number } | undefined>, string>;

/**
 * One component, four screens. The registry supplies `qIndex`; the questions
 * themselves live in coachMatch.ts next to the weights they feed.
 */
export function CoachQuizScreen() {
  const route = useRoute<QuizRoute>();
  const question = COACH_QUESTIONS[route.params?.qIndex ?? 0];
  const { draft, patch } = useOnboarding();

  const value = draft.coachAnswers[question.id] ?? null;

  return (
    <OnboardingStep title={question.title} subtitle={question.subtitle} valid={value !== null}>
      <ChoiceList
        options={question.options}
        value={value}
        onChange={(v) =>
          patch({ coachAnswers: { ...draft.coachAnswers, [question.id]: v } })
        }
      />
    </OnboardingStep>
  );
}
