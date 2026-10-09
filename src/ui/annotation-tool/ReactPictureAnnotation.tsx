
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
import { isBelowMinimumSize, clampPointToImage, keepMarkInside, markArea } from "@/util/boxGeometry";
import { normalizeSubmittedMarks } from "@/util/validators/annotationSubmit";
import { findNearDuplicates } from "@/features/annotate/objectStep";
import { buildTrays, TRAY_COPY } from "@/features/annotate/objectTrays";
import { toggleHiddenId, withoutHiddenId, BOX_VISIBILITY_COPY } from "@/features/annotate/boxVisibility";
import { createEditSaver } from "@/util/editSaver";
import { TAXONOMY_GUIDE, TAXONOMY_RULES } from "@/features/annotate/taxonomyGuide";
import {
  isRealObject,
  realObjects,
  summarizeObstructionStep,
  toggleObstructionPatch,
  finalizeObstructionAnswers,
} from "@/features/annotate/obstructionStep";
import { OBSTRUCTION_GUIDE } from "@/features/annotate/obstructionGuide";
import { annotatorStepHeading, annotatorStepsFor } from "@/features/annotate/annotatorSteps";
import { initialSidewalkState, sidewalkReducer, isNearFirstPoint } from "@/features/annotate/sidewalkEditor";
import { SIDEWALK_GUIDE } from "@/features/annotate/sidewalkGuide";
import { normalizeSidewalkMask, summarizeSidewalkMask } from "@/util/validators/sidewalkMask";

import { IAnnotation } from "./Annotation";
import { IAnnotationState } from "./annotation/AnnotationState";
import { DefaultAnnotationState } from "./annotation/DefaultAnnotationState";
import JudgingAnnotationState from "./annotation/JudgingAnnotationState";
import SidewalkAnnotationState from "./annotation/SidewalkAnnotationState";
import { paintSidewalk } from "./paintSidewalk";
import DefaultInputSection from "./DefaultInputSection";
import ObjectInputSection from "./ObjectInputSection";
import ObjectTrays from "./ObjectTrays";
import {
  defaultShapeStyle,
  IShape,
  IShapeBase,
  IShapeStyle,
  PaintVariant,
  RectShape,
} from "./Shape";
import Transformer, { ITransformer } from "./Transformer";
import {
  readSessionData,
  writeSession,
  writeCurrentCount,
} from "@/util/sessionCache";
import { P } from "../Typography";
import { H2 } from "../Typography";
import { H3 } from "../Typography";
import Container from '../Container';
import Checkbox from '../Checkbox';
import { EyeIcon, EyeOffIcon } from '../icons';
import { buildDisplayLabelsInOrder, orderOfAppearance, formatLabel } from "@/util/buildDisplayLabels";

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
 * Note that the canvas is driven by mouse events with no touch equivalent, so
 * annotating requires a mouse or trackpad. See hooks/useCanAnnotate.
 */
/**
 * Sidewalk width card icons.
 *
 * Each card shows a person navigating past an obstruction (a bollard/post) on
 * a perspective-drawn sidewalk. The three width levels differ in how much clear
 * space surrounds the obstruction — narrow (squeeze past), moderate (comfortable
 * clearance), wide (plenty of room). This framing avoids literal person-counting
 * and instead captures the *effective clear width* concept from the manuscript
 * (Ch. 1 line 27, Ch. 2 line 53).
 *
 * The same obstruction appears at a fixed size across all three cards — what
 * changes is the sidewalk width around it.
 */
function SidewalkWidthIcon({ type }: { type: string }) {
  /** Stick figure walking forward — head, body, arms, legs. */
  const walkingFigure = (cx: number) => (
    <g>
      <ellipse cx={cx} cy={22} rx={5} ry={6} fill="currentColor" />
      <line x1={cx} y1={28} x2={cx - 1} y2={46} stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" />
      <line x1={cx - 1} y1={33} x2={cx - 10} y2={38} stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      <line x1={cx - 1} y1={33} x2={cx + 8} y2={40} stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      <line x1={cx - 1} y1={46} x2={cx - 8} y2={62} stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" />
      <line x1={cx - 1} y1={46} x2={cx + 7} y2={61} stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" />
    </g>
  );

  /** Two converging perspective lines representing sidewalk edges. */
  const sidewalkEdges = (leftTop: number, leftBot: number, rightTop: number, rightBot: number) => (
    <g>
      <line x1={leftTop} y1={5} x2={leftBot} y2={75} stroke="currentColor" strokeWidth={2} opacity={0.35} />
      <line x1={rightTop} y1={5} x2={rightBot} y2={75} stroke="currentColor" strokeWidth={2} opacity={0.35} />
    </g>
  );

  /** A simple bollard/post obstruction — the obstacle the person navigates past. */
  const bollard = (cx: number) => (
    <g opacity={0.35}>
      {/* Post shaft */}
      <line x1={cx} y1={26} x2={cx} y2={56} stroke="currentColor" strokeWidth={4.5} strokeLinecap="round" />
      {/* Cap / top */}
      <circle cx={cx} cy={24} r={4} fill="currentColor" />
    </g>
  );

  switch (type) {
    case "noSidewalk":
      return (
        <svg viewBox="0 0 80 80" className="w-full h-full text-muted" aria-label="None — person forced onto road, no sidewalk">
          {/* Dashed sidewalk edges — where a sidewalk would be */}
          <line x1={35} y1={5} x2={15} y2={75} stroke="currentColor" strokeWidth={2} strokeDasharray="6 4" opacity={0.25} />
          <line x1={45} y1={5} x2={65} y2={75} stroke="currentColor" strokeWidth={2} strokeDasharray="6 4" opacity={0.25} />
          {/* X mark over the sidewalk area */}
          <line x1={30} y1={25} x2={50} y2={50} stroke="currentColor" strokeWidth={2.5} opacity={0.35} />
          <line x1={50} y1={25} x2={30} y2={50} stroke="currentColor" strokeWidth={2.5} opacity={0.35} />
          {/* Walking figure outside the sidewalk on the left — forced onto the road */}
          <g opacity={0.7}>
            <ellipse cx={14} cy={24} rx={4.5} ry={5.5} fill="currentColor" />
            <line x1={14} y1={30} x2={15} y2={46} stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" />
            <line x1={15} y1={35} x2={7} y2={39} stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
            <line x1={15} y1={35} x2={23} y2={41} stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
            <line x1={15} y1={46} x2={8} y2={60} stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" />
            <line x1={15} y1={46} x2={22} y2={59} stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" />
          </g>
        </svg>
      );
    case "onePerson":
      return (
        <svg viewBox="0 0 80 80" className="w-full h-full text-ink" aria-label="Narrow — tight clearance past obstruction">
          {sidewalkEdges(33, 18, 47, 62)}
          {walkingFigure(33)}
          {bollard(47)}
        </svg>
      );
    case "twoPeople":
      return (
        <svg viewBox="0 0 80 80" className="w-full h-full text-ink" aria-label="Moderate — comfortable clearance past obstruction">
          {sidewalkEdges(28, 8, 52, 72)}
          {walkingFigure(33)}
          {bollard(52)}
        </svg>
      );
    case "threePlus":
      return (
        <svg viewBox="0 0 80 80" className="w-full h-full text-ink" aria-label="Wide — plenty of room past obstruction">
          {sidewalkEdges(24, 2, 56, 78)}
          {walkingFigure(30)}
          {bollard(56)}
        </svg>
      );
    default:
      return null;
  }
}

