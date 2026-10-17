import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }) => <a href={href} {...rest}>{children}</a>,
}));
// eslint-disable-next-line @next/next/no-img-element -- a stand-in for next/image in a test
vi.mock("next/image", () => ({ default: ({ src, alt }) => <img src={src} alt={alt} /> }));
vi.mock("next/dynamic", () => ({ default: () => () => <div data-dynamic /> }));
vi.mock("next/router", () => ({ useRouter: () => ({ pathname: "/privacy", query: {}, isReady: true, push: vi.fn(), events: { on: vi.fn(), off: vi.fn() } }) }));
vi.mock("next-auth/react", () => ({ useSession: () => ({ status: "unauthenticated", data: null }), signIn: vi.fn() }));
// Pages render without their layout here: the chrome has its own tests
vi.mock("@/ui/page", () => ({ default: ({ children }) => <div data-page>{children}</div> }));
vi.mock("@/ui/InteractiveObstructions", () => ({ default: () => <div data-scene /> }));

import AboutSection from "@/features/about";
import HelpDirectory from "@/features/contribute/help";
import { LegalShell, LEGAL_TABS } from "@/features/legal";
import NotFound from "@/pages/404";
import Login from "@/pages/login";
import Register from "@/pages/register";
import ForgotPassword from "@/pages/forgot-password";
import InformedConsent from "@/pages/terms-of-use";
import { ABOUT_COPY } from "@/features/about/aboutCopy";
import { GUIDE_COPY } from "@/features/contribute/help/guideCopy";
import { SESSION_PICKER_COPY } from "@/features/annotate/SessionSizeOptions";
import { CONTRIBUTOR_OPTIONS } from "@/features/annotate/sessionOptions";
import { PICKER_STILL_SELECTED } from "@/features/contribute/help/SessionPickerStill";
import { CATEGORY_GROUPS, SCENE_QUESTIONS, SEVERITY_SCALE } from "@/features/contribute/help/taskFacts";
import { AUTH_COPY } from "@/features/auth/authCopy";
import { NOT_FOUND_COPY } from "@/features/notFound/notFoundCopy";

/**
 * The public pages render what the manuscript-checked copy says (16 Oct 2026,
 * IMPRINT_public_redesign.md).
 */
const decode = (html) => html.replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"');

describe("About", () => {
  const html = decode(renderToStaticMarkup(<AboutSection />));

  it("tells the study as the manuscript does, and drops what Imprint does not record", () => {
    expect(html).toContain(ABOUT_COPY.title);
    for (const step of ABOUT_COPY.steps.items) expect(html).toContain(step.title);
    for (const g of CATEGORY_GROUPS) for (const label of g.labels) expect(html).toContain(`>${label}<`);
    for (const q of SCENE_QUESTIONS) expect(html).toContain(q.name);
    // The old page: "simple micro-tasks", labels that "train the models", and
    // lists of things (tactile paving, ramps, manholes) the platform never asks about
    expect(html).not.toMatch(/micro-task|train the models|tactile paving|manhole|wheelchair ramps/i);
    // General terms (Rans, 16 Oct 2026): no study figures, no aggregation method
    expect(html).not.toMatch(/22 percent|majority vote|across Metro Manila, and uses/i);
    expect(html).not.toContain("theHow.jpg");
  });

  it("links the consent form, the privacy policy, the guide and the preview", () => {
    for (const href of ["/terms-of-use", "/privacy", "/demo", "/#how-it-works"]) expect(html).toContain(`href="${href}"`);
  });

  it("keeps every section on the one page ground, with no alternating bands (Rans, 17 Oct 2026)", () => {
    const sections = [...html.matchAll(/<section[^>]*>/g)].map((m) => m[0]);
    expect(sections.length).toBeGreaterThan(3);
    for (const s of sections) expect(s).not.toMatch(/bg-|border-y/);
  });
});

