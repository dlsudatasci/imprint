import { createRef, memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/ui";
import { cn } from "@/ui/cn";
import { EyeOffIcon, ExpandIcon } from "@/ui/icons";
import DefaultInputSection, { SeverityPicker } from "@/ui/annotation-tool/DefaultInputSection";
import ObjectTrays, { ObjectTraysPeek } from "@/ui/annotation-tool/ObjectTrays";
import SceneQuestions from "@/ui/annotation-tool/SceneQuestions";
import { boxLabelColors, boxLineStyle, boxStrokeColor, defaultShapeStyle, placeLabel } from "@/ui/annotation-tool/Shape";
import { ensureVisible, fitImage, keepPhotoInPlace, panLimits } from "@/ui/annotation-tool/viewTransform";
import { LOUPE_BACKGROUND, LOUPE_MAGNIFICATION, LOUPE_SIZE_PX, loupePlacement, loupeSource } from "@/ui/annotation-tool/loupe";
import { TOUCH_HANDLE_DOT_PX, markCorners } from "@/ui/annotation-tool/touchGeometry";
import { snapPoints, springStep } from "@/ui/sheetSnap";
import { TRAY_COPY, buildPeekChips, buildTrays, sceneProgressLine } from "@/features/annotate/objectTrays";
import { BOX_VISIBILITY_COPY } from "@/features/annotate/boxVisibility";
import { buildDisplayLabelsInOrder, formatLabel, orderOfAppearance } from "@/util/buildDisplayLabels";
import { getSuggestionPanelMode } from "@/util/suggestionJudgment";
import { CATEGORY_OPTIONS } from "@/util/categoryOptions";
import { DEMO_IMAGES, DEMO_IMAGE_SIZE } from "./demoScript";

/**
 * The annotation screen as a contributor sees it on a phone or tablet, drawn
 * for the landing page's preview there (HowItWorks, 22 Oct 2026, played by
 * touchScript.js). The laptop preview is DemoStage.
 *
 * The tool's sheet layout without its top bar (the step card takes its place,
 * as the laptop preview leaves out the progress strip and the title): the
 * photo letterboxed on the dark screen, the answers in a bottom sheet over
 * it, and a finger. Built from the tool's own pieces wherever they stand
 * alone, so it matches what a contributor will meet: the panel in the sheet
 * (DefaultInputSection, SeverityPicker, variant "sheet"), the top of the sheet
 * at rest (ObjectTraysPeek), the lists and Step 2 under it (ObjectTrays
 * stacked, SceneQuestions "sheet"). Where the tool's piece cannot stand alone
 * it is copied here, kept in step by tests where it can be: the photo with
 * its boxes (the canvas needs a session), Add box and the full-screen button,
 * the hint, the magnifier, the line above an open box's panel, the sheet's
 * frame and the open category list. The geometry is the tool's own, through
 * its pure helpers: where the sheet rests (snapPoints) and how it moves
 * (springStep), how the photo is fitted (fitImage) and moved clear of the
 * sheet (keepPhotoInPlace, panLimits, ensureVisible), where names go on the photo (placeLabel)
 * and where the magnifier goes (loupePlacement, loupeSource).
 *
 * The screen is laid out at the size of the space it is shown in, so it is
 * the visitor's own screen, a little shorter. Below MIN_SCREEN_H (or
 * MIN_SCREEN_W) it is laid out at that size and scaled down to fit, so the
 * open panel's question and its Yes and No always show, as on a phone.
 *
 * Nothing in it can be focused or clicked: the parent marks it inert and
 * aria-hidden, and the captions carry the same content for screen readers.
 * The finger, the sheet, the photo's position, the sheet's scroll and the
 * magnifier are set straight on the DOM after each render, from the frame's
 * targets measured in the screen as it is, so they land on the real buttons
 * whatever the fonts, the wording or the screen's size.
 */

/** The shortest and narrowest screen the preview lays out, design px. Smaller spaces show it scaled. */
export const MIN_SCREEN_H = 520;
export const MIN_SCREEN_W = 320;
/** The annotation screen's background on phones and tablets (.annotate-sheet-screen in Toolstyles.css) */
export const SCREEN_BACKGROUND = "#0b0f14";
/**
 * The tool's words over the photo (ADD_BOX_COPY and FOCUS_COPY in
 * ReactPictureAnnotation.tsx, checked equal by TouchStage.test.jsx). Copied
 * so the landing page does not load the whole tool for three strings.
 */
export const TOOL_COPY = Object.freeze({
  addBox: "Add box",
  hint: "Drag the corners to fit the object.",
  fullScreen: "Full-screen photo",
});

// The tool's photo moves over 180 ms, eased out (animateView). The sheet's
// list scrolls smoothly when the tool brings Step 2 up (scrollSheetTo).
const PAN_MS = 180;
const SCROLL_MS = 320;
// The severity slider's thumb is 22 px across, 32 px where a finger is the primary pointer (SeveritySlider's CSS)
const THUMB_R = 11;
const THUMB_R_COARSE = 16;
// Room kept under an answer or a panel control the sheet's list scrolls to, design px
const SCROLL_MARGIN = 16;

const noop = () => {};
const BOX = defaultShapeStyle;
const LABEL_H = BOX.fontSize + BOX.paddingY * 2;

/** The scale and the design size of the screen for a space this many CSS px across and down */
export function screenScale(view) {
  const w = Math.max(1, view.w);
  const h = Math.max(1, view.h);
  const s = Math.min(1, h / MIN_SCREEN_H, w / MIN_SCREEN_W);
  return { s, w: w / s, h: h / s };
}

/**
 * How far to scroll the sheet's list, design px, for what is in it.
 * `section`: Step 2 at the top, as the tool's scrollSheetTo puts it. `answer`:
 * from there, only as far as it takes to bring a Step 2 answer into view, as
 * a person scrolls (`from` is Step 2's top). `control`: a panel button that a
 * short screen cuts off, brought into view. `top` and `bottom` are the
 * element's place in the list, `view` the list's height and `max` the
 * furthest it scrolls.
 */
export function listScroll(kind, { top = 0, bottom = 0, view = 0, max = 0, from = 0 }) {
  const clamp = (v) => Math.max(0, Math.min(max, v));
  const intoView = (base) => Math.max(base, bottom + SCROLL_MARGIN - view);
  if (kind === "section") return clamp(top);
  if (kind === "answer") return clamp(intoView(from));
  if (kind === "control") return clamp(intoView(0));
  return 0;
}

/**
 * The element a finger target points at, or null when it is not on screen.
 * Found by tags the real components carry (data-control on the panel's
 * buttons, data-scene-option on Step 2's, the ids on the top of the sheet),
 * never by their wording, apart from Next, found by the tool's own word for
 * it (TRAY_COPY.next).
 */
export function findTouchTarget(root, target, boxes) {
  if (!root || !target) return null;
  if (target.kind === "image") return root.querySelector("[data-demo-photo]");
  if (target.kind === "box") return boxes.some((b) => b.id === target.id) ? root.querySelector("[data-demo-photo]") : null;
  if (target.kind !== "ui") return null;
  const control = { yes: "yes", no: "no", confirm: "confirm", category: "category", slider: "severity" }[target.name];
  if (control) return root.querySelector(`[data-demo-panel] [data-control="${control}"]`);
  if (target.name === "option") return root.querySelector(`[data-demo-option="${target.value}"]`);
  if (target.name === "scene") return root.querySelector(`[data-scene-option="${target.field}:${target.value}"]`);
  // The submit button is the last (Previous comes first from the second photo on)
  if (target.name === "next") return root.querySelector('[data-demo="next"] > button:last-child');
  if (target.name === "addbox") return root.querySelector('[data-demo="addbox"]');
  if (target.name === "scene-line") return root.querySelector("#scene-level-peek");
  if (target.name === "peek-next") {
    const peek = root.querySelector("#box-review-section-peek");
    return peek ? Array.from(peek.querySelectorAll("button")).find((b) => b.textContent.trim() === TRAY_COPY.next) || null : null;
  }
  return null;
}

/** One box on the photo, drawn as the canvas draws it on touch: the open one filled, with its four round handles */
function TouchBox({ box, scale, isOpen }) {
  const { x, y, width, height } = box.mark;
  const stroke = boxStrokeColor(box);
  const line = boxLineStyle(box);
  return (
    <g>
      {isOpen && <rect x={x * scale} y={y * scale} width={width * scale} height={height * scale} fill={BOX.shapeBackground} />}
      <rect
        x={x * scale}
        y={y * scale}
        width={width * scale}
        height={height * scale}
        fill="none"
        stroke={stroke}
        strokeWidth={line.width}
        strokeDasharray={line.dash.length ? line.dash.join(" ") : undefined}
        style={{ filter: `drop-shadow(0 0 ${BOX.shadowBlur / 2}px ${BOX.shapeShadowStyle})` }}
      />
      {isOpen &&
        !box.isRejected &&
        markCorners(box.mark).map((c, i) => (
          // Transformer.paintTouchHandles: white, ringed in the box's colour, a soft shadow
          <circle
            key={i}
            cx={c.x * scale}
            cy={c.y * scale}
            r={TOUCH_HANDLE_DOT_PX}
            fill="#ffffff"
            stroke={stroke}
            strokeWidth={2.5}
            style={{ filter: "drop-shadow(0 0 3px rgba(15, 23, 42, 0.35))" }}
          />
        ))}
    </g>
  );
}

/** The category list as it looks open: the real <select> cannot be shown open */
const CategoryList = ({ highlighted, listRef }) => (
  <ul ref={listRef} data-demo-list className="absolute left-0 top-0 z-30 max-h-64 overflow-hidden rounded-control border border-line bg-surface py-1 shadow-2xl">
    {CATEGORY_OPTIONS.map((opt) => (
      <li key={opt.value} data-demo-option={opt.value} className={cn("px-3 py-1 text-sm font-semibold", highlighted === opt.value ? "bg-primary text-white" : "text-ink")}>
        {opt.label}
      </li>
    ))}
  </ul>
);

/** The line above an open box's panel in the sheet (renderSheetPanelTitle): its name, and Hide on photo */
const PanelTitle = ({ label }) => (
  <div className="h-11 px-4 flex items-center justify-between gap-3">
    <span className="text-sm font-semibold text-ink truncate">{label}</span>
    <span className="shrink-0 -mr-2 h-11 px-2 inline-flex items-center gap-1.5 rounded-control text-xs font-semibold text-muted">
      <EyeOffIcon size={16} />
      {BOX_VISIBILITY_COPY.hideShort}
    </span>
  </div>
);

// Over the photo, as renderPhotoOverlays draws them
const FLOATING = "absolute z-10 h-11 inline-flex items-center justify-center rounded-full bg-surface text-ink text-sm font-bold border border-line shadow-md";

/**
 * What the screen shows, re-rendered only when that changes (not on every
 * frame of a glide). The photo's place, the sheet's position and scroll are
 * set by the stage on the DOM.
 */
const Screen = memo(function Screen({ view, geo, coarse, refs }) {
  const { imageIndex, boxes, selectedId, picker, dropdown, scene, saving, hint } = view;
  const image = DEMO_IMAGES[imageIndex];
  const scale = geo.fit ? geo.fit.scale : 0;
  const sorted = orderOfAppearance(boxes);
  const labels = buildDisplayLabelsInOrder(boxes);
  const trays = buildTrays(sorted, { labels });
  const open = boxes.find((b) => b.id === selectedId) || null;
  const photoW = DEMO_IMAGE_SIZE.width * scale;
  const photoH = DEMO_IMAGE_SIZE.height * scale;
  // While a box is open it is the only one on the photo (focusedBoxId, 14 Oct 2026)
  const drawn = open ? [open] : boxes;
  const named = open ? [] : sorted.filter((b) => b.comment);

  let header;
  let body;
  if (open) {
    const mode = getSuggestionPanelMode({ editable: open.editable, selected: open.selected, obstructs: open.obstructs, severity: open.severity, comment: open.comment || "" });
    header = <PanelTitle label={labels.get(open.id) || formatLabel(open.comment) || TRAY_COPY.fallbackLabel} />;
    body = (
      <div className="px-3 pt-1 pb-4" data-demo-panel>
        {mode === "severity" ? (
          <SeverityPicker key={picker} initialValue={picker} onConfirm={noop} onBack={noop} variant="sheet" />
        ) : (
          <DefaultInputSection
            key={open.id}
            value={open.comment || ""}
            onChange={noop}
            onDelete={noop}
            onSelectObstruction={noop}
            onUnselectObstruction={noop}
            onMarkNotAnObject={noop}
            onSetSeverity={noop}
            onSetObstructs={noop}
            onClose={noop}
            onClearObstruction={noop}
            onRestoreObject={noop}
            originalComment={open.initialState?.comment || ""}
            editable={open.editable}
            selected={open.selected}
            isRejected={Boolean(open.isRejected)}
            obstructs={open.obstructs}
            severity={open.severity}
            variant="sheet"
          />
        )}
      </div>
    );
  } else {
    header = (
      <ObjectTraysPeek
        trays={trays}
        peek={buildPeekChips(sorted, { labels })}
        selectedId={null}
        onOpen={noop}
        onNext={noop}
        sceneLine={sceneProgressLine(scene)}
        onShowScene={noop}
        hiddenIds={[]}
        onShowAll={noop}
        onHideAll={noop}
      />
    );
    body = (
      <>
        <ObjectTrays trays={trays} selectedId={null} hiddenIds={[]} onOpen={noop} onToggleHidden={noop} stacked />
        <SceneQuestions sceneLevel={scene} variant="sheet" onAnswer={noop} />
      </>
    );
  }

  const { points } = geo;
  return (
    <>
      {/* The photo area: from the top down to the top of the sheet at rest */}
      <div ref={refs.area} data-touch-area className="absolute inset-x-0 top-0 overflow-hidden" style={{ bottom: points.collapsed }}>
        <div ref={refs.photo} data-demo-photo className="absolute left-0 top-0" style={{ width: photoW, height: photoH }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- a static tutorial photo, drawn at a fixed size */}
          <img src={image.url} alt="" className="absolute inset-0 w-full h-full" draggable={false} />
          <svg className="absolute inset-0 overflow-visible" width={photoW} height={photoH}>
            {drawn.map((b) => (
              <TouchBox key={b.id} box={b} scale={scale} isOpen={b === open} />
            ))}
          </svg>
          {/* Names, placed by the stage (placeLabel). None while a box is open: it is the only box shown, and its name is in the sheet */}
          {named.map((b) => {
            const { background, text } = boxLabelColors(b);
            return (
              <span
                key={b.id}
                data-label={b.id}
                className="absolute left-0 top-0 rounded-[5px] font-bold whitespace-nowrap"
                style={{
                  height: LABEL_H,
                  lineHeight: `${LABEL_H}px`,
                  padding: `0 ${BOX.paddingX}px`,
                  fontSize: BOX.fontSize,
                  background,
                  color: text,
                }}
              >
                {labels.get(b.id) || formatLabel(b.comment)}
              </span>
            );
          })}
        </div>
        {hint && (
          <p className="pointer-events-none absolute left-1/2 -translate-x-1/2 z-10 px-3 py-2 rounded-full bg-ink/80 text-white text-xs font-semibold whitespace-nowrap" style={{ top: 12 }}>
            {TOOL_COPY.hint}
          </p>
        )}
        <span data-demo="addbox" className={cn(FLOATING, "gap-1.5 pl-3 pr-4")} style={{ left: 12, bottom: 12 }}>
          <svg aria-hidden="true" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          {TOOL_COPY.addBox}
        </span>
        {/* Only where the tool shows it: a finger as the primary pointer */}
        {coarse && (
          <span className={cn(FLOATING, "w-11")} style={{ right: 12, bottom: 12 }} title={TOOL_COPY.fullScreen}>
            <ExpandIcon size={20} />
          </span>
        )}
        {/* The magnifier, placed by the stage while a corner is dragged */}
        <div
          ref={refs.loupe}
          data-loupe
          className="pointer-events-none absolute left-0 top-0 z-20 overflow-hidden rounded-full shadow-[0_6px_20px_rgba(15,23,42,0.35)]"
          style={{ width: LOUPE_SIZE_PX, height: LOUPE_SIZE_PX, background: LOUPE_BACKGROUND, display: "none" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- the same photo, magnified */}
          <img ref={refs.loupeImage} src={image.url} alt="" className="absolute left-0 top-0 max-w-none" draggable={false} />
          <svg className="absolute inset-0" width={LOUPE_SIZE_PX} height={LOUPE_SIZE_PX}>
            <rect ref={refs.loupeBox} fill="none" strokeWidth={2} />
            {[[3, "rgba(11, 15, 20, 0.85)"], [1, "#ffffff"]].map(([w, colour]) => (
              <path
                key={w}
                d={`M${LOUPE_SIZE_PX / 2 - 5} ${LOUPE_SIZE_PX / 2}h10M${LOUPE_SIZE_PX / 2} ${LOUPE_SIZE_PX / 2 - 5}v10`}
                stroke={colour}
                strokeWidth={w}
              />
            ))}
            <circle cx={LOUPE_SIZE_PX / 2} cy={LOUPE_SIZE_PX / 2} r={LOUPE_SIZE_PX / 2 - 1.5} fill="none" stroke="#ffffff" strokeWidth={3} />
          </svg>
        </div>
      </div>

      {/* The answers sheet (BottomSheet): the handle and the header always in view, the list, the footer */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <section
          ref={refs.section}
          data-touch-sheet
          className="absolute inset-x-0 z-10 flex flex-col bg-surface rounded-t-2xl shadow-[0_-8px_24px_rgba(15,23,42,0.18)]"
          style={{ bottom: geo.footer, height: Math.max(0, points.full - geo.footer) }}
        >
          <div ref={refs.header} className="shrink-0">
            <div className="w-full h-11 grid place-items-center rounded-t-2xl">
              <span aria-hidden="true" className="block w-9 h-[5px] rounded-full bg-line" />
            </div>
            {header}
          </div>
          {/* While a box is open: the top of the sheet at rest, unseen, so the
              stage knows the photo area the tool had before the panel came up */}
          {open && (
            <div ref={refs.restHeader} className="invisible absolute inset-x-0 top-0 -z-10">
              <div className="h-11" />
              <ObjectTraysPeek
                trays={trays}
                peek={buildPeekChips(sorted, { labels })}
                selectedId={null}
                onOpen={noop}
                onNext={noop}
                sceneLine={sceneProgressLine(scene)}
                onShowScene={noop}
                hiddenIds={[]}
                onShowAll={noop}
                onHideAll={noop}
              />
            </div>
          )}
          <div ref={refs.list} data-sheet-scroll className="min-h-0 overflow-hidden border-t border-line" style={{ height: 0 }}>
            <div ref={refs.content}>{body}</div>
          </div>
        </section>
        <div ref={refs.footer} className="absolute inset-x-0 bottom-0 z-20 bg-surface border-t border-line px-4 pt-3 pb-3">
          {/* renderActions("sheet") for a contributor: Previous from the second photo on */}
          <div className="flex gap-2" data-demo="next">
            {imageIndex > 0 && <Button variant="neutral">Previous</Button>}
            <Button submit fullWidth disabled={saving} className="whitespace-nowrap">
              {saving ? "Saving..." : "Next Image"}
            </Button>
          </div>
        </div>
      </div>

      {dropdown && <CategoryList highlighted={dropdown.highlighted} listRef={refs.dropdown} />}
    </>
  );
});

/** A fingertip: grey and see-through, ringed in white so it shows on the photo and on the sheet */
function Finger({ fingerRef, dotRef }) {
  return (
    <div ref={fingerRef} className="pointer-events-none absolute left-0 top-0 z-40" style={{ opacity: 0 }}>
      <div
        ref={dotRef}
        className="w-9 h-9 -ml-[18px] -mt-[18px] rounded-full"
        style={{ background: "rgba(15, 23, 42, 0.28)", boxShadow: "0 0 0 2px rgba(255, 255, 255, 0.95), 0 2px 6px rgba(0, 0, 0, 0.35)" }}
      />
    </div>
  );
}

const sameGeo = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const stopFrame = (id) => {
  if (id && typeof cancelAnimationFrame === "function") cancelAnimationFrame(id);
};
const easeOut = (t) => 1 - (1 - t) ** 3;

export default function TouchStage({ frame, instant = false, coarse = false }) {
  const viewportRef = useRef(null);
  const screenRef = useRef(null);
  const fingerRef = useRef(null);
  const dotRef = useRef(null);
  // One set for the stage's life, so the memoised screen is not re-rendered for new refs
  const [refs] = useState(() => ({
    area: createRef(),
    photo: createRef(),
    loupe: createRef(),
    loupeImage: createRef(),
    loupeBox: createRef(),
    section: createRef(),
    header: createRef(),
    restHeader: createRef(),
    list: createRef(),
    content: createRef(),
    footer: createRef(),
    dropdown: createRef(),
  }));
  const refsRef = useRef(refs);

  // What changes only with the layout: the scale, the sheet's resting points, the photo's fit, the names' places
  const [geo, setGeo] = useState({ s: 1, w: MIN_SCREEN_W, h: MIN_SCREEN_H, footer: 0, points: { collapsed: 0, half: 0, full: 0, panel: 0 }, fit: null, spots: {}, pan: { x: 0, y: 0 } });
  const passes = useRef(0);

  // A resized space, or the fonts arriving and moving the buttons, needs the screen measured again
  const [, setLayoutVersion] = useState(0);
  useEffect(() => {
    const again = () => setLayoutVersion((v) => v + 1);
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(again) : null;
    if (observer && viewportRef.current) observer.observe(viewportRef.current);
    let live = true;
    document.fonts?.ready?.then(() => live && again());
    return () => {
      live = false;
      observer?.disconnect();
    };
  }, []);

  // The screen re-renders only when what it shows changes
  const view = useMemo(
    () => ({
      imageIndex: frame.imageIndex,
      boxes: frame.boxes,
      selectedId: frame.selectedId,
      picker: frame.picker,
      dropdown: frame.dropdown,
      scene: frame.scene,
      saving: frame.saving,
      hint: frame.hint,
    }),
    // Compared by content: touchFrame makes a new object on every scroll step
    [JSON.stringify([frame.imageIndex, frame.boxes, frame.selectedId, frame.picker, frame.dropdown, frame.scene, frame.saving, frame.hint])]
  );

  // Where things are on the screen now, and where they are going (design px)
  const live = useRef(null);
  const goal = useRef(null);
  const raf = useRef(0);
  const panMemo = useRef({ id: null, y: 0, x: 0 });
  const remembered = useRef(new Map());
  const loupeSide = useRef(null);
  const frameRef = useRef(frame);
  frameRef.current = frame;
  const geoRef = useRef(geo);
  geoRef.current = geo;
  useLayoutEffect(() => () => stopFrame(raf.current), []);

  /**
   * Screen px per design px as painted now: the screen's own scale and the
   * frame's growing in as it arrives (HowItWorks), read off the screen's width
   */
  const paintedScale = () => {
    const root = screenRef.current;
    const width = root ? root.getBoundingClientRect().width : 0;
    return width > 0 ? width / geoRef.current.w : geoRef.current.s || 1;
  };

  /** An element's box in the screen, design px, as it is painted now */
  const rectOf = (el) => {
    const root = screenRef.current;
    if (!el || !root) return null;
    const r = el.getBoundingClientRect();
    const o = root.getBoundingClientRect();
    if (!r.width && !r.height) return null;
    const s = paintedScale();
    return { x: (r.left - o.left) / s, y: (r.top - o.top) / s, w: r.width / s, h: r.height / s };
  };

  /** Puts everything that moves where `live` says, then the finger, the magnifier and the open list */
  const paint = () => {
    const g = geoRef.current;
    const f = frameRef.current;
    const L = live.current;
    const r = refsRef.current;
    if (!L || !r.section.current) return;
    const { points } = g;
    const rest = goal.current.pos;
    r.section.current.style.transform = `translateY(${Math.max(0, points.full - L.pos)}px)`;
    const header = r.header.current.offsetHeight;
    r.list.current.style.height = `${Math.max(0, Math.max(rest, L.pos) - header - g.footer)}px`;
    r.list.current.scrollTop = L.scroll;
    if (g.fit && r.photo.current) {
      r.photo.current.style.transform = `translate(${g.fit.originX + L.panX}px, ${g.fit.originY + L.panY}px)`;
    }

    // The finger
    const root = screenRef.current;
    const photo = rectOf(r.photo.current);
    const scale = g.fit ? g.fit.scale : 1;
    const resolve = (target) => {
      if (!target || target.kind === "off") return { x: g.w * 0.82, y: g.h + 40 };
      const el = findTouchTarget(root, target, f.boxes);
      if (!el) return null;
      if (target.kind === "image") return photo && { x: photo.x + target.x * scale, y: photo.y + target.y * scale };
      if (target.kind === "box") {
        const b = f.boxes.find((it) => it.id === target.id);
        return photo && { x: photo.x + (b.mark.x + b.mark.width / 2) * scale, y: photo.y + (b.mark.y + b.mark.height / 2) * scale };
      }
      const box = rectOf(el);
      if (!box) return null;
      if (target.name === "slider") {
        const thumb = coarse ? THUMB_R_COARSE : THUMB_R;
        return { x: box.x + thumb + ((target.value - 1) / 4) * (box.w - 2 * thumb), y: box.y + box.h / 2 };
      }
      return { x: box.x + box.w / 2, y: box.y + box.h / 2 };
    };
    // Where the finger is going is found where it is now (the sheet may still
    // be moving). Where it comes from is where it was when it got there: that
    // can since have moved under the sheet, or be gone (the list closes on a
    // tap, Yes turns into the slider), and the finger lifts from where it was
    const pointOf = (target) => {
      const key = JSON.stringify(target);
      const point = resolve(target);
      if (point) remembered.current.set(key, point);
      return point || remembered.current.get(key) || null;
    };
    const { cursor } = f;
    // A still (reduced motion) shows the finger only on something on the screen:
    // where it starts, at the start of a move, where it is going at the end
    const onScreen = !instant || ((cursor.t >= 1 || Boolean(resolve(cursor.from))) && (cursor.t <= 0 || Boolean(resolve(cursor.to))));
    const toPoint = pointOf(cursor.to);
    const from = remembered.current.get(JSON.stringify(cursor.from)) || pointOf(cursor.from) || toPoint;
    const to = toPoint || from;
    if (fingerRef.current && !(from && to)) fingerRef.current.style.opacity = "0";
    if (fingerRef.current && from && to) {
      const x = from.x + (to.x - from.x) * cursor.t;
      const y = from.y + (to.y - from.y) * cursor.t;
      fingerRef.current.style.transform = `translate(${x}px, ${y}px)`;
      // Lifted while it travels, pressed on the glass while it taps or drags
      fingerRef.current.style.opacity = cursor.visible && onScreen ? (cursor.pressed ? "1" : "0.6") : "0";
      if (dotRef.current) dotRef.current.style.transform = `scale(${cursor.pressed ? 0.86 : 1})`;
    }

    // The open category list, under its select, or over it when there is more room there
    const list = r.dropdown.current;
    const select = rectOf(root?.querySelector('[data-demo-panel] [data-control="category"]'));
    if (list && select) {
      const below = g.h - (select.y + select.h);
      const height = list.offsetHeight;
      const top = below >= height + 8 || below >= select.y ? select.y + select.h + 4 : select.y - height - 4;
      list.style.width = `${select.w}px`;
      list.style.transform = `translate(${select.x}px, ${Math.max(4, top)}px)`;
    }

    // The magnifier: while a corner is dragged, outside the box, the photo at 2.5 times
    const loupe = r.loupe.current;
    if (loupe) {
      const open = f.boxes.find((b) => b.id === f.selectedId);
      if (f.corner && f.cursor.pressed && open && g.fit) {
        const ox = g.fit.originX + L.panX;
        const oy = g.fit.originY + L.panY;
        const finger = { x: ox + f.corner.x * scale, y: oy + f.corner.y * scale };
        const cover = Math.max(0, L.pos - points.collapsed);
        const area = { width: g.w, height: Math.max(0, g.h - points.collapsed - cover) };
        const m = open.mark;
        const boxRect = { left: ox + m.x * scale, top: oy + m.y * scale, width: m.width * scale, height: m.height * scale };
        const place = loupePlacement(finger, area, LOUPE_SIZE_PX, { box: boxRect, point: finger, input: "touch", prefer: loupeSide.current });
        loupeSide.current = place.side;
        const src = loupeSource(f.corner, scale, LOUPE_MAGNIFICATION, LOUPE_SIZE_PX, DEMO_IMAGE_SIZE);
        loupe.style.display = "block";
        loupe.style.transform = `translate(${place.left}px, ${place.top}px)`;
        const image = r.loupeImage.current;
        image.style.width = `${DEMO_IMAGE_SIZE.width * src.scale}px`;
        image.style.height = `${DEMO_IMAGE_SIZE.height * src.scale}px`;
        image.style.transform = `translate(${-src.sx * src.scale}px, ${-src.sy * src.scale}px)`;
        const outline = r.loupeBox.current;
        outline.setAttribute("x", String((m.x - src.sx) * src.scale));
        outline.setAttribute("y", String((m.y - src.sy) * src.scale));
        outline.setAttribute("width", String(m.width * src.scale));
        outline.setAttribute("height", String(m.height * src.scale));
        outline.setAttribute("stroke", boxStrokeColor(open));
      } else {
        loupe.style.display = "none";
        loupeSide.current = null;
      }
    }
  };

  /** One animation frame: the sheet on its spring, the photo and the list eased, then paint */
  const tick = (now) => {
    const L = live.current;
    const G = goal.current;
    const dt = Math.min(0.064, Math.max(0, (now - (L.time ?? now)) / 1000));
    L.time = now;
    const displacement = L.pos - G.pos;
    const next = springStep(displacement, L.vel, dt);
    const settled = Math.abs(next.x) < 0.5 && Math.abs(next.v) < 10;
    L.pos = settled ? G.pos : G.pos + next.x;
    L.vel = settled ? 0 : next.v;
    let moving = !settled;
    for (const key of ["panX", "panY", "scroll"]) {
      const tw = L.tweens[key];
      if (!tw) continue;
      const t = Math.min(1, (now - tw.start) / tw.ms);
      L[key] = tw.from + (tw.to - tw.from) * easeOut(t);
      if (t >= 1) L.tweens[key] = null;
      else moving = true;
    }
    paint();
    raf.current = moving ? requestAnimationFrame(tick) : 0;
  };

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const r = refsRef.current;
    if (!viewport || !r.section.current) return;

    // ---- Measure, and lay out again if anything moved ----
    const { s, w, h } = screenScale({ w: viewport.clientWidth, h: viewport.clientHeight });
    const header = r.header.current.offsetHeight;
    const footer = r.footer.current.offsetHeight;
    const content = r.content.current.offsetHeight;
    const points = snapPoints({ container: h, header, footer, panel: content });
    const areaH = Math.max(0, h - points.collapsed);
    const fit = fitImage(DEMO_IMAGE_SIZE.width, DEMO_IMAGE_SIZE.height, w, areaH);
    const snap = frame.snap;
    const cover = Math.max(0, (points[snap] ?? points.collapsed) - points.collapsed);

    // Where the photo goes when a box opens, as the tool does it
    // (onStageResize, keepSelectedInView, 22 Oct 2026): the photo area grows
    // as the top of the sheet gets shorter, the photo stays where it was on
    // the screen (keepPhotoInPlace), and then moves only as far as keeps the
    // box clear of the sheet with the panel up (ensureVisible). Worked out once
    // per box opened, so later changes to the panel (Yes, the severity) do not
    // move it, as in the tool. Closed, it settles back (relaxView).
    const open = frame.boxes.find((b) => b.id === frame.selectedId);
    let pan = { x: 0, y: 0 };
    if (open && snap === "panel" && fit) {
      const memo = panMemo.current;
      if (memo.id !== open.id) {
        const restHeader = r.restHeader.current ? r.restHeader.current.offsetHeight : header;
        const restArea = Math.max(0, h - snapPoints({ container: h, header: restHeader, footer }).collapsed);
        const restFit = fitImage(DEMO_IMAGE_SIZE.width, DEMO_IMAGE_SIZE.height, w, restArea) || fit;
        const limits = panLimits(fit, 1, { width: w, height: areaH }, DEMO_IMAGE_SIZE, cover);
        const kept = keepPhotoInPlace({ x: restFit.originX, y: restFit.originY }, fit, 1, limits);
        const m = open.mark;
        const shown = {
          x: fit.originX + kept.panX + m.x * fit.scale,
          y: fit.originY + kept.panY + m.y * fit.scale,
          width: m.width * fit.scale,
          height: m.height * fit.scale,
        };
        const moved = ensureVisible(shown, { x: 0, y: 0, width: w, height: Math.max(0, areaH - cover) }, kept, limits);
        Object.assign(memo, { id: open.id, x: moved.panX, y: moved.panY });
      }
      pan = { x: memo.x, y: memo.y };
    } else {
      Object.assign(panMemo.current, { id: null, x: 0, y: 0 });
    }

    // Where each name goes (labelSpots): in the lists' order, in the photo area as it will be
    const spots = {};
    if (fit) {
      const placed = [];
      const ordered = open ? [] : orderOfAppearance(frame.boxes).filter((b) => b.comment);
      for (const b of ordered) {
        const span = r.photo.current?.querySelector(`[data-label="${b.id}"]`);
        const size = { width: span ? span.offsetWidth : 0, height: LABEL_H };
        const at = { x: fit.originX + pan.x + b.mark.x * fit.scale, y: fit.originY + pan.y + b.mark.y * fit.scale, width: b.mark.width * fit.scale, height: b.mark.height * fit.scale };
        const rect = placeLabel(at, size, placed);
        placed.push(rect);
        spots[b.id] = { x: Math.round((rect.x - fit.originX - pan.x) * 100) / 100, y: Math.round((rect.y - fit.originY - pan.y) * 100) / 100 };
      }
    }
    const next = { s, w, h, footer, points, fit, spots, pan };
    if (!sameGeo(next, geo) && passes.current < 4) {
      passes.current += 1;
      setGeo(next);
      return;
    }
    passes.current = 0;

    // The names
    for (const [id, spot] of Object.entries(geo.spots)) {
      const span = r.photo.current?.querySelector(`[data-label="${id}"]`);
      if (span) span.style.transform = `translate(${spot.x}px, ${spot.y}px)`;
    }

    // ---- Where the list scrolls to ----
    const listView = Math.max(0, (points[snap] ?? points.collapsed) - header - footer);
    const maxScroll = Math.max(0, content - listView);
    const painted = paintedScale();
    // From the list's top edge, as the tool's scrollSheetTo measures it
    const placeInList = (el) => {
      const list = r.list.current;
      const c = list.getBoundingClientRect();
      const e = el.getBoundingClientRect();
      return { top: (e.top - c.top) / painted + list.scrollTop, bottom: (e.bottom - c.top) / painted + list.scrollTop };
    };
    let scroll = 0;
    if (snap === "full") {
      const answer = frame.sceneFocus && r.content.current.querySelector(`[data-scene-option="${frame.sceneFocus.field}:${frame.sceneFocus.value}"]`);
      const section = r.content.current.querySelector("#scene-level-section");
      const from = section ? placeInList(section).top : 0;
      if (answer) scroll = listScroll("answer", { ...placeInList(answer), view: listView, max: maxScroll, from });
      else if (section) scroll = listScroll("section", { ...placeInList(section), view: listView, max: maxScroll });
    } else if (snap === "panel" && frame.cursor.to?.kind === "ui") {
      const el = findTouchTarget(r.content.current, frame.cursor.to, frame.boxes);
      if (el && r.content.current.contains(el)) scroll = listScroll("control", { ...placeInList(el), view: listView, max: maxScroll });
    }

    // ---- Go there ----
    const target = { pos: points[snap] ?? points.collapsed, panX: pan.x, panY: pan.y, scroll };
    const now = typeof performance !== "undefined" ? performance.now() : 0;
    const animates = typeof requestAnimationFrame === "function";
    if (!live.current || instant || !animates) {
      live.current = { ...target, vel: 0, tweens: {}, time: null };
      goal.current = target;
      stopFrame(raf.current);
      raf.current = 0;
      paint();
      return;
    }
    const L = live.current;
    const before = goal.current;
    goal.current = target;
    for (const [key, ms] of [["panX", PAN_MS], ["panY", PAN_MS], ["scroll", SCROLL_MS]]) {
      if (before[key] !== target[key]) L.tweens[key] = { from: L[key], to: target[key], start: now, ms };
    }
    paint();
    if (!raf.current) {
      L.time = null;
      raf.current = requestAnimationFrame(tick);
    }
  });

  return (
    <div ref={viewportRef} className="relative w-full h-full overflow-hidden" style={{ background: SCREEN_BACKGROUND }}>
      <div
        ref={screenRef}
        data-touch-screen
        className="absolute left-0 top-0 origin-top-left overflow-hidden"
        style={{ width: geo.w, height: geo.h, transform: geo.s === 1 ? undefined : `scale(${geo.s})` }}
      >
        <Screen view={view} geo={geo} coarse={coarse} refs={refs} />
        <Finger fingerRef={fingerRef} dotRef={dotRef} />
      </div>
    </div>
  );
}
