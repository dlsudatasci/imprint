import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { AuthCard, AuthScreen, Button } from "@/ui";
import { UNSUBSCRIBE_COPY as COPY } from "./unsubscribeCopy";

/**
 * The stop page a campaign email links to (S29, 16 Nov 2026):
 * /unsubscribe?u=<account id>&t=<signature>.
 *
 * Opening it changes nothing, since mail scanners open links. The button
 * posts the pair to /api/email/unsubscribe, then the page says it is done and
 * offers to turn the emails back on (the same route with `on: true`). The
 * server checked the signature before rendering, and a link that fails says
 * only that it does not work, nothing about any account.
 */
export default function UnsubscribeView({ valid, u = null, t = null }) {
  // "ask" (the first screen), "off" (stopped) or "on" (turned back on)
  const [phase, setPhase] = useState("ask");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const post = async (on) => {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/email/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(on ? { u, t, on: true } : { u, t }),
      });
      if (!r.ok) throw new Error(String(r.status));
      setPhase(on ? "on" : "off");
    } catch {
      setError(COPY.failed);
    } finally {
      setBusy(false);
    }
  };

  const title = !valid ? COPY.invalidTitle : phase === "off" ? COPY.doneTitle : phase === "on" ? COPY.onTitle : COPY.title;

  return (
    <AuthScreen>
      <AuthCard
        masthead={<Image src="/images/logo/imprint.png" alt="Imprint" width={56} height={56} className="w-14 h-14 object-contain" />}
        title={title}
      >
        <div className="w-full space-y-4" data-unsubscribe-phase={valid ? phase : "invalid"}>
          {!valid && <p className="text-sm text-body leading-relaxed text-center">{COPY.invalid}</p>}

          {valid && phase === "off" && (
            <p role="status" className="text-sm font-medium p-3 bg-success-soft rounded-control text-success border border-success-border text-center">
              {COPY.done}
            </p>
          )}
          {valid && phase === "on" && (
            <p role="status" className="text-sm font-medium p-3 bg-success-soft rounded-control text-success border border-success-border text-center">
              {COPY.on}
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm font-medium p-3 bg-warning-soft rounded-control text-warning border border-warning-border text-center">
              {error}
            </p>
          )}

          {valid && phase !== "off" && (
            <Button fullWidth onClick={() => post(false)} disabled={busy}>
              {busy ? COPY.stopping : COPY.stop}
            </Button>
          )}
          {valid && phase === "off" && (
            <Button variant="neutral" fullWidth onClick={() => post(true)} disabled={busy}>
              {busy ? COPY.turningOn : COPY.turnOn}
            </Button>
          )}

          <Link href="/" tabIndex={-1} className="flex pt-2">
            <Button variant="neutral" fullWidth>{COPY.home}</Button>
          </Link>
        </div>
      </AuthCard>
    </AuthScreen>
  );
}
