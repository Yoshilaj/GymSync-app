/** App metadata read from app.json (avoids an expo-constants dependency). */
import appJson from '../../app.json';

export const APP_VERSION: string = appJson.expo.version ?? '0.0.0';
export const APP_NAME: string = appJson.expo.name ?? 'GymSync';

/** Support + social endpoints (edit as these come online). */
export const SUPPORT_EMAIL = 'support@gymsyncapp.me';
export const SOCIAL_LINKS: { label: string; icon: string; url: string }[] = [
  { label: 'Instagram', icon: 'logo-instagram', url: 'https://www.instagram.com/gymsync.app' },
  { label: 'X', icon: 'logo-twitter', url: 'https://x.com/gymsyncapp' },
  { label: 'TikTok', icon: 'logo-tiktok', url: 'https://www.tiktok.com/@gym_sync_app' },
];
