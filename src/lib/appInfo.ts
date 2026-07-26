/** App metadata read from app.json (avoids an expo-constants dependency). */
import appJson from '../../app.json';

export const APP_VERSION: string = appJson.expo.version ?? '0.0.0';
export const APP_NAME: string = appJson.expo.name ?? 'GymSync';

/** Support + social endpoints (edit as these come online). */
// TODO(launch): point at the real support inbox before public release.
export const SUPPORT_EMAIL = 'support@gymsync.app';
// TODO(launch): replace with the real social handles once the accounts exist.
export const SOCIAL_LINKS: { label: string; icon: string; url: string }[] = [
  { label: 'Instagram', icon: 'logo-instagram', url: 'https://instagram.com/gymsync' },
  { label: 'X', icon: 'logo-twitter', url: 'https://x.com/gymsync' },
  { label: 'TikTok', icon: 'logo-tiktok', url: 'https://tiktok.com/@gymsync' },
];
