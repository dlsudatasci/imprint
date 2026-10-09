import React from "react";
import { cn } from "../cn";
import { TRAYS, TRAY_COPY, buildTrays, ghostSlotCount } from "@/features/annotate/objectTrays";
import { BOX_VISIBILITY_COPY } from "@/features/annotate/boxVisibility";
import { EyeIcon, EyeOffIcon } from "../icons";

/**
 * Contributor Step 1: the answers under the photo (7 Oct 2026).
 *
 * The objects still to decide, then two lists side by side, Not obstructions
 * and Obstructions, then any boxes marked Not an object. Each object is a chip
 * that opens its panel, which is where answers are given and changed. While
 * objects are still to decide, each list ends with empty dashed slots, so it
 * is clear that answers will go there.
 *
 * Chips in the lists are plain white. Still-to-decide chips are dashed like
 * their boxes on the canvas: amber for a suggestion, blue for a box the
 * contributor drew. A drawn box has a small blue pencil before its name, blue
 * like its box on the canvas.
 *
 * Each chip also has an eye that hides its box on the photo (8 Oct 2026), so
 * crowded boxes can be drawn and fitted. A line at the top counts the hidden
 * boxes, with Show all.
 *
 * Presentational: ReactPictureAnnotation passes the lists from buildTrays.
 * Keeps the box-review-section id, which the tutorial points at.
 */
type Trays = ReturnType<typeof buildTrays>;
type TrayItem = Trays["toDecide"][number];
type Tone = "toDecide" | "notObstructions" | "obstructions" | "removed";

export interface ObjectTraysProps {
  trays: Trays;
  selectedId: string | null;
  /** Ids of boxes hidden on the photo (8 Oct 2026) */
  hiddenIds?: string[];
  /** Select the box and open its panel */
  onOpen(id: string): void;
  /** Hide or show one box on the photo */
  onToggleHidden?(id: string): void;
  /** Show every hidden box again */
  onShowAll?(): void;
}

type ChipActions = Pick<ObjectTraysProps, "selectedId" | "onOpen" | "onToggleHidden"> & { hidden: Set<string> };

const LIST_IDS = {
  notObstructions: "object-tray-not-obstructions",
  obstructions: "object-tray-obstructions",
} as const;

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50";

const toneClass = (tone: Tone, drawn: boolean) => {
  switch (tone) {
    case "toDecide":
      return drawn
        ? "border-dashed border-primary bg-surface text-ink hover:bg-primary-50"
        : "border-dashed border-warning bg-surface text-ink hover:bg-warning-soft";
    case "removed":
      return "border-line bg-surface text-muted hover:text-ink hover:border-subtle";
    default:
      return "border-line bg-surface text-ink hover:border-subtle";
  }
};

/** A pencil: this box was drawn by the contributor. */
function DrawnMark() {
  return (
    <svg
      data-drawn
      aria-hidden="true"
      className="w-3 h-3 shrink-0 text-primary"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10.5 2.5l3 3L5.5 13.5 2 14l.5-3.5 8-8z" />
      <path d="M9 4l3 3" />
    </svg>
  );
}

// A press on a chip never reaches the canvas
const stopPress = (e: React.SyntheticEvent) => e.stopPropagation();

/**
 * One object: its name opens the box's panel, and the eye beside it hides or
 * shows the box on the photo. A hidden object's chip is faded, with the eye
 * crossed out.
 */
function Chip({ item, tone, actions }: { item: TrayItem; tone: Tone; actions: ChipActions }) {
  const { selectedId, onOpen, onToggleHidden, hidden } = actions;
  const isHidden = hidden.has(item.id);
  const eyeLabel = isHidden ? BOX_VISIBILITY_COPY.show(item.label) : BOX_VISIBILITY_COPY.hide(item.label);
  return (
    <li
      className={cn(
        "inline-flex items-stretch h-7 rounded-control border text-xs font-semibold whitespace-nowrap transition-colors motion-safe:animate-tray-land",
        toneClass(tone, item.drawn),
        selectedId === item.id && "ring-2 ring-primary/40",
        isHidden && "opacity-60"
      )}
    >
      <button
        type="button"
        data-tray={tone}
        data-hidden={isHidden || undefined}
        title={item.drawn ? TRAY_COPY.drawnTitle : undefined}
        onMouseDown={stopPress}
        onClick={(e) => {
          e.stopPropagation();
          onOpen(item.id);
        }}
        className={cn("inline-flex items-center gap-1.5 pl-2.5 rounded-control", onToggleHidden ? "pr-1" : "pr-2.5", FOCUS)}
      >
        {item.drawn && <DrawnMark />}
        {item.label}
        {item.drawn && <span className="sr-only">, {TRAY_COPY.drawnTitle.toLowerCase()}</span>}
      </button>
      {onToggleHidden && (
        <button
          type="button"
          data-eye
          aria-label={eyeLabel}
          aria-pressed={isHidden}
          title={eyeLabel}
          onMouseDown={stopPress}
          onClick={(e) => {
            e.stopPropagation();
            onToggleHidden(item.id);
          }}
          className={cn("grid place-items-center pl-0.5 pr-2 rounded-control text-subtle hover:text-ink transition-colors", FOCUS)}
        >
          {isHidden ? <EyeOffIcon size={14} /> : <EyeIcon size={14} />}
        </button>
      )}
    </li>
  );
}

