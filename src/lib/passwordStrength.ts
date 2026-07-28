/**
 * Password rules, in one place.
 *
 * Before this, "at least 8 characters" was hardcoded in four files with two
 * different thresholds. Sign-up and Change password now both ask this module.
 *
 * Two separate questions, deliberately kept apart:
 * - `meetsMinimum` — may this password be used at all? Only genuinely weak
 *   passwords fail: too short, a well-known one, or the user's own name/email.
 * - `score` — how strong is it? Presentation only; never blocks.
 *
 * The block rules are mirrored in `backend/app/password.py`, which is the
 * authority (a client can always be bypassed). Keep the two in step.
 */

export type PasswordScore = 0 | 1 | 2 | 3;

export interface PasswordCheck {
  score: PasswordScore;
  label: 'Weak' | 'Fair' | 'Good' | 'Strong';
  /** False = the account can't be created with this password. */
  meetsMinimum: boolean;
  /** The single most useful next step, or null when there's nothing to add. */
  hint: string | null;
}

export const MIN_PASSWORD_LENGTH = 8;

/**
 * The passwords attackers try first. Not a security control on its own — it
 * exists so the meter can't call "password123" anything but weak. Kept short
 * on purpose: this ships in the bundle, and the long tail adds little.
 */
const COMMON = new Set([
  'password', 'password1', 'password123', 'passw0rd', 'p@ssword', 'p@ssw0rd',
  '12345678', '123456789', '1234567890', '123123123', '11111111', '00000000',
  'qwerty', 'qwerty123', 'qwertyuiop', 'asdfghjkl', '1q2w3e4r', 'zaq12wsx',
  'iloveyou', 'princess', 'sunshine', 'welcome', 'welcome1', 'letmein',
  'monkey', 'dragon', 'football', 'baseball', 'basketball', 'superman',
  'batman', 'trustno1', 'whatever', 'starwars', 'computer', 'internet',
  'abc12345', 'admin123', 'administrator', 'freedom', 'shadow', 'master',
  'michael', 'jennifer', 'jordan23', 'hello123', 'test1234', 'changeme',
  // This app's own vocabulary — the first thing a gym user reaches for.
  'gymsync', 'gymsync123', 'workout', 'workout123', 'fitness', 'fitness123',
  'deadlift', 'benchpress', 'squat123', 'training', 'strength',
]);

/** Trailing digits are the classic disguise: "password2024" is "password". */
function normalize(pw: string): string {
  return pw.toLowerCase().replace(/[0-9!@#$%^&*_.-]+$/, '');
}

function classes(pw: string): number {
  let n = 0;
  if (/[a-z]/.test(pw)) n += 1;
  if (/[A-Z]/.test(pw)) n += 1;
  if (/[0-9]/.test(pw)) n += 1;
  if (/[^A-Za-z0-9]/.test(pw)) n += 1;
  return n;
}

/**
 * A password containing the user's own name or email handle is guessable by
 * anyone who knows them, however long it is. Only meaningful fragments count —
 * a 2-letter name would otherwise match almost everything.
 */
function containsPersonal(pw: string, ctx?: { email?: string; name?: string }): boolean {
  const lower = pw.toLowerCase();
  const parts: string[] = [];
  const handle = ctx?.email?.split('@')[0]?.trim().toLowerCase();
  if (handle) parts.push(handle);
  if (ctx?.name) parts.push(...ctx.name.toLowerCase().split(/\s+/));
  return parts.some((p) => p.length >= 4 && lower.includes(p));
}

const LABELS: Record<PasswordScore, PasswordCheck['label']> = {
  0: 'Weak',
  1: 'Fair',
  2: 'Good',
  3: 'Strong',
};

export function checkPassword(
  pw: string,
  ctx?: { email?: string; name?: string },
): PasswordCheck {
  if (pw.length < MIN_PASSWORD_LENGTH) {
    return {
      score: 0,
      label: 'Weak',
      meetsMinimum: false,
      hint: `Use at least ${MIN_PASSWORD_LENGTH} characters.`,
    };
  }
  if (COMMON.has(pw.toLowerCase()) || COMMON.has(normalize(pw))) {
    return {
      score: 0,
      label: 'Weak',
      meetsMinimum: false,
      hint: 'Too common — pick something less guessable.',
    };
  }
  if (containsPersonal(pw, ctx)) {
    return {
      score: 0,
      label: 'Weak',
      meetsMinimum: false,
      hint: "Avoid your name or email — they're easy to guess.",
    };
  }

  const variety = classes(pw);
  let points = 0;
  if (pw.length >= 12) points += 1;
  if (pw.length >= 16) points += 1;
  if (variety >= 2) points += 1;
  if (variety >= 3) points += 1;

  const score = Math.min(3, points) as PasswordScore;

  // One hint, always the highest-value one available.
  let hint: string | null = null;
  if (variety < 2) hint = 'Mix in a number or a capital letter.';
  else if (pw.length < 12) hint = 'A few more characters would make it stronger.';
  else if (variety < 3) hint = 'A symbol would make it stronger.';

  return { score, label: LABELS[score], meetsMinimum: true, hint };
}
