export const colors = {
  background: '#F3F7FD',
  surface: '#F3F7FD',
  surfaceElevated: '#E8F0FB',
  card: '#FFFFFF',
  border: '#D6E3F2',
  borderSoft: '#E3EAF4',
  accent: '#2E90EA',
  accentMuted: '#BBD6F4',
  accentSoft: '#E9F2FD',
  success: '#25B572',
  warning: '#E4A62F',
  danger: '#E04545',
  text: '#0B2447',
  textMuted: '#5C708A',
  textDim: '#9AAABF',
  userBubble: '#2E90EA',
  homieBubble: '#EEF4FC',
} as const;

export type ColorKey = keyof typeof colors;
