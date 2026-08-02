/**
 * The hosted mirrors of the two legal documents.
 *
 * Shared rather than declared beside whichever screen needs them: LegalScreen
 * links out to them, and the paywall opens them directly when it is mounted
 * somewhere with no `Legal` route to push. Two copies would drift, and a stale
 * legal URL is a broken promise in the App Store listing as well as in the app.
 */
export const LEGAL_URL = {
  privacy: 'https://gymsyncapp.me/privacy-policy',
  terms: 'https://gymsyncapp.me/terms-of-service',
} as const;
