import { describe, it, expect, afterEach, vi } from "vitest";
import { createRequire } from "node:module";

/**
 * next.config.js against the installed Next.js (S7, upgrade to 16.4): the
 * framework's own config schema accepts it in both phases (an unrecognized key
 * is refused, as Next.js does at start), and the settings this project relies
 * on are still there.
 */
const require = createRequire(import.meta.url);
const { configSchema } = require("next/dist/server/config-schema");
const { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD } = require("next/constants");
const configPath = `${process.cwd()}/next.config.js`;

function load(phase) {
  delete require.cache[require.resolve(configPath)];
  const exported = require(configPath);
  return typeof exported === "function" ? exported(phase) : exported;
}

afterEach(() => vi.unstubAllEnvs());

describe("next.config.js (S7)", () => {
  it("is valid for the installed Next.js when building and in development", () => {
    for (const phase of [PHASE_PRODUCTION_BUILD, PHASE_DEVELOPMENT_SERVER]) {
      const result = configSchema.safeParse(load(phase));
      expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
    }
    // The schema does refuse what it does not know, so the check means something
    expect(configSchema.safeParse({ notARealOption: true }).success).toBe(false);
  });

  it("keeps next dev from writing AI agent files into the repository", () => {
    expect(load(PHASE_DEVELOPMENT_SERVER).agentRules).toBe(false);
    expect(load(PHASE_PRODUCTION_BUILD).agentRules).toBe(false);
  });

  it("keeps the deploy settings: standalone output, no framework header, no browser source maps", () => {
    const config = load(PHASE_PRODUCTION_BUILD);
    expect(config.output).toBe("standalone");
    expect(config.poweredByHeader).toBe(false);
    expect(config.productionBrowserSourceMaps).toBe(false);
    expect(config.reactStrictMode).toBe(true);
    // No images block: next/image optimizes only the app's own pictures
    expect(config.images).toBeUndefined();
  });

  it("still sends the security headers on every path", async () => {
    const [rule] = await load(PHASE_PRODUCTION_BUILD).headers();
    expect(rule.source).toBe("/:path*");
    const names = rule.headers.map((h) => h.key);
    for (const name of ["X-Content-Type-Options", "X-Frame-Options", "Referrer-Policy", "Permissions-Policy"]) {
      expect(names).toContain(name);
    }
  });

  it("proxies /corpus-images/ only in development, and only when CORPUS_IMAGES_ORIGIN is set", async () => {
    expect(load(PHASE_DEVELOPMENT_SERVER).rewrites).toBeUndefined();
    vi.stubEnv("CORPUS_IMAGES_ORIGIN", "http://127.0.0.1:8080/");
    expect(load(PHASE_PRODUCTION_BUILD).rewrites).toBeUndefined();
    expect(await load(PHASE_DEVELOPMENT_SERVER).rewrites()).toEqual([
      { source: "/corpus-images/:path*", destination: "http://127.0.0.1:8080/corpus-images/:path*" },
    ]);
  });
});
