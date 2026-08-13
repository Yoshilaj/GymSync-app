import { UserProfile } from '@/types';

/**
 * The pre-hydration seed for UserContext — what `user` holds before the server
 * profile (or its cache) lands.
 *
 * `displayName` is deliberately EMPTY. This used to be a demo profile named
 * "Yoshi", and because the offline fallback path forgot to hydrate `user` from
 * the cached profile, every screen greeted every offline user as Yoshi. A
 * blank name renders as a quiet omission; a wrong name renders as someone
 * else's account. Screens that show the name own their own fallback copy
 * (e.g. Settings' "Your profile").
 */
export const defaultUser: UserProfile = {
  displayName: '',
  coachPersonality: 'supportive',
  units: 'lbs',
  notificationsWorkout: true,
};
