import { ChatMessage, CoachPersonality } from '@/types';

export const mockChatHistory: ChatMessage[] = [
  {
    id: 'm1',
    author: 'sync',
    text: "Morning. Today's push day — bench, incline DBs, and shoulders. You've got this.",
    timestamp: '08:02',
  },
  {
    id: 'm2',
    author: 'user',
    text: 'my right shoulder feels tight should i swap ohp?',
    timestamp: '08:03',
  },
  {
    id: 'm3',
    author: 'sync',
    text: "Good call. Swap overhead press for a landmine press — easier on the joint but keeps the pressing volume. Want me to update today's plan?",
    timestamp: '08:03',
  },
  {
    id: 'm4',
    author: 'user',
    text: 'yeah do it',
    timestamp: '08:04',
  },
  {
    id: 'm5',
    author: 'sync',
    text: "Done. Also warm up with band pull-aparts — 2 sets of 15. Meet me at the bench when you're ready.",
    timestamp: '08:04',
  },
];

const supportiveReplies = [
  'Got it. You’re locked in today — let’s make the first set feel easy.',
  'Nice. Remember: two seconds down, explode up. I’ll flag you when you’re close to a PR.',
  'Proud of you for showing up. Start light, rate your first set, and we adjust.',
];

const intenseReplies = [
  'Heard. No soft reps today. First set should leave 2 in the tank, not 5.',
  'Fine. But you owe the tempo — 2 down, drive up. I’ll call it if you rush.',
  'Show up. First set: crisp, controlled, violent on the concentric.',
];

const roastLightReplies = [
  "Oh so we're negotiating with the bar today? Pick it up and let's go.",
  "Cute. Warm-up's over. Real set next — try not to make it look like it's your birthday.",
  "You said that last time too. Set 1. Now.",
];

export function getScriptedReply(
  _userText: string,
  personality: CoachPersonality
): string {
  const pool =
    personality === 'intense'
      ? intenseReplies
      : personality === 'roast_light'
      ? roastLightReplies
      : supportiveReplies;
  return pool[Math.floor(Math.random() * pool.length)];
}
