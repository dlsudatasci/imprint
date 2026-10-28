import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/ui";
import { cn } from "@/ui/cn";
import DefaultInputSection, { SeverityPicker } from "@/ui/annotation-tool/DefaultInputSection";
import ObjectTrays from "@/ui/annotation-tool/ObjectTrays";
import SceneQuestions from "@/ui/annotation-tool/SceneQuestions";
import Step1Card from "@/ui/annotation-tool/Step1Card";
import { boxLabelColors, boxLineStyle, boxStrokeColor, defaultShapeStyle } from "@/ui/annotation-tool/Shape";
import { panelPosition } from "@/ui/annotation-tool/panelPosition";
import { buildTrays } from "@/features/annotate/objectTrays";
import { buildDisplayLabels, formatLabel } from "@/util/buildDisplayLabels";
import { getSuggestionPanelMode } from "@/util/suggestionJudgment";
import { CATEGORY_OPTIONS } from "@/util/categoryOptions";
import { DEMO_IMAGES, DEMO_IMAGE_SIZE, TICKS, demoFrame, tickOf } from "./demoScript";

/**
 * The annotation screen as the preview draws it (HowItWorks).
 *
 * Built from the tool's own pieces wherever they stand alone, so the preview
 * matches what a contributor will meet: the box panel (DefaultInputSection,
 * SeverityPicker), the answers under the photo (ObjectTrays) and Step 2
 * (SceneQuestions), all with the real buttons and wording. The photo is an
 * <img> with the boxes drawn over it in the canvas's colours (Shape.ts), since
 * the tool's canvas needs a contributor's session.
 *
 * Laid out at a fixed design width, without the session thumbnails and the
 * "Sidewalk #n" title (Rans, 15 Oct 2026), and filmed by a camera that fills
 * the preview's frame: close in on the photo while objects are answered and
 * drawn, back out to the whole page for Step 2 and Next Image. The step card
 * sits over the bottom-left corner, and fades while the action passes under
 * it (where the script says, and wherever else it happens): the camera never
 * moves for it. Nothing in
 * it can be focused or clicked: the parent marks it inert and aria-hidden, and
 * the captions carry the same content for screen readers.
 *
 * The cursor and the camera are positioned straight on the DOM after each
 * render (useLayoutEffect), from the frame's targets, measured in the page as
 * it is. That keeps them on the real buttons whatever the fonts or wording.
 */

export const STAGE_WIDTH = 1200;
// SeveritySlider's thumb is 22 px across: its centre runs 11 px in from each end
const THUMB_R = 11;
const MAX_ZOOM = 2;
const CAMERA_PAD = 24;
// Share of the gap the camera closes each frame
const CAMERA_RATE = 0.12;

const noop = () => {};

/** An element's box inside `root`, in the stage's own (unscaled) pixels. */
function rectIn(el, root) {
  if (!el) return null;
  let x = 0;
  let y = 0;
  let node = el;
  while (node && node !== root) {
    x += node.offsetLeft;
    y += node.offsetTop;
    node = node.offsetParent;
  }
  if (node !== root) return null;
  return { x, y, w: el.offsetWidth, h: el.offsetHeight };
}

const centre = (r) => (r ? { x: r.x + r.w / 2, y: r.y + r.h / 2 } : null);

// The canvas's box style (Shape.ts), so the preview's boxes match the tool's
const BOX = defaultShapeStyle;
const LABEL_H = BOX.fontSize + BOX.paddingY * 2;
// A box being dragged out: a drawn box with no category yet
const DRAFT_LINE = boxLineStyle({ editable: true });

/**
 * The element a cursor target points at, or null when it is not on screen.
 * Found by tags the real components carry (data-control on the panel's
 * buttons, data-scene-option on Step 2's), never by their wording, so
 * rewording a button in the tool does not lose the cursor. A box or an image
 * point gives the photo. DemoStage.test.jsx checks every target the script
 * uses can be found when the cursor goes to it.
 */