/** An empty slot: the shape of a chip, waiting for an answer. */
function EmptySlot() {
  return (
    <li
      aria-hidden="true"
      data-slot="empty"
      className="h-7 w-16 rounded-control border border-dashed border-line grid place-items-center text-sm leading-none text-subtle"
    >
      +
    </li>
  );
}

function AnswerList({ tray, trays, actions }: {
  tray: "notObstructions" | "obstructions";
  trays: Trays;
  actions: ChipActions;
}) {
  const items = trays[tray];
  const id = LIST_IDS[tray];
  const slots = ghostSlotCount(items.length, trays.toDecide.length);
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="min-w-0 rounded-card border border-line bg-surface-subtle px-3 pt-2.5 pb-3">
      <h3 id={`${id}-title`} className="text-sm font-semibold text-ink mb-2">{TRAY_COPY[tray]}</h3>
      {items.length > 0 || slots > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {items.map((item) => (
            <Chip key={item.id} item={item} tone={tray} actions={actions} />
          ))}
          {Array.from({ length: slots }, (_, i) => <EmptySlot key={`slot-${i}`} />)}
        </ul>
      ) : (
        <div aria-hidden="true" data-empty-list className="h-7" />
      )}
    </section>
  );
}

export default function ObjectTrays({ trays, selectedId, hiddenIds = [], onOpen, onToggleHidden, onShowAll }: ObjectTraysProps) {
  const { toDecide, notObstructions, obstructions, removed, total } = trays;
  const hidden = new Set(hiddenIds);
  const actions: ChipActions = { selectedId, onOpen, onToggleHidden, hidden };
  // Only boxes still in the image count as hidden
  const hiddenCount = [...toDecide, ...notObstructions, ...obstructions, ...removed].filter((item) => hidden.has(item.id)).length;

  return (
    <div id="box-review-section" className="px-4 pt-3.5 pb-4">
      <div className="flex flex-wrap items-center gap-1.5 min-h-[28px]">
        {toDecide.length > 0 ? (
          <>
            <span className="text-sm font-semibold text-ink mr-1">
              {TRAY_COPY.toDecideTitle} <span className="font-medium text-muted tabular-nums">{toDecide.length}</span>
            </span>
            <ul className="contents">
              {toDecide.map((item) => (
                <Chip key={item.id} item={item} tone="toDecide" actions={actions} />
              ))}
            </ul>
          </>
        ) : total > 0 || removed.length > 0 ? (
          <span className="text-sm font-semibold text-success">{TRAY_COPY.allAnswered}</span>
        ) : (
          <span className="text-sm text-muted">{TRAY_COPY.noObjects}</span>
        )}
        {hiddenCount > 0 && onShowAll && (
          <span data-hidden-summary className="ml-auto inline-flex items-center gap-2 pl-2 text-xs text-muted whitespace-nowrap">
            {BOX_VISIBILITY_COPY.hiddenCount(hiddenCount)}
            <button
              type="button"
              onMouseDown={stopPress}
              onClick={(e) => {
                e.stopPropagation();
                onShowAll();
              }}
              className={cn("font-semibold text-primary hover:underline rounded", FOCUS)}
            >
              {BOX_VISIBILITY_COPY.showAll}
            </button>
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 mt-3">
        <AnswerList tray={TRAYS.notObstructions as "notObstructions"} trays={trays} actions={actions} />
        <AnswerList tray={TRAYS.obstructions as "obstructions"} trays={trays} actions={actions} />
      </div>

      {removed.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mt-3">
          <span className="text-xs font-medium text-muted mr-1">{TRAY_COPY.removed}</span>
          <ul className="contents">
            {removed.map((item) => (
              <Chip key={item.id} item={item} tone="removed" actions={actions} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