/**
 * Surface Condition Icon — ground cross-section profiles.
 *
 * Visual language: the ground itself, not a person. A flat line = easy,
 * a bumpy line = some difficulty, a jagged broken line = dangerous.
 * Uses a wheel/motion glyph for "easy" and a warning triangle for "dangerous"
 * to reinforce the functional meaning.
 */
function SurfaceConditionIcon({ type }: { type: "easy" | "some" | "difficult" }) {
  switch (type) {
    case "easy":
      return (
        <svg viewBox="0 0 64 64" className="w-full h-full text-inherit" aria-label="Easy to traverse — smooth surface">
          {/* Smooth ground line */}
          <line x1={8} y1={44} x2={56} y2={44} stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" opacity={0.7} />
          {/* Surface texture marks */}
          <line x1={14} y1={44} x2={14} y2={47} stroke="currentColor" strokeWidth={1.5} opacity={0.3} />
          <line x1={26} y1={44} x2={26} y2={47} stroke="currentColor" strokeWidth={1.5} opacity={0.3} />
          <line x1={38} y1={44} x2={38} y2={47} stroke="currentColor" strokeWidth={1.5} opacity={0.3} />
          <line x1={50} y1={44} x2={50} y2={47} stroke="currentColor" strokeWidth={1.5} opacity={0.3} />
          {/* Smooth rolling wheel above */}
          <circle cx={32} cy={30} r={9} stroke="currentColor" strokeWidth={2} fill="none" opacity={0.5} />
          <circle cx={32} cy={30} r={2} fill="currentColor" opacity={0.5} />
          {/* Motion lines */}
          <line x1={18} y1={26} x2={14} y2={26} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" opacity={0.3} />
          <line x1={18} y1={30} x2={12} y2={30} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" opacity={0.3} />
          <line x1={18} y1={34} x2={14} y2={34} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" opacity={0.3} />
        </svg>
      );
    case "some":
      return (
        <svg viewBox="0 0 64 64" className="w-full h-full text-inherit" aria-label="Some difficulty — uneven surface">
          {/* Bumpy ground line */}
          <polyline points="8,44 16,44 20,41 24,44 30,43 34,45 38,42 42,44 48,43 52,44 56,44" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" fill="none" opacity={0.7} />
          {/* Depth lines */}
          <line x1={14} y1={46} x2={14} y2={49} stroke="currentColor" strokeWidth={1.5} opacity={0.3} />
          <line x1={32} y1={47} x2={32} y2={50} stroke="currentColor" strokeWidth={1.5} opacity={0.3} />
          <line x1={50} y1={46} x2={50} y2={49} stroke="currentColor" strokeWidth={1.5} opacity={0.3} />
          {/* Wobbling wheel */}
          <circle cx={32} cy={28} r={9} stroke="currentColor" strokeWidth={2} fill="none" opacity={0.5} />
          <circle cx={32} cy={28} r={2} fill="currentColor" opacity={0.5} />
          {/* Wobble marks */}
          <line x1={26} y1={17} x2={24} y2={15} stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" opacity={0.35} />
          <line x1={38} y1={17} x2={40} y2={15} stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" opacity={0.35} />
        </svg>
      );
    case "difficult":
      return (
        <svg viewBox="0 0 64 64" className="w-full h-full text-inherit" aria-label="Difficult or dangerous — broken surface">
          {/* Jagged broken ground */}
          <polyline points="8,44 14,44 17,40 19,46 22,42 26,44 28,48 30,41 34,44 36,39 40,46 42,43 46,44 48,40 50,45 54,42 56,44" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" fill="none" opacity={0.7} />
          {/* Crack lines */}
          <line x1={22} y1={44} x2={20} y2={52} stroke="currentColor" strokeWidth={1.8} opacity={0.4} />
          <line x1={36} y1={44} x2={38} y2={54} stroke="currentColor" strokeWidth={1.8} opacity={0.4} />
          <line x1={48} y1={44} x2={46} y2={51} stroke="currentColor" strokeWidth={1.8} opacity={0.4} />
          {/* Warning triangle */}
          <polygon points="32,14 22,32 42,32" stroke="currentColor" strokeWidth={2} fill="none" opacity={0.55} />
          <line x1={32} y1={20} x2={32} y2={26} stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" opacity={0.55} />
          <circle cx={32} cy={29} r={1.2} fill="currentColor" opacity={0.55} />
        </svg>
      );
    default:
      return null;
  }
}

/**
 * Walking Comfort Icon — face expressions.
 *
 * Visual language: how the scene *feels*. Face-based scales (Wong-Baker FACES)
 * are the most validated visual approach for subjective self-reports.
 * Simple hand-drawn line faces — calm smile, uncertain flat, tense frown.
 */
function WalkingComfortIcon({ type }: { type: "comfortable" | "somewhat" | "uncomfortable" }) {
  switch (type) {
    case "comfortable":
      return (
        <svg viewBox="0 0 64 64" className="w-full h-full text-inherit" aria-label="Comfortable">
          <circle cx={32} cy={32} r={20} stroke="currentColor" strokeWidth={2.2} fill="none" opacity={0.6} />
          {/* Relaxed eyes */}
          <ellipse cx={24} cy={27} rx={2.5} ry={3} fill="currentColor" opacity={0.6} />
          <ellipse cx={40} cy={27} rx={2.5} ry={3} fill="currentColor" opacity={0.6} />
          {/* Gentle smile */}
          <path d="M23 37 Q28 43 32 43 Q36 43 41 37" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" fill="none" opacity={0.6} />
        </svg>
      );
    case "somewhat":
      return (
        <svg viewBox="0 0 64 64" className="w-full h-full text-inherit" aria-label="Somewhat uncomfortable">
          <circle cx={32} cy={32} r={20} stroke="currentColor" strokeWidth={2.2} fill="none" opacity={0.6} />
          {/* Slightly concerned eyes */}
          <ellipse cx={24} cy={27} rx={2.5} ry={3} fill="currentColor" opacity={0.6} />
          <ellipse cx={40} cy={27} rx={2.5} ry={3} fill="currentColor" opacity={0.6} />
          {/* Slight raised brow */}
          <line x1={36} y1={20} x2={44} y2={21} stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" opacity={0.4} />
          {/* Flat wavy mouth */}
          <path d="M24 39 Q28 37 32 38 Q36 39 40 37" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" fill="none" opacity={0.6} />
        </svg>
      );
    case "uncomfortable":
      return (
        <svg viewBox="0 0 64 64" className="w-full h-full text-inherit" aria-label="Uncomfortable">
          <circle cx={32} cy={32} r={20} stroke="currentColor" strokeWidth={2.2} fill="none" opacity={0.6} />
          {/* Tense eyes */}
          <ellipse cx={24} cy={27} rx={2.5} ry={2.5} fill="currentColor" opacity={0.6} />
          <ellipse cx={40} cy={27} rx={2.5} ry={2.5} fill="currentColor" opacity={0.6} />
          {/* Furrowed brows */}
          <line x1={20} y1={21} x2={27} y2={22} stroke="currentColor" strokeWidth={2} strokeLinecap="round" opacity={0.5} />
          <line x1={44} y1={21} x2={37} y2={22} stroke="currentColor" strokeWidth={2} strokeLinecap="round" opacity={0.5} />
          {/* Frown */}
          <path d="M24 41 Q28 36 32 36 Q36 36 40 41" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" fill="none" opacity={0.6} />
        </svg>
      );
    default:
      return null;
  }
}

