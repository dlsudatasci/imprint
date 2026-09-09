/**
 * Builds src/ui into a distributable library at src/ui/dist.
 *
 * Three outputs, because a design system is more than its JavaScript:
 *   dist/index.mjs   — the components, bundled, React left external
 *   dist/index.d.ts  — the type contracts, emitted by tsc
 *   dist/styles.css  — the Tailwind utilities these components actually use,
 *                      plus the token custom properties, so the bundle renders
 *                      correctly outside the Next app (e.g. in Claude Design).
 */
import { build } from 'esbuild';
import { execSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const uiDir = resolve(root, 'src/ui');
const outDir = resolve(uiDir, 'dist');

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

// ---- 1. JS bundle -------------------------------------------------------
await build({
  entryPoints: [resolve(uiDir, 'index.ts')],
  outfile: resolve(outDir, 'index.mjs'),
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['es2020'],
  jsx: 'automatic',
  external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'],
  logLevel: 'info',
});
console.log('✓ dist/index.mjs');

// ---- 2. Type declarations ----------------------------------------------
const tsconfig = {
  extends: '../../tsconfig.json',
  compilerOptions: {
    declaration: true,
    emitDeclarationOnly: true,
    noEmit: false,
    outDir: './dist',
    rootDir: '.',
    allowJs: false,
    skipLibCheck: true,
  },
  include: ['index.ts', 'cn.ts', 'tokens.ts', '*.tsx'],
  exclude: ['dist', 'annotation-tool', 'page', 'navlink', 'tooltip', 'logo'],
};
const tsconfigPath = resolve(uiDir, 'tsconfig.build.json');
writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2));
try {
  execSync(`npx tsc -p ${JSON.stringify(tsconfigPath)}`, { cwd: root, stdio: 'inherit' });
  console.log('✓ dist/*.d.ts');
} finally {
  rmSync(tsconfigPath, { force: true });
  rmSync(resolve(outDir, 'tsconfig.build.tsbuildinfo'), { force: true });
}

// Logo is .jsx so tsc can't emit for it; declare it by hand and re-export.
writeFileSync(
  resolve(outDir, 'logo.d.ts'),
  `export interface LogoProps {\n  /** Optional label rendered beside the mark. */\n  subTitle?: string;\n  /** Rendered height in pixels. Default 40. */\n  height?: number;\n  /** Image source for the mark. Defaults to the app's public path; pass one when hosting outside the Next app. */\n  src?: string;\n}\ndeclare const Logo: (props: LogoProps) => JSX.Element;\nexport default Logo;\n`,
);
const dts = resolve(outDir, 'index.d.ts');
if (existsSync(dts)) {
  const s = readFileSync(dts, 'utf8').replace(
    /export \{ default as Logo \} from '\.\/logo';/,
    `export { default as Logo } from './logo';\nexport type { LogoProps } from './logo';`,
  );
  writeFileSync(dts, s);
}

// ---- 3. Stylesheet ------------------------------------------------------
// Tailwind scans src/ui only, so the emitted CSS carries exactly the utilities
// the library uses — not the whole app's.
const cssEntry = resolve(outDir, '.tw-entry.css');
writeFileSync(cssEntry, '@tailwind base;\n@tailwind components;\n@tailwind utilities;\n');
const twConfig = resolve(outDir, '.tw-config.cjs');
// Safelist the documented token vocabulary.
//
// Tailwind emits only the classes it finds in the scanned content, which would
// limit the stylesheet to whatever these 12 components happen to use. But the
// stylesheet also has to serve whoever builds screens WITH the library — their
// own layout markup uses the same token names, and anything not emitted here
// renders unstyled for them. So the contract is: every class named in
// .design-sync/conventions.md ships, used internally or not.
const tokenSafelist = [
  'primary', 'primary-hover', 'primary-50', 'primary-100',
  'ink', 'body', 'muted', 'subtle', 'accent',
  'surface', 'surface-subtle', 'ground',
  'line', 'line-card',
  'danger', 'danger-soft', 'danger-border',
  'success', 'success-soft', 'success-border',
  'warning', 'warning-soft', 'warning-border',
  'info', 'info-soft', 'info-border',
].flatMap((t) => [`bg-${t}`, `text-${t}`, `border-${t}`])
  .concat([
    'rounded-control', 'rounded-card', 'rounded-modal', 'rounded-full',
    'shadow-2xl',
    'font-sans', 'font-display',
    'duration-300', 'ease-in-out', 'transition-all', 'transition-colors',
  ]);

writeFileSync(
  twConfig,
  `const base = require('../../../tailwind.config.js');\n` +
    `module.exports = { ...base, content: ['./src/ui/**/*.{js,ts,jsx,tsx}'], safelist: ${JSON.stringify(tokenSafelist)} };\n`,
);
execSync(
  `npx tailwindcss -c ${JSON.stringify(twConfig)} -i ${JSON.stringify(cssEntry)} -o ${JSON.stringify(resolve(outDir, 'styles.css'))} --minify`,
  { cwd: root, stdio: 'inherit' },
);
rmSync(cssEntry, { force: true });
rmSync(twConfig, { force: true });

// Prepend the token custom properties: the components reference them for the
// fonts, and a consumer outside the Next app has no other source for them.
const stylesPath = resolve(outDir, 'styles.css');
const tokensCss = `:root{--font-jakarta:"Plus Jakarta Sans";--font-ysabeau:"Ysabeau";--c-primary:#004aad;--c-primary-hover:#003d8f;--c-primary-50:#f0f4fa;--c-primary-100:#e0e9f5;--c-ink:#111827;--c-accent:#111827;--c-body:#4b5563;--c-muted:#6b7280;--c-subtle:#9ca3af;--c-surface:#fff;--c-surface-subtle:#f9fafb;--c-ground:#f8f7f9;--c-line:#e5e7eb;--c-line-card:#f3f4f6;--c-danger:#dc2626;--c-success:#16a34a;--c-warning:#d97706;--r-control:.75rem;--r-card:1rem;--r-modal:1.5rem}\n`;
const fontImport = `@import url("https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@200..800&family=Ysabeau:wght@500;600;700;800&display=swap");\n`;
writeFileSync(stylesPath, fontImport + tokensCss + readFileSync(stylesPath, 'utf8'));
console.log('✓ dist/styles.css');
