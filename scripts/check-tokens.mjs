/**
 * Verifies the three copies of the design tokens agree.
 *
 * Tokens necessarily exist in three places: the Tailwind theme (for classes),
 * CSS custom properties (for plain stylesheets that can't read the theme), and
 * a JS module (for style objects built at runtime, like react-select's). None
 * of them can read the others, so this checks them against each other.
 *
 * Run: npm run lint:tokens
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const tw = require('../tailwind.config.js');
const scss = readFileSync(new URL('../src/pages/_app/globals.scss', import.meta.url), 'utf8');
const ts = readFileSync(new URL('../src/ui/tokens.ts', import.meta.url), 'utf8');

const c = tw.theme.extend.colors;

// [label, value from Tailwind, CSS custom property, key in tokens.ts]
const checks = [
  ['primary',        c.primary.DEFAULT, '--c-primary',        'primary'],
  ['primary-hover',  c.primary.hover,   '--c-primary-hover',  'primaryHover'],
  ['primary-50',     c.primary[50],     '--c-primary-50',     'primary50'],
  ['primary-100',    c.primary[100],    '--c-primary-100',    'primary100'],
  ['ink',            c.ink,             '--c-ink',            'ink'],
  ['body',           c.body,            '--c-body',           'body'],
  ['muted',          c.muted,           '--c-muted',          'muted'],
  ['subtle',         c.subtle,          '--c-subtle',         'subtle'],
  ['surface',        c.surface.DEFAULT, '--c-surface',        'surface'],
  ['surface-subtle', c.surface.subtle,  '--c-surface-subtle', 'surfaceSubtle'],
  ['ground',         c.ground,          '--c-ground',         'ground'],
  ['line',           c.line.DEFAULT,    '--c-line',           'line'],
  ['line-card',      c.line.card,       '--c-line-card',      'lineCard'],
  ['danger',         c.danger.DEFAULT,  '--c-danger',         'danger'],
  ['success',        c.success.DEFAULT, '--c-success',        'success'],
  ['warning',        c.warning.DEFAULT, '--c-warning',        'warning'],
];

const failures = [];

for (const [label, twValue, cssVar, tsKey] of checks) {
  const cssMatch = scss.match(new RegExp(`${cssVar}:\\s*([^;]+);`));
  const tsMatch = ts.match(new RegExp(`\\b${tsKey}:\\s*'([^']+)'`));

  if (!cssMatch) {
    failures.push(`${label}: ${cssVar} is missing from globals.scss`);
  } else if (cssMatch[1].trim().toLowerCase() !== String(twValue).toLowerCase()) {
    failures.push(`${label}: Tailwind has ${twValue}, globals.scss has ${cssMatch[1].trim()}`);
  }

  if (!tsMatch) {
    failures.push(`${label}: '${tsKey}' is missing from src/ui/tokens.ts`);
  } else if (tsMatch[1].toLowerCase() !== String(twValue).toLowerCase()) {
    failures.push(`${label}: Tailwind has ${twValue}, tokens.ts has ${tsMatch[1]}`);
  }
}

if (failures.length) {
  console.error('Design tokens are out of sync:\n');
  for (const f of failures) console.error(`  - ${f}`);
  console.error('\nUpdate all three: tailwind.config.js, src/pages/_app/globals.scss, src/ui/tokens.ts');
  process.exit(1);
}

console.log(`Design tokens in sync across all three sources (${checks.length} checked).`);