/**
 * Accessible to Me Icon — gateway/path metaphor with 5-level colour gradient.
 *
 * Visual language: "can I get through?" The gateway progressively narrows from
 * wide-open (green) to fully blocked (red), matching a 1–5 person-dependent
 * accessibility scale (Preston & Colman 2000; Project Sidewalk 1–5 precedent).
 */
function AccessibleToMeIcon({ type }: { type: "easy" | "mostly" | "somewhat" | "very" | "not" }) {
  switch (type) {
    case "easy":
      return (
        <svg viewBox="0 0 64 64" className="w-full h-full" aria-label="Easily accessible" style={{ color: "#16a34a" }}>
          {/* Wide-open gateway */}
          <line x1={16} y1={12} x2={16} y2={52} stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" opacity={0.6} />
          <line x1={48} y1={12} x2={48} y2={52} stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" opacity={0.6} />
          <line x1={16} y1={12} x2={48} y2={12} stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" opacity={0.6} />
          <line x1={10} y1={52} x2={54} y2={52} stroke="currentColor" strokeWidth={2} opacity={0.35} />
          {/* Double checkmark */}
          <polyline points="20,32 26,38 36,24" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" fill="none" opacity={0.7} />
          <polyline points="30,32 36,38 46,24" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" fill="none" opacity={0.7} />
        </svg>
      );
    case "mostly":
      return (
        <svg viewBox="0 0 64 64" className="w-full h-full" aria-label="Mostly accessible" style={{ color: "#22c55e" }}>
          {/* Open gateway — walls slightly inward */}
          <line x1={17} y1={12} x2={19} y2={52} stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" opacity={0.6} />
          <line x1={47} y1={12} x2={45} y2={52} stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" opacity={0.6} />
          <line x1={17} y1={12} x2={47} y2={12} stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" opacity={0.6} />
          <line x1={10} y1={52} x2={54} y2={52} stroke="currentColor" strokeWidth={2} opacity={0.35} />
          {/* Single checkmark */}
          <polyline points="24,32 30,38 40,24" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" fill="none" opacity={0.7} />
        </svg>
      );
    case "somewhat":
      return (
        <svg viewBox="0 0 64 64" className="w-full h-full" aria-label="Somewhat difficult" style={{ color: "#d97706" }}>
          {/* Narrowing gateway */}
          <line x1={18} y1={12} x2={24} y2={52} stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" opacity={0.6} />
          <line x1={46} y1={12} x2={40} y2={52} stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" opacity={0.6} />
          <line x1={18} y1={12} x2={46} y2={12} stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" opacity={0.6} />
          <line x1={10} y1={52} x2={54} y2={52} stroke="currentColor" strokeWidth={2} opacity={0.35} />
          {/* Tilde / wavy line — uncertain */}
          <path d="M25,31 Q29,26 32,31 Q35,36 39,31" stroke="currentColor" strokeWidth={3} strokeLinecap="round" fill="none" opacity={0.7} />
        </svg>
      );
    case "very":
      return (
        <svg viewBox="0 0 64 64" className="w-full h-full" aria-label="Very difficult" style={{ color: "#ea580c" }}>
          {/* More narrowing gateway */}
          <line x1={14} y1={12} x2={26} y2={52} stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" opacity={0.6} />
          <line x1={50} y1={12} x2={38} y2={52} stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" opacity={0.6} />
          <line x1={14} y1={12} x2={50} y2={12} stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" opacity={0.6} />
          <line x1={10} y1={52} x2={54} y2={52} stroke="currentColor" strokeWidth={2} opacity={0.35} />
          {/* Exclamation */}
          <line x1={32} y1={22} x2={32} y2={34} stroke="currentColor" strokeWidth={3} strokeLinecap="round" opacity={0.7} />
          <circle cx={32} cy={40} r={2} fill="currentColor" opacity={0.7} />
        </svg>
      );
    case "not":
      return (
        <svg viewBox="0 0 64 64" className="w-full h-full" aria-label="Not accessible to me" style={{ color: "#dc2626" }}>
          {/* Blocked gateway — walls converge */}
          <line x1={12} y1={12} x2={28} y2={52} stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" opacity={0.6} />
          <line x1={52} y1={12} x2={36} y2={52} stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" opacity={0.6} />
          <line x1={12} y1={12} x2={52} y2={12} stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" opacity={0.6} />
          <line x1={10} y1={52} x2={54} y2={52} stroke="currentColor" strokeWidth={2} opacity={0.35} />
          {/* X mark */}
          <line x1={25} y1={24} x2={39} y2={38} stroke="currentColor" strokeWidth={3} strokeLinecap="round" opacity={0.7} />
          <line x1={39} y1={24} x2={25} y2={38} stroke="currentColor" strokeWidth={3} strokeLinecap="round" opacity={0.7} />
        </svg>
      );
    default:
      return null;
  }
}

export default class ReactPictureAnnotation extends React.Component<IReactPictureAnnotationProps> {
  public static defaultProps = {
    marginWithInput: 10,
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
      />
    ),
    isAnnotator: false,
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
    isRejected: false,
    obstructs: undefined as boolean | undefined,
    severity: undefined as number | null | undefined,
    canvasScale: 1,
    // Annotators only (4 Oct 2026): Objects, then Obstructions
    annotatorStep: "objects" as AnnotatorStep,
    obstructionsConfirmed: false,
    // The Sidewalk step's editor state (render copy, see sidewalkState below)
    sidewalk: initialSidewalkState(null),
    showSidewalkBoxes: true,
    hideSidewalkFill: false,
    showSidewalkOverlay: true,
    // Step 1, both roles (8 Oct 2026): boxes hidden on the photo from the list
    // under it, so crowded boxes can be drawn and fitted. A view setting only.
    hiddenBoxIds: [] as string[],
    // True while an image is being sent, so the button cannot send it twice
    submitting: false,
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

  /** True for a box hidden on the photo. Only in Step 1: every box shows in the other steps. */
  public isBoxHidden = (id: string) => this.inBoxStep && this.state.hiddenBoxIds.includes(id);

