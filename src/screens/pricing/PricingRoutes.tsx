/**
 * Navigation adapters for PricingScreen.
 *
 * The screen itself is pure and prop-driven; these thin wrappers are the only
 * place route params and navigation calls appear. That keeps the design file
 * mountable from any stack — and from none.
 */
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { SettingsStackParamList } from '@/navigation/SettingsNavigator';
import { BUILDING_ROUTE } from '@/screens/onboarding/steps';
import { PricingScreen } from './PricingScreen';

type SettingsNav = NativeStackNavigationProp<SettingsStackParamList>;
type PricingRoute = RouteProp<SettingsStackParamList, 'Pricing'>;
/** The onboarding stack is untyped (its route list is built from a registry). */
type OnboardingNav = NativeStackNavigationProp<Record<string, object | undefined>>;

/**
 * Settings → Account → Plan.
 *
 * Registered with `presentation: 'fullScreenModal'`, so `goBack()` dismisses
 * the modal and no mount of this screen sits under the floating tab bar.
 * `Legal` is pushed *on top of* that modal, hence `fromModal` — without it the
 * pushed page reserves ~110pt for a tab bar that isn't there.
 */
export function PricingSettingsRoute() {
  const nav = useNavigation<SettingsNav>();
  const { params } = useRoute<PricingRoute>();

  return (
    <PricingScreen
      context={params?.context ?? 'settings'}
      highlight={params?.highlight}
      onClose={() => nav.goBack()}
      onPurchased={() => nav.goBack()}
      onSkip={() => nav.goBack()}
      onLegal={(kind) => nav.navigate('Legal', { kind, fromModal: true })}
    />
  );
}

/**
 * The onboarding mount: the first screen of the post-signup stack.
 *
 * Order is PlanPreview → SignUp → **here** → BuildingPlan → the app. Two beats
 * decide that position:
 *
 * - *After* SignUp, not before it. A purchase made while no account exists
 *   binds to an anonymous store identity that then has to be aliased onto the
 *   real user (RevenueCat `logIn`), and every failure mode of that aliasing is
 *   a customer who paid and can't prove it. Selling one screen later costs a
 *   little heat and removes the whole class of bug.
 * - *Before* BuildingPlan, not after it. The plan reveal is one screen back, so
 *   desire is still warm; and BuildingPlan ends on "Start training", which
 *   should start training rather than open a price list.
 *
 * There is no back chevron here. Nothing sits behind this screen in the stack —
 * SignUp belongs to a navigator that has already been torn down — so `onClose`
 * is deliberately omitted and Skip is the only way past. Skip is also what
 * keeps the screen App Review-legal: a paywall with no visible dismissal is a
 * rejection.
 *
 * Both exits land on BuildingPlan rather than completing onboarding, so the
 * gate keeps its single owner. Nothing here can leave a user signed in with an
 * unsaved profile.
 */
export function PricingOnboardingRoute() {
  const nav = useNavigation<OnboardingNav>();

  // Whether they bought or skipped, the next thing is their plan being saved.
  const goOn = () => nav.replace(BUILDING_ROUTE);

  return (
    <PricingScreen
      context="onboarding"
      onPurchased={goOn}
      onSkip={goOn}
      // Registered in OnboardingNavigator too — the footer's Terms/Privacy
      // links have to resolve here exactly as they do from Settings, and this
      // stack has no tab bar for the pushed page to clear.
      onLegal={(kind) => nav.navigate('Legal', { kind, fromModal: true })}
    />
  );
}
