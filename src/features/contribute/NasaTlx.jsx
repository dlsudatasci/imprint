import React, { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { Button, H3 } from "@/ui";
import { NASA_TLX_SCALES } from "@/util/validators/nasaTlx";

// The keys that move a range input
const SCALE_KEYS = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"];
const MIDDLE = 10;
// Anything that touches or moves a scale, heard on the scale itself (23 Nov 2026)
const TOUCH_EVENTS = ["pointerdown", "mousedown", "touchstart", "click", "input", "change"];
// How often a scale's position is checked against what was recorded, ms
export const NASA_TLX_SYNC_MS = 300;

export const NASA_TLX_COPY = Object.freeze({
  hint: "Tap or drag each scale, even to keep the middle.",
  saving: "Saving…",
  failed: "Could not save. Try again.",
});

/**
 * The NASA Task Load Index after a session: six scales from 1 to 20, each
 * starting at the middle with a dash for its number until it is answered.
 *
 * S17 (4 Nov 2026), from pilot participant 3:
 * - Any touch of a scale answers it at the value it then shows: a pointer
 *   down or a click on it, or a key that moves it. A tap on the thumb where it
 *   sits fires no change, so before, the middle could never be chosen. Focus
 *   alone (tabbing past) does not count. Nothing is filled in for the
 *   participant: Submit waits for all six.
 * - While saving, Submit reads Saving… and both buttons are disabled. A
 *   failed submit says so and keeps the answers, instead of closing as if it
 *   had saved. Skip and Escape close whatever the save does, as before.
 * - A click on the backdrop no longer dismisses: a stray tap outside the
 *   card on a phone threw the answers away.
 *
 * 23 Nov 2026, seen in DuckDuckGo and Brave on phones: some moves of a scale
 * never counted, so Submit stayed off until a scale was dragged again. Those
 * browsers run their own scripts in the page. Two changes:
 * - A touch, drag or scale key is heard by listeners on the scale itself, so
 *   it counts even when React's shared listener never receives the event.
 * - While the form is open, each scale's position is compared with what was
 *   recorded every NASA_TLX_SYNC_MS. A scale the browser moved without telling
 *   anyone counts at the value it shows. Before, it was also snapped back to
 *   the middle at the next render. Focus still does not count, and nothing is
 *   filled in: a scale nobody moved or touched stays unanswered.
 */
export default function NasaTlx({ open, sessionNumber, sessionId, onComplete }) {
  const [responses, setResponses] = useState({});
  const [touched, setTouched] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [failed, setFailed] = useState(false);
  // The six range inputs, by scale key, and the values last recorded
  const inputs = useRef({});
  const recorded = useRef({});
  recorded.current = responses;

  // A scale is answered at the value it shows
  const answer = useCallback((key, input) => {
    const value = Number(input.value);
    setResponses((prev) => (prev[key] === value ? prev : { ...prev, [key]: value }));
    setTouched((prev) => (prev[key] ? prev : { ...prev, [key]: true }));
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const removers = [];
    for (const { key } of NASA_TLX_SCALES) {
      const input = inputs.current[key];
      if (!input) continue;
      const onTouch = () => answer(key, input);
      const onKey = (e) => {
        if (SCALE_KEYS.includes(e.key)) answer(key, input);
      };
      for (const type of TOUCH_EVENTS) input.addEventListener(type, onTouch, { passive: true });
      input.addEventListener("keydown", onKey);
      removers.push(() => {
        for (const type of TOUCH_EVENTS) input.removeEventListener(type, onTouch, { passive: true });
        input.removeEventListener("keydown", onKey);
      });
    }
    const sync = setInterval(() => {
      for (const { key } of NASA_TLX_SCALES) {
        const input = inputs.current[key];
        if (input && input.value !== String(recorded.current[key] ?? MIDDLE)) answer(key, input);
      }
    }, NASA_TLX_SYNC_MS);
    return () => {
      clearInterval(sync);
      removers.forEach((remove) => remove());
    };
  }, [open, answer]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") handleDismiss();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  });

  const allTouched = NASA_TLX_SCALES.every((s) => touched[s.key]);

  async function postResult(dismissed, data) {
    setSubmitting(true);
    setFailed(false);
    let saved = false;
    try {
      const res = await fetch("/api/nasa-tlx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          sessionNumber,
          dismissed,
          responses: dismissed ? null : data,
        }),
      });
      saved = res.ok;
      if (!saved) console.error("NASA-TLX save failed:", res.status);
    } catch (err) {
      console.error("NASA-TLX save failed:", err);
    }
    setSubmitting(false);
    // The answers stay for another try
    if (!saved && !dismissed) {
      setFailed(true);
      return;
    }
    setResponses({});
    setTouched({});
    onComplete();
  }

  const handleDismiss = useCallback(() => {
    if (submitting) return;
    postResult(true, null);
  }, [submitting, sessionId, sessionNumber]);

  function handleSubmit() {
    if (!allTouched || submitting) return;
    postResult(false, responses);
  }

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      data-nasa-tlx-backdrop
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm font-sans antialiased"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="NASA Task Load Index"
        className="bg-surface rounded-modal p-8 max-w-lg w-full shadow-2xl border border-line-card text-left max-h-[90vh] overflow-y-auto"
      >
        <H3 className="mb-2">How did that session feel?</H3>
        <p className="text-muted text-sm mb-2 leading-relaxed">
          Rate each dimension from your experience. This helps us understand
          the cognitive demands of the task. You can skip this if you prefer.
        </p>
        <p className="text-ink text-sm font-medium mb-6">{NASA_TLX_COPY.hint}</p>

        <div className="space-y-6">
          {NASA_TLX_SCALES.map((scale) => (
            <div key={scale.key}>
              <label className="block text-ink font-medium text-sm mb-1">
                {scale.label}
              </label>
              <p className="text-muted text-xs mb-2">{scale.description}</p>
              <input
                type="range"
                min={1}
                max={20}
                step={1}
                value={responses[scale.key] ?? MIDDLE}
                aria-label={scale.label}
                ref={(el) => {
                  inputs.current[scale.key] = el;
                }}
                // A touch of the scale answers it at the value it shows (S17);
                // the listeners on the scale itself hear touches and keys
                // (23 Nov 2026). A change that follows replaces it.
                onChange={(e) => answer(scale.key, e.target)}
                className="w-full accent-primary"
              />
              <div className="flex justify-between text-xs text-muted mt-1">
                <span>{scale.lowLabel}</span>
                <span className="font-medium text-ink">
                  {touched[scale.key] ? responses[scale.key] : "—"}
                </span>
                <span>{scale.highLabel}</span>
              </div>
            </div>
          ))}
        </div>

        {failed && (
          <p role="alert" className="text-danger text-sm font-medium mt-6 text-right">
            {NASA_TLX_COPY.failed}
          </p>
        )}

        <div className={`flex gap-3 justify-end ${failed ? "mt-3" : "mt-8"}`}>
          <Button
            variant="neutral"
            size="sm"
            onClick={handleDismiss}
            disabled={submitting}
          >
            Skip
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={!allTouched || submitting}
          >
            {submitting ? NASA_TLX_COPY.saving : "Submit"}
          </Button>
        </div>
      </div>
    </div>,
    document.querySelector("main") || document.body
  );
}
