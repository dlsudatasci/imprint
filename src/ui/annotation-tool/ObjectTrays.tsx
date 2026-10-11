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
 * On a touch screen (9 Oct 2026) chips and their eyes are 40 px tall with
 * 8 px between them, so a finger can hit them. On a phone or tablet the lists
 * sit in the answers sheet, stacked in one column, and ObjectTraysPeek shows
 * them at a glance in the sheet's top part, which is always in view.
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
  /** Hide every box on the photo (10 Oct 2026) */
  onHideAll?(): void;
  /** One list under the other, for the answers sheet on a phone (9 Oct 2026) */
  stacked?: boolean;
  /** The ids the touch tour points at, when there is no answers sheet to carry them (a tablet held sideways) */
  tourIds?: boolean;
}

type ChipActions = Pick<ObjectTraysProps, "selectedId" | "onOpen" | "onToggleHidden"> & { hidden: Set<string> };

const LIST_IDS = {
  notObstructions: "object-tray-not-obstructions",
  obstructions: "object-tray-obstructions",
} as const;

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50";
// Touch screens (9 Oct 2026): chips and eyes 40 px tall, 8 px apart. A mouse keeps the 28 px chips.
const CHIP_HEIGHT = "h-7 [@media(pointer:coarse)]:h-10";
const CHIP_GAP = "gap-1.5 [@media(pointer:coarse)]:gap-2";

// The open box's chip (10 Oct 2026): filled and outlined in blue, so it is
// clear which object the panel is about
const SELECTED_CHIP = "border-primary bg-primary-50 text-ink ring-2 ring-primary/40";

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
        "inline-flex items-stretch shrink-0 rounded-control border text-xs font-semibold whitespace-nowrap transition-colors motion-safe:animate-tray-land",
        CHIP_HEIGHT,
        selectedId === item.id ? SELECTED_CHIP : toneClass(tone, item.drawn),
        isHidden && "opacity-60"
      )}
    >
      <button
        type="button"
        data-tray={tone}
        aria-current={selectedId === item.id ? "true" : undefined}
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
          className={cn("grid place-items-center pl-0.5 pr-2 [@media(pointer:coarse)]:px-2.5 rounded-control text-subtle hover:text-ink transition-colors", FOCUS)}
        >
          {isHidden ? <EyeOffIcon size={14} /> : <EyeIcon size={14} />}
        </button>
      )}
    </li>
  );
}

/** Show all or Hide all, a text button at the right of the top line. */
function VisibilityButton({ label, onPress }: { label: string; onPress(): void }) {
  return (
    <button
      type="button"
      onMouseDown={stopPress}
      onClick={(e) => {
        e.stopPropagation();
        onPress();
      }}
      className={cn("font-semibold text-primary hover:underline rounded [@media(pointer:coarse)]:min-h-[40px]", FOCUS)}
    >
      {label}
    </button>
  );
}

/** An empty slot: the shape of a chip, waiting for an answer. */
function EmptySlot() {
  return (
    <li
      aria-hidden="true"
      data-slot="empty"
      className={cn(CHIP_HEIGHT, "w-16 shrink-0 rounded-control border border-dashed border-line grid place-items-center text-sm leading-none text-subtle")}
    >
      +
    </li>
  );
}

