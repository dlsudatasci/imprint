
import Button from '../Button';
import React, { MouseEventHandler } from "react";
import Router from "next/router";
import { validateAnnotationForSubmit, validateObjectStep, validateSidewalkStep } from "@/util/validators/clientAnnotation";
import {
  TAU_THRESHOLD,
  filterAnnotationsByTau,
  computeStepTimings,
  computeAnnotatorStepTimings,
  buildSuggestionConfidences,
  buildGeometryChanges,
  buildLabelChanges,
  buildSubmissionCounts,
} from "@/util/validators/telemetryPayload";
import {
  NOT_AN_OBJECT,
  notAnObjectPatch,
  annotatorNotAnObjectPatch,
  keepObjectPatch,
  getObjectPanelMode,
  isDecidedForObjects,
} from "@/util/suggestionJudgment";
import { isTaxonomyCategory } from "@/util/taxonomy";
import { isBelowMinimumSize, clampPointToImage, keepMarkInside, markArea, normalizeMark, pickNearSmallBox } from "@/util/boxGeometry";
import { normalizeSubmittedMarks } from "@/util/validators/annotationSubmit";
import { findNearDuplicates } from "@/features/annotate/objectStep";
import { buildTrays, buildPeekChips, TRAY_COPY, sceneProgressLine } from "@/features/annotate/objectTrays";
import { toggleHiddenId, withoutHiddenId, isDoubleTap, BOX_VISIBILITY_COPY } from "@/features/annotate/boxVisibility";
import { createEditSaver } from "@/util/editSaver";
import { TAXONOMY_GUIDE, TAXONOMY_RULES } from "@/features/annotate/taxonomyGuide";
import {
  isRealObject,
  realObjects,
  summarizeObstructionStep,
  toggleObstructionPatch,
  finalizeObstructionAnswers,
  pickJudgeTarget,
  pickJudgeLabel,
} from "@/features/annotate/obstructionStep";
import { OBSTRUCTION_GUIDE } from "@/features/annotate/obstructionGuide";
import { annotatorStepHeading, annotatorStepsFor } from "@/features/annotate/annotatorSteps";
import {
  initialSidewalkState,
  sidewalkReducer,
  closesDraft,
  findPointNear,
  findEdgeHandleNear,
  pickShape,
} from "@/features/annotate/sidewalkEditor";
import { annotatorStepParagraph, sidewalkOutlineHint, sidewalkSheetHint } from "@/features/annotate/annotatorStepCopy";
import {
  SIDEWALK_TOOL_COPY,
  sidewalkKeyAction,
  sidewalkShapeNumber,
  sidewalkToolContext,
  sidewalkToolTitle,
  sidewalkToolbarStatus,
  sidewalkTools,
} from "@/features/annotate/sidewalkTools";
import { toDecideFirst, unfinishedObjectIds } from "@/features/annotate/objectStep";
import { messageVisibleMs } from "@/features/annotate/stepMessage";
import { SIDEWALK_GUIDE } from "@/features/annotate/sidewalkGuide";
import { normalizeSidewalkMask, summarizeSidewalkMask } from "@/util/validators/sidewalkMask";

import { IAnnotation } from "./Annotation";
import { IAnnotationState } from "./annotation/AnnotationState";
import { DefaultAnnotationState } from "./annotation/DefaultAnnotationState";
import JudgingAnnotationState from "./annotation/JudgingAnnotationState";
import TransformationState from "./annotation/TransformationState";
import SidewalkAnnotationState from "./annotation/SidewalkAnnotationState";
import { paintSidewalk } from "./paintSidewalk";
import DefaultInputSection, { type PanelVariant } from "./DefaultInputSection";
import ObjectInputSection from "./ObjectInputSection";
import ObjectTrays, { ObjectTraysPeek, SheetStepHeading, DrawnMark, SheetNextButton } from "./ObjectTrays";
import {
  defaultShapeStyle,
  drawnBoxStyle,
  IShape,
  IShapeBase,
  IShapeStyle,
  PaintVariant,
  RectShape,
  boxStrokeColor,
  placeLabel,
} from "./Shape";
import Transformer, { ITransformer, TransformerMode } from "./Transformer";
import randomId from "./utils/randomId";
import { reduceTouch, initialTouchState, type TouchInput, type TouchEffect, type TouchHit, type Point, type Corner } from "./touchGesture";
import {
  reduceSidewalkTouch,
  initialSidewalkTouchState,
  type SidewalkHit,
  type SidewalkTouchInput,
  type SidewalkTouchEffect,
} from "./sidewalkTouch";
import {
  clientToStage,
  cssToImage,
  markCorners,
  moveCorner,
  pickCorner,
  addBoxPlacement,
  TOUCH_HANDLE_HIT_PX,
  TOUCH_MIN_SIDE_PX,
  ADD_BOX_MIN_SIDE_PX,
  TOUCH_NEAR_PX,
  TOUCH_SMALL_BOX_PX,
} from "./touchGeometry";
import { loupePlacement, loupeSource, LOUPE_SIZE_PX, LOUPE_MAGNIFICATION, LOUPE_BACKGROUND, type LoupeSide } from "./loupe";
import {
  fitImage,
  applyView,
  zoomAt,
  panLimits,
  clampView,
  clampZoom,
  ensureVisible,
  IDENTITY_VIEW,
  type Fit,
  type View,
} from "./viewTransform";
import BottomSheet, { NO_SCROLL_STYLE, type SheetSnap, type SheetPoints } from "../BottomSheet";
import PhotoCredit, { type PhotoSource } from "./PhotoCredit";
import { summarizeInputTypes, classifyDevice } from "@/util/validators/deviceTelemetry";
import {
  readSessionData,
  writeSession,
  writeCurrentCount,
} from "@/util/sessionCache";
import { P } from "../Typography";
import { H2 } from "../Typography";
import { H3 } from "../Typography";
import SceneQuestions, { type SceneLevel } from "./SceneQuestions";
import Step1Card from "./Step1Card";
import { panelPosition, fitPanelTop, PANEL_MARGIN, PANEL_WIDTH, PANEL_ROOM_BELOW } from "./panelPosition";
import Container from '../Container';
import Checkbox from '../Checkbox';
import {
  EyeIcon,
  EyeOffIcon,
  CheckIcon,
  CloseIcon,
  UndoIcon,
  TrashIcon,
  PhotoIcon,
  PointMinusIcon,
  ExpandIcon,
  ShrinkIcon,
} from '../icons';
import { buildDisplayLabelsInOrder, orderOfAppearance, formatLabel } from "@/util/buildDisplayLabels";

// Sent with every submit so the analysis can tell marks made on the fixed
// canvas from those made while .rp-image had a 5px border that put the photo
// up to 5 stage px away from the boxes (IMPRINT_photo_frame_fix.md, 9 Oct 2026).
// A page loaded before that deploy sends no canvasVersion.
export const CANVAS_VERSION = 2;

/** The tutorial moves the answers sheet with this window event, detail "collapsed", "half" or "full" (9 Oct 2026). */
export const SHEET_EVENT = "imprint:answer-sheet";

/** Copy for the full-screen photo on phones (12 Oct 2026). */
export const FOCUS_COPY = Object.freeze({
  enter: "Full-screen photo",
  exit: "Exit full screen",
  // Pulls the answers sheet up from the bottom: on a selected box, and otherwise
  details: "Details",
  answers: "Answers",
  deleteBox: "Delete box",
  stillToDecide: (n: number) => `${n} still to decide`,
  toDecide: (n: number) => `${n} to decide`,
});

/** Copy over the photo on touch (9 Oct 2026). Says "tap", never "click". */
export const ADD_BOX_COPY = Object.freeze({
  button: "Add box",
  fit: "Fit",
  hint: "Drag the corners to fit the object.",
});

/** The icon of each Sidewalk drawing tool (sidewalkTools.js), at a size. */
const SIDEWALK_TOOL_ICONS: Record<string, (size: number) => React.ReactNode> = {
  finish: (size) => <CheckIcon size={size} />,
  undo: (size) => <UndoIcon size={size} />,
  cancel: (size) => <CloseIcon size={size} />,
  deletePoint: (size) => <PointMinusIcon size={size} />,
  deleteShape: (size) => <TrashIcon size={size} />,
  done: (size) => <CheckIcon size={size} />,
};

/** An annotator card on the desktop layout, or in the answers sheet on a phone or tablet. */
type CardVariant = "desktop" | "sheet";

// A guide card in the sheet: full width, not sticky, no inner scroll (the sheet's body scrolls)
const GUIDE_SHEET_CLASS = "bg-surface rounded-card border border-line p-4";

/** What the magnifier is on: a box's corner or edge, or a point of the sidewalk outline. */
type LoupeTarget = { kind: "box"; id: string } | { kind: "sidewalk" };

/** The sidewalk outline's blue, as paintSidewalk draws it. */
const SIDEWALK_BLUE = "#2563eb";

/** How near the first point, in CSS px, a mouse press closes a Sidewalk shape. */
const SIDEWALK_CLOSE_PX = 12;

/**
 * How long after a finger or pen a mouse event on the photo is taken to be the
 * browser's copy of the tap, and ignored (14 Oct 2026). iOS Safari sends those
 * copies even though the tap's pointerdown is cancelled, so in Obstructions a
 * tap marked a box and the copied mousedown unmarked it straight away.
 */
const COMPAT_MOUSE_MS = 1000;

/** How near the first tap, in CSS px, the second of a double tap lands (isDoubleTap) */
const DOUBLE_TAP_PX = 30;

/** A media query's answer, false where there is no matchMedia (tests, old browsers). */
const matches = (query: string) =>
  typeof window !== "undefined" && Boolean(window.matchMedia?.(query)?.matches);

const prefersReducedMotion = () => matches("(prefers-reduced-motion: reduce)");

interface IReactPictureAnnotationProps {
  annotationData?: IAnnotation[];
  selectedId?: string | null;
  scrollSpeed: number;
  marginWithInput: number;
  onChange: (annotationData: IAnnotation[]) => void;
  onSelect: (id: string | null) => void;
  width: number;
  height: number;
  image: string;
  /** Where the photo comes from, for its credit line (PhotoCredit, 16 Oct 2026) */
  photoSource?: PhotoSource | null;
  annotationStyle: IShapeStyle;
  defaultAnnotationSize?: number[];
  username: string;
  imageID: string;
  city: string;
  servedModelVersion?: string;
  isReference?: boolean;
  currentAnnotationCount: number;
  inputElement: (
    value: string,
    onChange: (value: string) => void,
    onDelete: () => void,
    onSelectObstruction: () => void,
    onUnselectObstruction: () => void,
    editable: boolean,
    selected: boolean,
    isRejected: boolean,
    id: string,
    onSetSeverity: (severity: number) => void,
    onSetObstructs: (obstructs: boolean) => void,
    obstructs: boolean | undefined,
    severity: number | null | undefined,
    onMarkNotAnObject: () => void,
    askSeverity: boolean,
    onClose: () => void,
    onClearObstruction: () => void,
    onRestoreObject: () => void,
    originalComment: string,
    variant?: PanelVariant,
    onHide?: () => void,
  ) => React.ReactElement;
  totalAnnotationCount?: number;
  // Annotators give no severity and answer no scene-level questions (decided
  // 3 Oct 2026). Comes from the database through annotationGet, never the session.
  isAnnotator?: boolean;
  // Told when the annotator moves between Objects and Obstructions. The
  // tutorial uses it to show its tour and beacons in Objects only.
  onAnnotatorStepChange?: (step: AnnotatorStep) => void;
  // Annotators on model-development images (and in the tutorial) outline the
  // sidewalk between Objects and Obstructions (6 Oct 2026)
  askSidewalk?: boolean;
  // "sheet" on phones and tablets under 1024 px (9 Oct 2026, both roles from
  // 12 Oct 2026): the photo fills the screen and the answers sit in a bottom sheet
  layout?: "desktop" | "sheet";
  // The full-screen photo on phones and tablets (12 Oct 2026): in the sheet
  // layout the photo fills the screen, with no top bar and the answers sheet
  // down to its handle.
  // AnnotateForm holds it and passes the two callbacks on phones and tablets.
  focus?: boolean;
  onEnterFocus?: () => void;
  onExitFocus?: () => void;
}

type AnnotatorStep = "objects" | "sidewalk" | "obstructions";

interface IStageState {
  scale: number;
  originX: number;
  originY: number;
}

const defaultState: IStageState = {
  scale: 1,
  originX: 0,
  originY: 0,
};

/**
 * The annotation workspace: the canvas, plus the three questions asked about
 * each image. This is the core of what contributors actually do on Imprint.
 *
 * Three things about the implementation are worth knowing before changing it:
 *
 *   - There are two stacked canvases. The photo is painted once on the lower
 *     one and left alone; boxes are cleared and redrawn on the upper one many
 *     times a second while dragging. A single canvas would mean repainting the
 *     photo on every mouse movement.
 *   - It is a class component because the drawing loop needs state it can
 *     change immediately. `shapes`, `selectedId` and `scaleState` are plain
 *     instance fields, so a drag updates them at pointer speed without
 *     triggering a re-render per frame. Only things the page displays — the
 *     popup, the slider, the error — go through setState.
 *   - Moving to the next image is a full page reload rather than client-side
 *     navigation. That guarantees the canvas is rebuilt cleanly each time, but
 *     it means unsaved work must be written to the session cache first. See
 *     cacheCurrentImageEdits.
 *
 * The mouse drives the canvas through the state classes in annotation/. A
 * finger or a pen works too, on any device: contributors from 9 Oct 2026
 * (IMPRINT_contributor_mobile.md) and annotators from 12 Oct 2026
 * (IMPRINT_mobile_followup.md). Pointer handlers beside the mouse ones run the
 * touch gestures (touchGesture.ts for boxes, sidewalkTouch.ts for the
 * outline), Add box places boxes, and on phones and tablets the answers sit
 * in a bottom sheet (layout "sheet"). On phones the photo can also fill the
 * whole screen (the `focus` prop). The mouse tool is unchanged.
 */

export default class ReactPictureAnnotation extends React.Component<IReactPictureAnnotationProps> {
  public static defaultProps = {
    marginWithInput: PANEL_MARGIN,
    scrollSpeed: 0.0005,
    annotationStyle: defaultShapeStyle,
    inputElement: (
      value: string,
      onChange: (value: string) => void,
      onDelete: () => void,
      onSelectObstruction: () => void,
      onUnselectObstruction: () => void,
      editable: boolean,
      selected: boolean,
      isRejected: boolean,
      id: string,
      onSetSeverity: (severity: number) => void,
      onSetObstructs: (obstructs: boolean) => void,
      obstructs: boolean | undefined,
      severity: number | null | undefined,
      onMarkNotAnObject: () => void,
      askSeverity: boolean,
      onClose: () => void,
      onClearObstruction: () => void,
      onRestoreObject: () => void,
      originalComment: string,
      variant: PanelVariant = "floating",
      onHide?: () => void,
    ) => (
      <DefaultInputSection
        key={id}
        value={value}
        onChange={onChange}
        onDelete={onDelete}
        onSelectObstruction={onSelectObstruction}
        onUnselectObstruction={onUnselectObstruction}
        onMarkNotAnObject={onMarkNotAnObject}
        onSetSeverity={onSetSeverity}
        onSetObstructs={onSetObstructs}
        editable={editable}
        selected={selected}
        isRejected={isRejected}
        obstructs={obstructs}
        severity={severity}
        askSeverity={askSeverity}
        onClose={onClose}
        onClearObstruction={onClearObstruction}
        onRestoreObject={onRestoreObject}
        originalComment={originalComment}
        variant={variant}
        onHide={onHide}
      />
    ),
    isAnnotator: false,
    layout: "desktop",
  };

  public state = {
    inputPosition: {
      left: 0,
      top: 0,
    } as Record<string, number>,
    showInput: false,
    inputComment: "",
    // The model's own category for the selected suggestion, for the Not an
    // object panel (8 Oct 2026)
    originalComment: "",
    editable: false,
    selected: false,
    sliderValue: 5,
    pavementType: "",
    sceneLevel: {
      sidewalkWidth: null as string | null,
      surfaceCondition: null as number | null,
      walkability: null as number | null,
      overallAccessibility: null as number | null,
    },
    error: null as string | null,
    // Counts each message shown, so the same one shown again restarts its
    // timer (21 Oct 2026, showMessage)
    errorSeq: 0,
    isRejected: false,
    obstructs: undefined as boolean | undefined,
    severity: undefined as number | null | undefined,
    canvasScale: 1,
    // Annotators only (4 Oct 2026): Objects, then Obstructions
    annotatorStep: "objects" as AnnotatorStep,
    obstructionsConfirmed: false,
    // The Sidewalk step's editor state (render copy, see sidewalkState below)
    sidewalk: initialSidewalkState(null),
    hideSidewalkFill: false,
    showSidewalkOverlay: true,
    // Step 1, both roles (8 Oct 2026): boxes hidden on the photo from the list
    // under it, so crowded boxes can be drawn and fitted. A view setting only.
    hiddenBoxIds: [] as string[],
    // True while an image is being sent, so the button cannot send it twice
    submitting: false,
    // Phones and tablets (9 Oct 2026). The photo area's size in the sheet
    // layout, measured, and where the answers sheet rests.
    sheetStage: null as { width: number; height: number } | null,
    sheetSnap: "collapsed" as SheetSnap,
    sheetCollapsed: 0,
    // Touch: zoomed in past the fit (shows Fit), the magnifier's place while a
    // corner is dragged, the box Add box just placed (shows its hint), and
    // whether any pointer is coarse (shows Add box in the desktop layout)
    zoomed: false,
    loupe: null as { left: number; top: number } | null,
    addBoxHintId: null as string | null,
    anyCoarsePointer: false,
    // A finger is the primary pointer (an iPad, a phone): the words say "tap"
    coarsePointer: false,
  };

  set selectedId(value: string | null) {
    const { onSelect } = this.props;
    // The resize handles belong to the selected box. Drop them whenever the
    // selection changes (6 Oct 2026). Left in place, a deselected box kept
    // invisible handles that caught the next click: on a tiny box they cover
    // the whole box, so clicking it (or its chip in the list) started a resize
    // instead of selecting it, and its panel never opened. A new handle set is
    // made for the newly selected box (DefaultAnnotationState, onShapeChange).
    if (value !== this.selectedIdTrueValue) this.currentTransformer = null;
    this.selectedIdTrueValue = value;
    onSelect(value);
  }

  get selectedId() {
    return this.selectedIdTrueValue;
  }

  get annotationStyle() {
    return this.props.annotationStyle;
  }

  get defaultAnnotationSize() {
    return this.props.defaultAnnotationSize;
  }

  public shapes: IShape[] = [];
  public scaleState = defaultState;
  public currentTransformer: ITransformer;

