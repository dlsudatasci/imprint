import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import crypto from "crypto";
import { createMockReq, createMockRes, createMockDb } from "@/test-utils/api-helpers";

vi.mock("@/util/mongodb", () => ({ connectToDatabase: vi.fn() }));
vi.mock("nodemailer", () => ({ default: { createTransport: vi.fn(() => ({ sendMail: vi.fn() })) } }));
vi.mock("@/util/campaigns/sendCampaign.mjs", () => ({ sendCampaign: vi.fn() }));

import { connectToDatabase } from "@/util/mongodb";
import { sendCampaign } from "@/util/campaigns/sendCampaign.mjs";
import { fromInsideContainer, hasCampaignSecret } from "@/util/campaigns/internalAccess.mjs";
import handler from "@/pages/api/internal/campaigns.js";

/**
 * POST /api/internal/campaigns (S29, 16 Nov 2026): reachable only from inside
 * the container with CAMPAIGN_SECRET. Everything else is a 404.
 */
const SECRET = "a-long-random-campaign-secret";
const db = createMockDb();

beforeEach(() => {
  vi.stubEnv("CAMPAIGN_SECRET", SECRET);
  connectToDatabase.mockResolvedValue({ db });
  sendCampaign.mockImplementation(async ({ mode, campaign }) => ({ ok: true, campaign, mode, sent: 0 }));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

const request = ({ address = "127.0.0.1", secret = SECRET, headers = {}, ...rest } = {}) =>
  createMockReq({
    socket: { remoteAddress: address },
    headers: { ...(secret === null ? {} : { authorization: `Bearer ${secret}` }), ...headers },
    body: { campaign: "welcome-nudge", mode: "dry" },
    ...rest,
  });

async function call(req) {
  const res = createMockRes();
  await handler(req, res);
  return res;
}

describe("POST /api/internal/campaigns, the locks", () => {
  it("is a 404 from a non-loopback address, even with the right secret", async () => {
    for (const address of ["10.0.1.5", "172.18.0.3", "::ffff:10.0.0.2", "0.0.0.0"]) {
      expect((await call(request({ address })))._status).toBe(404);
    }
    // No socket address at all
    expect((await call(request({ socket: {} })))._status).toBe(404);
    expect(sendCampaign).not.toHaveBeenCalled();
  });

  it("is a 404 from loopback when a proxy on the same machine forwarded it: an outside x-forwarded-for, x-real-ip or forwarded", async () => {
    for (const headers of [
      { "x-forwarded-for": "203.0.113.9" },
      { "x-forwarded-for": "203.0.113.9, 127.0.0.1" },
      { "x-forwarded-for": "127.0.0.1, 10.0.0.2" },
      { "x-forwarded-for": "" },
      { "x-real-ip": "203.0.113.9" },
      { "x-real-ip": "127.0.0.1" },
      { forwarded: "for=203.0.113.9" },
    ]) {
      expect((await call(request({ headers })))._status, JSON.stringify(headers)).toBe(404);
    }
    expect(sendCampaign).not.toHaveBeenCalled();
  });

  it("allows an inside request with the headers exactly as Next.js sets them", async () => {
    // next/dist/server/base-server.js adds these to every request before the handler
    const nextHeaders = {
      host: "127.0.0.1:3000",
      "x-forwarded-host": "127.0.0.1:3000",
      "x-forwarded-port": "3000",
      "x-forwarded-proto": "http",
      "x-forwarded-for": "127.0.0.1",
    };
    const res = await call(request({ headers: nextHeaders }));
    expect(res._status).toBe(200);
    expect(sendCampaign).toHaveBeenCalledTimes(1);
    // The same over IPv6 loopback
    const v6 = await call(request({ address: "::1", headers: { ...nextHeaders, "x-forwarded-for": "::1" } }));
    expect(v6._status).toBe(200);
  });

  it("is a 404 with a wrong or missing secret", async () => {
    for (const secret of ["wrong", "", null, `${SECRET}x`, SECRET.slice(0, -1)]) {
      expect((await call(request({ secret })))._status).toBe(404);
    }
    const basic = request({ secret: null, headers: { authorization: `Basic ${SECRET}` } });
    expect((await call(basic))._status).toBe(404);
    expect(sendCampaign).not.toHaveBeenCalled();
  });

  it("is a 404 when CAMPAIGN_SECRET is not set, whatever is sent", async () => {
    vi.stubEnv("CAMPAIGN_SECRET", "");
    expect((await call(request({ secret: "" })))._status).toBe(404);
    expect((await call(request()))._status).toBe(404);
    expect(sendCampaign).not.toHaveBeenCalled();
  });

  it("is a 404 for other methods", async () => {
    expect((await call(request({ method: "GET" })))._status).toBe(404);
    expect(sendCampaign).not.toHaveBeenCalled();
  });

  it("compares the secret in constant time", () => {
    const spy = vi.spyOn(crypto, "timingSafeEqual");
    expect(hasCampaignSecret({ headers: { authorization: `Bearer ${SECRET}` } }, SECRET)).toBe(true);
    expect(hasCampaignSecret({ headers: { authorization: "Bearer x" } }, SECRET)).toBe(false);
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });

  it("takes the three loopback forms", () => {
    for (const address of ["127.0.0.1", "::1", "::ffff:127.0.0.1"]) {
      expect(fromInsideContainer({ socket: { remoteAddress: address }, headers: {} })).toBe(true);
    }
  });
});

describe("POST /api/internal/campaigns, from loopback with the secret", () => {
  it("passes each mode to the sender and answers its counts", async () => {
    for (const [i, address] of ["127.0.0.1", "::1", "::ffff:127.0.0.1", "127.0.0.1", "::1"].entries()) {
      const mode = ["preview", "dry", "apply", "retry-failed", "auto"][i];
      const body = { campaign: "welcome-nudge", mode, previewTo: "rans-admin", limit: 10, pauseMs: 0 };
      const res = await call(request({ address, body }));
      expect(res._status).toBe(200);
      expect(res._json).toEqual({ ok: true, campaign: "welcome-nudge", mode, sent: 0 });
      const options = sendCampaign.mock.calls.at(-1)[0];
      expect(options).toMatchObject({ db, campaign: "welcome-nudge", mode, previewTo: "rans-admin", limit: 10, pauseMs: 0 });
      expect(typeof options.transport.sendMail).toBe("function");
    }
    expect(sendCampaign).toHaveBeenCalledTimes(5);
  });

  it("passes a family name and \"all\" to the sender, as the daily task posts it (S33)", async () => {
    for (const campaign of ["all", "milestone", "inactivity", "exit-questionnaire"]) {
      const res = await call(request({ body: { campaign, mode: campaign === "exit-questionnaire" ? "dry" : "auto" } }));
      expect(res._status).toBe(200);
      expect(sendCampaign.mock.calls.at(-1)[0]).toMatchObject({ campaign });
    }
  });

  it("answers 400 when the sender refuses the exit questionnaire in auto (S33)", async () => {
    sendCampaign.mockResolvedValueOnce({ ok: false, error: "This campaign is sent by hand only, never by auto." });
    const res = await call(request({ body: { campaign: "exit-questionnaire", mode: "auto" } }));
    expect(res._status).toBe(400);
    expect(res._json.error).toContain("by hand only");
  });

  it("answers 400 with the sender's refusal", async () => {
    sendCampaign.mockResolvedValueOnce({ ok: false, error: "Send this campaign by hand first." });
    const res = await call(request({ body: { campaign: "welcome-nudge", mode: "auto" } }));
    expect(res._status).toBe(400);
    expect(res._json).toEqual({ ok: false, error: "Send this campaign by hand first." });
  });

  it("answers 500 when the run throws, without the error's message", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    sendCampaign.mockRejectedValueOnce(new Error("user1@example.org"));
    const res = await call(request());
    expect(res._status).toBe(500);
    expect(JSON.stringify(res._json)).not.toContain("@");
  });
});