function AnswerList({ tray, trays, actions, tourId }: {
  tray: "notObstructions" | "obstructions";
  trays: Trays;
  actions: ChipActions;
  tourId?: string;
}) {
  const items = trays[tray];
  const id = LIST_IDS[tray];
  const slots = ghostSlotCount(items.length, trays.toDecide.length);
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="min-w-0 rounded-card border border-line bg-surface-subtle px-3 pt-2.5 pb-3">
      <h3 id={`${id}-title`} className="text-sm font-semibold text-ink mb-2">
        {tourId ? <span id={tourId}>{TRAY_COPY[tray]}</span> : TRAY_COPY[tray]}
      </h3>
      {items.length > 0 || slots > 0 ? (
        <ul className={cn("flex flex-wrap", CHIP_GAP)}>
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

export default function ObjectTrays({ trays, selectedId, hiddenIds = [], onOpen, onToggleHidden, onShowAll, onHideAll, stacked = false, tourIds = false }: ObjectTraysProps) {
  const { toDecide, notObstructions, obstructions, removed, total } = trays;
  const hidden = new Set(hiddenIds);
  const actions: ChipActions = { selectedId, onOpen, onToggleHidden, hidden };
  // Only boxes still in the image count as hidden
  const everyItem = [...toDecide, ...notObstructions, ...obstructions, ...removed];
  const hiddenCount = everyItem.filter((item) => hidden.has(item.id)).length;
  const showHideAll = Boolean(onHideAll) && hiddenCount < everyItem.length;

  return (
    <div id="box-review-section" className="px-4 pt-3.5 pb-4">
      <div id={tourIds ? "box-review-section-peek" : undefined} className={cn("flex flex-wrap items-center min-h-[28px]", CHIP_GAP)}>
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
        {((hiddenCount > 0 && onShowAll) || showHideAll) && (
          <span data-hidden-summary className="ml-auto inline-flex items-center gap-3 pl-2 text-xs text-muted whitespace-nowrap">
            {hiddenCount > 0 && onShowAll && (
              <>
                {BOX_VISIBILITY_COPY.hiddenCount(hiddenCount)}
                <VisibilityButton label={BOX_VISIBILITY_COPY.showAll} onPress={onShowAll} />
              </>
            )}
            {showHideAll && <VisibilityButton label={BOX_VISIBILITY_COPY.hideAll} onPress={onHideAll!} />}
          </span>
        )}
      </div>

      <div className={cn("grid gap-3 mt-3", stacked ? "grid-cols-1" : "grid-cols-2")}>
        <AnswerList tray={TRAYS.notObstructions as "notObstructions"} trays={trays} actions={actions} />
        <AnswerList
          tray={TRAYS.obstructions as "obstructions"}
          trays={trays}
          actions={actions}
          tourId={tourIds ? "box-review-obstructions-peek" : undefined}
        />
      </div>

      {removed.length > 0 && (
        <div className={cn("flex flex-wrap items-center mt-3", CHIP_GAP)}>
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

export interface ObjectTraysPeekProps {
  trays: Trays;
  selectedId: string | null;
  /** Select the box and open its panel */
  onOpen(id: string): void;
  /** Open the first object still to decide */
  onNext(): void;
  /** "Step 2: Rate the Sidewalk, 1 of 4 answered" */
  sceneLine: string;
  /** Show Step 2 */
  onShowScene(): void;
}

/** One answer list as a row: its title and count, then its chips scrolling sideways. */
function PeekRow({ tray, trays, actions, id }: {
  tray: "notObstructions" | "obstructions";
  trays: Trays;
  actions: ChipActions;
  id?: string;
}) {
  const items = trays[tray];
  return (
    <div id={id} className="h-11 flex items-center gap-2 min-w-0">
      <span className="w-[7.5rem] shrink-0 text-xs font-semibold text-ink whitespace-nowrap">
        {TRAY_COPY[tray]} <span className="font-medium text-muted tabular-nums">{items.length}</span>
      </span>
      <ul aria-label={TRAY_COPY[tray]} className={cn("flex-1 min-w-0 flex items-center overflow-x-auto overscroll-x-contain", CHIP_GAP)}>
        {items.map((item) => (
          <Chip key={item.id} item={item} tone={tray} actions={actions} />
        ))}
        {items.length === 0 && <EmptySlot />}
      </ul>
    </div>
  );
}

/**
 * The top of the answers sheet on a phone or tablet (9 Oct 2026), always in
 * view, like the driver card in Grab: how many objects are still to decide with
 * Next, the two lists as rows of chips, and a line saying Step 2 is further
 * up. Every row has a fixed height, so the sheet's collapsed height, and with
 * it the photo's, does not change as objects are answered. The touch tour
 * points at it (box-review-section-peek).
 */
export function ObjectTraysPeek({ trays, selectedId, onOpen, onNext, sceneLine, onShowScene }: ObjectTraysPeekProps) {
  const { toDecide, total, removed } = trays;
  const actions: ChipActions = { selectedId, onOpen, hidden: new Set() };
  return (
    <div id="box-review-section-peek" className="px-4 pb-2">
      <div className="h-11 flex items-center justify-between gap-3">
        {toDecide.length > 0 ? (
          <>
            <span className="text-sm font-semibold text-ink">
              {TRAY_COPY.toDecideTitle} <span className="font-medium text-muted tabular-nums">{toDecide.length}</span>
            </span>
            <button
              type="button"
              onClick={onNext}
              className={cn("h-11 px-4 rounded-control border border-primary bg-primary text-white text-sm font-bold", FOCUS)}
            >
              {TRAY_COPY.next}
            </button>
          </>
        ) : total > 0 || removed.length > 0 ? (
          <span className="text-sm font-semibold text-success">{TRAY_COPY.allAnswered}</span>
        ) : (
          <span className="text-xs text-muted line-clamp-2">{TRAY_COPY.noObjectsTouch}</span>
        )}
      </div>
      <PeekRow tray="notObstructions" trays={trays} actions={actions} />
      <PeekRow tray="obstructions" trays={trays} actions={actions} id="box-review-obstructions-peek" />
      <button
        type="button"
        id="scene-level-peek"
        onClick={onShowScene}
        className={cn("mt-1 h-6 w-full text-left text-xs text-muted truncate rounded", FOCUS)}
      >
        {sceneLine}
      </button>
    </div>
  );
}