  // Deliberately instance fields, not React state — see the class comment.
  // `shapes` is the live source of truth the canvas paints from;
  // currentAnnotationData is the plain data mirrored out of it for submission.
  private currentAnnotationData: IAnnotation[] = [];
  private hiddenSuggestions: IAnnotation[] = [];
  // Unsubmitted edits are saved to the session cache shortly after they stop
  // (8 Oct 2026), so a refresh or a pause keeps them. Not before the image's
  // boxes and cached answers have been restored, or an empty first paint
  // would overwrite them.
  private editsRestored = false;
  // Set from the moment an image is sent until the page moves on
  private submitInFlight = false;
  private editSaver = createEditSaver(() => this.cacheCurrentImageEdits(), 400);
  private flushEdits = () => this.editSaver.flush();
  private onVisibilityChange = () => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") this.editSaver.flush();
  };
  private scheduleEditSave() {
    if (this.editsRestored) this.editSaver.schedule();
  }
  private selectedIdTrueValue: string | null;
  private canvasRef = React.createRef<HTMLCanvasElement>();
  private canvas2D?: CanvasRenderingContext2D | null;
  private imageCanvasRef = React.createRef<HTMLCanvasElement>();
  private imageCanvas2D?: CanvasRenderingContext2D | null;
  private canvasWrapperRef = React.createRef<HTMLDivElement>();
  private resizeObserver: ResizeObserver | null = null;
  private currentImageElement?: HTMLImageElement;
  private currentAnnotationState: IAnnotationState = new DefaultAnnotationState(
    this
  );
  // Start of the timer behind the "average seconds per image" dashboard stat.
  // Reset in componentDidUpdate when the image changes, so it measures time on
  // the current photo rather than since the component first mounted.
  private mountTime: number = Date.now();
  private sceneStepStartMs: number | null = null;
  // The last time the annotator entered the Obstructions step
  private obstructionStepStartMs: number | null = null;
  // The last time the annotator entered the Sidewalk step
  private sidewalkStepStartMs: number | null = null;
  // The sidewalk editor's state. Like the shapes, it lives outside React state
  // so a drag or the drawing preview repaints at pointer speed without a
  // re-render per frame. state.sidewalk is a copy for rendering, updated on
  // every action except MOVE_PREVIEW and DRAG_POINT.
  private sidewalkState = initialSidewalkState(null);

  // ── Phones and tablets (contributors, 9 Oct 2026, IMPRINT_contributor_mobile.md) ──
  // The letterbox fit, and the touch zoom and pan on top of it. scaleState is
  // always applyView(fit, view), which is the fit itself at the identity view.
  private fit: Fit | null = null;
  private view: View = IDENTITY_VIEW;
  // "touch" shows four round corner handles, "mouse" the eight square ones.
  // Set by every press on the photo.
  public inputMode: TransformerMode = "mouse";
  // For telemetry, reset when the image changes
  private inputTypesUsed = new Set<string>();
  private maxZoom = 1;
  private loupeShownCount = 0;
  private boxesAddedWithButton = 0;
  // The touch gesture in progress (touchGesture.ts), the fingers on the photo
  // (CSS px from the canvas's corner), and what the press started from
  private touchState = initialTouchState();
  private pointers = new Map<number, Point>();
  /** When a finger or pen last touched the photo, for isMouseFromTouch */
  private lastTouchAt = -Infinity;
  /** The last tap on empty photo in Step 1, for showHiddenOnDoubleTap: { at, x, y } in ms and image px */
  private lastEmptyTap: { at: number; x: number; y: number } | null = null;
  private touchStart: { boxId: string | null; mark: IShapeBase | null; downImage: Point; corner: Corner | null; grab: Point } | null = null;
  private pinchStart: { distance: number; mid: Point; view: View } | null = null;
  private viewAnimation: number | null = null;
  private loupeFrame: number | null = null;
  // True while a mouse resize shows the magnifier, so each drag counts once
  private mouseLoupeShown = false;
  private loupeCanvasRef = React.createRef<HTMLCanvasElement>();
  /** The box's floating panel on the desktop photo, which the magnifier keeps clear of when it can */
  private floatingPanelRef = React.createRef<HTMLDivElement>();
  private sheetAreaRef = React.createRef<HTMLDivElement>();
  private sheetBodyRef = React.createRef<HTMLDivElement>();
  private sheetAreaObserver: ResizeObserver | null = null;
  private sheetPoints: SheetPoints | null = null;
  private lastStage = { width: 0, height: 0 };
  private lastPanelId: string | null = null;
  // The Sidewalk step's touch gesture (sidewalkTouch.ts, 12 Oct 2026), where
  // the finger went down (image px), and the point being dragged: the finger's
  // offset from it, and where it was, to put it back
  private sidewalkTouchState = initialSidewalkTouchState();
  private sidewalkDown: Point = { x: 0, y: 0 };
  private sidewalkDrag: { grab: Point; start: Point } | null = null;
  private sidewalkAiming = false;
  // The full-screen photo, for telemetry, per image
  private focusModeCount = 0;
  private focusModeMs = 0;
  private focusStartMs: number | null = null;

  // Annotators give no severity and answer no scene-level questions (decided
  // 3 Oct 2026). Every role-dependent part of the tool reads these getters.
  private get askSeverity() {
    return !this.props.isAnnotator;
  }

  private get askScene() {
    return !this.props.isAnnotator;
  }

  // The annotator flow (4 Oct 2026): Objects (boxes and categories, Keep or Not
  // an object on every suggestion), then Obstructions (click the obstructing
  // objects, confirm the rest). The name dates from when it was Objects only.
  private get annotatorObjectStep() {
    return this.props.isAnnotator === true;
  }

  private get inObstructionStep() {
    return this.annotatorObjectStep && this.state.annotatorStep === "obstructions";
  }

  private get inSidewalkStep() {
    return this.annotatorObjectStep && this.props.askSidewalk === true && this.state.annotatorStep === "sidewalk";
  }

  private get askSidewalk() {
    return this.annotatorObjectStep && this.props.askSidewalk === true;
  }

  /** Step 1 for either role: boxes can be edited, and hidden from the list. */
  private get inBoxStep() {
    return !this.inSidewalkStep && !this.inObstructionStep;
  }

  /**
   * True for a box hidden on the photo. Only in Step 1: every box shows in the
   * other steps. On a phone or tablet the open box is also the only one shown
   * (focusedBoxId).
   */
  public isBoxHidden = (id: string) => {
    if (!this.inBoxStep) return false;
    if (this.state.hiddenBoxIds.includes(id)) return true;
    const focused = this.focusedBoxId;
    return focused !== null && id !== focused;
  };

  /**
   * Phones and tablets, Step 1, both roles (14 Oct 2026): the open box, a
   * suggestion tapped or a box just added, is the only box on the photo until
   * it closes. Every other box is neither drawn nor tapped meanwhile, so a tap
   * where one was closes the open box. The boxes the annotator hid stay
   * hidden after; this is not stored in hiddenBoxIds.
   */
  private get focusedBoxId(): string | null {
    if (!this.isSheet || !this.inBoxStep || this.selectedId == null) return null;
    const id = this.selectedId;
    return this.shapes.some((shape) => shape.getAnnotationData().id === id) ? id : null;
  }

  /** The step list for this image: Sidewalk only on model-development images. */
  private get annotatorSteps() {
    return annotatorStepsFor({ askSidewalk: this.askSidewalk });
  }

  private get paintVariant(): PaintVariant {
    if (this.inObstructionStep) return "obstructions";
    return "default";
  }

  /**
   * The Sidewalk step shows no object boxes (10 Oct 2026, the adviser's
   * request), so the annotator outlines the walking space without them in the
   * way. They come back in Obstructions.
   */
  private get paintsBoxes() {
    return !this.inSidewalkStep;
  }

  /**
   * On a phone or tablet, for both roles (annotators from 12 Oct 2026): the
   * photo fills the screen and the answers sit in a sheet.
   */
  private get isSheet() {
    return this.props.layout === "sheet";
  }

  /**
   * Touch and pen on the photo, for both roles (annotators from 12 Oct 2026).
   * A finger gets the touch interaction on any layout. The mouse keeps its own
   * handlers and is unchanged.
   */
  private get touchEnabled() {
    return true;
  }

  /** The photo fills the whole screen (phones, the sheet layout). */
  private get inFocus() {
    return this.isSheet && this.props.focus === true;
  }

  /**
   * Whether the words say "tap": on the sheet layout, and on the desktop layout
   * when a finger is the primary pointer (an iPad held sideways). With a mouse
   * or trackpad as the primary pointer the desktop copy is word for word as it
   * was. The same rule as the tours' wording (tourWordsFor).
   */
  private get touchWords() {
    return this.isSheet || this.state.coarsePointer;
  }

  private get words(): "pointer" | "touch" {
    return this.touchWords ? "touch" : "pointer";
  }

  /** Stage px to CSS px. 1 in the sheet layout, where the stage is the photo area itself. */
  private get displayScale() {
    return this.isSheet ? 1 : this.state.canvasScale;
  }

  /**
   * The stage's size in stage px. Every read of it goes through here: the
   * desktop stage is the fixed 960 by 600 from the props, shrunk with a CSS
   * scale. In the sheet layout the stage is the photo area, in CSS px, so
   * labels, handles and every pixel threshold keep their size.
   */
  public stageSize() {
    if (this.isSheet && this.state.sheetStage) return this.state.sheetStage;
    return { width: this.props.width, height: this.props.height };
  }

  /** Add box: in the sheet layout, and on a desktop layout with a touch screen. Contributors' box step only. */
  private get showAddBox() {
    return this.touchEnabled && this.inBoxStep && (this.isSheet || this.state.anyCoarsePointer);
  }

  /** 8 canvas pixels in image pixels, so snapping feels the same on 640 and 1280 pixel images. */
  public get sidewalkTolerance() {
    return 8 / (this.scaleState.scale || 1);
  }

  /**
   * The mouse's reach to the first point to close a shape: 12 CSS px, in image
   * px (14 Oct 2026). It was the 8 stage px tolerance, which the CSS scale of
   * the desktop stage shrank to about 5 px on a laptop, smaller than the dot.
   */
  private sidewalkCloseReach() {
    return cssToImage(SIDEWALK_CLOSE_PX, this.scaleState.scale, this.displayScale);
  }

  /**
   * True when a press at this image point closes the shape being drawn. One
   * test for the click, the enlarged first point under the mouse, and touch,
   * so what the first point promises is what a press does.
   */
  public sidewalkClosesDraft(point: Point, reach = this.sidewalkCloseReach()) {
    const { width, height } = this.imageSize();
    return closesDraft(this.sidewalkState.draft, point, {
      imageWidth: width,
      imageHeight: height,
      tolerance: this.sidewalkTolerance,
      reach,
    });
  }

  public getSidewalkState() {
    return this.sidewalkState;
  }

  /**
   * Runs the sidewalk editor's reducer with the image size and tolerance filled
   * in, then repaints. Pointer-speed actions repaint without a re-render.
   */
  public dispatchSidewalk = (action: { type: string; [key: string]: unknown }) => {
    const { width, height } = this.imageSize();
    const next = sidewalkReducer(this.sidewalkState, {
      imageWidth: width,
      imageHeight: height,
      tolerance: this.sidewalkTolerance,
      ...action,
    });
    if (next === this.sidewalkState) return;
    const prev = this.sidewalkState;
    this.sidewalkState = next;
    const pointerSpeed = action.type === "MOVE_PREVIEW" || action.type === "DRAG_POINT";
    if (!pointerSpeed) this.setState({ sidewalk: next });
    this.onShapeChange({ quiet: pointerSpeed });
    // Save the outline whenever it changes (a shape closed, edited or deleted,
    // No sidewalk ticked), so a refresh mid-step keeps it (6 Oct 2026). A drag
    // changes it point by point, so it is saved once, when the drag ends. A
    // half-drawn shape is not part of the outline and is not saved.
    if (!pointerSpeed && (next.mask !== prev.mask || action.type === "END_DRAG")) {
      this.cacheCurrentImageEdits();
    }
  };

  /** The outline, painted under the boxes in the Sidewalk step and faintly in Obstructions. */
  private paintSidewalkLayer() {
    if (!this.canvas2D || !this.askSidewalk) return;
    const toCanvas = (p: { x: number; y: number }) => {
      const { originX, originY, scale } = this.scaleState;
      return { x: p.x * scale + originX, y: p.y * scale + originY };
    };
    const state = this.sidewalkState;
    if (this.inSidewalkStep) {
      paintSidewalk(this.canvas2D, {
        mode: "edit",
        state,
        toCanvas,
        hideFill: this.state.hideSidewalkFill,
        nearFirstPoint: Boolean(state.preview && this.sidewalkClosesDraft(state.preview)),
        // Finger-sized handles once the photo has been touched
        touch: this.inputMode === "touch",
        displayScale: this.displayScale,
      });
    } else if (this.inObstructionStep && this.state.showSidewalkOverlay) {
      paintSidewalk(this.canvas2D, { mode: "overlay", state, toCanvas });
    }
  }

  private markSceneStepStart = () => {
    if (this.sceneStepStartMs === null) {
      this.sceneStepStartMs = Date.now();
    }
  };

  public componentDidMount = () => {
    const currentCanvas = this.canvasRef.current;
    const currentImageCanvas = this.imageCanvasRef.current;
    let savedAnnotatorStep: AnnotatorStep | undefined;
    if (currentCanvas && currentImageCanvas) {
      this.setCanvasDPI();

      this.canvas2D = currentCanvas.getContext("2d");
      this.imageCanvas2D = currentImageCanvas.getContext("2d");
      this.onImageChange();

      // --- Restore User Caches ---
      const localData = readSessionData();
      if (localData && localData.imgRecords) {
        const currentIndex = this.props.currentAnnotationCount - 1;
        const currentRecord = localData.imgRecords[currentIndex];

        if (currentRecord) {
          if (currentRecord.userSliderValue !== undefined) {
            this.setState({ sliderValue: currentRecord.userSliderValue });
          }
          if (currentRecord.userPavementType !== undefined) {
            this.setState({ pavementType: currentRecord.userPavementType });
          }
          // annotationGet copies a stored sceneLevel into userSceneLevel, and
          // that is null for annotators. Only restore a real answer object, or
          // reads of this.state.sceneLevel.sidewalkWidth would throw.
          const savedScene = currentRecord.userSceneLevel;
          if (savedScene && typeof savedScene === "object") {
            this.setState({ sceneLevel: savedScene });
          }
          savedAnnotatorStep = currentRecord.userAnnotatorStep;
          // The cached or stored sidewalk outline (annotationGet copies a
          // stored one into userSidewalkMask)
          const savedMask = currentRecord.userSidewalkMask;
          if (this.props.askSidewalk && savedMask && typeof savedMask === "object") {
            this.sidewalkState = initialSidewalkState(savedMask);
            this.setState({ sidewalk: this.sidewalkState });
          }
        }
      }
    }

    this.syncAnnotationData();
    // A refresh during Sidewalk or Obstructions comes back to it with the
    // outline and the marks, and with the confirmation unticked. Falls back to
    // an earlier step if that step's check fails.
    if (this.annotatorObjectStep && savedAnnotatorStep === "sidewalk") {
      this.enterSidewalkStep({ restoring: true });
    } else if (this.annotatorObjectStep && savedAnnotatorStep === "obstructions") {
      this.enterObstructionStep({ restoring: true });
    }
    if (typeof window !== "undefined") {
      window.addEventListener("keydown", this.onSidewalkKeyDown);
      // Save a waiting edit when the page is left, reloaded or hidden
      window.addEventListener("pagehide", this.flushEdits);
      document.addEventListener("visibilitychange", this.onVisibilityChange);
      // The tutorial moves the answers sheet before its Step 2 step
      window.addEventListener(SHEET_EVENT, this.onSheetRequest);
      document.addEventListener("scroll", this.onStrayScroll, true);
      // A finger is the primary pointer, so a box selected from a chip shows
      // round corner handles before the photo is ever touched
      if (this.touchEnabled && matches("(pointer: coarse)")) {
        this.setInputMode("touch");
        this.setState({ coarsePointer: true });
      }
      if (this.touchEnabled && matches("(any-pointer: coarse)")) this.setState({ anyCoarsePointer: true });
      if (this.inFocus) this.focusStartMs = Date.now();
    }
    this.syncSelectedId();
    this.setupCanvasScaling();
    this.observeSheetArea();
    this.lastStage = this.stageSize();
    this.editsRestored = true;
  };

  public componentDidUpdate = (preProps: IReactPictureAnnotationProps, prevState: this["state"]) => {
    const { image } = this.props;
    if (prevState) this.timeMessage(prevState);
    // Contributors' Step 2 answers are saved as they change, like the boxes
    if (prevState && prevState.sceneLevel !== this.state.sceneLevel) this.scheduleEditSave();
    // A switch between the desktop and sheet layouts (an iPad rotated) builds
    // new canvases in a new place. Every box, answer and the selection are
    // instance fields and state, so they carry over. Only the stage changes.
    const layoutChanged = preProps.layout !== this.props.layout;
    if (layoutChanged) {
      this.canvas2D = this.canvasRef.current?.getContext("2d");
      this.imageCanvas2D = this.imageCanvasRef.current?.getContext("2d");
      this.currentTransformer = null;
      this.resizeObserver?.disconnect();
      this.setupCanvasScaling();
      this.observeSheetArea();
    }
    const stage = this.stageSize();
    if (layoutChanged || stage.width !== this.lastStage.width || stage.height !== this.lastStage.height) {
      this.onStageResize(this.lastStage);
      this.lastStage = stage;
    }
    if (preProps.image !== image) {
      this.mountTime = Date.now();
      this.sceneStepStartMs = null;
      this.obstructionStepStartMs = null;
      this.sidewalkStepStartMs = null;
      this.inputTypesUsed = new Set();
      this.maxZoom = 1;
      this.loupeShownCount = 0;
      this.boxesAddedWithButton = 0;
      this.focusModeCount = this.inFocus ? 1 : 0;
      this.focusModeMs = 0;
      this.focusStartMs = this.inFocus ? Date.now() : null;
      this.cleanImage();
      if (this.currentImageElement) {
        this.currentImageElement.src = image;
      } else {
        this.onImageChange();
      }
    }

    // this.syncAnnotationData();
    this.syncSelectedId();
    // Touch handles are sized in CSS px, so they follow the desktop stage's CSS scale
    if (prevState && prevState.canvasScale !== this.state.canvasScale && this.inputMode === "touch") {
      this.currentTransformer = null;
      this.onShapeChange({ quiet: true });
    }
    if (preProps.focus !== this.props.focus || layoutChanged) this.onFocusChange(preProps.focus === true && preProps.layout === "sheet");
    if (this.isSheet) this.followPanel();
    else this.keepPanelOnPhoto();
  };

  /**
   * The desktop photo's floating panel, kept inside the photo once it has
   * rendered (16 Oct 2026). panelPosition keeps PANEL_ROOM_BELOW px for it,
   * but a panel can be taller (fitPanelTop), and the photo's frame clips what
   * runs past its bottom: on a box low on the photo the panel's foot, with Not
   * an object, was cut off. Moves it up just enough, and only when needed, so
   * a panel that fits is where it always was.
   */
  private keepPanelOnPhoto() {
    const element = this.floatingPanelRef.current;
    if (!element || !this.state.showInput) return;
    const position = this.state.inputPosition;
    const top = position.top ?? 0;
    const fitted = fitPanelTop(top, element.offsetHeight, this.stageSize().height);
    if (fitted !== top) this.setState({ inputPosition: { ...position, top: fitted } });
  }

  /**
   * Entering or leaving the full-screen photo (phones, 12 Oct 2026). The tool
   * stays mounted, so the selection, the zoom and every edit carry over. On
   * leaving, a selected box's panel opens in the sheet with the box kept in
   * view, otherwise the sheet comes back collapsed. Counts the entries and the
   * time for telemetry.
   */
  private onFocusChange(wasInFocus: boolean) {
    const now = this.inFocus;
    if (now === wasInFocus) return;
    if (now) {
      this.focusModeCount += 1;
      this.focusStartMs = Date.now();
      // The photo first: the sheet goes down to its handle, also with a box
      // open (Details on the photo pulls its panel up)
      this.lastPanelId = this.state.showInput ? this.selectedId : null;
      this.setState({ sheetSnap: "collapsed" }, () => this.relaxView());
      return;
    }
    if (this.focusStartMs !== null) this.focusModeMs += Date.now() - this.focusStartMs;
    this.focusStartMs = null;
    if (!this.isSheet) return;
    const openId = this.state.showInput ? this.selectedId : null;
    this.lastPanelId = openId;
    this.setState({ sheetSnap: openId ? "panel" : "collapsed" }, () => {
      if (openId) this.keepSelectedInView();
      else this.relaxView();
    });
  }

  public componentWillUnmount = () => {
    if (this.messageTimer) clearTimeout(this.messageTimer);
    this.resizeObserver?.disconnect();
    this.sheetAreaObserver?.disconnect();
    this.cancelViewAnimation();
    if (this.loupeFrame !== null && typeof cancelAnimationFrame !== "undefined") cancelAnimationFrame(this.loupeFrame);
    this.editSaver.flush();
    if (typeof window !== "undefined") {
      window.removeEventListener("keydown", this.onSidewalkKeyDown);
      window.removeEventListener("pagehide", this.flushEdits);
      document.removeEventListener("visibilitychange", this.onVisibilityChange);
      window.removeEventListener(SHEET_EVENT, this.onSheetRequest);
      document.removeEventListener("scroll", this.onStrayScroll, true);
    }
  };

  /**
   * Keyboard shortcuts in the Sidewalk step only, and never while typing in a
   * field: Enter closes the shape, Escape cancels it or clears the selection,
   * Backspace removes the last point drawn or the selected point, Delete
   * removes the selected point or shape.
   */
  private onSidewalkKeyDown = (event: KeyboardEvent) => {
    if (!this.inSidewalkStep) return;
    const target = event.target as HTMLElement | null;
    const tag = target?.tagName;
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || target?.isContentEditable) return;

    // Which key does what is decided in sidewalkTools.js, with the tools' tooltips
    const type = sidewalkKeyAction(event.key, this.sidewalkState);
    const action = type ? { type } : null;
    if (!action) return;
    event.preventDefault();
    this.dispatchSidewalk(action);
  };

  private setupCanvasScaling = () => {
    const el = this.canvasWrapperRef.current;
    if (!el) return;
    this.resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const available = entry.contentRect.width;
      const scale = Math.min(1, available / this.props.width);
      if (Math.abs(scale - this.state.canvasScale) > 0.001) {
        this.setState({ canvasScale: scale });
      }
    });
    this.resizeObserver.observe(el);
  };

  public calculateMousePosition = (positionX: number, positionY: number) => {
    const { originX, originY, scale } = this.scaleState;
    return {
      positionX: (positionX - originX) / scale,
      positionY: (positionY - originY) / scale,
    };
  };

  public calculateShapePosition = (shapeData: IShapeBase): IShapeBase => {
    const { originX, originY, scale } = this.scaleState;
    const { x, y, width, height } = shapeData;
    return {
      x: x * scale + originX,
      y: y * scale + originY,
      width: width * scale,
      height: height * scale,
    };
  };

  public render() {
    const { inputElement } = this.props;
    // The stage: 960 by 600 on the desktop, the photo area on a phone (stageSize)
    const { width, height } = this.stageSize();
    const {
      showInput,
      inputPosition,
      inputComment,
      editable,
      selected,
      isRejected,
      obstructs,
      severity,
    } = this.state;

    // The lists show the boxes in order of appearance: suggestions in the
    // model's order, then drawn boxes in the order drawn (8 Oct 2026). A copy,
    // so the array the canvas and the submit handler read is never reordered.
    const sortedAnnotations = orderOfAppearance(this.currentAnnotationData);

    // The same numbering as the labels drawn on the photo
    const displayLabels = buildDisplayLabelsInOrder(sortedAnnotations);

    const canvasScale = this.displayScale;
    const { askScene, askSeverity, annotatorObjectStep, inObstructionStep, inSidewalkStep } = this;
    const steps = this.annotatorSteps;
    // Contributors' canvas takes touch and pen (9 Oct 2026). Annotators' does not.
    const touch = this.touchEnabled;

    // The box panel: beside the box on the desktop photo, in the answers sheet on a phone
    const panel = (variant: PanelVariant) => annotatorObjectStep ? (
      <ObjectInputSection
        key={this.selectedId || ""}
        value={inputComment}
        mode={getObjectPanelMode({ editable, selected, comment: inputComment })}
        onChange={this.onInputCommentChange}
        onKeep={this.onKeep}
        onMarkNotAnObject={this.onMarkNotAnObject}
        onDelete={this.onDelete}
        onClose={this.onClose}
        belowMinimumSize={this.selectedBelowMinimumSize()}
        // In the sheet the eye is on the line with the box's name instead (21 Oct 2026)
        onHide={this.inBoxStep && variant !== "sheet" ? this.hideOpenBox : undefined}
        variant={variant}
      />
    ) : inputElement(
      inputComment,
      this.onInputCommentChange,
      this.onDelete,
      this.onSelectObstruction,
      this.onUnselectObstruction,
      editable,
      selected,
      isRejected,
      this.selectedId || "",
      this.onSetSeverity,
      this.onSetObstructs,
      obstructs,
      severity,
      this.onMarkNotAnObject,
      askSeverity,
      this.onClose,
      this.onClearObstruction,
      this.onRestoreObject,
      this.state.originalComment,
      variant,
      this.inBoxStep && variant !== "sheet" ? this.hideOpenBox : undefined,
    );

    // The canvas, the same in every layout
    const canvasArea = (
      <div ref={this.canvasWrapperRef} className="w-full overflow-hidden">
        <div className="relative" style={{
          width: width * canvasScale,
          height: height * canvasScale,
          margin: '0 auto',
        }}>
          <div className={`rp-stage relative${touch ? " select-none [-webkit-touch-callout:none]" : ""}`} style={{
            width, height,
            transform: `scale(${canvasScale})`,
            transformOrigin: 'top left',
          }}>
            <canvas
              style={{ width, height }}
              className="rp-image"
              ref={this.imageCanvasRef}
              width={width * 2}
              height={height * 2}
            />
            <canvas
              className={touch ? "rp-shapes touch-none" : "rp-shapes"}
              style={{ width, height }}
              ref={this.canvasRef}
              width={width * 2}
              height={height * 2}
              onMouseDown={this.onMouseDown}
              onMouseMove={this.onMouseMove}
              onMouseUp={this.onMouseUp}
              onMouseLeave={this.onMouseLeave}
              onPointerDown={this.onPointerDown}
              onPointerMove={this.onPointerMove}
              onPointerUp={this.onPointerUp}
              onPointerCancel={this.onPointerCancel}
              onContextMenu={touch ? this.preventContextMenu : undefined}
            />
            {showInput && !this.isSheet && (
              <div
                ref={this.floatingPanelRef}
                className={touch ? "rp-selected-input select-text" : "rp-selected-input"}
                style={inputPosition}
                onMouseDown={(e) => e.stopPropagation()}
                onMouseUp={(e) => e.stopPropagation()}
                onMouseMove={(e) => e.stopPropagation()}
              >
                {panel("floating")}
              </div>
            )}
          </div>
          {this.renderLoupe()}
          {touch && this.renderPhotoOverlays()}
        </div>
      </div>
    );
    // Contributors get the one-card layout with their answers under the photo (7 Oct 2026). Annotator steps keep theirs.
    const contributorLayout = !annotatorObjectStep;
    // Contributors on a phone or tablet: the photo fills the screen and the
    // answers sit in a bottom sheet (9 Oct 2026)
    if (this.isSheet) return this.renderSheetLayout(canvasArea, panel, sortedAnnotations, displayLabels);

    return (
      <Container as="section" width="wide" className="annotation-container">
        <div className="flex flex-row gap-6">

          {/* ── Left: Step 1 (65%, or the full width when there is no Step 2) ── */}
          <div style={{ flex: '65 1 0%' }} className="min-w-0">
            {contributorLayout ? (
              // Contributors (7 Oct 2026): the heading, the photo and the answers
              // sit in one card, so Step 1 reads as one unit (Step1Card, shared
              // with the landing page's preview)
              <Step1Card
                className="mb-6"
                photo={
                  <>
                    {canvasArea}
                    <PhotoCredit photo={this.props.photoSource} className="px-1 pt-1.5" />
                  </>
                }
                answers={
                  <ObjectTrays
                    trays={buildTrays(sortedAnnotations, { labels: displayLabels })}
                    selectedId={showInput ? this.selectedId : null}
                    hiddenIds={this.state.hiddenBoxIds}
                    onOpen={this.openTrayItem}
                    onToggleHidden={this.toggleBoxHidden}
                    onShowAll={this.showAllBoxes}
                    onHideAll={this.hideAllBoxes}
                    tourIds={this.state.anyCoarsePointer}
                  />
                }
              />
            ) : (
              <>
                <div className="mb-3">
                  {inObstructionStep ? (
                    <>
                      <H2 className="text-lg font-bold text-ink mb-1">{annotatorStepHeading("obstructions", steps)}</H2>
                      <P className="text-body text-sm">{annotatorStepParagraph("obstructions", this.words)}</P>
                    </>
                  ) : inSidewalkStep ? (
                    <>
                      <H2 className="text-lg font-bold text-ink mb-1">{annotatorStepHeading("sidewalk", steps)}</H2>
                      <P className="text-body text-sm">{annotatorStepParagraph("sidewalk", this.words)}</P>
                    </>
                  ) : (
                    <>
                      <H2 className="text-lg font-bold text-ink mb-1">{annotatorStepHeading("objects", steps)}</H2>
                      <P className="text-body text-sm">{annotatorStepParagraph("objects", this.words)}</P>
                    </>
                  )}
                </div>

                <div className="flex flex-col gap-4 mb-6">
                  <div className="w-full bg-surface-subtle rounded-card border border-line shadow-sm p-2">
                    {/* The drawing tools are part of the photo's card (13 Oct 2026), so
                        the three steps share one layout: heading, photo, list */}
                    {inSidewalkStep && this.renderSidewalkToolbar()}
                    {canvasArea}
                    <PhotoCredit photo={this.props.photoSource} className="px-1 pt-1.5" />
                    {/* Sidewalk messages, under the photo where the outline is drawn */}
                    {inSidewalkStep && this.state.sidewalk.message && (
                      <p role="status" className="text-xs text-muted px-1 pt-2">{this.state.sidewalk.message}</p>
                    )}
                  </div>
                  {inSidewalkStep ? this.renderSidewalkShapesCard() : inObstructionStep ? this.renderObstructionsCard(displayLabels) : this.renderObjectsCard(sortedAnnotations, displayLabels)}
                </div>
              </>
            )}
          </div>

          {/* ── Right: Step 2 (35%) for contributors, the "What to Box" list for annotators ── */}
          {askScene ? (
          <div style={{ flex: '35 1 0%' }} className="min-w-0 overflow-y-auto">
            {this.renderSceneQuestions("desktop")}
          </div>
          ) : inSidewalkStep ? this.renderSidewalkGuide() : inObstructionStep ? this.renderObstructionGuide() : this.renderTaxonomyGuide()}

        </div>{/* end flex row */}

        {/* The message (showMessage). Always in the page, so it can arrive and
            leave the same way (21 Oct 2026): it fades in as its space opens, and
            out as its space closes, so Next Image glides instead of jumping. */}
        {this.renderDesktopMessage()}

        <div className="flex justify-center my-10 gap-4">
          {this.renderActions("desktop")}
        </div>
      </Container>
    );
  }

  /**
   * The buttons under the image: back (Previous, or back a step for
   * annotators) and the submit button, which the tutorial points at in every
   * step. One copy for both layouts. In the sheet layout (contributors on a
   * phone) they sit in the sheet's footer, the submit button full width.
   */
  private renderActions(variant: "desktop" | "sheet") {
    const { annotatorObjectStep, inObstructionStep, inSidewalkStep, askSidewalk } = this;
    const finishLabel = this.props.totalAnnotationCount && this.props.currentAnnotationCount >= this.props.totalAnnotationCount
      ? "Finish Session"
      : "Next Image";
    // An annotator image with no objects left has nothing to judge, so the
    // Objects step submits straight away
    const hasRealObjects = realObjects(this.currentAnnotationData).length > 0;

    if (variant === "sheet") {
      // The same step logic as the desktop buttons below, with shorter labels
      // so two fit on a 360 px screen (annotators from 12 Oct 2026)
      const back = inObstructionStep && askSidewalk
        ? { label: "Back", name: "Back to Sidewalk", onClick: this.backToSidewalk }
        : inObstructionStep || inSidewalkStep
          ? { label: "Back", name: "Back to Objects", onClick: this.backToObjects }
          : this.props.currentAnnotationCount > 1
            ? { label: "Previous", name: undefined, onClick: this.onPrevious }
            : null;
      const next = inSidewalkStep
        ? { label: hasRealObjects ? "Next: Obstructions" : finishLabel, onClick: this.onSidewalkNext }
        : annotatorObjectStep && !inObstructionStep
          ? { label: askSidewalk ? "Next: Sidewalk" : hasRealObjects ? "Next: Obstructions" : finishLabel, onClick: this.onObjectsNext }
          : { label: finishLabel, onClick: this.submit };
      return (
        <div className="flex gap-2">
          {back && (
            <Button variant="neutral" aria-label={back.name} onClick={back.onClick}>
              {back.label}
            </Button>
          )}
          <Button submit fullWidth onClick={next.onClick} disabled={this.state.submitting} className="whitespace-nowrap">
            {this.state.submitting ? "Saving..." : next.label}
          </Button>
        </div>
      );
    }

    return (
      <>
        {inObstructionStep && askSidewalk ? (
          <Button variant="neutral" onClick={this.backToSidewalk}>
            Back to Sidewalk
          </Button>
        ) : inObstructionStep || inSidewalkStep ? (
          <Button variant="neutral" onClick={this.backToObjects}>
            Back to Objects
          </Button>
        ) : this.props.currentAnnotationCount > 1 && (
          <Button variant="neutral" onClick={this.onPrevious}>
            Previous
          </Button>
        )}

        {/* Stays the submit button in every step, the tutorial's target */}
        {inSidewalkStep ? (
          <Button submit onClick={this.onSidewalkNext} disabled={this.state.submitting} className="whitespace-nowrap">
            {this.state.submitting ? "Saving..." : hasRealObjects ? "Next: Obstructions" : finishLabel}
          </Button>
        ) : annotatorObjectStep && !inObstructionStep ? (
          <Button submit onClick={this.onObjectsNext} disabled={this.state.submitting} className="whitespace-nowrap">
            {this.state.submitting ? "Saving..." : askSidewalk ? "Next: Sidewalk" : hasRealObjects ? "Next: Obstructions" : finishLabel}
          </Button>
        ) : (
          <Button submit onClick={this.submit} disabled={this.state.submitting} className="whitespace-nowrap">
            {this.state.submitting ? "Saving..." : finishLabel}
          </Button>
        )}
      </>
    );
  }

  /**
   * Contributors' Step 2, the four questions about the sidewalk (SceneQuestions,
   * shared with the landing page's preview). The first answer starts the
   * Step 2 timer.
   */
  private renderSceneQuestions(variant: "desktop" | "sheet") {
    return <SceneQuestions sceneLevel={this.state.sceneLevel} variant={variant} onAnswer={this.onSceneAnswer} />;
  }

  private onSceneAnswer = (updates: Partial<SceneLevel>) => {
    this.markSceneStepStart();
    this.setState({
      sceneLevel: { ...this.state.sceneLevel, ...updates },
    });
  };

  // ── Phones and tablets (contributors, 9 Oct 2026, IMPRINT_contributor_mobile.md) ──

  /**
   * The sheet layout: the photo area from the top bar down to the top of the
   * collapsed sheet, and the answers sheet over the rest. Expanding the sheet
   * covers the bottom of the photo, as in Grab: the photo area never resizes
   * during a drag, so the canvas is not rebuilt.
   */
  private renderSheetLayout(
    canvasArea: React.ReactElement,
    panel: (variant: PanelVariant) => React.ReactElement,
    sortedAnnotations: IAnnotation[],
    displayLabels: Map<string, string>,
  ) {
    const { showInput, sheetSnap, sheetCollapsed } = this.state;

    const open = showInput ? this.selectedShape()?.getAnnotationData() : null;
    const openLabel = open
      ? displayLabels.get(open.id) ?? formatLabel(open.comment) ?? TRAY_COPY.fallbackLabel
      : "";
    const annotator = this.annotatorObjectStep;

    // A box open: the handle and its name, so the answers come back as soon as it closes
    let header: React.ReactNode;
    let body: React.ReactNode;
    if (showInput) {
      header = this.renderSheetPanelTitle(openLabel || TRAY_COPY.fallbackLabel, "h-11 px-4");
      body = <div className="px-3 pt-1 pb-4">{panel("sheet")}</div>;
    } else if (annotator) {
      header = this.renderAnnotatorSheetHeader(sortedAnnotations, displayLabels);
      body = (
        <>
          {this.renderAnnotatorSheetBody(sortedAnnotations, displayLabels)}
          <PhotoCredit photo={this.props.photoSource} className="px-4 pt-1 pb-4" />
        </>
      );
    } else {
      const trays = buildTrays(sortedAnnotations, { labels: displayLabels });
      header = (
        <ObjectTraysPeek
          trays={trays}
          peek={this.contributorPeek(sortedAnnotations, displayLabels)}
          selectedId={null}
          onOpen={this.openTrayItem}
          onNext={this.openNextToDecide}
          sceneLine={sceneProgressLine(this.state.sceneLevel)}
          onShowScene={this.showSceneSection}
          hiddenIds={this.state.hiddenBoxIds}
          onShowAll={this.showAllBoxes}
          onHideAll={this.hideAllBoxes}
        />
      );
      // Show all and Hide all are at the top of the sheet (14 Oct 2026). In
      // full screen that top is not shown, so the lists keep their own.
      const listVisibility = this.inFocus ? { onShowAll: this.showAllBoxes, onHideAll: this.hideAllBoxes } : {};
      body = (
        <>
          <ObjectTrays
            trays={trays}
            selectedId={null}
            hiddenIds={this.state.hiddenBoxIds}
            onOpen={this.openTrayItem}
            onToggleHidden={this.toggleBoxHidden}
            {...listVisibility}
            stacked
          />
          {this.renderSceneQuestions("sheet")}
          <PhotoCredit photo={this.props.photoSource} className="px-4 pt-1 pb-4" />
        </>
      );
    }

    // The message is not in the footer (21 Oct 2026): it floats over the top
    // of the photo (renderSheetMessage), so the sheet never changes height for it
    const footer = this.renderActions("sheet");

    // The full-screen photo (12 Oct 2026): no top bar, and the sheet at rest
    // is its handle alone, so the photo has the screen either way up. Pulled
    // up (the handle, or Details and Answers on the photo) it is the same
    // sheet across the whole width, with everything inside the part that
    // scrolls: a phone held sideways is about 390 px tall, too short to keep
    // the top of the sheet in view as well. The same elements in the same
    // places as outside full screen, so nothing is rebuilt on the way in or out.
    const focus = this.inFocus;
    if (focus) {
      body = showInput ? (
        <>
          {this.renderSheetPanelTitle(openLabel || TRAY_COPY.fallbackLabel, "h-11 px-4 mt-1")}
          {body}
        </>
      ) : annotator ? (
        <div className="pt-3">{header}{body}</div>
      ) : (
        // A contributor's lists and Step 2. The short summary the sheet shows
        // at rest outside full screen would only say the lists twice.
        <div className="pt-1">{body}</div>
      );
      header = null;
    }

    return (
      <div className="relative flex-1 min-h-0" data-layout="sheet" data-focus={focus ? "true" : undefined} data-no-scroll>
        <div ref={this.sheetAreaRef} data-no-scroll className="absolute inset-x-0 top-0 overflow-hidden" style={{ ...NO_SCROLL_STYLE, bottom: sheetCollapsed }}>
          {canvasArea}
          {this.renderSheetMessage(focus)}
        </div>
        <BottomSheet
          id="answer-sheet"
          compact={focus}
          snap={sheetSnap}
          onSnapChange={this.onSheetSnapChange}
          header={header}
          footer={footer}
          onPointsChange={this.onSheetPoints}
          bodyRef={this.sheetBodyRef}
        >
          <div onFocusCapture={this.onSheetFocus}>{body}</div>
        </BottomSheet>
      </div>
    );
  }

  /**
   * The line above an open box's panel in the sheet: its name, and Hide on
   * photo at the other end (21 Oct 2026, both roles). The eye used to sit in
   * the panel's first row, beside the check that closes the panel, and a tap
   * meant for the check hid the box, which looked as if it had not been added.
   * Here it is apart from every answer and says what it does. Box step only.
   */
  private renderSheetPanelTitle(label: string, className: string) {
    return (
      <div className={`${className} flex items-center justify-between gap-3`}>
        <span className="text-sm font-semibold text-ink truncate">{label}</span>
        {this.inBoxStep && (
          <button
            type="button"
            onClick={this.hideOpenBox}
            title={BOX_VISIBILITY_COPY.hideOpen}
            className="shrink-0 -mr-2 h-11 px-2 inline-flex items-center gap-1.5 rounded-control text-xs font-semibold text-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            <EyeOffIcon size={16} />
            {BOX_VISIBILITY_COPY.hideShort}
          </button>
        )}
      </div>
    );
  }

  /**
   * Annotators on a phone or tablet (12 Oct 2026): the top of the answers
   * sheet for the step, always in view. The step heading, then what the step
   * needs at hand: Objects, what is left to decide with Next and every object
   * as a chip. Sidewalk, the drawing tools and a one-line hint. Obstructions,
   * the objects as chips that toggle, and the confirmation. Every row has a
   * fixed height, so the photo area does not resize as the content changes.
   */
  private renderAnnotatorSheetHeader(sortedAnnotations: IAnnotation[], displayLabels: Map<string, string>) {
    const steps = this.annotatorSteps;
    const labelOf = (box: IAnnotation) => displayLabels.get(box.id) ?? formatLabel(box.comment) ?? TRAY_COPY.fallbackLabel;
    const heading = (key: AnnotatorStep) => (
      <p className="h-5 text-xs font-bold text-muted truncate">{annotatorStepHeading(key, steps)}</p>
    );
    const chipRow = "h-11 flex items-center gap-2 overflow-x-auto overscroll-x-contain";

    if (this.inSidewalkStep) {
      const { sidewalk } = this.state;
      const count = sidewalk.mask.polygons.length;
      const line = sidewalk.message
        || sidewalkSheetHint({ drawing: Boolean(sidewalk.draft), shapeSelected: Boolean(sidewalk.selectedId) });
      return (
        <div className="px-4 pb-2">
          <div className="h-5 flex items-center justify-between gap-3">
            <p className="text-xs font-bold text-muted truncate">{annotatorStepHeading("sidewalk", steps)}</p>
            <span className="text-xs text-muted whitespace-nowrap">
              {count === 0 ? "No shapes yet" : count === 1 ? "1 shape" : `${count} shapes`}
            </span>
          </div>
          {this.renderSidewalkToolbar("sheet")}
          {/* Two lines at a fixed height: the longest hint does not fit one line on a phone */}
          <p role="status" className="mt-1 h-8 text-xs leading-4 text-muted line-clamp-2">{line}</p>
        </div>
      );
    }

    if (this.inObstructionStep) {
      const objects = realObjects(this.currentAnnotationData);
      const { marked } = summarizeObstructionStep(this.currentAnnotationData);
      return (
        <div id="box-review-section-peek" className="px-4 pb-2">
          {heading("obstructions")}
          <p className="h-6 text-sm font-semibold text-ink">Marked {marked} of {objects.length}</p>
          <ul aria-label="Objects" className={chipRow}>
            {orderOfAppearance(objects).map((box) => {
              const isMarked = box.obstructs === true;
              return (
                <li key={box.id} className="shrink-0">
                  <button
                    type="button"
                    aria-pressed={isMarked}
                    onClick={() => this.toggleObstruction(box.id)}
                    className={`h-10 px-3 text-xs font-semibold rounded-control border whitespace-nowrap transition-colors ${isMarked
                      ? "bg-red-600 border-red-600 text-white"
                      : "bg-surface border-line text-ink"
                      }`}
                  >
                    {labelOf(box)}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="min-h-[44px] flex items-center">
            <Checkbox
              id="obstructions-confirmed"
              checked={this.state.obstructionsConfirmed}
              onChange={(e) => this.setState({ obstructionsConfirmed: e.target.checked })}
              label="I checked every object. The ones I did not mark do not obstruct the sidewalk for me."
            />
          </div>
        </div>
      );
    }

    // What is left (17 Oct 2026): the suggestions still to decide and the boxes
    // with no category, in the chips' order, so Next opens the first chip
    const left = unfinishedObjectIds(this.currentAnnotationData);
    const chips = toDecideFirst(sortedAnnotations, left);
    const nextId = chips.length > 0 && left.includes(chips[0].id) ? chips[0].id : null;
    // Show all and Hide all beside the step's name (14 Oct 2026), so a hidden
    // box is a tap away without pulling the sheet up
    const hiddenCount = sortedAnnotations.filter((box) => this.state.hiddenBoxIds.includes(box.id)).length;
    return (
      <div id="box-review-section-peek" className="px-4 pb-2">
        <SheetStepHeading
          heading={annotatorStepHeading("objects", steps)}
          hiddenCount={hiddenCount}
          boxCount={sortedAnnotations.length}
          onShowAll={this.showAllBoxes}
          onHideAll={this.hideAllBoxes}
        />
        <div className="h-11 flex items-center justify-between gap-3">
          {nextId ? (
            <>
              <span className="text-sm font-semibold text-ink">
                To decide <span className="font-medium text-muted tabular-nums">{left.length}</span>
              </span>
              <SheetNextButton onPress={() => this.selectBoxById(nextId)} />
            </>
          ) : (
            <span className="text-sm font-semibold text-success">Every box is decided.</span>
          )}
        </div>
        {/* What is left first, so none is out of sight along the row: the suggestions
            still to decide (14 Oct 2026) and boxes with no category (17 Oct 2026) */}
        <ul aria-label="Objects in this image" className={chipRow}>
          {chips.map((box) => {
            const tag = this.objectTag(box);
            return (
              <li key={box.id} className="shrink-0">
                <button
                  type="button"
                  onClick={() => this.selectBoxById(box.id)}
                  className="h-10 px-2.5 inline-flex items-center gap-1.5 rounded-control border border-line bg-surface whitespace-nowrap"
                >
                  {box.editable && <DrawnMark />}
                  <span className="text-xs font-semibold text-ink">{labelOf(box)}</span>
                  {box.editable && <span className="sr-only">, {TRAY_COPY.drawnTitle.toLowerCase()}</span>}
                  {tag && <span className={`text-xs font-bold rounded-control px-1 ${tag.className}`}>{tag.text}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  /** Annotators: the part of the sheet pulled up. The step's instructions, then its cards. */
  private renderAnnotatorSheetBody(sortedAnnotations: IAnnotation[], displayLabels: Map<string, string>) {
    const step: AnnotatorStep = this.inSidewalkStep ? "sidewalk" : this.inObstructionStep ? "obstructions" : "objects";
    return (
      <div className="px-4 pt-3 pb-6 space-y-4">
        <P className="text-body text-sm">{annotatorStepParagraph(step, "touch")}</P>
        {step === "sidewalk" ? (
          <>
            {this.renderSidewalkShapesCard("sheet")}
            {this.renderSidewalkGuide("sheet")}
          </>
        ) : step === "obstructions" ? (
          <>
            {this.renderObstructionsCard(displayLabels, "sheet")}
            {this.renderObstructionGuide("sheet")}
          </>
        ) : (
          <>
            {this.renderObjectsCard(sortedAnnotations, displayLabels, "sheet")}
            {this.renderTaxonomyGuide("sheet")}
          </>
        )}
      </div>
    );
  }

  /**
   * The magnifier, over the photo while a box's corner or edge is dragged:
   * with a finger (corners) or the mouse (any of the eight handles), so it is
   * the same on every device (10 Oct 2026). From 15 Oct 2026 it sits outside
   * the box (showLoupe, loupePlacement). Never takes a press.
   */
  private renderLoupe() {
    const { loupe } = this.state;
    return (
      <canvas
        ref={this.loupeCanvasRef}
        aria-hidden="true"
        width={LOUPE_SIZE_PX * 2}
        height={LOUPE_SIZE_PX * 2}
        className="pointer-events-none absolute z-20 rounded-full shadow-[0_6px_20px_rgba(15,23,42,0.35)]"
        style={{
          width: LOUPE_SIZE_PX,
          height: LOUPE_SIZE_PX,
          left: loupe?.left ?? 0,
          top: loupe?.top ?? 0,
          display: loupe ? "block" : "none",
        }}
      />
    );
  }

  /**
   * Over the photo: Add box (bottom left, the box step), the full-screen
   * button on phones or Exit in full screen (bottom right), Fit while zoomed
   * (top right), the Add box hint (top centre), and in full screen a status
   * chip (top left). In full screen every position keeps clear of the notch
   * and the home indicator.
   */
  private renderPhotoOverlays() {
    const { zoomed, addBoxHintId, showInput } = this.state;
    const showHint = addBoxHintId !== null && addBoxHintId === this.selectedId && showInput;
    const focus = this.inFocus;
    // The sheet's handle is under the photo and keeps clear of the home indicator itself
    const edge = (side: "left" | "right" | "top" | "bottom") => (focus && side !== "bottom" ? `max(12px, env(safe-area-inset-${side}))` : 12);
    const floating = "absolute z-10 h-11 inline-flex items-center justify-center rounded-full bg-surface text-ink text-sm font-bold border border-line shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50";
    return (
      <>
        {this.showAddBox && (
          <button
            type="button"
            id="add-box-button"
            onClick={this.addBoxFromButton}
            className={`${floating} gap-1.5 pl-3 pr-4`}
            style={{ left: edge("left"), bottom: edge("bottom") }}
          >
            <svg aria-hidden="true" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            {ADD_BOX_COPY.button}
          </button>
        )}
        {/* Phones and tablets: AnnotateForm passes the callbacks there. They always have the sheet layout. */}
        {this.isSheet && !focus && this.props.onEnterFocus && (
          <button
            type="button"
            id="full-screen-button"
            aria-label={FOCUS_COPY.enter}
            title={FOCUS_COPY.enter}
            onClick={this.props.onEnterFocus}
            className={`${floating} w-11`}
            style={{ right: edge("right"), bottom: edge("bottom") }}
          >
            <ExpandIcon size={20} />
          </button>
        )}
        {focus && this.props.onExitFocus && (
          <button
            type="button"
            id="exit-full-screen-button"
            aria-label={FOCUS_COPY.exit}
            title={FOCUS_COPY.exit}
            onClick={this.props.onExitFocus}
            className={`${floating} w-11`}
            style={{ right: edge("right"), bottom: edge("bottom") }}
          >
            <ShrinkIcon size={20} />
          </button>
        )}
        {zoomed && (
          <button
            type="button"
            onClick={this.resetView}
            className={`${floating} min-w-[44px] px-4`}
            style={{ right: edge("right"), top: edge("top") }}
          >
            {ADD_BOX_COPY.fit}
          </button>
        )}
        {showHint && (
          <p
            role="status"
            className="pointer-events-none absolute left-1/2 -translate-x-1/2 z-10 px-3 py-2 rounded-full bg-ink/80 text-white text-xs font-semibold whitespace-nowrap"
            style={{ top: edge("top") }}
          >
            {ADD_BOX_COPY.hint}
          </p>
        )}
        {focus && (
          <div className="absolute z-10 max-w-[calc(100%-7rem)]" style={{ left: edge("left"), top: edge("top") }}>
            {this.renderFocusChip()}
          </div>
        )}
      </>
    );
  }

  /**
   * The full-screen photo's status chip, top left. It says where things
   * stand, and its button pulls the answers sheet up from the bottom (later on
   * 12 Oct 2026: before, Details left full screen, and nothing could be
   * answered in it). A selected box's name, with Delete for a box the person drew and
   * Details. With nothing selected, how many objects are left to decide and
   * Answers. In the Sidewalk step the drawing tools, and in Obstructions how
   * many objects are marked.
   */
  private renderFocusChip() {
    const chip = "inline-flex items-center gap-1 rounded-full bg-surface text-ink text-sm font-semibold border border-line shadow-md";
    // Pulls the answers sheet up. Gone while it is up.
    const sheetUp = this.state.sheetSnap !== "collapsed";
    const openButton = (label: string) =>
      sheetUp ? null : (
        <button type="button" data-open-sheet onClick={this.pullSheetUp} className="shrink-0 h-9 px-3 rounded-full bg-primary text-white text-xs font-bold">
          {label}
        </button>
      );
    const withButton = sheetUp ? "px-3" : "pl-3 pr-1";

    if (this.inSidewalkStep) {
      // Pulled up, the sheet has the drawing tools and the message at its top
      if (sheetUp) return null;
      const { message } = this.state.sidewalk;
      return (
        <div className="flex flex-col items-start gap-1">
          <div className="flex items-center gap-1 rounded-control bg-surface border border-line shadow-md p-1">
            {this.renderSidewalkToolbar("compact")}
            {openButton(FOCUS_COPY.details)}
          </div>
          {message && <p role="status" className="px-3 py-1 rounded-control bg-surface border border-line shadow-md text-xs text-ink">{message}</p>}
        </div>
      );
    }

    if (this.inObstructionStep) {
      const { objects, marked } = summarizeObstructionStep(this.currentAnnotationData);
      return (
        <span data-focus-chip className={`${chip} h-11 ${withButton}`}>
          <span>Marked {marked} of {objects}</span>
          {openButton(FOCUS_COPY.details)}
        </span>
      );
    }

    const open = this.selectedShape()?.getAnnotationData();
    if (open && !this.isBoxHidden(open.id)) {
      const label = buildDisplayLabelsInOrder(this.currentAnnotationData).get(open.id) ?? formatLabel(open.comment) ?? TRAY_COPY.fallbackLabel;
      return (
        <span data-focus-chip className={`${chip} h-11 ${open.editable ? "pl-3 pr-1" : withButton}`}>
          <span className="truncate">{label}</span>
          {open.editable && (
            <button
              type="button"
              aria-label={FOCUS_COPY.deleteBox}
              title={FOCUS_COPY.deleteBox}
              onClick={this.onDelete}
              className="shrink-0 w-11 h-11 grid place-items-center rounded-full text-muted"
            >
              <TrashIcon size={18} />
            </button>
          )}
          {openButton(FOCUS_COPY.details)}
        </span>
      );
    }

    // Nothing selected: what is left, and the way to the lists, Step 2 and Next Image
    const count = this.annotatorObjectStep
      ? unfinishedObjectIds(this.currentAnnotationData).length
      : this.contributorPeek(orderOfAppearance(this.currentAnnotationData)).left;
    if (count === 0 && sheetUp) return null;
    return (
      <span data-focus-chip className={`${chip} h-11 ${count > 0 ? withButton : "px-1"}`}>
        {count > 0 && <span>{this.annotatorObjectStep ? FOCUS_COPY.toDecide(count) : FOCUS_COPY.stillToDecide(count)}</span>}
        {openButton(this.annotatorObjectStep ? FOCUS_COPY.details : FOCUS_COPY.answers)}
      </span>
    );
  }

  /**
   * Full screen: Details and Answers on the photo pull the sheet up, to the
   * open box's panel or to the answers.
   */
  private pullSheetUp = () => {
    if (!this.inFocus) return;
    const openId = this.state.showInput ? this.selectedId : null;
    this.lastPanelId = openId;
    this.setState({ sheetSnap: openId ? "panel" : "half" }, () => {
      if (openId) this.keepSelectedInView();
    });
  };

  /** The selected box's shape, or null. */
  private selectedShape() {
    if (!this.selectedId) return null;
    return this.shapes.find((shape) => shape.getAnnotationData().id === this.selectedId) ?? null;
  }

  /** The resize handles for the selected box: square for the mouse, round corners for a finger. */
  private makeTransformer(shape: IShape): ITransformer {
    const mode: TransformerMode = this.touchEnabled ? this.inputMode : "mouse";
    return new Transformer(shape, this.scaleState.scale, mode, this.displayScale);
  }

  /** Set by every press on the photo. A change swaps the handles on the selected box. */
  public setInputMode(mode: TransformerMode) {
    if (this.inputMode === mode) return;
    this.inputMode = mode;
    this.currentTransformer = null;
    this.onShapeChange({ quiet: true });
  }

  /**
   * The stage changed size: the canvases were resized (which clears them and
   * their scaling), or the layout changed. Recomputes the fit and keeps the
   * zoom, with the photo point at the centre of the old stage at the centre of
   * the new one, then repaints the photo and the boxes. Before 9 Oct 2026 a
   * size change repainted with the old fit, which would put boxes in the wrong
   * place.
   */
  private onStageResize(previous: { width: number; height: number }) {
    this.setCanvasDPI();
    const { width: iw, height: ih } = this.imageSize();
    const stage = this.stageSize();
    if (this.currentImageElement && iw && ih) {
      const centre = this.calculateMousePosition(previous.width / 2, previous.height / 2);
      const fit = fitImage(iw, ih, stage.width, stage.height);
      if (fit) {
        this.fit = fit;
        let view: View = IDENTITY_VIEW;
        if (this.view.zoom > 1 && previous.width > 0 && previous.height > 0) {
          const scale = fit.scale * this.view.zoom;
          view = clampView(
            {
              zoom: this.view.zoom,
              panX: stage.width / 2 - centre.positionX * scale - fit.originX,
              panY: stage.height / 2 - centre.positionY * scale - fit.originY,
            },
            panLimits(fit, this.view.zoom, stage, { width: iw, height: ih }, this.sheetCover()),
          );
        }
        this.view = view;
        this.scaleState = applyView(fit, view);
        if ((view.zoom > 1.001) !== this.state.zoomed) this.setState({ zoomed: view.zoom > 1.001 });
      }
    }
    if (this.inputMode === "touch") this.currentTransformer = null;
    this.onShapeChange();
    this.onImageChange();
  }

  /** Measures the photo area in the sheet layout, which is the stage there. */
  private observeSheetArea() {
    this.sheetAreaObserver?.disconnect();
    this.sheetAreaObserver = null;
    const el = this.sheetAreaRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    this.sheetAreaObserver = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      const width = Math.floor(rect.width);
      const height = Math.floor(rect.height);
      if (width <= 0 || height <= 0) return;
      const now = this.state.sheetStage;
      if (!now || now.width !== width || now.height !== height) this.setState({ sheetStage: { width, height } });
    });
    this.sheetAreaObserver.observe(el);
  }

  /** How much of the photo area the sheet covers now, past its collapsed height. */
  private sheetCover() {
    if (!this.isSheet || !this.sheetPoints) return 0;
    const position = this.sheetPoints[this.state.sheetSnap] ?? this.sheetPoints.collapsed;
    return Math.max(0, position - this.sheetPoints.collapsed);
  }

  private onSheetPoints = (points: SheetPoints) => {
    this.sheetPoints = points;
    if (points.collapsed !== this.state.sheetCollapsed) this.setState({ sheetCollapsed: points.collapsed });
    if (this.state.showInput) this.keepSelectedInView();
  };

  private onSheetSnapChange = (requested: SheetSnap) => {
    // Full screen: the handle pulls an open box's panel up, not the lists behind it
    const snap = this.inFocus && this.state.showInput && requested === "half" ? "panel" : requested;
    this.setState({ sheetSnap: snap }, () => {
      if (snap === "collapsed") this.relaxView();
    });
  };

  /**
   * The tutorial moves the sheet: up before a tour step whose target is in the
   * part pulled down, and back after it, and down before a tour starts. The
   * detail is a snap name, or { snap, scrollTo } with the selector of the
   * element the step points at. Any request closes an open box first (12 Oct
   * 2026): the tour points at the top of the sheet, which shows the box panel
   * instead while a box is open.
   */
  private onSheetRequest = (event: Event) => {
    const detail = (event as CustomEvent).detail;
    const snap = typeof detail === "string" ? detail : detail?.snap;
    const scrollTo: string | undefined = typeof detail === "object" ? detail?.scrollTo : undefined;
    if (!this.isSheet || !["collapsed", "half", "full"].includes(snap)) return;
    if (this.state.showInput) {
      this.lastPanelId = null;
      this.closePanel();
    }
    this.setState({ sheetSnap: snap }, () => {
      if (snap === "full") this.scrollSheetTo(scrollTo || "#scene-level-section");
      if (snap === "collapsed") this.relaxView();
    });
  };

  /** Focusing a text field in the sheet moves it to full, so the keyboard does not cover the field. */
  private onSheetFocus = (event: React.FocusEvent) => {
    const target = event.target as HTMLElement;
    const typing = target.tagName === "TEXTAREA" || (target.tagName === "INPUT" && (target as HTMLInputElement).type !== "range");
    if (typing && this.state.sheetSnap !== "full") this.setState({ sheetSnap: "full" });
  };

  /**
   * The sheet follows the panel: opening a box moves it to its panel height
   * and pans the photo so the box stays in view, and closing it (X, No,
   * Confirm, Delete box, Not an object, a tap on empty photo) brings the
   * answers back at the collapsed height.
   */
  private followPanel() {
    const openId = this.state.showInput ? this.selectedId : null;
    if (openId === this.lastPanelId) return;
    this.lastPanelId = openId;
    // Full screen: a box selected on the photo leaves the photo clear, and
    // Details pulls its panel up. A box opened from the lists, with the sheet
    // already up, shows its panel as usual.
    if (openId && this.inFocus && this.state.sheetSnap === "collapsed") return;
    if (openId) {
      this.setState({ sheetSnap: "panel" }, () => this.keepSelectedInView());
    } else {
      this.setState({ sheetSnap: "collapsed" }, () => this.relaxView());
    }
  }

  /** Pans the photo, by the smallest shift, so the selected box is clear of the sheet. */
  private keepSelectedInView() {
    if (!this.isSheet || !this.fit) return;
    const shape = this.selectedShape();
    const { width: iw, height: ih } = this.imageSize();
    if (!shape || !iw || !ih) return;
    const stage = this.stageSize();
    const cover = this.sheetCover();
    const box = this.calculateShapePosition(normalizeMark(shape.getAnnotationData().mark));
    const visible = { x: 0, y: 0, width: stage.width, height: Math.max(0, stage.height - cover) };
    const limits = panLimits(this.fit, this.view.zoom, stage, { width: iw, height: ih }, cover);
    const pan = ensureVisible(box, visible, this.view, limits);
    if (Math.abs(pan.panX - this.view.panX) > 0.5 || Math.abs(pan.panY - this.view.panY) > 0.5) {
      this.animateView({ zoom: this.view.zoom, ...pan });
    }
  }

  /** Back inside the normal limits once the sheet no longer covers the photo. */
  private relaxView() {
    if (!this.fit) return;
    const { width: iw, height: ih } = this.imageSize();
    if (!iw || !ih) return;
    const next = clampView(this.view, panLimits(this.fit, this.view.zoom, this.stageSize(), { width: iw, height: ih }, this.sheetCover()));
    if (next.panX !== this.view.panX || next.panY !== this.view.panY) this.animateView(next);
  }

  /** Applies a zoom and pan: a view change, not an edit, so nothing is saved. */
  private setView(view: View) {
    if (!this.fit) return;
    this.view = view;
    this.scaleState = applyView(this.fit, view);
    this.maxZoom = Math.max(this.maxZoom, view.zoom);
    this.onImageChange();
    this.onShapeChange({ quiet: true });
    const zoomed = view.zoom > 1.001;
    if (zoomed !== this.state.zoomed) this.setState({ zoomed });
  }

  /** Moves the view over 180 ms, at once with reduced motion. */
  private animateView(target: View, duration = 180) {
    this.cancelViewAnimation();
    if (prefersReducedMotion() || typeof requestAnimationFrame === "undefined") {
      this.setView(target);
      return;
    }
    const from = this.view;
    let start: number | null = null;
    const step = (now: number) => {
      if (start === null) start = now;
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      this.setView({
        zoom: from.zoom + (target.zoom - from.zoom) * eased,
        panX: from.panX + (target.panX - from.panX) * eased,
        panY: from.panY + (target.panY - from.panY) * eased,
      });
      this.viewAnimation = t < 1 ? requestAnimationFrame(step) : null;
    };
    this.viewAnimation = requestAnimationFrame(step);
  }

  private cancelViewAnimation() {
    if (this.viewAnimation !== null && typeof cancelAnimationFrame !== "undefined") cancelAnimationFrame(this.viewAnimation);
    this.viewAnimation = null;
  }

  /** Fit: back to the whole photo. */
  private resetView = () => {
    this.animateView(IDENTITY_VIEW);
  };

  /**
   * Contributors on a phone or tablet: every object as a chip at the top of
   * the sheet, what is left first (21 Oct 2026). `sorted` is in the lists' order.
   */
  private contributorPeek(sorted: IAnnotation[], labels?: Map<string, string>) {
    return buildPeekChips(sorted, { labels: labels ?? buildDisplayLabelsInOrder(sorted), askSeverity: this.askSeverity });
  }

  /** Next at the top of the sheet: the first chip left, so it is the one Next opens. */
  private openNextToDecide = () => {
    const nextId = this.contributorPeek(orderOfAppearance(this.currentAnnotationData)).nextId;
    if (nextId) this.openTrayItem(nextId);
  };

  /**
   * Scrolls the sheet's own list, and nothing else, so the target is at its
   * top. Never `scrollIntoView` (12 Oct 2026): it scrolls every box around the
   * target that can scroll, and while the sheet was still sliding up that
   * included the phone screen's clipped containers. The whole screen shifted,
   * with the dark background showing and the buttons displaced, and stayed so.
   */
  private scrollSheetTo(selector: string) {
    if (typeof document === "undefined") return;
    let target: Element | null = null;
    try {
      target = document.querySelector(selector);
    } catch {
      target = null;
    }
    const scroller = target?.closest<HTMLElement>("[data-sheet-scroll]");
    if (!target || !scroller) return;
    const top = target.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
    if (typeof scroller.scrollTo === "function") scroller.scrollTo({ top, behavior: prefersReducedMotion() ? "auto" : "smooth" });
    else scroller.scrollTop = top;
  }

  /**
   * The phone screen's containers must never scroll (see scrollSheetTo). They
   * use `overflow: clip` where the browser has it. This puts back any that
   * scrolled anyway, such as an older browser bringing a focused field into
   * view. Listens in the capture phase, since scroll events do not bubble.
   */
  private onStrayScroll = (event: Event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement) || !target.hasAttribute("data-no-scroll")) return;
    if (target.scrollTop !== 0) target.scrollTop = 0;
    if (target.scrollLeft !== 0) target.scrollLeft = 0;
  };

  private scrollToScene() {
    this.scrollSheetTo("#scene-level-section");
  }

  /** The Step 2 line at the top of the sheet: pull the sheet up to Step 2. */
  private showSceneSection = () => {
    this.showSection("scene");
  };

  /**
   * Shows the part of the screen a submit error is about (sheet layout):
   * Step 2 with the sheet at full, or the answers with the sheet collapsed, so
   * the Still to decide line and its Next button are in view.
   */
  private showSection(section?: string) {
    if (!this.isSheet) return;
    if (this.state.showInput) {
      this.lastPanelId = null;
      this.closePanel();
    }
    if (section === "scene") this.setState({ sheetSnap: "full" }, () => this.scrollToScene());
    // In full screen the sheet at rest is its handle alone, so it comes up
    // for the message and the top of the answers to be seen
    else if (this.inFocus) this.setState({ sheetSnap: "half" });
    else this.setState({ sheetSnap: "collapsed" }, () => this.relaxView());
  }

  /**
   * Add box (contributors' box step, touch): a new drawn box in the middle of
   * the visible photo, selected so its panel opens (category first) with its
   * four corners showing. Dragging a finger on empty photo never draws a box.
   */
  public addBoxFromButton = () => {
    if (!this.touchEnabled || !this.inBoxStep) return;
    const { width: iw, height: ih } = this.imageSize();
    const stage = this.stageSize();
    const topLeft = this.calculateMousePosition(0, 0);
    const bottomRight = this.calculateMousePosition(stage.width, Math.max(0, stage.height - this.sheetCover()));
    let x1 = topLeft.positionX;
    let y1 = topLeft.positionY;
    let x2 = bottomRight.positionX;
    let y2 = bottomRight.positionY;
    if (iw && ih) {
      x1 = Math.max(0, x1);
      y1 = Math.max(0, y1);
      x2 = Math.min(iw, x2);
      y2 = Math.min(ih, y2);
    }
    const visible = { x: x1, y: y1, width: Math.max(0, x2 - x1), height: Math.max(0, y2 - y1) };
    const minSide = cssToImage(ADD_BOX_MIN_SIDE_PX, this.scaleState.scale, this.displayScale);
    const mark = addBoxPlacement(visible, { width: iw, height: ih }, minSide);
    const id = randomId();
    this.shapes.push(
      new RectShape(
        // Like a drawn box: numbered in the order added, never submitted with its time
        { id, mark, editable: true, selected: false, drawnOrder: Date.now() },
        this.onShapeChange,
        drawnBoxStyle
      )
    );
    this.boxesAddedWithButton += 1;
    this.inputTypesUsed.add("touch");
    this.inputMode = "touch";
    this.selectBoxById(id);
    this.setState({ addBoxHintId: id });
  };

  private preventContextMenu = (event: React.MouseEvent) => event.preventDefault();

  /** A pointer's place on the canvas, CSS px from its top-left corner. */
  private pointerPoint(event: React.PointerEvent<HTMLCanvasElement>): Point {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  /** CSS px on the canvas to stage px, through the canvas's size on screen (not offsetX). */
  private cssToStage(point: Point): Point {
    const stage = this.stageSize();
    const rect = this.canvasRef.current?.getBoundingClientRect();
    if (!rect || !rect.width || !rect.height) return { x: point.x / this.displayScale, y: point.y / this.displayScale };
    return clientToStage(point.x + rect.left, point.y + rect.top, rect, stage.width, stage.height);
  }

  /** CSS px on the canvas to image px. */
  private toImage(point: Point): Point {
    const stage = this.cssToStage(point);
    const { positionX, positionY } = this.calculateMousePosition(stage.x, stage.y);
    return { x: positionX, y: positionY };
  }

  /** What a press here lands on: a corner of the selected box, its inside, or another box. */
  private touchHitAt(point: Point): TouchHit {
    const image = this.toImage(point);
    // Obstructions: the boxes are locked. A tap toggles a real object's mark,
    // and there is nothing to fit or move.
    if (this.inObstructionStep) return { corner: null, insideSelected: false, boxId: this.touchJudgeTargetAt(image) };
    const shape = this.selectedShape();
    let corner: Corner | null = null;
    let insideSelected = false;
    if (shape && this.inBoxStep && !this.isBoxHidden(shape.getAnnotationData().id)) {
      const data = shape.getAnnotationData();
      // A rejected box has no handles and does not move
      if (!data.isRejected) corner = pickCorner(data.mark, image, cssToImage(TOUCH_HANDLE_HIT_PX, this.scaleState.scale, this.displayScale));
      const m = normalizeMark(data.mark);
      insideSelected = image.x >= m.x && image.x <= m.x + m.width && image.y >= m.y && image.y <= m.y + m.height;
    }
    const boxId = this.touchBoxAt(image);
    return { corner, insideSelected, boxId: boxId === this.selectedId ? null : boxId };
  }

  /**
   * Obstructions on touch: the real object a finger picks at this point (image
   * px). The smallest one under it, as the mouse does (pickJudgeTarget), or a
   * small one near it with a finger's tolerances.
   */
  private touchJudgeTargetAt(point: Point): string | null {
    const labelled = this.judgeLabelAt(point);
    if (labelled) return labelled;
    const boxes = this.shapes.map((shape) => shape.getAnnotationData());
    const target = pickJudgeTarget(boxes, point.x, point.y);
    if (target) return target.id;
    const near = pickNearSmallBox(
      boxes.map((box) => (isRealObject(box) ? box.mark : null)),
      point.x,
      point.y,
      this.scaleState.scale,
      { nearPx: TOUCH_NEAR_PX / this.displayScale, smallPx: TOUCH_SMALL_BOX_PX / this.displayScale }
    );
    return near === null ? null : boxes[near].id;
  }

  /**
   * The box a finger picks at this point (image px), as the mouse does: the
   * smallest box under it, or a small box near it with a finger's tolerances.
   * Hidden boxes are skipped.
   */
  private touchBoxAt(point: Point): string | null {
    return this.boxAtAmong(point, (id) => !this.isBoxHidden(id));
  }

  /** The box hidden by the annotator under a finger at this point (image px), as touchBoxAt picks. */
  private hiddenBoxAt(point: Point): string | null {
    const hidden = this.state.hiddenBoxIds;
    return this.boxAtAmong(point, (id) => hidden.includes(id));
  }

  private boxAtAmong(point: Point, include: (id: string) => boolean): string | null {
    let best: string | null = null;
    let bestArea = Infinity;
    for (const shape of this.shapes) {
      const data = shape.getAnnotationData();
      if (!include(data.id) || !shape.checkBoundary(point.x, point.y)) continue;
      const area = Math.abs(data.mark.width * data.mark.height);
      if (area < bestArea) {
        best = data.id;
        bestArea = area;
      }
    }
    if (best !== null) return best;
    const near = pickNearSmallBox(
      this.shapes.map((shape) => (include(shape.getAnnotationData().id) ? shape.getAnnotationData().mark : null)),
      point.x,
      point.y,
      this.scaleState.scale,
      { nearPx: TOUCH_NEAR_PX / this.displayScale, smallPx: TOUCH_SMALL_BOX_PX / this.displayScale }
    );
    return near === null ? null : this.shapes[near].getAnnotationData().id;
  }

  /**
   * Touch and pen on the photo (contributors). The mouse keeps its own
   * handlers: every pointer handler returns at once for a mouse, and for
   * annotators, without preventDefault, so their tool is exactly as before.
   */
  private onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.pointerType === "mouse" || !this.touchEnabled) return;
    // Stops the browser's compatibility mouse events, so a tap is not handled
    // twice. iOS Safari sends them anyway, so the mouse handlers also check
    // isMouseFromTouch.
    event.preventDefault();
    this.lastTouchAt = Date.now();
    try {
      // A finger that slides onto the sheet still reports to the photo
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Not an active pointer (synthetic events in tests)
    }
    this.cancelViewAnimation();
    this.inputTypesUsed.add(event.pointerType);
    this.setInputMode("touch");
    const point = this.pointerPoint(event);
    this.pointers.set(event.pointerId, point);
    // The Sidewalk step has its own gestures (sidewalkTouch.ts). The box
    // gestures serve the box step and, with the boxes locked, Obstructions.
    if (this.pointers.size === 1) {
      if (this.inSidewalkStep) this.dispatchSidewalkTouch({ type: "down", id: event.pointerId, point, hit: this.sidewalkHitAt(point) });
      else this.dispatchTouch({ type: "down", id: event.pointerId, point, hit: this.touchHitAt(point) });
    } else {
      this.routeTouch({ type: "secondDown", id: event.pointerId, point });
      if (this.pointers.size === 2) this.startPinch();
    }
  };

  /** Sends a move, lift, cancel or second finger to the step's gesture reducer. */
  private routeTouch(event: Exclude<TouchInput, { type: "down" }>) {
    if (this.inSidewalkStep) this.dispatchSidewalkTouch(event);
    else this.dispatchTouch(event);
  }

  private get touchPhase() {
    return this.inSidewalkStep ? this.sidewalkTouchState.phase : this.touchState.phase;
  }

  private onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.pointerType === "mouse" || !this.touchEnabled || !this.pointers.has(event.pointerId)) return;
    const point = this.pointerPoint(event);
    this.pointers.set(event.pointerId, point);
    if (this.touchPhase === "pinch") {
      if (this.pinchStart && this.pointers.size >= 2) this.updatePinch();
      return;
    }
    this.routeTouch({ type: "move", id: event.pointerId, point });
  };

  private onPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.pointerType === "mouse" || !this.touchEnabled || !this.pointers.has(event.pointerId)) return;
    this.lastTouchAt = Date.now();
    this.pointers.delete(event.pointerId);
    if (this.pointers.size < 2) this.pinchStart = null;
    this.routeTouch({ type: "up", id: event.pointerId });
  };

  private onPointerCancel = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.pointerType === "mouse" || !this.touchEnabled || !this.pointers.has(event.pointerId)) return;
    this.lastTouchAt = Date.now();
    this.pointers.delete(event.pointerId);
    this.pinchStart = null;
    this.routeTouch({ type: "cancel", id: event.pointerId });
  };

  // ── Touch in the annotators' Sidewalk step (12 Oct 2026) ──

  /** A point, an edge dot or the first point is within this many image px of a finger: 22 CSS px. */
  private sidewalkHitDistance() {
    return cssToImage(TOUCH_HANDLE_HIT_PX, this.scaleState.scale, this.displayScale);
  }

  /** What a press lands on in the Sidewalk step. */
  private sidewalkHitAt(point: Point): SidewalkHit {
    const image = this.toImage(point);
    const state = this.sidewalkState;
    const reach = this.sidewalkHitDistance();
    const drafting = Boolean(state.draft);
    const selected = state.mask.polygons.find((polygon) => polygon.id === state.selectedId) || null;
    let pointIndex: number | null = null;
    let edgeAfterIndex: number | null = null;
    if (selected && !drafting) {
      pointIndex = findPointNear(selected, image, reach);
      // A point wins over the dot in the middle of an edge
      if (pointIndex === null) edgeAfterIndex = findEdgeHandleNear(selected, image, reach)?.afterIndex ?? null;
    }
    return {
      drafting,
      nearFirstPoint: this.sidewalkClosesDraft(image, reach),
      pointIndex,
      edgeAfterIndex,
      shapeId: pickShape(state.mask.polygons, image)?.id ?? null,
      shapeSelected: Boolean(selected),
    };
  }

  private dispatchSidewalkTouch(event: SidewalkTouchInput) {
    if (event.type === "down") this.sidewalkDown = this.toImage(event.point);
    const { state, effect } = reduceSidewalkTouch(this.sidewalkTouchState, event);
    this.sidewalkTouchState = state;
    this.applySidewalkTouchEffect(effect);
  }

  /**
   * Carries out a Sidewalk gesture with the editor's own actions, the ones the
   * mouse uses, so its rules apply unchanged. Snapping to the photo's edge
   * keeps its tolerance (dispatchSidewalk passes it). The 22 px hit distance is
   * only for what a finger lands on.
   */
  private applySidewalkTouchEffect(effect: SidewalkTouchEffect) {
    const editor = this.sidewalkState;
    const selected = editor.mask.polygons.find((polygon) => polygon.id === editor.selectedId) || null;
    switch (effect.type) {
      case "close":
        this.dispatchSidewalk({ type: "CLOSE_SHAPE" });
        break;
      case "addPoint":
        this.dispatchSidewalk({ type: "ADD_POINT", point: this.toImage(effect.point) });
        break;
      case "startShape":
        this.dispatchSidewalk({ type: "START_SHAPE", point: this.toImage(effect.point) });
        break;
      case "aim": {
        // The dashed line to the finger, and the magnifier on its point
        this.dispatchSidewalk({ type: "MOVE_PREVIEW", point: this.toImage(effect.point) });
        if (!this.sidewalkAiming) {
          this.sidewalkAiming = true;
          this.loupeShownCount += 1;
        }
        const preview = this.sidewalkState.preview;
        if (preview) this.showLoupe(effect.point, preview, { kind: "sidewalk" });
        break;
      }
      case "place": {
        const point = this.toImage(effect.point);
        this.sidewalkAiming = false;
        this.hideLoupe();
        if (this.sidewalkClosesDraft(point, this.sidewalkHitDistance())) {
          this.dispatchSidewalk({ type: "CLOSE_SHAPE" });
        } else {
          this.dispatchSidewalk({ type: "ADD_POINT", point });
        }
        break;
      }
      case "cancelAim": {
        // The preview back to the last point: nothing is added
        const draft = this.sidewalkState.draft;
        const last = draft?.points[draft.points.length - 1];
        this.sidewalkAiming = false;
        this.hideLoupe();
        if (last) this.dispatchSidewalk({ type: "MOVE_PREVIEW", point: last });
        break;
      }
      case "selectPoint":
        this.dispatchSidewalk({ type: "SELECT_POINT", index: effect.index });
        break;
      case "selectShape":
        this.dispatchSidewalk({ type: "SELECT_SHAPE", id: effect.shapeId });
        break;
      case "clearSelection":
        this.dispatchSidewalk({ type: "CLEAR_SELECTION" });
        break;
      case "startDrag": {
        const at = selected?.points[effect.index];
        if (!selected || !at) break;
        this.dispatchSidewalk({ type: "SELECT_POINT", index: effect.index });
        this.dispatchSidewalk({ type: "START_DRAG", id: selected.id, index: effect.index });
        this.beginSidewalkDrag(at);
        this.dragSidewalkPoint(effect.point);
        break;
      }
      case "insertPoint": {
        if (!selected) break;
        const points = selected.points;
        const a = points[effect.afterIndex];
        const b = points[(effect.afterIndex + 1) % points.length];
        if (!a || !b) break;
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        this.dispatchSidewalk({ type: "INSERT_POINT", id: selected.id, afterIndex: effect.afterIndex, point: mid });
        if (effect.drag) {
          this.dispatchSidewalk({ type: "START_DRAG", id: selected.id, index: effect.afterIndex + 1 });
          this.beginSidewalkDrag(mid);
          this.dragSidewalkPoint(effect.point);
        }
        break;
      }
      case "dragPoint":
        this.dragSidewalkPoint(effect.point);
        break;
      case "endDrag":
        this.sidewalkDrag = null;
        this.hideLoupe();
        this.dispatchSidewalk({ type: "END_DRAG" });
        break;
      case "revertDrag":
        // A second finger or a cancel: the point back where it was
        if (this.sidewalkDrag) this.dispatchSidewalk({ type: "DRAG_POINT", point: this.sidewalkDrag.start });
        this.sidewalkDrag = null;
        this.hideLoupe();
        this.dispatchSidewalk({ type: "END_DRAG" });
        break;
      case "pan":
        this.panBy(effect.dx, effect.dy);
        break;
      default:
        break;
    }
  }

  /** The finger keeps its offset from the point, so the point does not jump under it. */
  private beginSidewalkDrag(at: Point) {
    if (!this.sidewalkState.drag) return;
    this.sidewalkDrag = { grab: { x: this.sidewalkDown.x - at.x, y: this.sidewalkDown.y - at.y }, start: { x: at.x, y: at.y } };
    this.loupeShownCount += 1;
  }

  private dragSidewalkPoint(finger: Point) {
    const drag = this.sidewalkDrag;
    if (!drag) return;
    const image = this.toImage(finger);
    this.dispatchSidewalk({ type: "DRAG_POINT", point: { x: image.x - drag.grab.x, y: image.y - drag.grab.y } });
    const { drag: active, mask } = this.sidewalkState;
    const at = active ? mask.polygons.find((polygon) => polygon.id === active.id)?.points[active.index] : null;
    if (at) this.showLoupe(finger, at, { kind: "sidewalk" });
  }

  /** Runs the gesture reducer and carries out its effect. */
  private dispatchTouch(event: TouchInput) {
    if (event.type === "down") {
      const shape = this.selectedShape();
      this.touchStart = {
        boxId: this.selectedId,
        // The selected box's mark at the press, for a revert
        mark: shape ? { ...shape.getAnnotationData().mark } : null,
        downImage: this.toImage(event.point),
        corner: event.hit.corner,
        grab: { x: 0, y: 0 },
      };
    }
    const { state, effect } = reduceTouch(this.touchState, event);
    this.touchState = state;
    this.applyTouchEffect(effect);
  }

  /**
   * Step 1 (14 Oct 2026): a second tap on empty photo, soon after and near the
   * first, shows the hidden box under it again (isDoubleTap). The first tap
   * did what a tap on empty photo does, closing an open box.
   */
  private showHiddenOnDoubleTap() {
    const image = this.touchStart?.downImage;
    if (!this.inBoxStep || !image) return;
    const tap = { at: Date.now(), x: image.x, y: image.y };
    const reach = cssToImage(DOUBLE_TAP_PX, this.scaleState.scale, this.displayScale);
    if (!isDoubleTap(this.lastEmptyTap, tap, { reach })) {
      this.lastEmptyTap = tap;
      return;
    }
    this.lastEmptyTap = null;
    const id = this.hiddenBoxAt(image);
    if (id) this.setState({ hiddenBoxIds: withoutHiddenId(this.state.hiddenBoxIds, id) }, () => this.onShapeChange());
  }

  /** The box the gesture works on: the one selected at the press, unless it is rejected. */
  private touchTarget() {
    const id = this.touchStart?.boxId;
    if (!id) return null;
    const shape = this.shapes.find((s) => s.getAnnotationData().id === id);
    return shape && !shape.getAnnotationData().isRejected ? shape : null;
  }

  private applyTouchEffect(effect: TouchEffect) {
    switch (effect.type) {
      case "select":
        this.lastEmptyTap = null;
        // Obstructions: a tap on a real object toggles its mark. No panel, no selection.
        if (this.inObstructionStep) this.toggleObstruction(effect.boxId);
        else this.selectBoxById(effect.boxId);
        break;
      case "deselect":
        if (this.inObstructionStep) break;
        if (this.selectedId !== null) this.closePanel();
        this.showHiddenOnDoubleTap();
        break;
      case "startCorner": {
        const shape = this.touchTarget();
        const start = this.touchStart;
        if (!shape || !start?.mark) break;
        // The finger keeps its offset from the corner, so the corner does not jump under it
        const corner = markCorners(start.mark)[effect.corner];
        start.grab = { x: start.downImage.x - corner.x, y: start.downImage.y - corner.y };
        start.corner = effect.corner;
        this.loupeShownCount += 1;
        if (this.state.addBoxHintId === shape.getAnnotationData().id) this.setState({ addBoxHintId: null });
        this.applyCorner(effect.point);
        break;
      }
      case "moveCorner":
        this.applyCorner(effect.point);
        break;
      case "startMove":
      case "moveBox":
        this.applyMove(effect.dx, effect.dy);
        break;
      case "pan":
        this.panBy(effect.dx, effect.dy);
        break;
      case "revert":
        this.revertTouch();
        break;
      case "commit":
        this.commitTouch();
        break;
      default:
        break;
    }
  }

  /** One corner follows the finger; the opposite corner stays. Repainted without saving until the finger lifts. */
  private applyCorner(point: Point) {
    const shape = this.touchTarget();
    const start = this.touchStart;
    if (!shape || !start?.mark || start.corner === null) return;
    const { width, height } = this.imageSize();
    const minSide = cssToImage(TOUCH_MIN_SIDE_PX, this.scaleState.scale, this.displayScale);
    const next = moveCorner(start.mark, start.corner, this.toImage(point), start.grab, minSide, width, height);
    const mark = shape.getAnnotationData().mark;
    Object.assign(mark, { x: next.x, y: next.y, width: next.width, height: next.height });
    this.onShapeChange({ quiet: true });
    this.showLoupe(point, markCorners(mark)[start.corner], { kind: "box", id: shape.getAnnotationData().id }, "touch");
  }

  /** The selected box moved by the finger's travel since the press, kept on the photo. */
  private applyMove(dx: number, dy: number) {
    const shape = this.touchTarget();
    const start = this.touchStart;
    if (!shape || !start?.mark) return;
    const { width, height } = this.imageSize();
    const moved = keepMarkInside(
      {
        ...start.mark,
        x: start.mark.x + cssToImage(dx, this.scaleState.scale, this.displayScale),
        y: start.mark.y + cssToImage(dy, this.scaleState.scale, this.displayScale),
      },
      width,
      height
    );
    Object.assign(shape.getAnnotationData().mark, { x: moved.x, y: moved.y, width: moved.width, height: moved.height });
    this.onShapeChange({ quiet: true });
  }

  /** The box back where it was at the press (a second finger, or a cancel). */
  private revertTouch() {
    const shape = this.touchTarget();
    const start = this.touchStart;
    if (shape && start?.mark) Object.assign(shape.getAnnotationData().mark, start.mark);
    this.hideLoupe();
    this.onShapeChange({ quiet: true });
  }

  /** The finger lifted after fitting or moving the box: one edit, saved like a mouse edit. */
  private commitTouch() {
    const shape = this.touchTarget();
    if (shape) {
      const { mark } = shape.getAnnotationData();
      Object.assign(mark, normalizeMark(mark));
    }
    this.hideLoupe();
    this.onShapeChange();
  }

  /** One finger on empty photo pans, when zoomed in. */
  private panBy(dx: number, dy: number) {
    if (!this.fit || this.view.zoom <= 1) return;
    const { width: iw, height: ih } = this.imageSize();
    if (!iw || !ih) return;
    const limits = panLimits(this.fit, this.view.zoom, this.stageSize(), { width: iw, height: ih }, this.sheetCover());
    this.setView(clampView(
      { ...this.view, panX: this.view.panX + dx / this.displayScale, panY: this.view.panY + dy / this.displayScale },
      limits
    ));
  }

  private startPinch() {
    const [a, b] = Array.from(this.pointers.values());
    if (!a || !b) return;
    this.hideLoupe();
    this.pinchStart = {
      distance: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)),
      mid: this.cssToStage({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }),
      view: this.view,
    };
  }

  /** Two fingers zoom about their midpoint, from 1 to 5 times the fit, and moving both pans. */
  private updatePinch() {
    const start = this.pinchStart;
    const { width: iw, height: ih } = this.imageSize();
    if (!start || !this.fit || !iw || !ih) return;
    const [a, b] = Array.from(this.pointers.values());
    const distance = Math.hypot(b.x - a.x, b.y - a.y);
    const mid = this.cssToStage({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    const zoom = clampZoom(start.view.zoom * (distance / start.distance));
    const next = zoomAt(this.fit, start.view, start.mid, mid, zoom);
    this.setView(clampView(next, panLimits(this.fit, zoom, this.stageSize(), { width: iw, height: ih }, this.sheetCover())));
  }

  private lastLoupe: { finger: Point; point: Point; target: LoupeTarget } | null = null;
  /** The side of the box the magnifier sat on last, kept while it stays clear (loupePlacement) */
  private loupeSide: LoupeSide | null = null;

  /**
   * The magnifier for the point being dragged: a box's corner, any handle with
   * the mouse, or a Sidewalk point. For a box it sits outside the box, clear of
   * the finger or pointer and, on the desktop photo, of the box's panel when it
   * can (15 Oct 2026). For a Sidewalk point it goes above the finger (below it
   * near the top). `finger` is CSS px on the canvas, `point` image px.
   */
  private showLoupe(finger: Point, point: Point, target: LoupeTarget, input: "touch" | "mouse" = "touch") {
    const area = this.loupeArea();
    const avoid = target.kind === "box" ? this.loupeAvoid(target.id, point) : {};
    const { left, top, side } = loupePlacement(finger, area, LOUPE_SIZE_PX, { ...avoid, input, prefer: this.loupeSide });
    this.loupeSide = side;
    this.lastLoupe = { finger, point, target };
    const now = this.state.loupe;
    if (!now || now.left !== left || now.top !== top) this.setState({ loupe: { left, top } });
    if (typeof requestAnimationFrame === "undefined") {
      this.paintLoupe();
      return;
    }
    if (this.loupeFrame !== null) return;
    this.loupeFrame = requestAnimationFrame(() => {
      this.loupeFrame = null;
      this.paintLoupe();
    });
  }

  /**
   * The part of the photo area the magnifier may use, CSS px from its top-left
   * corner: the whole stage, less what a pulled-up answers sheet covers.
   */
  private loupeArea() {
    const stage = this.stageSize();
    const ds = this.displayScale;
    return { width: stage.width * ds, height: Math.max(0, stage.height - this.sheetCover()) * ds };
  }

  /**
   * What the magnifier keeps clear of while a box is fitted, CSS px: the box as
   * it is now, the point being dragged (image px in), and the box's floating
   * panel when it is open on the desktop photo. Its size is read from the page,
   * or taken as the panel's usual width and room when the page has none.
   */
  private loupeAvoid(id: string, point: Point) {
    const shape = this.shapes.find((s) => s.getAnnotationData().id === id);
    if (!shape) return {};
    const ds = this.displayScale;
    const p = this.calculateShapePosition(normalizeMark(shape.getAnnotationData().mark));
    const box = { left: p.x * ds, top: p.y * ds, width: p.width * ds, height: p.height * ds };
    const { originX, originY, scale } = this.scaleState;
    const at = { x: (point.x * scale + originX) * ds, y: (point.y * scale + originY) * ds };
    let panel: { left: number; top: number; width: number; height: number } | null = null;
    if (this.state.showInput && !this.isSheet && this.selectedId === id) {
      const { left = 0, top = 0 } = this.state.inputPosition;
      const element = this.floatingPanelRef.current;
      const width = element?.offsetWidth || PANEL_WIDTH;
      const height = element?.offsetHeight || PANEL_ROOM_BELOW;
      panel = { left: left * ds, top: top * ds, width: width * ds, height: height * ds };
    }
    return { box, point: at, panel };
  }

  private hideLoupe() {
    this.lastLoupe = null;
    this.loupeSide = null;
    if (this.state.loupe) this.setState({ loupe: null });
  }

  /**
   * Paints the magnifier: the photo around the dragged point at 2.5 times its
   * current display scale, drawn from the source image so it is sharp, dark
   * past the photo's edge, the box's outline (at a corner its two edges meet
   * in the middle, at an edge handle one edge runs through it), and a
   * crosshair on the point.
   */
  private paintLoupe() {
    const canvas = this.loupeCanvasRef.current;
    const info = this.lastLoupe;
    const ctx = canvas?.getContext?.("2d");
    if (!canvas || !info || !ctx) return;
    const size = LOUPE_SIZE_PX;
    const half = size / 2;
    const { target } = info;
    const shape = target.kind === "box" ? this.shapes.find((s) => s.getAnnotationData().id === target.id) : undefined;
    const src = loupeSource(info.point, this.scaleState.scale * this.displayScale, LOUPE_MAGNIFICATION, size, this.imageSize());
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.beginPath();
    ctx.arc(half, half, half, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = LOUPE_BACKGROUND;
    ctx.fillRect(0, 0, size, size);
    const image = this.currentImageElement;
    if (image && src.draw) {
      const d = src.draw;
      ctx.drawImage(image, d.sx, d.sy, d.sw, d.sh, d.dx, d.dy, d.dw, d.dh);
    }
    if (shape) {
      const m = normalizeMark(shape.getAnnotationData().mark);
      ctx.setLineDash([]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = boxStrokeColor(shape.getAnnotationData());
      ctx.strokeRect((m.x - src.sx) * src.scale, (m.y - src.sy) * src.scale, m.width * src.scale, m.height * src.scale);
    }
    if (target.kind === "sidewalk") {
      // The outline in place of a box: the selected shape's edges, or the shape
      // being drawn with its dashed line to the finger
      const toLoupe = (p: Point) => ({ x: (p.x - src.sx) * src.scale, y: (p.y - src.sy) * src.scale });
      const editor = this.sidewalkState;
      const trace = (points: Point[], close: boolean) => {
        ctx.beginPath();
        points.forEach((p, i) => {
          const c = toLoupe(p);
          if (i === 0) ctx.moveTo(c.x, c.y);
          else ctx.lineTo(c.x, c.y);
        });
        if (close) ctx.closePath();
        ctx.stroke();
      };
      ctx.setLineDash([]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = SIDEWALK_BLUE;
      const selected = editor.mask.polygons.find((polygon) => polygon.id === editor.selectedId);
      if (editor.draft) {
        trace(editor.draft.points, false);
        const last = editor.draft.points[editor.draft.points.length - 1];
        if (last && editor.preview) {
          ctx.setLineDash([4, 4]);
          trace([last, editor.preview], false);
          ctx.setLineDash([]);
        }
      } else if (selected) {
        trace(selected.points, true);
      }
    }
    // The crosshair: two 10 px lines, white with a 1 px dark outline
    ctx.lineCap = "butt";
    for (const [width, colour] of [[3, "rgba(11, 15, 20, 0.85)"], [1, "#ffffff"]] as const) {
      ctx.lineWidth = width;
      ctx.strokeStyle = colour;
      ctx.beginPath();
      ctx.moveTo(half - 5, half);
      ctx.lineTo(half + 5, half);
      ctx.moveTo(half, half - 5);
      ctx.lineTo(half, half + 5);
      ctx.stroke();
    }
    ctx.restore();
    ctx.beginPath();
    ctx.arc(half, half, half - 1.5, 0, Math.PI * 2);
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();
  }

  /** Device and input fields for this image's telemetry (deviceTelemetry.js). */
  private deviceTelemetry() {
    const win = typeof window !== "undefined" ? window : undefined;
    const round2 = (n: number) => Math.round(n * 100) / 100;
    const screenMin = win?.screen ? Math.min(win.screen.width, win.screen.height) : undefined;
    const imageWidth = this.imageSize().width;
    return {
      inputType: summarizeInputTypes(this.inputTypesUsed),
      layout: this.isSheet ? "sheet" : "desktop",
      deviceClass: classifyDevice({ coarsePointer: matches("(pointer: coarse)"), screenMinSide: screenMin }),
      viewportWidth: win ? Math.round(win.innerWidth) : undefined,
      viewportHeight: win ? Math.round(win.innerHeight) : undefined,
      photoDisplayWidth: imageWidth && this.fit ? round2(imageWidth * this.fit.scale * this.displayScale) : undefined,
      devicePixelRatio: win?.devicePixelRatio ? round2(win.devicePixelRatio) : undefined,
      maxZoom: round2(this.maxZoom),
      loupeShownCount: this.loupeShownCount,
      boxesAddedWithButton: this.boxesAddedWithButton,
      // The full-screen photo on phones (12 Oct 2026), counting the time still running
      focusModeCount: this.focusModeCount,
      focusModeMs: Math.round(this.focusModeMs + (this.focusStartMs !== null ? Date.now() - this.focusStartMs : 0)),
    };
  }

  /** The image's natural size. The element is never attached to the page. */
  private imageSize() {
    return {
      width: this.currentImageElement?.width,
      height: this.currentImageElement?.height,
    };
  }

  /**
   * Step 1, both roles (8 Oct 2026): a point in the empty band beside the
   * photo is moved onto its edge, so boxes are drawn and resized on the photo
   * only. Unchanged before the image has loaded.
   */
  public clampToPhoto = (x: number, y: number) => {
    const { width, height } = this.imageSize();
    return clampPointToImage(x, y, width, height);
  };

  /** Moves a box dragged past the photo's edge back onto it, at its full size. */
  public keepShapeInsidePhoto = (shape: IShape) => {
    const { width, height } = this.imageSize();
    const { mark } = shape.getAnnotationData();
    const inside = keepMarkInside(mark, width, height);
    if (inside === mark || (inside.x === mark.x && inside.y === mark.y && inside.width === mark.width && inside.height === mark.height)) return;
    Object.assign(mark, inside);
    this.onShapeChange();
  };

  /** Copies with marks normalized and clipped to the image, as the server stores them. */
  private tidyMarks(boxes: IAnnotation[]) {
    const { width, height } = this.imageSize();
    return normalizeSubmittedMarks(boxes, width, height);
  }

  private selectedBelowMinimumSize() {
    const box = this.currentAnnotationData.find((a) => a.id === this.selectedId);
    if (!box?.mark) return false;
    const { width, height } = this.imageSize();
    return isBelowMinimumSize(box.mark, width, height);
  }

  /**
   * What a press on a box does to select it: it becomes the selected box, gets
   * resize handles, and moves to the end of the list so it paints on top (and
   * so DraggingAnnotationState drags it). Shared by DefaultAnnotationState and
   * selectBoxById. Returns the shape.
   */
  public selectShapeAt = (index: number) => {
    const shape = this.shapes[index];
    this.selectedId = shape.getAnnotationData().id;
    this.currentTransformer = this.makeTransformer(shape);
    this.shapes.splice(index, 1);
    this.shapes.push(shape);
    return shape;
  };

  /**
   * Selects the box with this id and opens its panel, as a click on it does,
   * wherever it sits among other boxes (7 Oct 2026). Selecting by a simulated
   * click at a point just inside the box's corner opened the wrong panel when
   * a smaller box covered that corner, such as a pole over the corner of a car,
   * since a click picks the smallest box under it.
   */
  public selectBoxById = (id: string) => {
    const index = this.shapes.findIndex((shape) => shape.getAnnotationData().id === id);
    if (index < 0) return;
    // Opening a hidden object shows its box again
    if (this.state.hiddenBoxIds.includes(id)) {
      this.setState({ hiddenBoxIds: withoutHiddenId(this.state.hiddenBoxIds, id) }, () => this.selectBoxById(id));
      return;
    }
    // Settle any gesture in flight first
    this.currentAnnotationState.onMouseUp();
    this.selectShapeAt(index);
    this.setAnnotationState(new DefaultAnnotationState(this));
    this.onShapeChange();
  };

  /** Contributors: a chip under the photo opens its box's panel (7 Oct 2026). */
  private openTrayItem = (id: string) => {
    if (this.annotatorObjectStep) return;
    this.selectBoxById(id);
  };

  /** Step 1, both roles: hides or shows one box on the photo (8 Oct 2026). */
  private toggleBoxHidden = (id: string) => {
    if (!this.inBoxStep) return;
    const hiddenBoxIds = toggleHiddenId(this.state.hiddenBoxIds, id);
    // Hiding the open box closes its panel
    if (hiddenBoxIds.includes(id) && this.selectedId === id) {
      this.currentAnnotationState.onMouseUp();
      this.selectedId = null;
      this.setAnnotationState(new DefaultAnnotationState(this));
    }
    this.setState({ hiddenBoxIds }, () => this.onShapeChange());
  };

  private showAllBoxes = () => {
    this.setState({ hiddenBoxIds: [] }, () => this.onShapeChange());
  };

  /** Hides the open box from its panel's eye (10 Oct 2026), which closes the panel. */
  private hideOpenBox = () => {
    if (this.selectedId && !this.state.hiddenBoxIds.includes(this.selectedId)) this.toggleBoxHidden(this.selectedId);
  };

  /** Step 1, both roles: hides every box on the photo (10 Oct 2026). Closes the open panel. */
  private hideAllBoxes = () => {
    if (!this.inBoxStep) return;
    if (this.selectedId) {
      this.currentAnnotationState.onMouseUp();
      this.selectedId = null;
      this.setAnnotationState(new DefaultAnnotationState(this));
    }
    const hiddenBoxIds = this.shapes.map((shape) => shape.getAnnotationData().id);
    this.setState({ hiddenBoxIds }, () => this.onShapeChange());
  };

  /**
   * Annotators: the "Objects in This Image" card under the canvas. Keeps the
   * box-review-section id, which the tutorial points at.
   */
  /**
   * An annotator box's status, as its chip shows it: To decide, Kept, Not an
   * object or No category, or null for a drawn box with a category. From
   * 17 Oct 2026 a drawn box has the contributors' pencil before its name
   * instead of a Drawn tag, and a box still needing a category (a box just
   * added, or a kept suggestion whose category is not on the list) says so,
   * in the same red as To decide, since both are left to do.
   */
  private objectTag(box: IAnnotation): { text: string; className: string } | null {
    const noCategory = { text: "No category", className: "bg-danger-soft text-danger" };
    if (box.editable) return isTaxonomyCategory(box.comment) ? null : noCategory;
    if (box.selected === true) return isTaxonomyCategory(box.comment) ? { text: "Kept", className: "bg-primary text-white" } : noCategory;
    if (box.comment === NOT_AN_OBJECT) return { text: "Not an object", className: "bg-surface-subtle text-muted border border-line" };
    return { text: "To decide", className: "bg-danger-soft text-danger" };
  }

  /**
   * `variant` is "desktop" (as it was) or "sheet": in the answers sheet on a
   * phone or tablet (12 Oct 2026) the card is full width, its chips and
   * buttons at least 44 px tall and no text under 12 px. The other annotator
   * cards take the same variant.
   */
  private renderObjectsCard(sortedAnnotations: IAnnotation[], displayLabels: Map<string, string>, variant: CardVariant = "desktop") {
    const sheet = variant === "sheet";
    const duplicates = findNearDuplicates(sortedAnnotations);
    const labelOf = (box: IAnnotation) => displayLabels.get(box.id) ?? formatLabel(box.comment) ?? "Select a category";
    const tagFor = (box: IAnnotation) => this.objectTag(box);
    const textButton = sheet ? "font-semibold text-primary hover:underline min-h-[44px] px-1" : "font-semibold text-primary hover:underline";

    const hidden = this.state.hiddenBoxIds;
    const hiddenCount = sortedAnnotations.filter((box) => hidden.includes(box.id)).length;
    // The box whose panel is open (10 Oct 2026)
    const openId = this.state.showInput ? this.selectedId : null;

    return (
      <div id="box-review-section" className="bg-surface rounded-card border border-line shadow-sm p-4 w-full">
        <div className="mb-3 flex items-center justify-between gap-3">
          <H3><span className="text-lg font-bold text-ink">Objects in This Image</span></H3>
          {/* Boxes hidden on the photo (8 Oct 2026), and Hide all (10 Oct 2026).
              In the sheet both sit beside the step's name, always in view (14 Oct 2026). */}
          {sheet && hiddenCount > 0 && (
            <span className="text-xs text-muted whitespace-nowrap">{BOX_VISIBILITY_COPY.hiddenCount(hiddenCount)}</span>
          )}
          {!sheet && sortedAnnotations.length > 0 && (
            <span className="inline-flex items-center gap-3 text-xs text-muted whitespace-nowrap">
              {hiddenCount > 0 && (
                <>
                  {BOX_VISIBILITY_COPY.hiddenCount(hiddenCount)}
                  <button type="button" onClick={this.showAllBoxes} className={textButton}>
                    {BOX_VISIBILITY_COPY.showAll}
                  </button>
                </>
              )}
              {hiddenCount < sortedAnnotations.length && (
                <button type="button" onClick={this.hideAllBoxes} className={textButton}>
                  {BOX_VISIBILITY_COPY.hideAll}
                </button>
              )}
            </span>
          )}
        </div>
        <ul className="flex flex-wrap gap-2">
          {(sheet ? toDecideFirst(sortedAnnotations, unfinishedObjectIds(this.currentAnnotationData)) : sortedAnnotations).map((box) => {
            const tag = tagFor(box);
            const isHidden = hidden.includes(box.id);
            const isOpen = box.id === openId;
            const eyeLabel = isHidden ? BOX_VISIBILITY_COPY.show(labelOf(box)) : BOX_VISIBILITY_COPY.hide(labelOf(box));
            return (
              <li
                key={box.id}
                className={`group border rounded-control hover:border-primary hover:shadow-md transition-all flex items-stretch ${sheet ? "min-h-[44px] " : ""}${isOpen ? "border-primary bg-primary-50 ring-2 ring-primary/40" : "border-line bg-surface"} ${isHidden ? "opacity-60" : ""}`}
              >
                {/* The name opens the box, the eye hides it on the photo */}
                <button
                  type="button"
                  aria-current={isOpen ? "true" : undefined}
                  className="flex items-center gap-1.5 pl-2 pr-1 py-1 cursor-pointer rounded-control"
                  onClick={() => this.selectBoxById(box.id)}
                >
                  {box.editable && <DrawnMark />}
                  <span className="text-xs font-semibold text-ink whitespace-nowrap">{labelOf(box)}</span>
                  {box.editable && <span className="sr-only">, {TRAY_COPY.drawnTitle.toLowerCase()}</span>}
                  {tag && <span className={`${sheet ? "text-xs" : "text-[10px]"} font-bold rounded-control px-1 whitespace-nowrap ${tag.className}`}>{tag.text}</span>}
                </button>
                <button
                  type="button"
                  aria-label={eyeLabel}
                  aria-pressed={isHidden}
                  title={eyeLabel}
                  onClick={() => this.toggleBoxHidden(box.id)}
                  className={`grid place-items-center pl-0.5 pr-2 rounded-control text-subtle hover:text-ink transition-colors${sheet ? " min-w-[44px]" : ""}`}
                >
                  {isHidden ? <EyeOffIcon size={sheet ? 18 : 14} /> : <EyeIcon size={sheet ? 18 : 14} />}
                </button>
              </li>
            );
          })}
        </ul>
        {duplicates.map(({ a, b }) => (
          <p key={`${a.id}-${b.id}`} className="text-xs text-muted mt-2">
            Two boxes overlap almost completely ({labelOf(a)} and {labelOf(b)}). Check that each object has only one box.
          </p>
        ))}
      </div>
    );
  }

  /** Annotators: the "What to Box" list beside the canvas, in place of Step 2. */
  private renderTaxonomyGuide(variant: CardVariant = "desktop") {
    return (
      <div style={variant === "sheet" ? undefined : { flex: '35 1 0%' }} className="min-w-0">
        <div
          id="taxonomy-guide"
          className={variant === "sheet" ? GUIDE_SHEET_CLASS : "sticky top-4 bg-surface rounded-card border border-line shadow-sm p-4 max-h-[calc(100vh-2rem)] overflow-y-auto"}
        >
          <H2 className="text-lg font-bold text-ink mb-3">What to Box</H2>
          {TAXONOMY_GUIDE.map(({ group, items }) => (
            <div key={group} className="mb-3">
              <p className="text-xs font-bold text-subtle uppercase tracking-widest mb-1">{group}</p>
              <ul className="space-y-1">
                {items.map((item) => (
                  <li key={item.value} className="text-sm leading-snug">
                    <span className="font-semibold text-ink">{item.label}</span>
                    <span className="text-muted">: {item.description}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <ul className="mt-3 pt-3 border-t border-line space-y-1 list-disc pl-4">
            {TAXONOMY_RULES.map((rule) => (
              <li key={rule} className="text-xs text-body leading-snug">{rule}</li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  /**
   * Annotators: move from Objects to Obstructions. Runs the Objects check
   * first, and submits straight away when no objects are left to judge. The
   * confirmation always starts unticked. `restoring` is a reload in the middle
   * of Obstructions, which neither shows the Objects error, submits nor caches.
   * The tutorial is still told the step, so its tour matches the screen.
   */
  public enterObstructionStep = ({ restoring = false }: { restoring?: boolean } = {}) => {
    if (!this.annotatorObjectStep) return;

    const check = validateObjectStep(this.currentAnnotationData, { words: this.words });
    if (!check.valid) {
      if (!restoring) this.showStepError(check.error, check.boxIds);
      return;
    }

    if (this.askSidewalk) {
      const sidewalk = this.sidewalkCheck();
      if (!sidewalk.valid) {
        if (restoring) this.enterSidewalkStep({ restoring: true });
        else this.showStepError(sidewalk.error);
        return;
      }
    }

    if (realObjects(this.currentAnnotationData).length === 0) {
      if (!restoring) this.submit();
      return;
    }

    this.selectedId = null;
    this.currentTransformer = null;
    this.setAnnotationState(new JudgingAnnotationState(this));
    this.obstructionStepStartMs = Date.now();
    this.setState(
      // Every box shows again outside Step 1
      { annotatorStep: "obstructions", obstructionsConfirmed: false, error: null, showInput: false, hiddenBoxIds: [], ...this.sheetStepReset() },
      () => {
        this.onShapeChange();
        this.afterStepChange();
        if (!restoring) this.cacheCurrentImageEdits();
        // Told on a reload too, so the tutorial shows this step's tour
        this.props.onAnnotatorStepChange?.("obstructions");
      }
    );
  };

  /**
   * An annotator step's error. When it is about boxes the first of them opens
   * (openFirstUnfinished). Otherwise, on a phone or tablet, the sheet
   * collapses and any panel closes, so the top of the sheet (what is left to
   * decide, the drawing tools or the confirmation) is in view with the message.
   */
  private showStepError(error: string | undefined, boxIds?: string[]) {
    this.showMessage(error ?? null);
    if (!this.openFirstUnfinished(boxIds)) this.showSection();
  }

  private messageTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Shows a message under the photo, or over it on a phone or tablet, which
   * goes by itself after it has been read (21 Oct 2026, stepMessage.js). The same
   * message shown again, by trying again, stays its full time again. Every
   * message goes through here, so none stays for the rest of the image.
   */
  private showMessage(error: string | null) {
    if (error) this.lastMessage = error;
    this.setState({ error, errorSeq: this.state.errorSeq + 1 });
  }

  /** The last message shown: still in the page while it leaves, so it goes the way it came */
  private lastMessage = "";

  /**
   * Desktop: the message above the step's buttons (21 Oct 2026). Its row opens
   * to the message's height as it fades in, and closes as it fades out, on the
   * same ease both ways. A plain fade with reduced motion.
   */
  private renderDesktopMessage() {
    const shown = Boolean(this.state.error);
    return (
      <div
        aria-hidden={!shown}
        className={`grid motion-safe:transition-[grid-template-rows,opacity] motion-safe:duration-300 motion-safe:ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-opacity motion-reduce:duration-200 ${shown ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="flex justify-center pt-6 pb-4">
            <div className="bg-danger-soft border border-danger-border text-danger px-6 py-3 rounded-control flex items-center gap-2">
              <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" className="shrink-0 h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span role="alert" className="font-medium">{shown ? this.state.error : this.lastMessage}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /**
   * Phones and tablets: the message floats over the top of the photo, a
   * frosted card (21 Oct 2026, apple-design). It used to sit in the sheet's
   * footer, where coming and going changed the sheet's height and so the
   * photo's. It materializes, fading in as it grows from 96% and comes into
   * focus, and leaves the same way, over 0.3 s; a cross-fade with reduced
   * motion, and a solid card with reduced transparency. It sits below the
   * controls at the top of the photo (Fit, and in full screen the status chip),
   * so it covers none of them. It never takes a tap.
   */
  private renderSheetMessage(focus: boolean) {
    const shown = Boolean(this.state.error);
    return (
      <div
        aria-hidden={!shown}
        className="pointer-events-none absolute inset-x-0 z-30 flex justify-center px-4"
        // Below the row of controls at the top of the photo (Fit while zoomed, the
        // tutorial's "Tap ? to see the tour again", in full screen the status chip)
        style={{ top: focus ? "calc(env(safe-area-inset-top) + 68px)" : 64 }}
      >
        <div
          className={`max-w-sm w-full flex items-start gap-2.5 px-4 py-3 rounded-2xl border border-white/50 bg-surface/90 backdrop-blur-xl backdrop-saturate-150 shadow-[0_8px_30px_rgba(15,23,42,0.22)] [@media(prefers-reduced-transparency:reduce)]:bg-surface [@media(prefers-reduced-transparency:reduce)]:backdrop-blur-none motion-safe:transition-[opacity,transform,filter] motion-safe:duration-300 motion-safe:ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-opacity motion-reduce:duration-200 ${shown ? "opacity-100 scale-100 blur-0" : "opacity-0 scale-[0.96] -translate-y-2 blur-[2px]"}`}
        >
          <span className="mt-px text-danger">
            <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" className="shrink-0 h-[18px] w-[18px]" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
          </span>
          <p role="alert" className="text-sm font-semibold leading-snug tracking-[0.005em] text-ink">
            {shown ? this.state.error : this.lastMessage}
          </p>
        </div>
      </div>
    );
  }

  /** Starts a shown message's timer, or stops it when the message has gone another way (componentDidUpdate). */
  private timeMessage(prevState: this["state"]) {
    const { error, errorSeq } = this.state;
    if (prevState.error === error && prevState.errorSeq === errorSeq) return;
    if (this.messageTimer) clearTimeout(this.messageTimer);
    this.messageTimer = null;
    if (!error) return;
    const seq = errorSeq;
    // Its time up, it goes; the page animates it out (renderDesktopMessage, renderSheetMessage)
    this.messageTimer = setTimeout(() => {
      this.messageTimer = null;
      if (this.state.errorSeq === seq) this.setState({ error: null });
    }, messageVisibleMs(error));
  }

  /**
   * After a failed Next or Next Image (21 Oct 2026, both roles, every layout):
   * opens the first box the message is about, in the lists' order (the order
   * the chips and Next use), so it is plain which box is left and its panel is
   * there to finish it. On a phone or tablet the sheet comes up to the box's
   * panel, with the message in its footer, also in full screen; on the desktop
   * photo its panel opens beside it and the photo is scrolled into view if it
   * is out of view. A hidden box shows again. False when there is no such box
   * (Step 2, the outline, the Obstructions confirmation), for the caller to
   * show the message as before.
   */
  private openFirstUnfinished(boxIds?: string[]): boolean {
    if (!this.inBoxStep || !boxIds || boxIds.length === 0) return false;
    const wanted = new Set(boxIds);
    const first = orderOfAppearance(this.currentAnnotationData).find((box) => wanted.has(box.id));
    if (!first || !this.shapes.some((shape) => shape.getAnnotationData().id === first.id)) return false;
    if (this.isSheet) {
      // The panel height first, so followPanel keeps it, also in full screen
      this.lastPanelId = null;
      this.setState({ sheetSnap: "panel" }, () => this.selectBoxById(first.id));
      return true;
    }
    this.selectBoxById(first.id);
    const reduced = typeof window !== "undefined" && matches("(prefers-reduced-motion: reduce)");
    this.canvasWrapperRef.current?.scrollIntoView?.({ behavior: reduced ? "auto" : "smooth", block: "nearest" });
    return true;
  }

  /** Moving between steps on a phone or tablet collapses the sheet. */
  private sheetStepReset(): { sheetSnap?: SheetSnap } {
    return this.isSheet ? { sheetSnap: "collapsed" } : {};
  }

  /**
   * After a step change: the desktop layout scrolls the photo into view. The
   * sheet layout does not scroll (the page is fixed there) and goes back to
   * the whole photo, since a zoom on one box says nothing about the next step.
   */
  private afterStepChange() {
    if (!this.isSheet) {
      this.canvasWrapperRef.current?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
      return;
    }
    this.lastPanelId = null;
    this.touchState = initialTouchState();
    this.sidewalkTouchState = initialSidewalkTouchState();
    if (this.fit && (this.view.zoom !== 1 || this.view.panX !== 0 || this.view.panY !== 0)) this.setView(IDENTITY_VIEW);
  }

  /** Annotators, Objects step: the forward button. Sidewalk next on model-development images. */
  private onObjectsNext = () => {
    const check = validateObjectStep(this.currentAnnotationData, { words: this.words });
    if (!check.valid) {
      this.showStepError(check.error, check.boxIds);
      return;
    }
    if (this.askSidewalk) this.enterSidewalkStep();
    else this.enterObstructionStep();
  };

  private sidewalkCheck() {
    const { width, height } = this.imageSize();
    return validateSidewalkStep({
      askSidewalk: this.askSidewalk,
      mask: this.sidewalkState.mask,
      hasDraft: Boolean(this.sidewalkState.draft),
      imageWidth: width,
      imageHeight: height,
    });
  }

  /**
   * Annotators on model-development images: enter the Sidewalk step. Needs the
   * Objects check to pass. Clears the Obstructions start time, so the step
   * timings describe the last pass through each step. `restoring` is a reload
   * in the middle of the step, which neither shows an error nor caches. The
   * tutorial is still told the step, so its tour matches the screen.
   */
  public enterSidewalkStep = ({ restoring = false }: { restoring?: boolean } = {}) => {
    if (!this.askSidewalk) return;
    const check = validateObjectStep(this.currentAnnotationData, { words: this.words });
    if (!check.valid) {
      if (!restoring) this.showStepError(check.error, check.boxIds);
      return;
    }

    this.selectedId = null;
    this.currentTransformer = null;
    this.setAnnotationState(new SidewalkAnnotationState(this));
    this.sidewalkStepStartMs = Date.now();
    this.obstructionStepStartMs = null;
    this.setState({ annotatorStep: "sidewalk", error: null, showInput: false, hiddenBoxIds: [], ...this.sheetStepReset() }, () => {
      this.onShapeChange();
      this.afterStepChange();
      if (!restoring) this.cacheCurrentImageEdits();
      // Told on a reload too, so the tutorial shows this step's tour
      this.props.onAnnotatorStepChange?.("sidewalk");
    });
  };

  /** Annotators, Sidewalk step: the forward button. */
  private onSidewalkNext = () => {
    const sidewalk = this.sidewalkCheck();
    if (!sidewalk.valid) {
      this.showStepError(sidewalk.error);
      return;
    }
    this.enterObstructionStep();
  };

  /** Annotators, Obstructions step: back to Sidewalk, with the outline as it was. */
  private backToSidewalk = () => {
    this.enterSidewalkStep();
  };

  /** Annotators: back to Objects from Sidewalk or Obstructions, keeping every box, mark and outline. */
  private backToObjects = () => {
    this.sidewalkStepStartMs = null;
    this.obstructionStepStartMs = null;
    this.setAnnotationState(new DefaultAnnotationState(this));
    this.setState({ annotatorStep: "objects", error: null, ...this.sheetStepReset() }, () => {
      this.onShapeChange();
      if (this.isSheet) this.afterStepChange();
      this.cacheCurrentImageEdits();
      this.props.onAnnotatorStepChange?.("objects");
    });
  };

  /**
   * Annotators, Obstructions step: marks or unmarks one real object. Public so
   * JudgingAnnotationState can call it. Does nothing in any other step, for Not
   * an object boxes or for an unknown id. The confirmation stays ticked, since
   * the annotator can see the marks they are confirming.
   */
  public toggleObstruction = (id: string) => {
    if (!this.inObstructionStep) return;
    const shape = this.shapes.find((s) => s.getAnnotationData().id === id);
    if (!shape) return;
    const data = shape.getAnnotationData();
    if (!isRealObject(data)) return;
    Object.assign(data, toggleObstructionPatch(data));
    this.onShapeChange();
    // Save each mark, so a refresh mid-step keeps the marks (6 Oct 2026)
    this.cacheCurrentImageEdits();
  };

  /**
   * Obstructions: the real object whose label is under this image point, or
   * null. A label is drawn over the boxes, so it is checked before them, by
   * the mouse (JudgingAnnotationState) and a finger alike. Public so
   * JudgingAnnotationState can call it.
   */
  public judgeLabelAt(point: Point): string | null {
    const { originX, originY, scale } = this.scaleState;
    const labels = this.shapes
      .map((shape) => ({ data: shape.getAnnotationData(), rect: shape.labelRect }))
      .filter(({ data, rect }) => rect && isRealObject(data) && !this.isBoxHidden(data.id))
      .map(({ data, rect }) => ({ id: data.id, rect }));
    return pickJudgeLabel(labels, point.x * scale + originX, point.y * scale + originY);
  }

  /**
   * Annotators, Sidewalk step: the drawing tools (13 Oct 2026, replacing a row
   * of six buttons above the photo that were mostly greyed out). Only the
   * tools for what is happening show (sidewalkTools.js): Finish, Undo and
   * Cancel while a shape is drawn, Delete point, Delete shape and Done while
   * one is selected, none otherwise. Photo only, a view setting, is always
   * there.
   *
   *   "desktop"  a bar at the top of the photo's card: what is happening on the
   *              left, the tools on the right. One line at a fixed height, so
   *              the photo never moves as the tools change.
   *   "sheet"    at the top of the answers sheet on a phone or tablet: 44 px
   *              buttons with an icon and a label, in a row of a fixed height.
   *   "compact"  icons only, on the full-screen photo.
   *
   * The editor's messages (a refused shape, an undone drag) stay under the
   * photo, next to where the drawing happens (8 Oct 2026).
   */
  private renderSidewalkToolbar(variant: "desktop" | "sheet" | "compact" = "desktop") {
    const { sidewalk, hideSidewalkFill } = this.state;
    const touch = variant !== "desktop";
    const context = sidewalkToolContext(sidewalk);
    const tools = sidewalkTools(sidewalk, { touch });
    const run = (action: string) => () => this.dispatchSidewalk({ type: action });
    const togglePhotoOnly = () => this.setState({ hideSidewalkFill: !hideSidewalkFill }, () => this.onShapeChange());
    const photoOnly = SIDEWALK_TOOL_COPY.photoOnly;

    if (touch) {
      const compact = variant === "compact";
      const base = "shrink-0 h-11 inline-flex items-center justify-center gap-1.5 rounded-control border text-xs font-semibold whitespace-nowrap transition-colors disabled:opacity-40";
      const plain = "border-line bg-surface text-ink";
      const filled = "border-primary bg-primary text-white";
      // Beside other tools the Photo only button is its icon alone, so a
      // phone's row holds them all without scrolling
      const photoIconOnly = compact || tools.length > 0;
      return (
        <div
          id={compact ? undefined : "sidewalk-tools"}
          role="toolbar"
          aria-label="Drawing tools"
          data-context={context}
          className={compact ? "flex items-center gap-1" : "h-11 flex items-center gap-2 overflow-x-auto overscroll-x-contain"}
        >
          {tools.map((entry) => (
            <button
              key={entry.key}
              type="button"
              data-tool={entry.key}
              disabled={entry.disabled}
              aria-label={entry.name}
              title={compact ? sidewalkToolTitle(entry, { keys: false }) : undefined}
              onClick={run(entry.action)}
              className={`${base} ${compact ? "w-11" : "px-3"} ${entry.primary ? filled : plain}`}
            >
              {SIDEWALK_TOOL_ICONS[entry.key](18)}
              {!compact && entry.label}
            </button>
          ))}
          <button
            type="button"
            data-tool="photoOnly"
            aria-label={photoOnly.name}
            title={photoIconOnly ? photoOnly.name : undefined}
            aria-pressed={hideSidewalkFill}
            onClick={togglePhotoOnly}
            className={`${base} ${photoIconOnly ? "w-11" : "px-3"} ${hideSidewalkFill ? filled : plain}`}
          >
            <PhotoIcon size={18} />
            {!photoIconOnly && photoOnly.label}
          </button>
        </div>
      );
    }

    return (
      <div
        id="sidewalk-tools"
        role="toolbar"
        aria-label="Drawing tools"
        data-context={context}
        className="min-h-[44px] flex items-center gap-2 px-1 pb-2"
      >
        {/* What the tools are for, or what to do next. Left out where a narrow window has no room for it. */}
        <div className="flex-1 min-w-0">
          <p role="status" className="hidden xl:block truncate text-sm font-semibold text-ink">
            {sidewalkToolbarStatus(sidewalk, this.words)}
          </p>
        </div>
        {tools.map((entry) =>
          entry.key === "done" ? (
            // The same tick as Done in the Objects step's box panel
            <button
              key={entry.key}
              type="button"
              data-tool={entry.key}
              aria-label={entry.name}
              title={sidewalkToolTitle(entry)}
              onClick={run(entry.action)}
              className="shrink-0 w-[38px] h-[38px] flex items-center justify-center rounded-control bg-blue-50 hover:bg-blue-100 text-primary transition-colors border border-blue-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <CheckIcon size={18} />
            </button>
          ) : (
            <Button
              key={entry.key}
              size="sm"
              variant={entry.primary ? "primary" : "neutral"}
              data-tool={entry.key}
              disabled={entry.disabled}
              aria-label={entry.name}
              title={sidewalkToolTitle(entry)}
              onClick={run(entry.action)}
              className="shrink-0"
            >
              {SIDEWALK_TOOL_ICONS[entry.key](16)}
              {entry.label}
            </Button>
          )
        )}
        {tools.length > 0 && <span className="shrink-0 w-px h-6 bg-line mx-1" aria-hidden="true" />}
        <Button
          size="sm"
          variant={hideSidewalkFill ? "primary" : "neutral"}
          data-tool="photoOnly"
          aria-label={photoOnly.name}
          title={photoOnly.name}
          aria-pressed={hideSidewalkFill}
          onClick={togglePhotoOnly}
          className="shrink-0"
        >
          <PhotoIcon size={16} />
          {photoOnly.label}
        </Button>
      </div>
    );
  }

  /**
   * Annotators, Sidewalk step: the shapes under the canvas, and No sidewalk.
   * Each shape is a chip, like the boxes in "Objects in This Image": clicking it
   * selects the shape on the photo, where its points can be dragged, and the ×
   * deletes it (redesigned 6 Oct 2026, the shapes were large buttons with no
   * hint of what they did).
   */
  private renderSidewalkShapesCard(variant: CardVariant = "desktop") {
    const sheet = variant === "sheet";
    const { sidewalk } = this.state;
    const { polygons, noSidewalk } = sidewalk.mask;
    const hasShapes = polygons.length > 0 || Boolean(sidewalk.draft);
    const number = sidewalkShapeNumber;
    const selected = polygons.find((p) => p.id === sidewalk.selectedId);
    // "tap" with a finger, the desktop wording with a mouse (annotatorStepCopy.js)
    const hint = sidewalkOutlineHint(
      { drawing: Boolean(sidewalk.draft), selectedNumber: selected ? number(selected.id) : null, shapeCount: polygons.length, noSidewalk },
      this.words
    );

    return (
      <div id="sidewalk-shapes" className="bg-surface rounded-card border border-line shadow-sm p-4 w-full">
        <div className="flex items-baseline justify-between gap-2 mb-2">
          <H3><span className="text-lg font-bold text-ink">Sidewalk Outline</span></H3>
          {polygons.length > 0 && (
            <span className="text-xs text-muted">{polygons.length === 1 ? "1 shape" : `${polygons.length} shapes`}</span>
          )}
        </div>

        {polygons.length > 0 && (
          <ul className="flex flex-wrap gap-2 mb-2">
            {polygons.map((polygon) => {
              const isSelected = polygon.id === sidewalk.selectedId;
              return (
                <li
                  key={polygon.id}
                  className={`flex items-center gap-1.5 rounded-control border pl-1 pr-1 py-0.5 transition-colors ${sheet ? "min-h-[44px] " : ""}${isSelected ? "border-primary bg-primary-50" : "border-line bg-surface hover:border-primary"}`}
                >
                  <button
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => this.dispatchSidewalk({ type: "SELECT_SHAPE", id: polygon.id })}
                    className={`flex items-baseline gap-1.5 px-1 py-0.5 text-left cursor-pointer${sheet ? " min-h-[44px] items-center" : ""}`}
                  >
                    <span className="text-xs font-semibold text-ink whitespace-nowrap">Shape {number(polygon.id)}</span>
                    <span className={`${sheet ? "text-xs" : "text-[11px]"} text-muted whitespace-nowrap`}>{polygon.points.length} points</span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete shape ${number(polygon.id)}`}
                    title="Delete shape"
                    onClick={() => {
                      this.dispatchSidewalk({ type: "SELECT_SHAPE", id: polygon.id });
                      this.dispatchSidewalk({ type: "DELETE_SHAPE" });
                    }}
                    className={`shrink-0 bg-surface border border-line hover:bg-danger-soft hover:text-danger text-muted rounded-full flex items-center justify-center font-bold transition-colors ${sheet ? "w-9 h-9 text-sm" : "w-5 h-5 text-[10px]"}`}
                  >
                    ×
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <p className="text-xs text-muted">{hint}</p>

        <div className={`mt-3 pt-3 border-t border-line${sheet ? " min-h-[44px] flex items-center" : ""}`}>
          <Checkbox
            id="no-sidewalk"
            checked={noSidewalk}
            disabled={hasShapes}
            onChange={(e) => this.dispatchSidewalk({ type: "SET_NO_SIDEWALK", value: e.target.checked })}
            label={
              <>
                No sidewalk or pedestrian path in this image
                {hasShapes && (
                  <span className="block text-xs font-normal text-muted mt-0.5">
                    Delete the shapes above to tick this.
                  </span>
                )}
              </>
            }
          />
        </div>
      </div>
    );
  }

  /** Annotators, Sidewalk step: "What Counts as Walking Space" beside the canvas. */
  private renderSidewalkGuide(variant: CardVariant = "desktop") {
    return (
      <div style={variant === "sheet" ? undefined : { flex: '35 1 0%' }} className="min-w-0">
        <div
          id="sidewalk-guide"
          className={variant === "sheet" ? GUIDE_SHEET_CLASS : "sticky top-4 bg-surface rounded-card border border-line shadow-sm p-4 max-h-[calc(100vh-2rem)] overflow-y-auto"}
        >
          <H2 className="text-lg font-bold text-ink mb-3">What Counts as Walking Space</H2>
          <ul className="space-y-2 list-disc pl-4">
            {SIDEWALK_GUIDE.map((point) => (
              <li key={point} className="text-sm text-body leading-snug">{point}</li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  /** Annotators, Obstructions step: the list under the canvas, and the confirmation. */
  private renderObstructionsCard(displayLabels: Map<string, string>, variant: CardVariant = "desktop") {
    const sheet = variant === "sheet";
    const objects = realObjects(this.currentAnnotationData);
    const { marked } = summarizeObstructionStep(this.currentAnnotationData);
    return (
      <div id="box-review-section" className="bg-surface rounded-card border border-line shadow-sm p-4 w-full">
        <H3><span className="text-lg font-bold text-ink">Which of These Obstruct the Sidewalk for You?</span></H3>
        <p className="text-xs text-muted mb-3">Marked as obstructing: {marked} of {objects.length}</p>
        {this.askSidewalk && (
          <div className="mb-3">
            <Button
              size="sm"
              variant="neutral"
              aria-pressed={this.state.showSidewalkOverlay}
              onClick={() => this.setState({ showSidewalkOverlay: !this.state.showSidewalkOverlay }, () => this.onShapeChange())}
            >
              {this.state.showSidewalkOverlay ? "Hide sidewalk outline" : "Show sidewalk outline"}
            </Button>
          </div>
        )}
        <ul className="flex flex-wrap gap-2">
          {objects.map((box) => {
            const isMarked = box.obstructs === true;
            return (
              <li key={box.id}>
                <button
                  type="button"
                  aria-pressed={isMarked}
                  onClick={() => this.toggleObstruction(box.id)}
                  className={`text-xs font-semibold rounded-control border transition-colors whitespace-nowrap ${sheet ? "min-h-[44px] px-3" : "px-2 py-1"} ${isMarked
                    ? "bg-red-600 border-red-600 text-white"
                    : "bg-surface border-line text-ink hover:border-primary"
                    }`}
                >
                  {displayLabels.get(box.id) ?? formatLabel(box.comment)}
                </button>
              </li>
            );
          })}
        </ul>
        {/* In the sheet the confirmation is at the top, always in view */}
        {!sheet && (
          <div className="mt-4 pt-3 border-t border-line">
            <Checkbox
              id="obstructions-confirmed"
              checked={this.state.obstructionsConfirmed}
              onChange={(e) => this.setState({ obstructionsConfirmed: e.target.checked })}
              label="I checked every object. The ones I did not mark do not obstruct the sidewalk for me."
            />
          </div>
        )}
      </div>
    );
  }

  /** Annotators, Obstructions step: "What Counts as an Obstruction" beside the canvas. */
  private renderObstructionGuide(variant: CardVariant = "desktop") {
    return (
      <div style={variant === "sheet" ? undefined : { flex: '35 1 0%' }} className="min-w-0">
        <div
          id="obstruction-guide"
          className={variant === "sheet" ? GUIDE_SHEET_CLASS : "sticky top-4 bg-surface rounded-card border border-line shadow-sm p-4 max-h-[calc(100vh-2rem)] overflow-y-auto"}
        >
          <H2 className="text-lg font-bold text-ink mb-3">What Counts as an Obstruction</H2>
          <ul className="space-y-2 list-disc pl-4">
            {OBSTRUCTION_GUIDE.map((point) => (
              <li key={point} className="text-sm text-body leading-snug">{point}</li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  private onPrevious = async () => {
    // 1. Check if we are at the start
    if (this.props.currentAnnotationCount <= 1) return;

    // 2. Save User Edits Locally (Just in case they drew something before going back)
    this.cacheCurrentImageEdits();

    // 3. Decrement the counter in Local Storage. From the image on screen, so
    // a double click lands on the same previous image rather than two back.
    const newCount = this.props.currentAnnotationCount - 1;
    writeCurrentCount(newCount);

    // 4. Update the DB Session so logouts resume correctly
    await fetch("/api/updateSessionCount", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentAnnotationCount: newCount }),
    }).catch(err => console.error(err));

    // 5. Reload to fetch the previous image
    sessionStorage.setItem("isNavigatingImages", "true");
    Router.reload();
  };

  /**
   * Validates the three steps, derives telemetry, and posts the annotation.
   *
   * Validation is strict on purpose — an image submitted with an unresolved
   * suggestion or a missing surface type is a hole in the dataset that nobody
   * will ever come back to fill.
   */
  private submit = async () => {
    // One submit at a time (8 Oct 2026). A double click on Next Image, or Enter
    // and a click, used to send the image twice, and each success moved the
    // position on by one, so the next image was skipped and a 50-image session
    // ended after 49.
    if (this.submitInFlight) return;
    const durationMs = Date.now() - this.mountTime;

    const username = this.props.username;
    // Annotators send every decided suggestion (kept or Not an object) and
    // every drawn box, with the confirmed obstruction answers: marked objects
    // obstruct, every other real object does not. Contributors send the
    // suggestions they answered Yes or No.
    const objectStep = this.annotatorObjectStep;
    const imageSize = this.imageSize();
    // The outline as the server stores it: clamped to the image and rounded.
    // null for reference images and contributors.
    const submittedMask = objectStep && this.askSidewalk
      ? normalizeSidewalkMask(this.sidewalkState.mask, imageSize.width, imageSize.height)
      : null;
    const answered = objectStep ? finalizeObstructionAnswers(this.currentAnnotationData) : this.currentAnnotationData;
    const decidedSuggestions = answered.filter((element) =>
      !element.editable && (objectStep ? isDecidedForObjects(element) : (element.selected || element.isRejected))
    );
    const drawnBoxes = answered.filter(
      (element) => element.editable
    );
    // Both roles: marks normalized (positive width and height) and clipped to
    // the image before sending. initialState is left alone.
    const selectedObjects = this.tidyMarks(decidedSuggestions);
    // drawnOrder only numbers boxes on screen, so it is not submitted
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- dropped on purpose
    const newObjects = this.tidyMarks(drawnBoxes).map(({ drawnOrder, ...box }) => box);

    // A box with no area on the photo (one left wholly in the band beside it
    // before 8 Oct 2026) would be refused by the server. Say which.
    const offPhoto = [...selectedObjects, ...newObjects].find(
      (box) => box?.mark && box.comment !== NOT_AN_OBJECT && !(markArea(box.mark) > 0)
    );
    if (offPhoto) {
      const label = buildDisplayLabelsInOrder(this.currentAnnotationData).get(offPhoto.id) || "A box";
      this.showMessage(`${label} is outside the photo. Move it onto the photo or delete it.`);
      if (!this.openFirstUnfinished([offPhoto.id])) this.showSection("objects");
      return;
    }

    const counts = buildSubmissionCounts(answered);
    const {
      manualBoxCount,
      acceptedSuggestionCount,
      modifiedSuggestionCount,
      deletedSuggestionCount,
      notAnObjectSuggestionCount,
      obstructionCount,
      nonObstructionCount,
    } = counts;

    const submitTime = Date.now();
    const stepTimings = objectStep
      ? computeAnnotatorStepTimings(this.mountTime, this.obstructionStepStartMs, submitTime, {
        sidewalkStepStartMs: this.sidewalkStepStartMs,
      })
      : computeStepTimings(this.mountTime, this.sceneStepStartMs, submitTime, {
        hasSceneStep: this.askScene,
      });
    const suggestionConfidences = buildSuggestionConfidences(this.currentAnnotationData);
    const hiddenConfidences = this.hiddenSuggestions.map((s) => ({
      id: s.id,
      confidence: s.confidence ?? null,
      action: "hidden_below_tau",
    }));
    const geometryChanges = buildGeometryChanges(this.currentAnnotationData);
    const labelChanges = buildLabelChanges(this.currentAnnotationData);

    const maskSummary = submittedMask ? summarizeSidewalkMask(submittedMask) : null;
    const sidewalkTelemetry = objectStep
      ? {
        sidewalkWalkShapes: maskSummary ? maskSummary.walkCount : null,
        sidewalkPoints: maskSummary ? maskSummary.pointCount : null,
        noSidewalk: maskSummary ? maskSummary.noSidewalk : null,
      }
      : {};

    const telemetryPayload = {
      imageDurationMs: durationMs,
      ...stepTimings,
      ...sidewalkTelemetry,
      imagePositionInSession: this.props.currentAnnotationCount,
      isReferenceImage: this.props.isReference ?? false,
      manualBoxCount,
      acceptedSuggestionCount,
      modifiedSuggestionCount,
      deletedSuggestionCount,
      notAnObjectSuggestionCount,
      totalBoxesSubmitted: manualBoxCount + acceptedSuggestionCount + modifiedSuggestionCount,
      obstructionCount,
      nonObstructionCount,
      tauThreshold: TAU_THRESHOLD,
      hiddenSuggestionCount: this.hiddenSuggestions.length,
      suggestionConfidences: [...suggestionConfidences, ...hiddenConfidences],
      geometryChanges,
      labelChanges,
      // Device and input (9 Oct 2026). The server adds the browser family.
      ...this.deviceTelemetry(),
    };

    this.setState({ error: null });

    const { sceneLevel } = this.state;
    const validationResult = validateAnnotationForSubmit({
      existingAnnotations: this.currentAnnotationData,
      newObjects,
      selectedObjects,
      sceneLevel,
      isAnnotator: objectStep,
      obstructionsConfirmed: this.state.obstructionsConfirmed,
      askSidewalk: this.askSidewalk,
      sidewalkMask: this.sidewalkState.mask,
      sidewalkDraftOpen: Boolean(this.sidewalkState.draft),
      imageWidth: imageSize.width,
      imageHeight: imageSize.height,
      words: this.words,
    });

    if (!validationResult.valid) {
      this.showMessage(validationResult.error);
      // The first box the message is about opens; otherwise, on a phone, the
      // part of the screen it is about shows
      const { section, boxIds } = validationResult as { section?: string; boxIds?: string[] };
      if (!this.openFirstUnfinished(boxIds)) this.showSection(section);
      return;
    }

    const body = {
      username: username,
      imageID: this.props.imageID,
      city: this.props.city,
      servedModelVersion: this.props.servedModelVersion,
      sceneLevel: this.askScene ? sceneLevel : null,
      // Annotators on model-development images only (6 Oct 2026)
      ...(objectStep ? { sidewalkMask: submittedMask } : {}),
      selectedObjectsID: selectedObjects,
      newObjects: newObjects,
      currentAnnotationCount: this.props.currentAnnotationCount + 1,
      canvasVersion: CANVAS_VERSION,
      telemetry: telemetryPayload,
    };
    this.submitInFlight = true;
    this.setState({ submitting: true });
    let res: Response;
    try {
      res = await fetch("/api/annotationSubmit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      this.submitInFlight = false;
      this.setState({ submitting: false });
      this.showMessage("We couldn't save that annotation. Check your connection and try again.");
      return;
    }
    if (res.status === 200) {
      // Fold the current UI state into the cached batch so 'Previous' can
      // restore it without another round trip. An annotator's finished image
      // reopens at Objects, with the answers as submitted.
      this.cacheCurrentImageEdits(
        objectStep ? { annotatorStep: "objects", annotations: answered, sidewalkMask: submittedMask } : {}
      );

      // The image after the one on screen, never one more than whatever the
      // cache holds: a repeated success then lands on the same image
      const newCount = this.props.currentAnnotationCount + 1;
      writeCurrentCount(newCount);

      sessionStorage.setItem("isNavigatingImages", "true");
      Router.reload();
      window.scrollTo(0, 0);
    } else {
      // The server explains a refusal (422 and the like). Anything else is
      // most likely the connection.
      let message: string | null = null;
      if (res.status >= 400 && res.status < 500) {
        try {
          const json = await res.json();
          if (typeof json?.message === "string" && json.message) message = json.message;
        } catch {
          message = null;
        }
      }
      this.submitInFlight = false;
      this.setState({ submitting: false });
      this.showMessage(message || "We couldn't save that annotation. Check your connection and try again.");
    }
  };

  /**
   * Writes the boxes, rating, and surface choice for the image on screen back
   * into the cached batch. Called before navigating in either direction so the
   * page reload that follows picks the work back up.
   */
  private cacheCurrentImageEdits = ({
    annotatorStep,
    annotations,
    sidewalkMask,
  }: { annotatorStep?: AnnotatorStep; annotations?: IAnnotation[]; sidewalkMask?: unknown } = {}) => {
    const localData = readSessionData();
    if (!localData || !localData.imgRecords) return;

    const currentIndex = this.props.currentAnnotationCount - 1;
    const record = localData.imgRecords[currentIndex];
    if (!record) return;

    record.annotationList = this.tidyMarks(annotations ?? this.currentAnnotationData);
    record.userSliderValue = this.state.sliderValue;
    record.userPavementType = this.state.pavementType;
    record.userSceneLevel = this.askScene ? this.state.sceneLevel : null;
    if (this.annotatorObjectStep) {
      record.userAnnotatorStep = annotatorStep ?? this.state.annotatorStep;
      // A half-drawn shape is not cached
      record.userSidewalkMask = this.askSidewalk ? (sidewalkMask ?? this.sidewalkState.mask) : null;
    }
    writeSession({ data: localData });
  };

  public setAnnotationState = (annotationState: IAnnotationState) => {
    this.currentAnnotationState = annotationState;
  };

  /**
   * Where each box's name goes on the photo (17 Oct 2026, apple-design check).
   * Names were painted at their box's top-left corner as each box was drawn,
   * so boxes side by side (a row of parked motorcycles, or any two boxes on a
   * phone, where the photo is small) painted their names over each other:
   * "Car #1" read "r #1". Names are now placed before painting, in the lists'
   * order, each moved down below an earlier name it would cover (placeLabel).
   * The order is the lists', not the drawing order, which changes on every
   * click, so no name moves when a box is clicked. The selected box keeps its
   * spot though its name is not painted, for the same reason.
   */
  private labelSpots(labels: Map<string, string>, variant: string): Map<string, { x: number; y: number }> {
    const spots = new Map<string, { x: number; y: number }>();
    if (!this.canvas2D || !this.paintsBoxes) return spots;
    const rank = new Map(Array.from(labels.keys()).map((id, i) => [id, i] as [string, number]));
    const named = this.shapes
      .filter((shape) => {
        const data = shape.getAnnotationData();
        if (this.isBoxHidden(data.id) || !data.comment) return false;
        return !(variant === "obstructions" && data.comment === "not_an_object");
      })
      .sort((a, b) => (rank.get(a.getAnnotationData().id) ?? Infinity) - (rank.get(b.getAnnotationData().id) ?? Infinity));
    const placed: IShapeBase[] = [];
    for (const shape of named) {
      const data = shape.getAnnotationData();
      const text = shape.labelText(labels.get(data.id));
      if (!text) continue;
      const rect = placeLabel(this.calculateShapePosition(data.mark), shape.measureLabel(this.canvas2D, text), placed);
      placed.push(rect);
      spots.set(data.id, { x: rect.x, y: rect.y });
    }
    return spots;
  }

  public selectAnnotation = (data) => {
    // Numbered in the lists' order, not drawing order
    const labels = buildDisplayLabelsInOrder(this.currentAnnotationData);
    this.paintSidewalkLayer();
    const variant = this.paintVariant;
    const spots = this.labelSpots(labels, variant);
    for (const item of this.shapes) {
      if (!this.paintsBoxes) break;
      if (this.isBoxHidden(item.getAnnotationData().id)) continue;
      const isSelected = variant === "default" && item.getAnnotationData().id === data.id;
      item.paint(
        this.canvas2D,
        this.calculateShapePosition,
        isSelected,
        labels.get(item.getAnnotationData().id),
        variant,
        spots.get(item.getAnnotationData().id)
      );

      if (isSelected) {
        if (!this.currentTransformer) {
          this.currentTransformer = this.makeTransformer(item);
        }

        this.currentTransformer.paint(
          this.canvas2D,
          this.calculateShapePosition,
          this.scaleState.scale
        );

        this.syncPanel(item);
      }
    }
    this.currentAnnotationData = this.shapes.map((item) =>
      item.getAnnotationData()
    );
    const { onChange } = this.props;
    onChange(this.currentAnnotationData);
  };

  public onShapeChange = ({ quiet = false }: { quiet?: boolean } = {}) => {
    // The selected box, whose panel shows. Found while painting, or without a
    // canvas (jsdom) straight from the shapes, so the panel's state never
    // depends on painting (9 Oct 2026).
    let selectedItem: IShape | null = null;
    if (this.canvas2D && this.canvasRef.current) {
      this.canvas2D.clearRect(
        0,
        0,
        this.canvasRef.current.width,
        this.canvasRef.current.height
      );

      // Numbered in the lists' order, not drawing order, which changes on every
      // click: "Lamp Post #2" is the same box on the photo and in the list
      const labels = buildDisplayLabelsInOrder(this.currentAnnotationData);

      // The sidewalk outline goes under the boxes
      this.paintSidewalkLayer();

      // Obstructions locks the boxes: nothing is selected or transformed.
      // Sidewalk shows none.
      const variant = this.paintVariant;
      const spots = this.labelSpots(labels, variant);
      for (const item of this.shapes) {
        if (!this.paintsBoxes) break;
        if (this.isBoxHidden(item.getAnnotationData().id)) continue;
        const isSelected = variant === "default" && item.getAnnotationData().id === this.selectedId;
        item.paint(
          this.canvas2D,
          this.calculateShapePosition,
          isSelected,
          labels.get(item.getAnnotationData().id),
          variant,
          spots.get(item.getAnnotationData().id)
        );

        if (isSelected) {
          if (!this.currentTransformer) {
            this.currentTransformer = this.makeTransformer(item);
          }

          selectedItem = item;

          this.currentTransformer.paint(
            this.canvas2D,
            this.calculateShapePosition,
            this.scaleState.scale
          );
        }
      }
    } else if (this.paintVariant === "default" && this.paintsBoxes) {
      const item = this.selectedShape();
      if (item && !this.isBoxHidden(item.getAnnotationData().id)) selectedItem = item;
    }

    if (selectedItem) {
      this.syncPanel(selectedItem);
    } else if (!quiet) {
      // quiet: a pointer-speed repaint, which must not re-render
      this.setState({
        showInput: false,
        inputComment: "",
        editable: false,
        selected: false,
        isRejected: false,
      });
    }
    this.currentAnnotationData = this.shapes.map((item) =>
      item.getAnnotationData()
    );
    const { onChange } = this.props;
    onChange(this.currentAnnotationData);
    // Every box edit is saved shortly after it stops (8 Oct 2026). A quiet
    // repaint is a pointer moving over the sidewalk outline, not an edit.
    if (!quiet) this.scheduleEditSave();
  };

  /**
   * Shows the selected box's panel with its answers (9 Oct 2026, moved out of
   * the painting code). On the desktop photo the panel sits beside the box: to
   * its right, or to its left when it would run off the stage.
   */
  private syncPanel(item: IShape) {
    const data = item.getAnnotationData();
    const { x, y, width: boxW } = this.calculateShapePosition(data.mark);
    const stage = this.stageSize();

    this.setState({
      showInput: true,
      inputPosition: panelPosition({ x, y, width: boxW }, stage, this.props.marginWithInput),
      inputComment: data.comment || "",
      originalComment: data.initialState?.comment || "",
      editable: data.editable || false,
      selected: data.selected || false,
      isRejected: data.isRejected || false,
      obstructs: data.obstructs,
      severity: data.severity,
    });
  }

  /**
   * Rebuilds the shapes array from props, but only when something actually
   * differs — a blanket rebuild on every update would discard the user's
   * in-progress work along with the current selection.
   */
  private syncAnnotationData = () => {
    const { annotationData } = this.props;
    const { visible, hidden } = filterAnnotationsByTau(annotationData, TAU_THRESHOLD);
    this.hiddenSuggestions = hidden;

    const refreshShapesWithAnnotationData = () => {
      this.selectedId = null;
      this.shapes = visible.map(
        (eachAnnotationData) => {
          if (!eachAnnotationData.editable && !eachAnnotationData.initialState) {
            eachAnnotationData.initialState = {
              comment: eachAnnotationData.comment,
              mark: { ...eachAnnotationData.mark }
            };
            eachAnnotationData.selected = false;
            eachAnnotationData.isRejected = false;
          }
          return new RectShape(
            eachAnnotationData,
            this.onShapeChange,
            this.annotationStyle
          );
        }
      );
      this.onShapeChange();
    };

    for (const annotationDataItem of visible) {
      const targetShape = this.shapes.find(
        (item) => item.getAnnotationData().id === annotationDataItem.id
      );
      if (targetShape && targetShape.equal(annotationDataItem)) {
        continue;
      } else {
        refreshShapesWithAnnotationData();
        break;
      }
    }
  };

  private syncSelectedId = () => {
    const { selectedId } = this.props;

    if (selectedId && selectedId !== this.selectedId) {
      this.selectedId = selectedId;
      this.onShapeChange();
    }
  };

  private onDelete = () => {
    const deleteTarget = this.shapes.findIndex(
      (shape) => shape.getAnnotationData().id === this.selectedId
    );

    if (deleteTarget >= 0) {
      if (this.shapes[deleteTarget].getAnnotationData().editable) {
        this.shapes.splice(deleteTarget, 1);
        // Clear the selection, which also drops the deleted box's resize
        // handles. Left in place, they swallowed the next press where the box
        // had been (found 8 Oct 2026).
        this.selectedId = null;
        this.onShapeChange();
      }
    }
  };

  // The annotator panel never reaches the four obstruction handlers below. The
  // guards make sure an annotator box can never get an obstruction answer
  // through an old path.
  private onSelectObstruction = () => {
    if (this.annotatorObjectStep) return;
    const selectTarget = this.shapes.findIndex(
      (shape) => shape.getAnnotationData().id === this.selectedId
    );

    let keepSelected = false;
    if (selectTarget >= 0) {
      const data = this.shapes[selectTarget].getAnnotationData();
      if (!data.editable) {
        // A contributor's first Yes keeps the panel open for the severity
        // picker. Annotators give no severity, so Yes closes it like No.
        if (!data.selected && this.askSeverity) {
          keepSelected = true;
        }
        if (!this.askSeverity) {
          data.severity = null;
        }
        data.selected = true;
        data.isRejected = false;
        data.obstructs = true;
        this.setState({
          selected: true,
          isRejected: false,
          obstructs: true,
          ...(this.askSeverity ? {} : { severity: null }),
        });
        this.onShapeChange();
      }
      // A drawn box: the check button and Enter only confirm the category and
      // close the panel. Yes or No is answered separately (onSetObstructs).
    }

    if (!keepSelected) {
      this.closePanel();
    }
  };

  private onUnselectObstruction = () => {
    if (this.annotatorObjectStep) return;
    const selectTarget = this.shapes.findIndex(
      (shape) => shape.getAnnotationData().id === this.selectedId
    );

    if (selectTarget >= 0) {
      if (!this.shapes[selectTarget].getAnnotationData().editable) {
        const data = this.shapes[selectTarget].getAnnotationData();
        data.selected = false;
        data.isRejected = true;
        data.obstructs = false;
        data.severity = null;
        this.setState({ selected: false, isRejected: true, obstructs: false, severity: null });
        this.onShapeChange();
      }
    }

    this.closePanel();
  };

  private onMarkNotAnObject = () => {
    const selectTarget = this.shapes.findIndex(
      (shape) => shape.getAnnotationData().id === this.selectedId
    );

    if (selectTarget >= 0) {
      const data = this.shapes[selectTarget].getAnnotationData();
      if (data.editable) return;
      // Annotators give no obstruction answer, so their Not an object box keeps obstructs null
      const patch = this.annotatorObjectStep ? annotatorNotAnObjectPatch() : notAnObjectPatch();
      Object.assign(data, patch);
      this.setState({ selected: false, isRejected: true, obstructs: patch.obstructs, severity: null, inputComment: NOT_AN_OBJECT });
      this.onShapeChange();
    }

    this.closePanel();
  };

  /**
   * Annotators: keep the selected suggestion as a real object. Refused while
   * its category is not one of the 18, and for drawn boxes, which are always
   * kept. Closes the panel like the contributor's No does.
   */
  private onKeep = () => {
    if (!this.annotatorObjectStep) return;
    const target = this.shapes.find((shape) => shape.getAnnotationData().id === this.selectedId);
    if (!target) return;
    const data = target.getAnnotationData();
    if (data.editable || !isTaxonomyCategory(data.comment)) return;
    Object.assign(data, keepObjectPatch());
    this.setState({ selected: true, isRejected: false, obstructs: null, severity: null });
    this.onShapeChange();

    this.closePanel();
  };

  /** Closes the panel without changing the box (the check button). */
  private onClose = () => {
    this.closePanel();
  };

  /**
   * Deselects the box, which closes its panel (8 Oct 2026). This used to be a
   * simulated click at (-1, -1), just off the photo's top-left corner. For a
   * box touching that corner the click landed on the box's own resize handle,
   * so No, Not an object, Keep or Close left the panel open. In Sidewalk and
   * Obstructions the step keeps its own click handling.
   */
  private closePanel = () => {
    this.selectedId = null;
    if (this.inBoxStep) this.setAnnotationState(new DefaultAnnotationState(this));
    this.onShapeChange();
  };

  private onSetObstructs = (obstructs: boolean) => {
    if (this.annotatorObjectStep) return;
    const selectTarget = this.shapes.findIndex(
      (shape) => shape.getAnnotationData().id === this.selectedId
    );

    if (selectTarget >= 0) {
      const data = this.shapes[selectTarget].getAnnotationData();
      data.obstructs = obstructs;
      // A No clears the severity. A first Yes leaves it empty, so the panel
      // shows the severity picker, as it does for suggestions (7 Oct 2026).
      if (!obstructs || !this.askSeverity) data.severity = null;
      this.setState({ obstructs, severity: data.severity ?? null });
      this.onShapeChange();
    }
  };

  private onSetSeverity = (severity: number) => {
    // The panel never shows severity to annotators, this is only a guard
    if (this.annotatorObjectStep || !this.askSeverity) return;

    const selectTarget = this.shapes.findIndex(
      (shape) => shape.getAnnotationData().id === this.selectedId
    );

    if (selectTarget >= 0) {
      const data = this.shapes[selectTarget].getAnnotationData();
      data.severity = severity as 1 | 2 | 3 | 4 | 5;
      data.obstructs = true;
      this.setState({ severity, obstructs: true });
      this.onShapeChange();

      // Severity is only set from the severity picker's Confirm, which
      // finishes the box, so the panel closes for suggestions and drawn boxes
      // alike (7 Oct 2026)
      this.onClose();
    }
  };

  /**
   * Contributors: the severity picker's Go back after a first Yes. Takes the
   * Yes back so the box is unanswered again and the panel shows the question
   * (7 Oct 2026). Before, Go back on a suggestion recorded a No.
   */
  private onClearObstruction = () => {
    if (this.annotatorObjectStep) return;
    const target = this.shapes.find((shape) => shape.getAnnotationData().id === this.selectedId);
    if (!target) return;
    const data = target.getAnnotationData();
    data.obstructs = undefined;
    data.severity = null;
    if (!data.editable) {
      data.selected = false;
      data.isRejected = false;
    }
    this.setState({ obstructs: undefined, severity: null, selected: data.selected || false, isRejected: data.isRejected || false });
    this.onShapeChange();
  };

  /**
   * Contributors: Undo on a suggestion marked Not an object. It gets the
   * model's category back and no answer, so it is still to decide (7 Oct 2026).
   */
  private onRestoreObject = () => {
    if (this.annotatorObjectStep) return;
    const target = this.shapes.find((shape) => shape.getAnnotationData().id === this.selectedId);
    if (!target) return;
    const data = target.getAnnotationData();
    if (data.editable || data.comment !== NOT_AN_OBJECT) return;
    const original = data.initialState?.comment;
    const comment = original && original !== NOT_AN_OBJECT ? original : "---";
    data.comment = comment;
    data.selected = false;
    data.isRejected = false;
    data.obstructs = undefined;
    data.severity = null;
    this.setState({ inputComment: comment, selected: false, isRejected: false, obstructs: undefined, severity: null });
    this.onShapeChange();
  };

  private setCanvasDPI = () => {
    const currentCanvas = this.canvasRef.current;
    const currentImageCanvas = this.imageCanvasRef.current;
    if (currentCanvas && currentImageCanvas) {
      const currentCanvas2D = currentCanvas.getContext("2d");
      const currentImageCanvas2D = currentImageCanvas.getContext("2d");
      if (currentCanvas2D && currentImageCanvas2D) {
        currentCanvas2D.setTransform(1, 0, 0, 1, 0, 0);
        currentCanvas2D.scale(2, 2);
        currentImageCanvas2D.setTransform(1, 0, 0, 1, 0, 0);
        currentImageCanvas2D.scale(2, 2);
      }
    }
  };

  private onInputCommentChange = (comment: string) => {
    const selectedShapeIndex = this.shapes.findIndex(
      (item) => item.getAnnotationData().id === this.selectedId
    );

    // findIndex returns -1 when the selection was cleared between render and
    // this callback firing; shapes[-1] would throw
    if (selectedShapeIndex === -1) return;

    this.shapes[selectedShapeIndex].setComment(comment);
    this.currentAnnotationData = this.shapes.map((item) =>
      item.getAnnotationData()
    );
    this.setState({ inputComment: comment });
  };

  private cleanImage = () => {
    if (this.imageCanvas2D && this.imageCanvasRef.current) {
      this.imageCanvas2D.clearRect(
        0,
        0,
        this.imageCanvasRef.current.width,
        this.imageCanvasRef.current.height
      );
    }
  };

  /**
   * Paints the photo onto the lower canvas, loading it first if needed.
   *
   * Calls itself once: the first pass has no image element, so it starts a load
   * and returns. The load handler works out the scale and offsets that letterbox
   * the photo into the canvas — comparing aspect ratios to decide whether width
   * or height is the binding constraint — then calls back in to actually draw.
   *
   * That scale is also what calculateMousePosition inverts, so clicks map back
   * to coordinates in the original image rather than the displayed one. Boxes
   * are therefore stored in image space and survive a different canvas size.
   */
  private onImageChange = () => {
    this.cleanImage();
    if (this.imageCanvas2D && this.imageCanvasRef.current) {
      if (this.currentImageElement) {
        const { originX, originY, scale } = this.scaleState;
        this.imageCanvas2D.drawImage(
          this.currentImageElement,
          originX,
          originY,
          this.currentImageElement.width * scale,
          this.currentImageElement.height * scale
        );
      } else {
        const nextImageNode = document.createElement("img");
        nextImageNode.addEventListener("load", () => {
          this.currentImageElement = nextImageNode;
          const { width, height } = nextImageNode;
          const stage = this.stageSize();
          // The letterbox fit (viewTransform.ts). A new image starts at the
          // whole photo: the touch zoom is not kept.
          const fit = fitImage(width, height, stage.width, stage.height);
          if (fit) {
            this.fit = fit;
            this.view = IDENTITY_VIEW;
            this.scaleState = applyView(fit, this.view);
            if (this.state.zoomed) this.setState({ zoomed: false });
          }
          this.onImageChange();
          this.onShapeChange();
        });
        nextImageNode.alt = "";
        nextImageNode.src = this.props.image;
      }
    }
  };

  /**
   * True for a mouse event the browser made from a finger or pen: one while a
   * finger is down or within COMPAT_MOUSE_MS of one, or one the browser says
   * came from touch. A real mouse right after a tap is rare enough to lose.
   */
  private isMouseFromTouch(event?: React.MouseEvent<HTMLCanvasElement>) {
    const capabilities = (event?.nativeEvent as (MouseEvent & { sourceCapabilities?: { firesTouchEvents?: boolean } }) | undefined)?.sourceCapabilities;
    return this.pointers.size > 0 || Date.now() - this.lastTouchAt < COMPAT_MOUSE_MS || capabilities?.firesTouchEvents === true;
  }

  private onMouseDown: MouseEventHandler<HTMLCanvasElement> = (event) => {
    if (this.isMouseFromTouch(event)) return;
    // For telemetry, and the square handles (9 Oct 2026)
    this.inputTypesUsed.add("mouse");
    this.setInputMode("mouse");
    // Obstructions (14 Oct 2026): a double-click is one click. Its second
    // press used to toggle the box back, so a double-clicked box stayed unmarked.
    if (this.inObstructionStep && event.detail > 1) return;
    const { offsetX, offsetY } = event.nativeEvent;
    const { positionX, positionY } = this.calculateMousePosition(
      offsetX,
      offsetY
    );
    this.currentAnnotationState.onMouseDown(positionX, positionY);
  };

  private onMouseMove: MouseEventHandler<HTMLCanvasElement> = (event) => {
    if (this.isMouseFromTouch(event)) return;
    const { offsetX, offsetY } = event.nativeEvent;
    const { positionX, positionY } = this.calculateMousePosition(
      offsetX,
      offsetY
    );
    // Step 1: drawing and resizing stop at the photo's edge (8 Oct 2026). The
    // Sidewalk step keeps its own snapping to the edge.
    if (this.inBoxStep) {
      const { x, y } = this.clampToPhoto(positionX, positionY);
      this.currentAnnotationState.onMouseMove(x, y);
      this.followMouseLoupe(offsetX, offsetY);
      return;
    }
    this.currentAnnotationState.onMouseMove(positionX, positionY);
  };

  private onMouseUp: MouseEventHandler<HTMLCanvasElement> = (event) => {
    if (this.isMouseFromTouch(event)) return;
    this.currentAnnotationState.onMouseUp();
    this.endMouseLoupe();
  };

  private onMouseLeave: MouseEventHandler<HTMLCanvasElement> = () => {
    this.currentAnnotationState.onMouseLeave();
    this.endMouseLoupe();
  };

  /**
   * The magnifier while a resize handle is dragged with the mouse (10 Oct
   * 2026, both roles, box step), as a finger fitting a corner gets on touch.
   * `offsetX`, `offsetY` are stage px on the canvas.
   */
  private followMouseLoupe(offsetX: number, offsetY: number) {
    if (!(this.currentAnnotationState instanceof TransformationState)) return;
    const point = this.currentTransformer?.activeHandlePoint?.();
    if (!point || !this.selectedId) return;
    if (!this.mouseLoupeShown) {
      this.mouseLoupeShown = true;
      this.loupeShownCount += 1;
    }
    this.showLoupe({ x: offsetX * this.displayScale, y: offsetY * this.displayScale }, point, { kind: "box", id: this.selectedId }, "mouse");
  }

  private endMouseLoupe() {
    if (!this.mouseLoupeShown) return;
    this.mouseLoupeShown = false;
    this.hideLoupe();
  }

  private surfaceTypeText = (surfaceType) => {
    switch (surfaceType) {
      case "no_sidewalk":
        return "There is no sidewalk found in the image.";
      case "rough_paving":
        return "Rough surfaces are craggy, irregular, and are usually broken in various spots on the surface";
      case "smooth_paving":
        return "Smooth surfaces are evenly balanced, made of solid material, and do not contain any cracks or irregularities";
      case "slippery_paving":
        return "Tiled/Slippery surfaces are put together using different segments of flooring and become hazardous and slippery when wet.";
    }
    return "";
  };

  /* Legacy sliderValueText removed — the old 1-10 slider is replaced by the
     5-level "Accessible to Me" card buttons (values 1-5). */
}
