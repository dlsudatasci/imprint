/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Emits .next/standalone with a self-contained server.js and only the
  // node_modules actually reached at runtime. On the VM that means we deploy a
  // build artifact instead of installing dependencies there — no toolchain, no
  // network at deploy time, and a much smaller footprint.
  output: 'standalone',

  // gzip at the Node layer. nginx also compresses, so this is belt-and-braces
  // for the case where the app is reached directly (e.g. an SSH tunnel).
  compress: true,

  // Don't advertise the framework and version to anyone scanning.
  poweredByHeader: false,

  // Source maps for client bundles roughly double the build output and let
  // anyone read the original source. Server-side stack traces are unaffected.
  productionBrowserSourceMaps: false,

  // No `eslint` key: Next 16 removed it along with `next lint`, and rejects it as
  // an unrecognized option. `next build` no longer runs ESLint at all, which is
  // what `ignoreDuringBuilds: true` used to buy us. Linting stays a separate step
  // (`yarn lint` — eslint + scripts/check-tokens.mjs).

  /**
   * Baseline security headers.
   *
   * No CSP here on purpose: this app loads Google Fonts, Google OAuth, Leaflet
   * tiles and remote annotation images, and a CSP written without testing each
   * of those breaks the site in ways that are hard to diagnose. Add one
   * deliberately once the asset origins are pinned down — see DEPLOYMENT.md.
   */
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
        ],
      },
    ];
  },
};

/**
 * Corpus images in development.
 *
 * On the VM, nginx serves /corpus-images/ straight from disk before a request
 * ever reaches Next (deploy/nginx.conf). `yarn dev` on a laptop has no such
 * folder, so when CORPUS_IMAGES_ORIGIN is set (for example
 * http://127.0.0.1:8080, an SSH tunnel to the VM's nginx) the dev server
 * proxies /corpus-images/ there. The rewrite exists only in the development
 * server: `next build` never sees it, so production builds are unchanged even
 * when the variable is set in the laptop's .env.
 */
const { PHASE_DEVELOPMENT_SERVER } = require('next/constants');

module.exports = (phase) => {
  const origin = (process.env.CORPUS_IMAGES_ORIGIN || '').replace(/\/+$/, '');
  if (phase !== PHASE_DEVELOPMENT_SERVER || !origin) return nextConfig;
  return {
    ...nextConfig,
    async rewrites() {
      return [{ source: '/corpus-images/:path*', destination: `${origin}/corpus-images/:path*` }];
    },
  };
};
