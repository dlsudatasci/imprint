import React, { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/router";

import Page from "@/ui/page";
import { Button, H1, H2, Card, Container } from "@/ui";
import ContentSkeleton from "@/features/layout/contentSkeleton";
import { EXIT_SURVEY_QUESTIONS, QUESTION_KEYS } from "@/util/validators/exitSurvey";

export default function ExitSurveyPage() {
  const { status } = useSession();
  const router = useRouter();
  const loading = status === "loading";

  const emptyResponses = {};
  for (const key of QUESTION_KEYS) {
    emptyResponses[key] = "";
  }

  const [responses, setResponses] = useState(emptyResponses);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (status !== "authenticated") return;

    async function loadExisting() {
      try {
        const res = await fetch("/api/exit-survey");
        if (!res.ok) throw new Error("Failed to load");
        const data = await res.json();
        if (data.survey?.responses) {
          const loaded = { ...emptyResponses };
          for (const key of QUESTION_KEYS) {
            loaded[key] = data.survey.responses[key] || "";
          }
          setResponses(loaded);
        }
      } catch {
        // First visit — start fresh
      } finally {
        setLoadingExisting(false);
      }
    }
    loadExisting();
  }, [status]);

  if (loading || loadingExisting) {
    return (
      <Page title="Exit Survey - Imprint" contribute>
        <ContentSkeleton />
      </Page>
    );
  }

  if (status === "unauthenticated") {
    router.replace("/auth/signin");
    return null;
  }

  const hasContent = QUESTION_KEYS.some((k) => responses[k].trim() !== "");
  const canSubmit = hasContent && !submitting;

  function setField(key, value) {
    setResponses((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/exit-survey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ responses }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.message || "Something went wrong.");
        return;
      }

      setSubmitted(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <Page title="Exit Survey - Imprint" contribute>
        <Container className="max-w-2xl py-16">
          <div className="text-center">
            <H1 className="mb-4">Thank you for your feedback!</H1>
            <p className="text-muted text-lg mb-8">
              Your responses have been saved. You can update them anytime by
              revisiting this page.
            </p>
            <div className="flex gap-4 justify-center">
              <Button onClick={() => setSubmitted(false)} variant="neutral">
                Edit Responses
              </Button>
              <Button onClick={() => router.push("/contribute")}>
                Back to Dashboard
              </Button>
            </div>
          </div>
        </Container>
      </Page>
    );
  }

  return (
    <Page title="Exit Survey - Imprint" contribute>
      <Container className="max-w-2xl py-12">
        <div className="mb-8">
          <H1 className="mb-2">Exit Questionnaire</H1>
          <p className="text-muted text-lg">
            Help us understand your experience. All questions are open-ended and
            optional, but please answer at least one. Your honest feedback is
            valuable regardless of how many sessions you completed.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          <Card padding="lg">
            <H2 className="mb-6">Your Experience</H2>
            <div className="space-y-8">
              {EXIT_SURVEY_QUESTIONS.map((q, i) => (
                <div key={q.key}>
                  <label className="block text-ink font-medium mb-1">
                    {i + 1}. {q.label}
                  </label>
                  <p className="text-muted text-sm mb-3">{q.prompt}</p>
                  <textarea
                    value={responses[q.key]}
                    onChange={(e) => setField(q.key, e.target.value)}
                    maxLength={2000}
                    rows={4}
                    className="w-full rounded-control border border-line bg-surface px-4 py-3 text-body text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-y"
                    placeholder="Optional"
                  />
                </div>
              ))}
            </div>
          </Card>

          {error && (
            <p className="text-sm text-danger font-medium text-center bg-danger-soft p-3 rounded-control border border-danger-border">
              {error}
            </p>
          )}

          <div className="flex gap-4 justify-end">
            <Button
              variant="neutral"
              onClick={() => router.push("/contribute")}
              type="button"
            >
              Back to Dashboard
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {submitting ? "Saving..." : "Submit Survey"}
            </Button>
          </div>
        </form>
      </Container>
    </Page>
  );
}
