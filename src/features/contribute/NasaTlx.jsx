import React, { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { Button, H3 } from "@/ui";
import { NASA_TLX_SCALES } from "@/util/validators/nasaTlx";

export default function NasaTlx({ open, sessionNumber, sessionId, onComplete }) {
  const [responses, setResponses] = useState({});
  const [touched, setTouched] = useState({});
  const [submitting, setSubmitting] = useState(false);

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
    try {
      await fetch("/api/nasa-tlx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          sessionNumber,
          dismissed,
          responses: dismissed ? null : data,
        }),
      });
    } catch (err) {
      console.error("NASA-TLX save failed:", err);
    } finally {
      setSubmitting(false);
      setResponses({});
      setTouched({});
      onComplete();
    }
  }

  const handleDismiss = useCallback(() => {
    if (submitting) return;
    postResult(true, null);
  }, [submitting, sessionId, sessionNumber]);

  function handleSubmit() {
    if (!allTouched || submitting) return;
    postResult(false, responses);
  }

  function handleChange(key, value) {
    setResponses((prev) => ({ ...prev, [key]: value }));
    setTouched((prev) => ({ ...prev, [key]: true }));
  }

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm font-sans antialiased"
      onClick={handleDismiss}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="NASA Task Load Index"
        onClick={(e) => e.stopPropagation()}
        className="bg-surface rounded-modal p-8 max-w-lg w-full shadow-2xl border border-line-card text-left max-h-[90vh] overflow-y-auto"
      >
        <H3 className="mb-2">How did that session feel?</H3>
        <p className="text-muted text-sm mb-6 leading-relaxed">
          Rate each dimension from your experience. This helps us understand
          the cognitive demands of the task. You can skip this if you prefer.
        </p>

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
                value={responses[scale.key] ?? 10}
                onChange={(e) =>
                  handleChange(scale.key, Number(e.target.value))
                }
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

        <div className="flex gap-3 justify-end mt-8">
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
            Submit
          </Button>
        </div>
      </div>
    </div>,
    document.querySelector("main") || document.body
  );
}
