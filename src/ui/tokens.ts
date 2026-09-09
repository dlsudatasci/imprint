/**
 * Design tokens (colours, spacing, radii) as JavaScript values.
 *
 * For the places that build styles in code and so can't use a Tailwind class:
 * react-select's style objects on the profile pages, and the canvas drawing in
 * the annotation tool.
 *
 * The same values necessarily exist in three places — the Tailwind theme, the
 * CSS variables in globals.scss, and this file. Run `npm run lint:tokens` to
 * check they still agree after changing any of them.
 */
export const tokens = {
  color: {
    primary: '#004aad',
    primaryHover: '#003d8f',
    primary50: '#f0f4fa',
    primary100: '#e0e9f5',

    ink: '#111827',
    body: '#4b5563',
    muted: '#6b7280',
    subtle: '#9ca3af',

    surface: '#ffffff',
    surfaceSubtle: '#f9fafb',
    ground: '#f8f7f9',
    line: '#e5e7eb',
    lineCard: '#f3f4f6',

    danger: '#dc2626',
    success: '#16a34a',
    warning: '#d97706',
  },
  radius: {
    control: '0.75rem',
    card: '1rem',
    modal: '1.5rem',
  },
  duration: {
    fast: 150,
    base: 300,
  },
} as const;

export type Tokens = typeof tokens;