describe("annotation guide", () => {
  const html = decode(renderToStaticMarkup(<HelpDirectory />));

  it("has a section for every step, each reachable from the contents", () => {
    for (const step of [...GUIDE_COPY.steps, GUIDE_COPY.reference]) {
      expect(html).toContain(`id="${step.id}"`);
      expect(html).toContain(`href="#${step.id}"`);
    }
  });

  it("pictures every step, the first with the session picker drawn from its own words and sizes", () => {
    for (const step of GUIDE_COPY.steps) expect(step.still !== undefined || step.picker === true, step.id).toBe(true);
    const start = html.slice(html.indexOf('id="start"'), html.indexOf('id="answer"'));
    expect(start).toContain('data-guide-still="session-picker"');
    expect(start).toContain(SESSION_PICKER_COPY.title);
    expect(start).toContain(SESSION_PICKER_COPY.lead);
    expect(start).toContain(SESSION_PICKER_COPY.start);
    for (const o of CONTRIBUTOR_OPTIONS) expect(start).toContain(o.time);
    expect(start).toMatch(new RegExp(`aria-pressed="true"[^>]*>\\s*<span[^>]*>${PICKER_STILL_SELECTED}</span>`));
    expect(start).toContain(GUIDE_COPY.pickerCaption);
  });

  it("describes the tool as it is: no slider, no surface-type step, no white boxes", () => {
    expect(html).not.toMatch(/slider|surface type|white box|Selected Obstructions|Others"/i);
    for (const s of SEVERITY_SCALE) expect(html).toContain(s.label);
    for (const q of SCENE_QUESTIONS) for (const a of q.answers) expect(html).toContain(a);
  });
});

describe("legal pages", () => {
  it("switch between the two documents with the current one marked", () => {
    const html = renderToStaticMarkup(<LegalShell title="Privacy Policy" intro={<p>i</p>}><p /></LegalShell>);
    expect(LEGAL_TABS.map((t) => t.href)).toEqual(["/terms-of-use", "/privacy"]);
    expect(html).toContain('href="/privacy" aria-current="page"');
    expect(html).not.toContain('href="/terms-of-use" aria-current="page"');
    expect(html).toMatch(/<h1[^>]*>Privacy Policy<\/h1>/);
  });
});

describe("Informed Consent", () => {
  const html = decode(renderToStaticMarkup(<InformedConsent />));

  it("takes the three lines Rans changed on 16 Oct 2026, and keeps the rest of appendix_C.tex", () => {
    expect(html).toContain("have basic digital literacy, and have access to a web browser on a computer, tablet, or smartphone.");
    expect(html).not.toMatch(/desktop or laptop/);
    expect(html).not.toMatch(/eight\s+weeks/);
    expect(html).toContain("as often as you wish over the study period.");
    expect(html).toContain("the type of device, browser, and screen size you use");
    // Unchanged lines
    expect(html).toContain("Leveraging Human-in-the-Loop Crowdsourcing for Richer Perception Data");
    expect(html).toContain("I have read and understood this form and agree to");
  });
});

describe("404", () => {
  it("says the page is missing and offers a way back", () => {
    const html = decode(renderToStaticMarkup(<NotFound />));
    expect(html).toContain(NOT_FOUND_COPY.title);
    expect(html).toContain('href="/"');
    expect(html).toContain('href="/demo"');
  });
});

describe("sign-in pages", () => {
  it("log in: verb labels, autocomplete for password managers, and the inline Google mark", () => {
    const html = decode(renderToStaticMarkup(<Login />));
    expect(html).toContain(`>${AUTH_COPY.login.submit}<`);
    expect(html).toContain(AUTH_COPY.google);
    expect(html).toMatch(/autocomplete="username"/i);
    expect(html).toMatch(/autocomplete="current-password"/i);
    expect(html).toContain('fill="#4285F4"');
    expect(html).not.toContain("svgrepo");
  });

  it("register: Create account, the rules as hints, and new-password autocomplete", () => {
    const html = decode(renderToStaticMarkup(<Register />));
    expect(html).toContain(`>${AUTH_COPY.register.submit}<`);
    expect(html).toContain(AUTH_COPY.register.usernameHint);
    expect(html).toContain(AUTH_COPY.register.passwordHint);
    expect((html.match(/autocomplete="new-password"/gi) || []).length).toBe(2);
    // The consent lines are appendix_C.tex's, unchanged
    expect(html).toContain("I have read and understood the");
    expect(html).toContain("and agree to participate");
    expect(html).toContain("I confirm that I am at least 18 years old");
  });

  it("forgot password: tells Google accounts there is nothing to reset", () => {
    const html = decode(renderToStaticMarkup(<ForgotPassword />));
    expect(html).toContain(AUTH_COPY.forgot.googleNote);
  });
});