export function findTarget(root, target, boxes) {
  if (!target) return null;
  if (target.kind === "image") return root.querySelector("[data-demo-photo]");
  if (target.kind === "box") return boxes.some((b) => b.id === target.id) ? root.querySelector("[data-demo-photo]") : null;
  if (target.kind !== "ui") return null;
  const control = { yes: "yes", no: "no", confirm: "confirm", category: "category", slider: "severity" }[target.name];
  if (control) return root.querySelector(`[data-demo-panel] [data-control="${control}"]`);
  if (target.name === "option") return root.querySelector(`[data-demo-option="${target.value}"]`);
  if (target.name === "scene") return root.querySelector(`[data-scene-option="${target.field}:${target.value}"]`);
  if (target.name === "next") return root.querySelector('[data-demo="next"] button');
  return null;
}

/**
 * The first photo's answer lists at their fullest in the run (every object
 * answered, Lamp Post #2 drawn). Laid out invisibly under the real lists, so
 * the close shot can be framed for their tallest from the start and the
 * camera never moves as they grow (28 Oct 2026). Its ids are dropped as it
 * mounts, so the page has one of each.
 */
const FULLEST_BOXES = demoFrame(tickOf("drawn-confirm", "end") / TICKS).boxes;
const FULLEST_TRAYS = buildTrays(FULLEST_BOXES, { labels: buildDisplayLabels(FULLEST_BOXES) });
const dropIds = (el) => {
  if (!el) return;
  el.querySelectorAll("[id], [aria-labelledby]").forEach((node) => {
    node.removeAttribute("id");
    node.removeAttribute("aria-labelledby");
  });
};
function FullestTrays() {
  return (
    <div ref={dropIds} data-trays-fullest aria-hidden="true" className="pointer-events-none invisible absolute inset-x-0 top-0">
      <ObjectTrays trays={FULLEST_TRAYS} selectedId={null} hiddenIds={[]} onOpen={noop} onToggleHidden={noop} onShowAll={noop} onHideAll={noop} />
    </div>
  );
}

/** One box on the photo, drawn the way Shape.paint draws it. */
function DemoBox({ box, label, scale, isOpen }) {
  const { x, y, width, height } = box.mark;
  const stroke = boxStrokeColor(box);
  const line = boxLineStyle(box);
  const { background: labelBg, text: labelInk } = boxLabelColors(box);
  const handle = BOX.transformerSize;
  const text = label || formatLabel(box.comment);
  return (
    <g>
      {isOpen && (
        <rect x={x * scale} y={y * scale} width={width * scale} height={height * scale} fill={BOX.shapeBackground} />
      )}
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
      {!isOpen && text && (
        // As Shape.paintLabel: a tag the font size plus paddingY above and
        // below, whose top edge is the box's top line. A block, not inline,
        // so no line box pushes it down
        <foreignObject x={x * scale} y={y * scale} width={240} height={LABEL_H} overflow="visible">
          <span
            className="block w-max rounded-[5px] font-bold whitespace-nowrap"
            style={{
              height: LABEL_H,
              lineHeight: `${LABEL_H}px`,
              padding: `0 ${BOX.paddingX}px`,
              fontSize: BOX.fontSize,
              background: labelBg,
              color: labelInk,
            }}
          >
            {text}
          </span>
        </foreignObject>
      )}
      {isOpen &&
        [
          [x, y], [x + width / 2, y], [x + width, y],
          [x + width, y + height / 2], [x + width, y + height],
          [x + width / 2, y + height], [x, y + height], [x, y + height / 2],
        ].map(([hx, hy], i) => (
          <rect key={i} x={hx * scale - handle / 2} y={hy * scale - handle / 2} width={handle} height={handle} fill={BOX.transformerBackground} />
        ))}
    </g>
  );
}

/** The category list as it looks open: the real <select> cannot be shown open. */
function DemoCategoryList({ highlighted }) {
  return (
    <ul
      data-demo-list
      className="absolute left-3 right-14 top-[52px] z-10 max-h-64 overflow-hidden rounded-control border border-line bg-surface py-1 shadow-2xl"
    >
      {CATEGORY_OPTIONS.map((opt) => (
        <li
          key={opt.value}
          data-demo-option={opt.value}
          className={cn("px-3 py-1 text-sm font-semibold", highlighted === opt.value ? "bg-primary text-white" : "text-ink")}
        >
          {opt.label}
        </li>
      ))}
    </ul>
  );
}

