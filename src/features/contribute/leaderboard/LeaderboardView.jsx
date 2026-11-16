import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Badge, Button, Checkbox, CloseIcon, Container, IconButton, Skeleton } from "@/ui";
import { LEADERBOARD_COPY as COPY } from "./leaderboardCopy";

/**
 * The one-time question: show the username, or a number instead. Either
 * button saves the choice. Closing it (the X, Escape or a click outside)
 * saves nothing, so the person stays hidden and is asked again next time.
 * Laid out as ConfirmDialog is, which could not be used here: its second
 * button is its close.
 */
function NameQuestion({ busy, onChoose, onClose }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm font-sans antialiased"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="leaderboard-question-title"
        onClick={(e) => e.stopPropagation()}
        className="relative bg-surface rounded-modal p-6 sm:p-8 max-w-md w-full shadow-2xl border border-line-card text-left"
      >
        <IconButton aria-label={COPY.question.close} size="sm" className="absolute right-4 top-4" onClick={onClose}>
          <CloseIcon />
        </IconButton>
        <h2 id="leaderboard-question-title" className="pr-10 font-display text-2xl font-bold text-ink mb-3">
          {COPY.question.title}
        </h2>
        <p className="text-muted mb-8 leading-relaxed font-medium">{COPY.question.description}</p>
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="neutral" size="sm" disabled={busy} onClick={() => onChoose(false)}>
            {COPY.question.hide}
          </Button>
          <Button size="sm" disabled={busy} onClick={() => onChoose(true)}>
            {COPY.question.show}
          </Button>
        </div>
      </div>
    </div>,
    document.querySelector("main") || document.body,
  );
}

/** One row: rank, name, the "You" mark, photos. The name wraps, so nothing scrolls sideways at 360 px. */
function Row({ row, as: Tag = "li" }) {
  return (
    <Tag
      data-leaderboard-row={row.isYou ? "you" : ""}
      className={`flex items-center gap-3 px-4 py-3.5 sm:px-8 ${row.isYou ? "bg-primary-50" : ""}`}
    >
      <span className="w-10 shrink-0 text-base font-extrabold text-ink tabular-nums">{COPY.rank(row.rank)}</span>
      <span className="min-w-0 flex-1 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="min-w-0 break-words font-semibold text-ink">{row.name}</span>
        {row.isYou && <Badge tone="info">{COPY.you}</Badge>}
      </span>
      <span className="shrink-0 text-sm font-semibold text-muted tabular-nums">{COPY.photos(row.photos)}</span>
    </Tag>
  );
}

/**
 * The leaderboard page's content (S32, 17 Nov 2026): the top 20 contributors
 * by photos annotated properly, the viewer's own place, and their choice to
 * show their username or a number.
 *
 * Everything comes from GET /api/leaderboard. `you` is null for an admin, who
 * sees the board alone. A contributor who has never chosen (`nameChoice`
 * null) is asked once, before the board.
 */
export default function LeaderboardView() {
  const [board, setBoard] = useState(null);
  const [failed, setFailed] = useState(false);
  const [questionClosed, setQuestionClosed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/leaderboard");
      const data = res.ok ? await res.json().catch(() => null) : null;
      if (!data || !Array.isArray(data.top)) throw new Error("no board");
      setBoard(data);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const choose = useCallback(
    async (show) => {
      setSaving(true);
      setSaveFailed(false);
      try {
        const res = await fetch("/api/leaderboard/name", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ show }),
        });
        if (!res.ok) throw new Error("not saved");
        await load();
      } catch {
        setSaveFailed(true);
      } finally {
        setSaving(false);
        // Answered or failed, the board shows. A failed save asks again next time.
        setQuestionClosed(true);
      }
    },
    [load],
  );
  const closeQuestion = useCallback(() => setQuestionClosed(true), []);

  const you = board?.you ?? null;
  const asking = !!you && you.nameChoice == null && !questionClosed;
  const youInTop = !!board && board.top.some((row) => row.isYou);

  return (
    <section className="pt-12 pb-20 lg:pt-16">
      <Container width="reading">
        <h1 className="font-display text-5xl lg:text-6xl font-extrabold tracking-[-0.03em] leading-[1.04] text-primary">
          {COPY.title}
        </h1>
        <p className="mt-4 text-muted font-medium leading-relaxed">{COPY.intro}</p>

        {failed && !board ? (
          <p role="status" className="mt-8 rounded-card border border-line bg-surface px-6 py-8 text-center text-sm text-muted">
            {COPY.loadFailed}
          </p>
        ) : !board ? (
          <div className="mt-8 flex flex-col gap-4" aria-busy="true">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-96 w-full" />
          </div>
        ) : asking ? (
          <NameQuestion busy={saving} onChoose={choose} onClose={closeQuestion} />
        ) : (
          <>
            {you && (
              <p className="mt-8 text-xl font-bold text-ink" data-leaderboard-you>
                {you.rank != null ? COPY.yourPlace(you.rank, you.photos) : COPY.noPhotosYet}
              </p>
            )}

            <div className="mt-6 rounded-card border border-line bg-surface overflow-hidden">
              {board.top.length > 0 ? (
                <ol aria-label={COPY.boardLabel} className="divide-y divide-line-card">
                  {board.top.map((row, i) => (
                    <Row row={row} key={i} />
                  ))}
                </ol>
              ) : (
                <p className="px-6 py-8 text-center text-sm text-muted">{COPY.empty}</p>
              )}
            </div>

            {you && you.rank != null && !youInTop && (
              <div
                role="group"
                aria-label={COPY.yourRowLabel}
                className="mt-3 rounded-card border border-line bg-surface overflow-hidden"
              >
                <Row as="div" row={{ rank: you.rank, name: you.name, photos: you.photos, isYou: true }} />
              </div>
            )}

            {you && (
              <div className="mt-4 px-1">
                <Checkbox
                  label={COPY.nameSwitch}
                  labelClassName="text-muted"
                  checked={you.nameChoice === "shown"}
                  disabled={saving}
                  onChange={(e) => choose(e.target.checked)}
                />
                {saveFailed && <p role="status" className="mt-3 text-sm font-medium text-danger">{COPY.nameSaveFailed}</p>}
              </div>
            )}

            {/* The way to a better place (Rans, 17 Nov 2026): a small card
                like the one that ends the landing page (ClosingSection), the
                words on the left and the button beside them, under them on a
                phone. Someone on the board has finished a session, so the
                button starts one. Someone not yet on it goes to the
                dashboard, which shows their next step. */}
            {you && (
              <section
                aria-labelledby="leaderboard-nudge-title"
                data-leaderboard-nudge
                className="mt-8 flex flex-col gap-5 rounded-card border border-line bg-surface px-6 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-8"
              >
                <h2 id="leaderboard-nudge-title" className="font-display text-2xl font-bold text-ink tracking-[-0.02em]">
                  {COPY.improve}
                </h2>
                <Link href={you.rank != null ? "/contribute/annotate" : "/contribute"} tabIndex={-1} className="flex shrink-0">
                  <Button fullWidth>{COPY.annotate}</Button>
                </Link>
              </section>
            )}
          </>
        )}
      </Container>
    </section>
  );
}