  /** The step list for this image: Sidewalk only on model-development images. */
  private get annotatorSteps() {
    return annotatorStepsFor({ askSidewalk: this.askSidewalk });
  }

  private get paintVariant(): PaintVariant {
    if (this.inObstructionStep) return "obstructions";
    if (this.inSidewalkStep) return "context";
    return "default";
  }

  /** 8 canvas pixels in image pixels, so snapping feels the same on 640 and 1280 pixel images. */
  public get sidewalkTolerance() {
    return 8 / (this.scaleState.scale || 1);
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
        nearFirstPoint: Boolean(state.draft && state.preview && isNearFirstPoint(state.draft, state.preview, this.sidewalkTolerance)),
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
    }
    this.syncSelectedId();
    this.setupCanvasScaling();
    this.editsRestored = true;
  };

  public componentDidUpdate = (preProps: IReactPictureAnnotationProps, prevState: this["state"]) => {
    const { width, height, image } = this.props;
    // Contributors' Step 2 answers are saved as they change, like the boxes
    if (prevState && prevState.sceneLevel !== this.state.sceneLevel) this.scheduleEditSave();
    if (preProps.width !== width || preProps.height !== height) {
      this.setCanvasDPI();
      this.onShapeChange();
      this.onImageChange();
    }
    if (preProps.image !== image) {
      this.mountTime = Date.now();
      this.sceneStepStartMs = null;
      this.obstructionStepStartMs = null;
      this.sidewalkStepStartMs = null;
      this.cleanImage();
      if (this.currentImageElement) {
        this.currentImageElement.src = image;
      } else {
        this.onImageChange();
      }
    }

    // this.syncAnnotationData();
    this.syncSelectedId();
  };

  public componentWillUnmount = () => {
    this.resizeObserver?.disconnect();
    this.editSaver.flush();
    if (typeof window !== "undefined") {
      window.removeEventListener("keydown", this.onSidewalkKeyDown);
      window.removeEventListener("pagehide", this.flushEdits);
      document.removeEventListener("visibilitychange", this.onVisibilityChange);
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

    const { draft, selectedId, selectedPoint } = this.sidewalkState;
    let action: { type: string } | null = null;
    if (event.key === "Enter" && draft) action = { type: "CLOSE_SHAPE" };
    else if (event.key === "Escape") action = { type: draft ? "CANCEL_SHAPE" : "CLEAR_SELECTION" };
    else if (event.key === "Backspace") {
      if (draft) action = { type: "UNDO_POINT" };
      else if (selectedPoint != null) action = { type: "DELETE_POINT" };
    } else if (event.key === "Delete") {
      if (selectedPoint != null) action = { type: "DELETE_POINT" };
      else if (selectedId) action = { type: "DELETE_SHAPE" };
    }
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
    const { width, height, inputElement } = this.props;
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

    const { canvasScale } = this.state;
    const { askScene, askSeverity, annotatorObjectStep, inObstructionStep, inSidewalkStep, askSidewalk } = this;
    const steps = this.annotatorSteps;
    const finishLabel = this.props.totalAnnotationCount && this.props.currentAnnotationCount >= this.props.totalAnnotationCount
      ? "Finish Session"
      : "Next Image";
    // An annotator image with no objects left has nothing to judge, so the
    // Objects step submits straight away
    const hasRealObjects = realObjects(this.currentAnnotationData).length > 0;

    // The canvas, the same in both layouts below
    const canvasArea = (
      <div ref={this.canvasWrapperRef} className="w-full overflow-hidden">
        <div style={{
          width: width * canvasScale,
          height: height * canvasScale,
          margin: '0 auto',
        }}>
          <div className="rp-stage relative" style={{
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
              className="rp-shapes"
              style={{ width, height }}
              ref={this.canvasRef}
              width={width * 2}
              height={height * 2}
              onMouseDown={this.onMouseDown}
              onMouseMove={this.onMouseMove}
              onMouseUp={this.onMouseUp}
              onMouseLeave={this.onMouseLeave}
            />
            {showInput && (
              <div
                className="rp-selected-input"
                style={inputPosition}
                onMouseDown={(e) => e.stopPropagation()}
                onMouseUp={(e) => e.stopPropagation()}
                onMouseMove={(e) => e.stopPropagation()}
              >
                {annotatorObjectStep ? (
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
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
    // Contributors get the one-card layout with their answers under the photo (7 Oct 2026). Annotator steps keep theirs.
    const contributorLayout = !annotatorObjectStep;

    return (
      <Container as="section" width="wide" className="annotation-container">
        <div className="flex flex-row gap-6">

          {/* ── Left: Step 1 (65%, or the full width when there is no Step 2) ── */}
          <div style={{ flex: '65 1 0%' }} className="min-w-0">
            {contributorLayout ? (
              // Contributors (7 Oct 2026): the heading, the photo and the answers
              // sit in one card, so Step 1 reads as one unit
              <div className="mb-6 bg-surface rounded-card border border-line shadow-sm overflow-hidden">
                <div className="p-4 pb-3">
                  <H2 className="text-lg font-bold text-ink mb-1">Step 1: Identify Objects</H2>
                  <P className="text-body text-sm">
                    Review objects <span className="font-semibold text-ink">on or beside the sidewalk</span>.
                    For each dashed yellow box, decide whether it obstructs the path for <strong>you</strong>, traveling as you normally do.
                    Draw new boxes to label any missed objects. {TRAY_COPY.stepHint}
                  </P>
                </div>
                <div className="bg-surface-subtle p-2 border-y border-line">
                  {canvasArea}
                </div>
                <ObjectTrays
                  trays={buildTrays(sortedAnnotations, { labels: displayLabels })}
                  selectedId={showInput ? this.selectedId : null}
                  hiddenIds={this.state.hiddenBoxIds}
                  onOpen={this.openTrayItem}
                  onToggleHidden={this.toggleBoxHidden}
                  onShowAll={this.showAllBoxes}
                />
              </div>
            ) : (
              <>
                <div className="mb-3">
                  {inObstructionStep ? (
                    <>
                      <H2 className="text-lg font-bold text-ink mb-1">{annotatorStepHeading("obstructions", steps)}</H2>
                      <P className="text-body text-sm">
                        Click every object that obstructs the sidewalk for you, traveling as you normally do.
                        Click it again to unmark it. Leave the others unmarked, then confirm below that they do not obstruct.
                      </P>
                    </>
                  ) : inSidewalkStep ? (
                    <>
                      <H2 className="text-lg font-bold text-ink mb-1">{annotatorStepHeading("sidewalk", steps)}</H2>
                      <P className="text-body text-sm">
                        Outline the walking space in this image. Click points around the sidewalk and click the first point again to close the shape.
                        Draw under any object standing on the sidewalk, as if it were not there.
                      </P>
                    </>
                  ) : (
                    <>
                      <H2 className="text-lg font-bold text-ink mb-1">{annotatorStepHeading("objects", steps)}</H2>
                      <P className="text-body text-sm">
                        Box every object from the 18 categories that you can see anywhere in the image, on the sidewalk or not.
                        For each dashed yellow suggestion, check its category, fix the box if it is loose, then click Keep,
                        or click Not an object if it marks nothing real. Draw a box for every object the suggestions missed.
                      </P>
                    </>
                  )}
                </div>

                {inSidewalkStep && this.renderSidewalkToolbar()}

                <div className="flex flex-col gap-4 mb-6">
                  <div className="w-full bg-surface-subtle rounded-card border border-line shadow-sm p-2">
                    {canvasArea}
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
            <div id="scene-level-section" className="mb-6">
              <H2 className="text-lg font-bold text-ink mb-1">Step 2: Rate the Sidewalk</H2>
              <P className="text-body text-sm mb-4">
                Rate the following aspects of the sidewalk scene based on what you see in the image.
              </P>
              <div className="space-y-2">
                {/* Item 1 — Sidewalk Width */}
                <div className="bg-surface-subtle p-3 rounded-card border border-line">
                  <p className="text-sm font-semibold text-ink mb-0.5">Sidewalk Width</p>
                  <p className="text-[11px] text-muted mb-1.5">How much usable walking space does this sidewalk have?</p>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[
                      { value: "three_or_more", label: "Wide", icon: "threePlus" as const },
                      { value: "two_people", label: "Moderate", icon: "twoPeople" as const },
                      { value: "one_person", label: "Narrow", icon: "onePerson" as const },
                      { value: "no_sidewalk", label: "None", icon: "noSidewalk" as const },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        className={`flex flex-col items-center p-2 rounded-card text-center transition-all border ${this.state.sceneLevel.sidewalkWidth === opt.value
                          ? 'border-primary bg-primary/10 text-primary ring-2 ring-primary/20'
                          : 'border-line bg-surface text-body hover:bg-primary/5 hover:border-primary/30'
                          }`}
                        onClick={() => {
                          this.markSceneStepStart();
                          const updates: Record<string, unknown> = { sidewalkWidth: opt.value };
                          // No sidewalk: the other three questions are greyed out, so
                          // clear any answers given before "None" was chosen.
                          if (opt.value === "no_sidewalk") {
                            updates.surfaceCondition = null;
                            updates.walkability = null;
                            updates.overallAccessibility = null;
                          }
                          this.setState({
                            sceneLevel: { ...this.state.sceneLevel, ...updates },
                          });
                        }}
                      >
                        <div className="w-12 h-12 mb-1 flex items-end justify-center">
                          <SidewalkWidthIcon type={opt.icon} />
                        </div>
                        <span className="text-[10px] font-semibold leading-tight">{opt.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Item 2 — Surface Condition (disabled when no sidewalk) */}
                {/* Ground cross-section profiles — visual language: the surface itself.
                    3-level functional scale per Wolf et al. (2007) and Project Sidewalk reliability data. */}
                {(() => {
                  const disabled = this.state.sceneLevel.sidewalkWidth === "no_sidewalk";
                  const surfaceOptions: { value: number; label: string; icon: "easy" | "some" | "difficult" }[] = [
                    { value: 1, label: "Easy to traverse", icon: "easy" },
                    { value: 2, label: "Some difficulty", icon: "some" },
                    { value: 3, label: "Difficult or dangerous", icon: "difficult" },
                  ];
                  return (
                    <div className={`bg-surface-subtle p-3 rounded-card border border-line${disabled ? ' opacity-50' : ''}`}>
                      <p className="text-sm font-semibold text-ink mb-0.5">Surface Condition</p>
                      <p className="text-[11px] text-muted mb-1.5">
                        {disabled ? "Not applicable — no sidewalk present" : "How does the walking surface affect movement?"}
                      </p>
                      <div className="flex gap-1.5">
                        {surfaceOptions.map((opt) => (
                          <button
                            key={opt.value}
                            disabled={disabled}
                            className={`flex-1 flex flex-col items-center py-2 px-1 rounded-control transition-all border ${!disabled && this.state.sceneLevel.surfaceCondition === opt.value
                              ? 'border-primary bg-primary/10 text-primary ring-2 ring-primary/20'
                              : 'border-line bg-surface text-body' + (disabled ? ' cursor-not-allowed' : ' hover:bg-primary/5 hover:border-primary/30')
                              }`}
                            onClick={() => {
                              if (!disabled) {
                                this.markSceneStepStart();
                                this.setState({
                                  sceneLevel: { ...this.state.sceneLevel, surfaceCondition: opt.value },
                                });
                              }
                            }}
                          >
                            <div className="w-10 h-10 mb-1 flex items-center justify-center">
                              <SurfaceConditionIcon type={opt.icon} />
                            </div>
                            <span className="text-[10px] font-semibold leading-tight text-center">{opt.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* Item 3 — Walking Comfort (disabled when no sidewalk) */}
                {/* Face expressions — visual language: how the scene *feels*.
                    Reframed from undefined "walkability" to concrete "comfort" per Mehta (2008).
                    3-level scale per Kim et al. (2025) stability findings. */}
                {(() => {
                  const disabled = this.state.sceneLevel.sidewalkWidth === "no_sidewalk";
                  const comfortOptions: { value: number; label: string; icon: "comfortable" | "somewhat" | "uncomfortable" }[] = [
                    { value: 1, label: "Comfortable", icon: "comfortable" },
                    { value: 2, label: "Somewhat uncomfortable", icon: "somewhat" },
                    { value: 3, label: "Uncomfortable", icon: "uncomfortable" },
                  ];
                  return (
                    <div className={`bg-surface-subtle p-3 rounded-card border border-line${disabled ? ' opacity-50' : ''}`}>
                      <p className="text-sm font-semibold text-ink mb-0.5">Walking Comfort</p>
                      <p className="text-[11px] text-muted mb-1.5">
                        {disabled ? "Not applicable — no sidewalk present" : "How comfortable does this sidewalk look for walking?"}
                      </p>
                      <div className="flex gap-1.5">
                        {comfortOptions.map((opt) => (
                          <button
                            key={opt.value}
                            disabled={disabled}
                            className={`flex-1 flex flex-col items-center py-2 px-1 rounded-control transition-all border ${!disabled && this.state.sceneLevel.walkability === opt.value
                              ? 'border-primary bg-primary/10 text-primary ring-2 ring-primary/20'
                              : 'border-line bg-surface text-body' + (disabled ? ' cursor-not-allowed' : ' hover:bg-primary/5 hover:border-primary/30')
                              }`}
                            onClick={() => {
                              if (!disabled) {
                                this.markSceneStepStart();
                                this.setState({
                                  sceneLevel: { ...this.state.sceneLevel, walkability: opt.value },
                                });
                              }
                            }}
                          >
                            <div className="w-10 h-10 mb-1 flex items-center justify-center">
                              <WalkingComfortIcon type={opt.icon} />
                            </div>
                            <span className="text-[10px] font-semibold leading-tight text-center">{opt.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* Item 4 — Accessible to Me (disabled when no sidewalk) */}
                {/* Gateway/path metaphor with traffic-light colour gradient.
                    Self-referential "to me" framing per Huang et al. (2025) and Li et al. (2025).
                    5-point scale: Preston & Colman (2000) show 2-4 point scales have worst
                    psychometric properties; Project Sidewalk uses 1-5 severity; finer scale
                    captures person-dependent variation that IS the signal (thesis core argument).
                    Can be collapsed to 3 levels for reporting if needed. */}
                {(() => {
                  const disabled = this.state.sceneLevel.sidewalkWidth === "no_sidewalk";
                  const accessOptions: { value: number; label: string; icon: "easy" | "mostly" | "somewhat" | "very" | "not" }[] = [
                    { value: 1, label: "Easily accessible", icon: "easy" },
                    { value: 2, label: "Mostly accessible", icon: "mostly" },
                    { value: 3, label: "Somewhat difficult", icon: "somewhat" },
                    { value: 4, label: "Very difficult", icon: "very" },
                    { value: 5, label: "Not accessible", icon: "not" },
                  ];
                  return (
                    <div className={`bg-surface-subtle p-3 rounded-card border border-line${disabled ? ' opacity-50' : ''}`}>
                      <p className="text-sm font-semibold text-ink mb-0.5">Accessible to Me</p>
                      <p className="text-[11px] text-muted mb-1.5">
                        {disabled ? "Not applicable — no sidewalk present" : "Could you personally navigate this sidewalk?"}
                      </p>
                      <div className="flex gap-1">
                        {accessOptions.map((opt) => (
                          <button
                            key={opt.value}
                            disabled={disabled}
                            className={`flex-1 flex flex-col items-center py-1.5 px-0.5 rounded-control transition-all border ${!disabled && this.state.sceneLevel.overallAccessibility === opt.value
                              ? 'border-primary bg-primary/10 text-primary ring-2 ring-primary/20'
                              : 'border-line bg-surface text-body' + (disabled ? ' cursor-not-allowed' : ' hover:bg-primary/5 hover:border-primary/30')
                              }`}
                            onClick={() => {
                              if (!disabled) {
                                this.markSceneStepStart();
                                this.setState({
                                  sceneLevel: { ...this.state.sceneLevel, overallAccessibility: opt.value },
                                });
                              }
                            }}
                          >
                            <div className="w-8 h-8 mb-0.5 flex items-center justify-center">
                              <AccessibleToMeIcon type={opt.icon} />
                            </div>
                            <span className="text-[9px] font-semibold leading-tight text-center">{opt.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
          ) : inSidewalkStep ? this.renderSidewalkGuide() : inObstructionStep ? this.renderObstructionGuide() : this.renderTaxonomyGuide()}

        </div>{/* end flex row */}

        {/* Error Message Display */}
        {this.state.error && (
          <div className="flex justify-center mt-6 mb-4">
            <div className="bg-danger-soft border border-danger-border text-danger px-6 py-3 rounded-control flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="shrink-0 h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span className="font-medium">{this.state.error}</span>
            </div>
          </div>
        )}

        <div className="flex justify-center my-10 gap-4">
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
        </div>
      </Container>
    );
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
    this.currentTransformer = new Transformer(shape, this.scaleState.scale);
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

  /**
   * Annotators: the "Objects in This Image" card under the canvas. Keeps the
   * box-review-section id, which the tutorial points at.
   */
  private renderObjectsCard(sortedAnnotations: IAnnotation[], displayLabels: Map<string, string>) {
    const duplicates = findNearDuplicates(sortedAnnotations);
    const labelOf = (box: IAnnotation) => displayLabels.get(box.id) ?? formatLabel(box.comment) ?? "Select a category";
    const tagFor = (box: IAnnotation) => {
      if (box.editable) return { text: "Drawn", className: "bg-blue-50 text-primary border border-blue-200" };
      if (box.selected === true) return { text: "Kept", className: "bg-primary text-white" };
      if (box.comment === NOT_AN_OBJECT) return { text: "Not an object", className: "bg-surface-subtle text-muted border border-line" };
      return { text: "To decide", className: "bg-danger-soft text-danger" };
    };

    const hidden = this.state.hiddenBoxIds;
    const hiddenCount = sortedAnnotations.filter((box) => hidden.includes(box.id)).length;

    return (
      <div id="box-review-section" className="bg-surface rounded-card border border-line shadow-sm p-4 w-full">
        <div className="mb-3 flex items-center justify-between gap-3">
          <H3><span className="text-lg font-bold text-ink">Objects in This Image</span></H3>
          {/* Boxes hidden on the photo (8 Oct 2026) */}
          {hiddenCount > 0 && (
            <span className="inline-flex items-center gap-2 text-xs text-muted whitespace-nowrap">
              {BOX_VISIBILITY_COPY.hiddenCount(hiddenCount)}
              <button type="button" onClick={this.showAllBoxes} className="font-semibold text-primary hover:underline">
                {BOX_VISIBILITY_COPY.showAll}
              </button>
            </span>
          )}
        </div>
        <ul className="flex flex-wrap gap-2">
          {sortedAnnotations.map((box) => {
            const tag = tagFor(box);
            const isHidden = hidden.includes(box.id);
            const eyeLabel = isHidden ? BOX_VISIBILITY_COPY.show(labelOf(box)) : BOX_VISIBILITY_COPY.hide(labelOf(box));
            return (
              <li
                key={box.id}
                className={`group border border-line rounded-control bg-surface hover:border-primary hover:shadow-md transition-all flex items-stretch ${isHidden ? "opacity-60" : ""}`}
              >
                {/* The name opens the box, the eye hides it on the photo */}
                <button
                  type="button"
                  className="flex items-center gap-1.5 pl-2 pr-1 py-1 cursor-pointer rounded-control"
                  onClick={() => this.selectBoxById(box.id)}
                >
                  <span className="text-xs font-semibold text-ink whitespace-nowrap">{labelOf(box)}</span>
                  <span className={`text-[10px] font-bold rounded-control px-1 whitespace-nowrap ${tag.className}`}>{tag.text}</span>
                </button>
                <button
                  type="button"
                  aria-label={eyeLabel}
                  aria-pressed={isHidden}
                  title={eyeLabel}
                  onClick={() => this.toggleBoxHidden(box.id)}
                  className="grid place-items-center pl-0.5 pr-2 rounded-control text-subtle hover:text-ink transition-colors"
                >
                  {isHidden ? <EyeOffIcon size={14} /> : <EyeIcon size={14} />}
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
  private renderTaxonomyGuide() {
    return (
      <div style={{ flex: '35 1 0%' }} className="min-w-0">
        <div
          id="taxonomy-guide"
          className="sticky top-4 bg-surface rounded-card border border-line shadow-sm p-4 max-h-[calc(100vh-2rem)] overflow-y-auto"
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

    const check = validateObjectStep(this.currentAnnotationData);
    if (!check.valid) {
      if (!restoring) this.setState({ error: check.error });
      return;
    }

    if (this.askSidewalk) {
      const sidewalk = this.sidewalkCheck();
      if (!sidewalk.valid) {
        if (restoring) this.enterSidewalkStep({ restoring: true });
        else this.setState({ error: sidewalk.error });
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
      { annotatorStep: "obstructions", obstructionsConfirmed: false, error: null, showInput: false, hiddenBoxIds: [] },
      () => {
        this.onShapeChange();
        this.canvasWrapperRef.current?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
        if (!restoring) this.cacheCurrentImageEdits();
        // Told on a reload too, so the tutorial shows this step's tour
        this.props.onAnnotatorStepChange?.("obstructions");
      }
    );
  };

  /** Annotators, Objects step: the forward button. Sidewalk next on model-development images. */
  private onObjectsNext = () => {
    const check = validateObjectStep(this.currentAnnotationData);
    if (!check.valid) {
      this.setState({ error: check.error });
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
    const check = validateObjectStep(this.currentAnnotationData);
    if (!check.valid) {
      if (!restoring) this.setState({ error: check.error });
      return;
    }

    this.selectedId = null;
    this.currentTransformer = null;
    this.setAnnotationState(new SidewalkAnnotationState(this));
    this.sidewalkStepStartMs = Date.now();
    this.obstructionStepStartMs = null;
    this.setState({ annotatorStep: "sidewalk", error: null, showInput: false, hiddenBoxIds: [] }, () => {
      this.onShapeChange();
      this.canvasWrapperRef.current?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
      if (!restoring) this.cacheCurrentImageEdits();
      // Told on a reload too, so the tutorial shows this step's tour
      this.props.onAnnotatorStepChange?.("sidewalk");
    });
  };

  /** Annotators, Sidewalk step: the forward button. */
  private onSidewalkNext = () => {
    const sidewalk = this.sidewalkCheck();
    if (!sidewalk.valid) {
      this.setState({ error: sidewalk.error });
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
    this.setState({ annotatorStep: "objects", error: null }, () => {
      this.onShapeChange();
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
   * Annotators, Sidewalk step: the toolbar above the canvas. Its messages
   * (a refused shape, an undone drag) show under the photo instead, next to
   * where the drawing happens (8 Oct 2026).
   */
  private renderSidewalkToolbar() {
    const { sidewalk, showSidewalkBoxes, hideSidewalkFill } = this.state;
    const drawing = Boolean(sidewalk.draft);
    const send = (type: string, extra: Record<string, unknown> = {}) => () => this.dispatchSidewalk({ type, ...extra });
    const toggle = (key: "showSidewalkBoxes" | "hideSidewalkFill") => () =>
      this.setState(key === "showSidewalkBoxes" ? { showSidewalkBoxes: !showSidewalkBoxes } : { hideSidewalkFill: !hideSidewalkFill }, () => this.onShapeChange());
    return (
      <div id="sidewalk-tools" className="mb-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="neutral" disabled={!drawing} onClick={send("CLOSE_SHAPE")}>Finish shape</Button>
          <Button size="sm" variant="neutral" disabled={!drawing} onClick={send("UNDO_POINT")}>Undo point</Button>
          <Button size="sm" variant="neutral" disabled={!drawing} onClick={send("CANCEL_SHAPE")}>Cancel shape</Button>
          <span className="w-px h-6 bg-line mx-1" aria-hidden="true" />
          <Button size="sm" variant="neutral" disabled={drawing || sidewalk.selectedPoint == null} onClick={send("DELETE_POINT")}>Delete point</Button>
          <Button size="sm" variant="neutral" disabled={drawing || !sidewalk.selectedId} onClick={send("DELETE_SHAPE")}>Delete shape</Button>
          <span className="w-px h-6 bg-line mx-1" aria-hidden="true" />
          <Button size="sm" variant={showSidewalkBoxes ? "primary" : "neutral"} aria-pressed={showSidewalkBoxes} onClick={toggle("showSidewalkBoxes")}>
            Show object boxes
          </Button>
          <Button size="sm" variant={hideSidewalkFill ? "primary" : "neutral"} aria-pressed={hideSidewalkFill} onClick={toggle("hideSidewalkFill")}>
            Show photo only
          </Button>
        </div>
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
  private renderSidewalkShapesCard() {
    const { sidewalk } = this.state;
    const { polygons, noSidewalk } = sidewalk.mask;
    const hasShapes = polygons.length > 0 || Boolean(sidewalk.draft);
    const number = (id: string) => id.replace(/^[a-z]+/, "");
    const selected = polygons.find((p) => p.id === sidewalk.selectedId);
    let hint: string;
    if (sidewalk.draft) hint = "Click the first point again to close the shape you are drawing.";
    else if (selected) hint = `Shape ${number(selected.id)} is selected. Drag its points on the photo, or drag the handle in the middle of an edge to add a point.`;
    else if (polygons.length > 0) hint = "Click a shape to select it on the photo and adjust its points.";
    else if (noSidewalk) hint = "This image is marked as having no sidewalk.";
    else hint = "No shapes yet. Click points around the sidewalk on the photo to start one.";

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
                  className={`flex items-center gap-1.5 rounded-control border pl-1 pr-1 py-0.5 transition-colors ${isSelected ? "border-primary bg-primary-50" : "border-line bg-surface hover:border-primary"}`}
                >
                  <button
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => this.dispatchSidewalk({ type: "SELECT_SHAPE", id: polygon.id })}
                    className="flex items-baseline gap-1.5 px-1 py-0.5 text-left cursor-pointer"
                  >
                    <span className="text-xs font-semibold text-ink whitespace-nowrap">Shape {number(polygon.id)}</span>
                    <span className="text-[11px] text-muted whitespace-nowrap">{polygon.points.length} points</span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete shape ${number(polygon.id)}`}
                    title="Delete shape"
                    onClick={() => {
                      this.dispatchSidewalk({ type: "SELECT_SHAPE", id: polygon.id });
                      this.dispatchSidewalk({ type: "DELETE_SHAPE" });
                    }}
                    className="shrink-0 bg-surface border border-line hover:bg-danger-soft hover:text-danger text-muted rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-bold transition-colors"
                  >
                    ×
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <p className="text-xs text-muted">{hint}</p>

        <div className="mt-3 pt-3 border-t border-line">
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
  private renderSidewalkGuide() {
    return (
      <div style={{ flex: '35 1 0%' }} className="min-w-0">
        <div
          id="sidewalk-guide"
          className="sticky top-4 bg-surface rounded-card border border-line shadow-sm p-4 max-h-[calc(100vh-2rem)] overflow-y-auto"
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
  private renderObstructionsCard(displayLabels: Map<string, string>) {
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
                  className={`text-xs font-semibold rounded-control border px-2 py-1 transition-colors whitespace-nowrap ${isMarked
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
        <div className="mt-4 pt-3 border-t border-line">
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

  /** Annotators, Obstructions step: "What Counts as an Obstruction" beside the canvas. */
  private renderObstructionGuide() {
    return (
      <div style={{ flex: '35 1 0%' }} className="min-w-0">
        <div
          id="obstruction-guide"
          className="sticky top-4 bg-surface rounded-card border border-line shadow-sm p-4 max-h-[calc(100vh-2rem)] overflow-y-auto"
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
      this.setState({ error: `${label} is outside the photo. Move it onto the photo or delete it.` });
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
    });

    if (!validationResult.valid) {
      this.setState({ error: validationResult.error });
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
      this.setState({
        submitting: false,
        error: "We couldn't save that annotation. Check your connection and try again.",
      });
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
      this.setState({
        submitting: false,
        error: message || "We couldn't save that annotation. Check your connection and try again.",
      });
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

  public selectAnnotation = (data) => {
    // Numbered in the lists' order, not drawing order
    const labels = buildDisplayLabelsInOrder(this.currentAnnotationData);
    this.paintSidewalkLayer();
    const variant = this.paintVariant;
    for (const item of this.shapes) {
      if (this.isBoxHidden(item.getAnnotationData().id)) continue;
      const isSelected = variant === "default" && item.getAnnotationData().id === data.id;
      const { x, y, width: boxW } = item.paint(
        this.canvas2D,
        this.calculateShapePosition,
        isSelected,
        labels.get(item.getAnnotationData().id),
        variant
      );

      if (isSelected) {
        if (!this.currentTransformer) {
          this.currentTransformer = new Transformer(
            item,
            this.scaleState.scale
          );
        }

        this.currentTransformer.paint(
          this.canvas2D,
          this.calculateShapePosition,
          this.scaleState.scale
        );

        const stageW = 960;
        const popupW = 290;
        const margin = this.props.marginWithInput;
        const rightLeft = x + boxW + margin;
        const leftLeft = x - popupW - margin;
        const useLeft = rightLeft + popupW > stageW && leftLeft >= 0;
        const popupTop = Math.max(0, Math.min(y, 600 - 220));

        this.setState({
          showInput: true,
          inputPosition: { left: useLeft ? leftLeft : rightLeft, top: popupTop },
          inputComment: item.getAnnotationData().comment || "",
          originalComment: item.getAnnotationData().initialState?.comment || "",
          editable: item.getAnnotationData().editable || false,
          selected: item.getAnnotationData().selected || false,
          isRejected: item.getAnnotationData().isRejected || false,
          obstructs: item.getAnnotationData().obstructs,
          severity: item.getAnnotationData().severity,
        });
      }
    }
    this.currentAnnotationData = this.shapes.map((item) =>
      item.getAnnotationData()
    );
    const { onChange } = this.props;
    onChange(this.currentAnnotationData);
  };

  public onShapeChange = ({ quiet = false }: { quiet?: boolean } = {}) => {
    if (this.canvas2D && this.canvasRef.current) {
      this.canvas2D.clearRect(
        0,
        0,
        this.canvasRef.current.width,
        this.canvasRef.current.height
      );

      let hasSelectedItem = false;
      // Numbered in the lists' order, not drawing order, which changes on every
      // click: "Lamp Post #2" is the same box on the photo and in the list
      const labels = buildDisplayLabelsInOrder(this.currentAnnotationData);

      // The sidewalk outline goes under the boxes
      this.paintSidewalkLayer();

      // Obstructions and Sidewalk lock the boxes: nothing is selected or
      // transformed. Sidewalk can hide them.
      const variant = this.paintVariant;
      const skipBoxes = this.inSidewalkStep && !this.state.showSidewalkBoxes;
      for (const item of this.shapes) {
        if (skipBoxes) continue;
        if (this.isBoxHidden(item.getAnnotationData().id)) continue;
        const isSelected = variant === "default" && item.getAnnotationData().id === this.selectedId;
        const { x, y, width: boxW } = item.paint(
          this.canvas2D,
          this.calculateShapePosition,
          isSelected,
          labels.get(item.getAnnotationData().id),
          variant
        );

        if (isSelected) {
          if (!this.currentTransformer) {
            this.currentTransformer = new Transformer(
              item,
              this.scaleState.scale
            );
          }

          hasSelectedItem = true;

          this.currentTransformer.paint(
            this.canvas2D,
            this.calculateShapePosition,
            this.scaleState.scale
          );

          const stageW = 960;
          const popupW = 290;
          const margin = this.props.marginWithInput;
          const rightLeft = x + boxW + margin;
          const leftLeft = x - popupW - margin;
          const useLeft = rightLeft + popupW > stageW && leftLeft >= 0;
          const popupTop = Math.max(0, Math.min(y, 600 - 220));

          this.setState({
            showInput: true,
            inputPosition: { left: useLeft ? leftLeft : rightLeft, top: popupTop },
            inputComment: item.getAnnotationData().comment || "",
            originalComment: item.getAnnotationData().initialState?.comment || "",
            editable: item.getAnnotationData().editable || false,
            selected: item.getAnnotationData().selected || false,
            isRejected: item.getAnnotationData().isRejected || false,
            obstructs: item.getAnnotationData().obstructs,
            severity: item.getAnnotationData().severity,
          });
        }
      }

      // quiet: a pointer-speed sidewalk repaint, which must not re-render
      if (!hasSelectedItem && !quiet) {
        this.setState({
          showInput: false,
          inputComment: "",
          editable: false,
          selected: false,
          isRejected: false,
        });
      }
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
          const imageNodeRatio = height / width;
          const { width: canvasWidth, height: canvasHeight } = this.props;
          const canvasNodeRatio = canvasHeight / canvasWidth;
          if (!isNaN(imageNodeRatio) && !isNaN(canvasNodeRatio)) {
            if (imageNodeRatio < canvasNodeRatio) {
              const scale = canvasWidth / width;
              this.scaleState = {
                originX: 0,
                originY: (canvasHeight - scale * height) / 2,
                scale,
              };
            } else {
              const scale = canvasHeight / height;
              this.scaleState = {
                originX: (canvasWidth - scale * width) / 2,
                originY: 0,
                scale,
              };
            }
          }
          this.onImageChange();
          this.onShapeChange();
        });
        nextImageNode.alt = "";
        nextImageNode.src = this.props.image;
      }
    }
  };

  private onMouseDown: MouseEventHandler<HTMLCanvasElement> = (event) => {
    const { offsetX, offsetY } = event.nativeEvent;
    const { positionX, positionY } = this.calculateMousePosition(
      offsetX,
      offsetY
    );
    this.currentAnnotationState.onMouseDown(positionX, positionY);
  };

  private onMouseMove: MouseEventHandler<HTMLCanvasElement> = (event) => {
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
      return;
    }
    this.currentAnnotationState.onMouseMove(positionX, positionY);
  };

  private onMouseUp: MouseEventHandler<HTMLCanvasElement> = () => {
    this.currentAnnotationState.onMouseUp();
  };

  private onMouseLeave: MouseEventHandler<HTMLCanvasElement> = () => {
    this.currentAnnotationState.onMouseLeave();
  };

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