/** The open box's panel, beside the box as in the tool. */
function DemoPanel({ box, picker, dropdown, scale }) {
  const mode = getSuggestionPanelMode({
    editable: box.editable,
    selected: box.selected,
    obstructs: box.obstructs,
    severity: box.severity,
    comment: box.comment || "",
  });
  // Where the tool opens it (panelPosition, as syncPanel)
  const { left, top } = panelPosition(
    { x: box.mark.x * scale, y: box.mark.y * scale, width: box.mark.width * scale },
    { width: DEMO_IMAGE_SIZE.width * scale, height: DEMO_IMAGE_SIZE.height * scale }
  );

  return (
    <div data-demo-panel className="absolute z-20" style={{ left, top }}>
      {mode === "severity" ? (
        <SeverityPicker key={picker} initialValue={picker} onConfirm={noop} onBack={noop} />
      ) : (
        <DefaultInputSection
          key={box.id}
          value={box.comment || ""}
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
          onHide={noop}
          originalComment={box.initialState?.comment || ""}
          editable={box.editable}
          selected={box.selected}
          isRejected={Boolean(box.isRejected)}
          obstructs={box.obstructs}
          severity={box.severity}
        />
      )}
      {dropdown && <DemoCategoryList highlighted={dropdown.highlighted} />}
    </div>
  );
}

const Screen = memo(function Screen({ view, photoWidth }) {
  const { imageIndex, boxes, selectedId, draft, picker, dropdown, scene, saving } = view;
  const image = DEMO_IMAGES[imageIndex];
  const scale = photoWidth / DEMO_IMAGE_SIZE.width;
  const labels = buildDisplayLabels(boxes);
  const trays = buildTrays(boxes, { labels });
  const open = boxes.find((b) => b.id === selectedId) || null;

  return (
    <>
      <div className="flex flex-row gap-6">
        <div style={{ flex: "65 1 0%" }} className="min-w-0">
          <Step1Card
            data-demo-region="step1"
            photo={
              <div data-demo-region="photo" data-demo-photo className="relative" style={{ width: photoWidth, height: DEMO_IMAGE_SIZE.height * scale }}>
                {/* eslint-disable-next-line @next/next/no-img-element -- a static tutorial photo, drawn at a fixed size */}
                <img src={image.url} alt="" className="absolute inset-0 w-full h-full" draggable={false} />
                <svg className="absolute inset-0 overflow-visible" width={photoWidth} height={DEMO_IMAGE_SIZE.height * scale}>
                  {boxes.map((b) => (
                    <DemoBox key={b.id} box={b} label={labels.get(b.id)} scale={scale} isOpen={b.id === selectedId} />
                  ))}
                  {draft && (
                    <rect
                      x={Math.min(draft.x, draft.x + draft.width) * scale}
                      y={Math.min(draft.y, draft.y + draft.height) * scale}
                      width={Math.abs(draft.width) * scale}
                      height={Math.abs(draft.height) * scale}
                      fill="none"
                      stroke={boxStrokeColor({ editable: true })}
                      strokeWidth={DRAFT_LINE.width}
                      strokeDasharray={DRAFT_LINE.dash.join(" ")}
                    />
                  )}
                </svg>
                {open && <DemoPanel box={open} picker={picker} dropdown={dropdown} scale={scale} />}
              </div>
            }
            answers={
              <div className="relative">
                <ObjectTrays
                  trays={trays}
                  selectedId={selectedId}
                  hiddenIds={[]}
                  onOpen={noop}
                  onToggleHidden={noop}
                  onShowAll={noop}
                  onHideAll={noop}
                />
                {imageIndex === 0 && <FullestTrays />}
              </div>
            }
          />
        </div>
        <div style={{ flex: "35 1 0%" }} className="min-w-0" data-demo-region="scene">
          <SceneQuestions sceneLevel={scene} variant="desktop" onAnswer={noop} />
        </div>
      </div>
      <div className="flex justify-center mt-10 mb-4">
        <span data-demo="next" data-demo-region="actions" className="inline-block motion-safe:transition-opacity motion-safe:duration-300 motion-safe:ease-in-out">
          <Button submit disabled={saving} className="whitespace-nowrap">
            {saving ? "Saving..." : "Next Image"}
          </Button>
        </span>
      </div>
    </>
  );
});

