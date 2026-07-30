/**
 * Markdown stripper for coach replies.
 *
 * The chat renders raw strings — there is no markdown renderer — so a stray
 * `**bold**` reaches the screen as literal asterisks. The system prompt already
 * forbids markdown; this is the safety net for when the model slips, and it
 * also cleans up replies already stored in `conversation_messages`.
 *
 * Applied at render, not on the wire, so it survives streaming: the string is
 * re-derived on every delta and at worst a half-typed `*` flickers for a frame.
 *
 * Deliberately conservative. Line-level `- ` dashes are left alone — a plain
 * dash list reads fine, and stripping them would mangle ordinary sentences that
 * happen to start with a dash. The voice path does the heavier sanitising in
 * `backend/app/agents/voice.py` (notation expansion, emoji) and is untouched.
 *
 * No lookbehind anywhere: Hermes has historically been patchy on it, and a
 * regex SyntaxError here would take down every chat screen at module load.
 * Preceding-character guards are captured and re-emitted instead.
 */

const RULES: [RegExp, string][] = [
  // Fenced blocks first — the content is kept, only the fence goes.
  [/```[a-zA-Z0-9]*\n?/g, ''],
  // ATX headers: `## Heading` -> `Heading`.
  [/^ {0,3}#{1,6}[ \t]+/gm, ''],
  // Blockquote markers.
  [/^ {0,3}> ?/gm, ''],
  // Emphasis, longest marker first so `**x**` never leaves a stray `*`.
  // Content must start and end non-space, which is what separates `*emphasis*`
  // from a `* ` bullet or a lone asterisk mid-sentence.
  [/\*\*\*(\S(?:[^*\n]*\S)?)\*\*\*/g, '$1'],
  [/\*\*(\S(?:[^*\n]*\S)?)\*\*/g, '$1'],
  [/\*(\S(?:[^*\n]*\S)?)\*/g, '$1'],
  // Underscores need word-boundary guards so snake_case survives intact.
  [/(^|[^A-Za-z0-9_])___(\S(?:[^_\n]*\S)?)___(?![A-Za-z0-9_])/g, '$1$2'],
  [/(^|[^A-Za-z0-9_])__(\S(?:[^_\n]*\S)?)__(?![A-Za-z0-9_])/g, '$1$2'],
  [/(^|[^A-Za-z0-9_])_(\S(?:[^_\n]*\S)?)_(?![A-Za-z0-9_])/g, '$1$2'],
  // Inline code.
  [/`([^`\n]+)`/g, '$1'],
  // `[label](url)` -> `label`.
  [/\[([^\]\n]+)\]\([^)\s]+\)/g, '$1'],
];

/** Strip markdown emphasis, headers, and code markers from coach text. */
export function toPlainText(input: string): string {
  if (!input) return input;
  // Cheap bail-out: most replies contain none of these at all.
  if (!/[*_`#>[\]]/.test(input)) return input;
  return RULES.reduce((s, [re, to]) => s.replace(re, to), input);
}
