/** A bullet item, or a label:text pair rendered as "**label:** text". */
export type LegalListItem = string | { label: string; text: string };

export type LegalBlock =
  | { type: 'p'; text: string }
  | { type: 'h'; text: string }
  | { type: 'h2'; text: string }
  | { type: 'list'; items: LegalListItem[] }
  | { type: 'services'; items: { name: string; purpose: string; url: string }[] };
