import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { AUTH_COPY } from "@/features/auth/authCopy";
import { TOO_MANY_ATTEMPTS_ERROR } from "@/features/auth/authResponse";

/**
 * deploy/nginx.conf's request limit for sign-in, sign-up and password reset
 * (S8, 26 Oct 2026), read from the file. nginx itself is checked by hand on
 * staging (`nginx -t` and a curl loop, see "Rate limiting" in DEPLOYMENT.md);
 * this keeps the file saying what S8 decided: which paths are limited, which
 * never are, and what the forms are sent on a 429.
 */
const root = process.cwd();
const conf = readFileSync(`${root}/deploy/nginx.conf`, "utf8");

/** Directives and blocks, with comments dropped and quoted strings kept whole. */
function parse(text) {
  const tokens = [];
  let i = 0;
  let word = "";
  const push = () => { if (word) tokens.push(word); word = ""; };
  while (i < text.length) {
    const c = text[i];
    if (c === "#") { push(); while (i < text.length && text[i] !== "\n") i++; continue; }
    if (c === "'" || c === '"') {
      const end = text.indexOf(c, i + 1);
      word += text.slice(i, end + 1);
      i = end + 1;
      continue;
    }
    if (/\s/.test(c)) { push(); i++; continue; }
    if (c === "{" || c === "}" || c === ";") { push(); tokens.push(c); i++; continue; }
    word += c;
    i++;
  }
  push();
  let at = 0;
  function block() {
    const items = [];
    let words = [];
    while (at < tokens.length) {
      const t = tokens[at++];
      if (t === ";") { items.push({ words }); words = []; }
      else if (t === "{") { items.push({ words, children: block() }); words = []; }
      else if (t === "}") return items;
      else words.push(t);
    }
    return items;
  }
  return block();
}

const top = parse(conf);
const server = top.find((d) => d.words[0] === "server").children;
const locations = server.filter((d) => d.words[0] === "location");
const directives = (loc) => loc.children.map((d) => d.words.join(" "));
const isLimited = (loc) => directives(loc).some((d) => d.startsWith("limit_req "));

/** nginx's choice for a path here: an exact match, else the longest prefix (there are no regex locations). */
function match(path) {
  const exact = locations.find((l) => l.words[1] === "=" && l.words[2] === path);
  if (exact) return exact;
  return locations
    .filter((l) => l.words.length === 2 && path.startsWith(l.words[1]))
    .sort((a, b) => b.words[1].length - a.words[1].length)[0];
}

const LIMITED = [
  "/api/auth/callback/credentials",
  "/api/auth/register",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
  "/api/auth/verify-reset-token",
  "/api/auth/resend-verification",
];
const NEVER = [
  "/api/auth/session",
  "/api/auth/csrf",
  "/api/auth/providers",
  "/api/auth/callback/google",
  "/api/auth/signin/google",
  "/api/auth/verify-email",
  "/api/auth/choose-username",
  "/api/auth/complete-profile",
  "/api/annotationGet",
  "/login",
  "/register",
  "/",
];

describe("deploy/nginx.conf request limit (S8)", () => {
  it("declares the zone and the 429 status in the http context, before the server block", () => {
    const before = top.slice(0, top.findIndex((d) => d.words[0] === "server")).map((d) => d.words.join(" "));
    expect(before).toContain("limit_req_zone $binary_remote_addr zone=imprint_auth:10m rate=10r/m");
    expect(before).toContain("limit_req_status 429");
  });

  it("limits exactly the six sign-in, sign-up and reset paths, each in its own exact location", () => {
    expect(locations.filter(isLimited).map((l) => [l.words[1], l.words[2]])).toEqual(LIMITED.map((p) => ["=", p]));
    for (const path of LIMITED) {
      const loc = match(path);
      expect(loc.words).toEqual(["location", "=", path]);
      expect(directives(loc)).toContain("limit_req zone=imprint_auth burst=5 nodelay");
      expect(directives(loc)).toContain("error_page 429 = @imprint_auth_limited");
    }
    // Nothing is limited for the whole server, and no regex location could catch these paths
    expect(server.some((d) => d.words[0] === "limit_req")).toBe(false);
    expect(locations.some((l) => ["~", "~*"].includes(l.words[1]))).toBe(false);
  });

  it("never limits the session, CSRF and providers calls, the Google callback, or ordinary pages", () => {
    for (const path of NEVER) {
      const loc = match(path);
      expect(loc, path).toBeDefined();
      expect(isLimited(loc), path).toBe(false);
    }
    expect(match("/api/auth/session").words).toEqual(["location", "/"]);
  });

  it("proxies each limited path with the same settings as location /", () => {
    const base = directives(match("/"));
    for (const path of LIMITED) {
      const own = directives(match(path)).filter((d) => !d.startsWith("limit_req ") && !d.startsWith("error_page "));
      expect(own, path).toEqual(base);
    }
    expect(base).toContain("proxy_pass http://127.0.0.1:3000");
    expect(base).toContain("proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for");
  });

  it("answers a refused request with JSON the forms and NextAuth's signIn() can read", () => {
    const named = locations.find((l) => l.words[1] === "@imprint_auth_limited");
    const lines = directives(named);
    expect(lines).toContain("default_type application/json");
    const ret = named.children.find((d) => d.words[0] === "return");
    expect(ret.words[1]).toBe("429");
    const body = JSON.parse(ret.words[2].slice(1, -1).replace("$scheme", "https").replace("$http_host", "imprint.example.org"));
    expect(body.message).toBe(AUTH_COPY.tooManyAttempts);
    const url = new URL(body.url);
    expect(url.origin + url.pathname).toBe("https://imprint.example.org/login");
    expect(url.searchParams.get("error")).toBe(TOO_MANY_ATTEMPTS_ERROR);
  });

  it("limits only paths the app has", () => {
    for (const path of LIMITED.filter((p) => !p.startsWith("/api/auth/callback/"))) {
      expect(existsSync(`${root}/src/pages${path}.js`), path).toBe(true);
    }
    // The password sign-in callback is NextAuth's, under the catch-all route
    expect(existsSync(`${root}/src/pages/api/auth/[...nextauth].js`)).toBe(true);
  });

  it("parses the file it checks", () => {
    expect(locations.map((l) => l.words.slice(1).join(" "))).toEqual(expect.arrayContaining(["/", "/_next/static/", "= /api/health"]));
  });
});