/** A pointer arrow, the tip at (0, 0) */
function CursorGlyph() {
  return (
    <svg width="26" height="30" viewBox="0 0 26 30" aria-hidden="true" style={{ filter: "drop-shadow(0 2px 3px rgba(0,0,0,.35))" }}>
      <path d="M2 2 L2 24 L8 18.5 L12.5 28 L16.5 26.2 L12 16.8 L20 16.8 Z" fill="#111827" stroke="#ffffff" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * The camera for a region: the scale that fits it, with a margin, in the
 * screen, never smaller than the scale that fits the whole stage and never
 * over MAX_ZOOM, and the offset that centres it. The stage is not held
 * inside the screen: beyond its edges is the same ground colour, so nothing
 * shows. The step card takes no room from the camera, and the camera never
 * moves for it (it fades instead, see cardCovers).
 */
export function cameraFor(region, view, stage) {
  const base = Math.min(view.w / stage.w, view.h / stage.h);
  const fit = Math.min(view.w / (region.w + CAMERA_PAD * 2), view.h / (region.h + CAMERA_PAD * 2));
  const z = Math.max(base, Math.min(fit, MAX_ZOOM));
  return {
    z,
    x: view.w / 2 - (region.x + region.w / 2) * z,
    y: view.h / 2 - (region.y + region.h / 2) * z,
  };
}

// How faint the step card goes while something passes under it (Rans, 15 Oct
// 2026: faded, not hidden)
const COVERED_OPACITY = 0.3;

/**
 * Whether the step card is in the way (screen px): the cursor near it, or
 * more than `share` of a box, panel or list under it. A corner brushing the
 * card does not count, so it does not fade for nothing.
 */
export function cardCovers(card, { pointer = null, areas = [] }, { gap = 8, share = 0.05 } = {}) {
  if (!card) return false;
  const nearCard = (r) => r.x < card.x + card.w + gap && r.x + r.w > card.x - gap && r.y < card.y + card.h + gap && r.y + r.h > card.y - gap;
  const shareUnder = (r) => {
    const w = Math.min(r.x + r.w, card.x + card.w) - Math.max(r.x, card.x);
    const h = Math.min(r.y + r.h, card.y + card.h) - Math.max(r.y, card.y);
    return w > 0 && h > 0 ? (w * h) / (r.w * r.h) : 0;
  };
  return Boolean(pointer && nearCard(pointer)) || areas.some((r) => r && r.w > 0 && r.h > 0 && shareUnder(r) > share);
}

/**
 * The camera, panned down so nothing above design y `top` shows: the close
 * shot of the photo starts at the photo's grey well, without the Step 1
 * heading and a cut-off line of its instructions (Rans, 15 Oct 2026). Never
 * so far that the top of `region` itself goes off the screen.
 */
export function keepBelow(camera, top, region) {
  const highest = -top * camera.z;
  if (camera.y <= highest) return camera;
  return { ...camera, y: Math.max(highest, -region.y * camera.z) };
}

/**
 * The close shot of the work (28 Oct 2026): `region` is the Step 1 card from
 * the inside of the photo's grey well down to the foot of its answer lists
 * at their fullest, so the photo and the lists under it. The shot shows all
 * of its width, nothing cropped (Rans: cropping cut the lists' words), as
 * much of its height as fits, centred in the frame, so the room above and
 * below is the same (Rans). Above, that room shows the foot of Step 1's
 * instructions, which DemoStage blurs (showsAbove). Never past MAX_ZOOM. It
 * is the same all through the run, so the camera holds still.
 */
export function workShot(region, view) {
  const z = Math.min(MAX_ZOOM, view.w / region.w, view.h / region.h);
  return { z, x: view.w / 2 - (region.x + region.w / 2) * z, y: view.h / 2 - (region.y + region.h / 2) * z };
}

/** Whether anything above design y `top` (the photo's well) shows in the frame with this camera */
export function showsAbove(top, camera) {
  return top * camera.z + camera.y > 0.5;
}

/**
 * Whether design y `top` (Next Image's) would show in the frame with this
 * camera. In the close shot Next Image is faded out while it would, so the
 * room under the lists is plain ground, not a cut-off button (Rans, 28 Oct
 * 2026), and back in as the camera goes out to the whole page.
 */
export function showsBelow(top, camera, view) {
  return top * camera.z + camera.y < view.h;
}

// How Step 1's instructions blur above the close shot, and how fast they blur and clear
const HEADER_BLUR = 5;
const SHOT_FADE = "400ms cubic-bezier(0.2, 0.8, 0.2, 1)";

// The step card's margin from the frame's edges, and how far inside the photo it sits
const CARD_EDGE = 24;
const CARD_INSET = 16;

/**
 * Where the step card sits on a laptop: inside the photo's bottom-left
 * corner, CARD_INSET px in, as the close shot of the photo shows it (Rans,
 * 15 Oct 2026). From the layout and the frame's size only, not from the frame
 * being played, so the card stays put. Never off the frame's edges.
 * Returns the card's left and its bottom, in px from the frame's edges.
 */
export function captionPlace(photo, wellTop, view, stage, card) {
  const shot = keepBelow(cameraFor(photo, view, stage), wellTop, photo);
  const clamp = (v, lo, hi) => Math.round(Math.min(hi, Math.max(lo, v)));
  return {
    left: clamp(photo.x * shot.z + shot.x + CARD_INSET, CARD_EDGE, view.w - card.w - CARD_EDGE),
    bottom: clamp(view.h - ((photo.y + photo.h) * shot.z + shot.y) + CARD_INSET, CARD_EDGE + 6, view.h - card.h - CARD_EDGE),
  };
}

/** Under this many pixels across, the camera follows the open box and its panel instead of the whole photo */
const COMPACT_VIEW = 700;

function union(rects) {
  const list = rects.filter(Boolean);
  if (!list.length) return null;
  const x = Math.min(...list.map((r) => r.x));
  const y = Math.min(...list.map((r) => r.y));
  return { x, y, w: Math.max(...list.map((r) => r.x + r.w)) - x, h: Math.max(...list.map((r) => r.y + r.h)) - y };
}

export default function DemoStage({ frame, instant = false, captionRef = null }) {
  const viewportRef = useRef(null);
  const cameraRef = useRef(null);
  const stageRef = useRef(null);
  const cursorRef = useRef(null);
  const points = useRef(new Map());
  const camTarget = useRef(null);
  const camShown = useRef(null);
  const camRaf = useRef(0);

  // The camera eases toward its target on its own clock, so a region change
  // (a panel opening, a new chapter) glides instead of jumping
  // will-change only while the camera moves. Left on, Chrome left the
  // frame's rounded corners unpainted in testing, and a layer kept for a
  // transform can keep the scale it was drawn at, softening zoomed text.
  const paintCamera = (moving = false) => {
    const c = camShown.current;
    const el = cameraRef.current;
    if (!el || !c) return;
    el.style.transform = `translate(${c.x}px, ${c.y}px) scale(${c.z})`;
    el.style.willChange = moving ? "transform" : "auto";
  };
  const easeCamera = () => {
    const from = camShown.current;
    const to = camTarget.current;
    const step = (a, b) => (Math.abs(b - a) < 0.05 ? b : a + (b - a) * CAMERA_RATE);
    camShown.current = { x: step(from.x, to.x), y: step(from.y, to.y), z: Math.abs(to.z - from.z) < 0.0005 ? to.z : from.z + (to.z - from.z) * CAMERA_RATE };
    const done = camShown.current.x === to.x && camShown.current.y === to.y && camShown.current.z === to.z;
    paintCamera(!done);
    camRaf.current = done ? 0 : requestAnimationFrame(easeCamera);
  };
  useLayoutEffect(() => () => cancelAnimationFrame(camRaf.current), []);

  // The frame only changes with the scroll. A resized window, or the fonts
  // arriving and moving the buttons, needs the cursor and camera placed again.
  const [, setLayoutVersion] = useState(0);
  useEffect(() => {
    const again = () => setLayoutVersion((v) => v + 1);
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(again) : null;
    if (observer && viewportRef.current) observer.observe(viewportRef.current);
    // The caption changes height from one chapter to the next
    if (observer && captionRef?.current) observer.observe(captionRef.current);
    let live = true;
    document.fonts?.ready?.then(() => live && again());
    return () => {
      live = false;
      observer?.disconnect();
    };
  }, [captionRef]);

  // The screen re-renders only when what it shows changes, not on every frame of a glide
  const view = useMemo(
    () => ({
      imageIndex: frame.imageIndex,
      boxes: frame.boxes,
      selectedId: frame.selectedId,
      draft: frame.draft,
      picker: frame.picker,
      dropdown: frame.dropdown,
      scene: frame.scene,
      saving: frame.saving,
    }),
    // Compared by content: demoFrame makes a new object on every scroll step
    [JSON.stringify([frame.imageIndex, frame.boxes, frame.selectedId, frame.draft, frame.picker, frame.dropdown, frame.scene, frame.saving])]
  );

  // The photo fills the Step 1 card's well: 65% of the row, less the card's padding and border
  const photoWidth = Math.round((STAGE_WIDTH - 48 - 24) * 0.65 - 16 - 2);

  useLayoutEffect(() => {
    const root = stageRef.current;
    const viewport = viewportRef.current;
    if (!root || !viewport) return;
    const stage = { w: root.offsetWidth, h: root.offsetHeight };
    const photo = rectIn(root.querySelector("[data-demo-photo]"), root);
    const scale = photo ? photo.w / DEMO_IMAGE_SIZE.width : 1;

    const resolve = (target) => {
      if (!target || target.kind === "off") return { x: stage.w * 0.82, y: stage.h + 40 };
      const el = findTarget(root, target, frame.boxes);
      // Not on screen, or not laid out (jsdom)
      if (!el || ((target.kind === "image" || target.kind === "box") && !photo)) return null;
      if (target.kind === "image") return { x: photo.x + target.x * scale, y: photo.y + target.y * scale };
      if (target.kind === "box") {
        const b = frame.boxes.find((it) => it.id === target.id);
        return { x: photo.x + (b.mark.x + b.mark.width / 2) * scale, y: photo.y + (b.mark.y + b.mark.height / 2) * scale };
      }
      if (target.name === "slider") {
        const r = rectIn(el, root);
        if (!r) return null;
        return { x: r.x + THUMB_R + ((target.value - 1) / 4) * (r.w - 2 * THUMB_R), y: r.y + r.h / 2 };
      }
      return centre(rectIn(el, root));
    };

    // A target can be gone by the time the cursor leaves it (the category list
    // closes on a click, the Yes button turns into the severity slider), so
    // each target's last known point is kept, keyed by the target itself
    const remembered = (target) => {
      const key = JSON.stringify(target);
      const point = resolve(target);
      if (point) points.current.set(key, point);
      return point || points.current.get(key) || null;
    };
    const { cursor } = frame;
    // With no point for one end (a still shown first, with reduced motion), the cursor sits at the other
    const toPoint = remembered(cursor.to);
    const from = remembered(cursor.from) || toPoint;
    const to = toPoint || from;
    if (cursorRef.current && from && to) {
      const x = lerp(from.x, to.x, cursor.t);
      const y = lerp(from.y, to.y, cursor.t);
      cursorRef.current.style.transform = `translate(${x}px, ${y}px) scale(${cursor.pressed ? 0.88 : 1})`;
      cursorRef.current.style.opacity = cursor.visible ? "1" : "0";
    }

    const whole = { x: 0, y: 0, w: stage.w, h: stage.h };
    const vp = { w: viewport.clientWidth, h: viewport.clientHeight };
    // The close shot of the photo shows nothing above the inside of its grey
    // well (the well's top border is the line)
    const well = rectIn(root.querySelector("[data-step1-well]"), root);
    const wellTop = well ? well.y + 1 : 0;
    const regionRect = (name) => {
      // A phone shows the whole stage too small to read: the Step 1 card
      // stands in for it, or Next Image while the cursor is heading there
      // (Step 2's questions while the cursor answers them)
      if (name === "overview" && vp.w < COMPACT_VIEW) {
        const heading = frame.cursor.to?.name;
        name = heading === "scene" ? "scene" : heading === "next" && frame.imageIndex === 0 ? "actions" : "step1";
      }
      if (name === "overview") return whole;
      // On a small screen the whole photo is too small to read the panel, so
      // the camera shows the open box with its panel and category list
      if (name === "photo" && vp.w < COMPACT_VIEW && photo) {
        const panel = root.querySelector("[data-demo-panel]");
        if (panel) {
          const open = frame.boxes.find((b) => b.id === frame.selectedId);
          const boxRect = open && {
            x: photo.x + open.mark.x * scale,
            y: photo.y + open.mark.y * scale,
            w: open.mark.width * scale,
            h: open.mark.height * scale,
          };
          return union([boxRect, rectIn(panel, root), rectIn(root.querySelector("[data-demo-list]"), root)]);
        }
      }
      return rectIn(root.querySelector(`[data-demo-region="${name}"]`), root) || whole;
    };
    const region = regionRect(frame.camera);
    // On a phone the step card spans the bottom of the screen, so shots are
    // framed in the space above it rather than centred on the whole screen
    const phoneCard = vp.w < COMPACT_VIEW ? captionRef?.current : null;
    const shotView = phoneCard ? { w: vp.w, h: Math.max(vp.h / 2, phoneCard.offsetTop - 12) } : vp;
    const fitted = cameraFor(region, shotView, stage);
    // The photo shot is the photo and its answer lists across their full width (workShot).
    // In a narrow frame, while a box is open, it follows the box and its panel instead
    // (regionRect), kept below the well
    const step1CardEl = root.querySelector("[data-step1-card]");
    const step1Card = rectIn(step1CardEl, root);
    // The foot of the answer lists at their fullest (FullestTrays), or as they are
    const lists = rectIn(root.querySelector("#box-review-section"), root);
    const fullest = root.querySelector("[data-trays-fullest]");
    const listsFoot = lists ? lists.y + Math.max(lists.h, fullest ? fullest.offsetHeight : 0) : step1Card ? step1Card.y + step1Card.h : 0;
    const followsPanel = vp.w < COMPACT_VIEW && Boolean(root.querySelector("[data-demo-panel]"));
    const work = !followsPanel && photo && step1Card ? { x: step1Card.x, y: wellTop, w: step1Card.w, h: listsFoot - wellTop } : null;
    const centred = frame.camera !== "photo" ? fitted : work ? workShot(work, vp) : keepBelow(fitted, wellTop, region);

    // In the close shot the foot of Step 1's instructions shows above the photo: blurred and
    // dimmed, like content under a frame's edge, and clear again as the camera goes out (Rans,
    // 28 Oct 2026). On the instructions themselves, so it moves with the camera
    const header = step1CardEl?.firstElementChild;
    if (header) {
      const blur = Boolean(work) && frame.camera === "photo" && showsAbove(wellTop, centred);
      const filter = blur ? `blur(${HEADER_BLUR}px)` : "";
      if (header.style.filter !== filter) {
        header.style.transition = instant ? "" : `filter ${SHOT_FADE}, opacity ${SHOT_FADE}`;
        header.style.filter = filter;
        header.style.opacity = blur ? "0.45" : "";
      }
    }

    // Next Image fades out while the close shot would show the top of it, judged where the camera is heading
    const nextButton = root.querySelector('[data-demo="next"]');
    const nextRect = rectIn(nextButton, root);
    if (nextButton && nextRect) {
      const hide = Boolean(work) && frame.camera === "photo" && showsBelow(nextRect.y, centred, vp);
      const opacity = hide ? "0" : "";
      if (nextButton.style.opacity !== opacity) nextButton.style.opacity = opacity;
    }

    // ---- The step card ----
    const caption = captionRef?.current;
    // On a laptop the card sits inside the photo's bottom-left corner as the
    // close shot shows it (captionPlace), and stays there while the preview
    // plays. On a phone it spans the width at the bottom (HowItWorks' classes).
    if (caption) {
      let left = "";
      let bottom = "";
      if (vp.w >= COMPACT_VIEW && photo) {
        const place = captionPlace(photo, wellTop, vp, stage, { w: caption.offsetWidth, h: caption.offsetHeight });
        left = `${place.left}px`;
        bottom = `${place.bottom}px`;
      }
      if (caption.style.left !== left) caption.style.left = left;
      if (caption.style.bottom !== bottom) caption.style.bottom = bottom;
    }
    const target = centred;

    // The camera never moves for the card (Rans, 15 Oct 2026: panning around
    // it made the view shake while scrolling). When the cursor, the open box,
    // the box being drawn, its panel or the category list passes under the
    // card, the card fades instead, and comes back once it has passed
    if (caption) {
      const toScreen = (r) => r && { x: r.x * target.z + target.x, y: r.y * target.z + target.y, w: r.w * target.z, h: r.h * target.z };
      const open = frame.boxes.find((b) => b.id === frame.selectedId);
      const boxRect = open && photo && { x: photo.x + open.mark.x * scale, y: photo.y + open.mark.y * scale, w: open.mark.width * scale, h: open.mark.height * scale };
      const draftRect = frame.draft && photo && {
        x: photo.x + Math.min(frame.draft.x, frame.draft.x + frame.draft.width) * scale,
        y: photo.y + Math.min(frame.draft.y, frame.draft.y + frame.draft.height) * scale,
        w: Math.abs(frame.draft.width) * scale,
        h: Math.abs(frame.draft.height) * scale,
      };
      // The arrow, its tip at the point
      const pointer = cursor.visible && from && to && { x: lerp(from.x, to.x, cursor.t), y: lerp(from.y, to.y, cursor.t), w: 26, h: 30 };
      const card = { x: caption.offsetLeft, y: caption.offsetTop, w: caption.offsetWidth, h: caption.offsetHeight };
      // Faded where the script says (frame.cardFaded: as a panel opens over
      // it, and through steps close together), or whenever the action comes
      // under it at this screen size
      const inTheWay = cardCovers(card, {
        pointer: toScreen(pointer),
        areas: [boxRect, draftRect, rectIn(root.querySelector("[data-demo-panel]"), root), rectIn(root.querySelector("[data-demo-list]"), root)].map(toScreen),
      });
      const covered = frame.cardFaded || inTheWay;
      if ((caption.dataset.covered === "true") !== covered) {
        caption.dataset.covered = String(covered);
        caption.style.opacity = covered ? String(COVERED_OPACITY) : "";
        // Fading happens at once, so the card is never over a panel that has
        // just opened, even for the length of a fade. Coming back glides
        caption.style.transitionDuration = covered ? "0ms" : "";
      }
    }

    camTarget.current = target;
    if (!camShown.current || instant) {
      camShown.current = target;
      paintCamera();
    } else if (!camRaf.current) {
      camRaf.current = requestAnimationFrame(easeCamera);
    }
  });

  return (
    <div ref={viewportRef} className="relative w-full h-full overflow-hidden bg-ground">
      <div ref={cameraRef} className="absolute left-0 top-0 origin-top-left">
        <div ref={stageRef} className="relative bg-ground p-6" style={{ width: STAGE_WIDTH }}>
          <Screen view={view} photoWidth={photoWidth} />
          <div ref={cursorRef} className="pointer-events-none absolute left-0 top-0 z-30 will-change-transform" style={{ opacity: 0, transformOrigin: "0 0" }}>
            <CursorGlyph />
          </div>
        </div>
      </div>
    </div>
  );
}
