
import Button from '../Button';
import React, { MouseEventHandler } from "react";
import Router from "next/router";
import { validateAnnotationForSubmit } from "@/util/validators/clientAnnotation";
import {
  TAU_THRESHOLD,
  filterAnnotationsByTau,
  computeStepTimings,
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
import { normalizeMark, isBelowMinimumSize } from "@/util/boxGeometry";
import { normalizeSubmittedMarks } from "@/util/validators/annotationSubmit";
import { summarizeObjectStep, findNearDuplicates } from "@/features/annotate/objectStep";
import { TAXONOMY_GUIDE, TAXONOMY_RULES } from "@/features/annotate/taxonomyGuide";

import { IAnnotation } from "./Annotation";
import { IAnnotationState } from "./annotation/AnnotationState";
import { DefaultAnnotationState } from "./annotation/DefaultAnnotationState";
import DefaultInputSection from "./DefaultInputSection";
import ObjectInputSection from "./ObjectInputSection";
import {
  defaultShapeStyle,
  IShape,
  IShapeBase,
  IShapeStyle,
  RectShape,
} from "./Shape";
import Transformer, { ITransformer } from "./Transformer";
import {
  readSessionData,
  readCurrentCount,
  writeSession,
  writeCurrentCount,
} from "@/util/sessionCache";
import { P } from "../Typography";
import { H2 } from "../Typography";
import { H3 } from "../Typography";
import Container from '../Container';
import { buildDisplayLabels, formatLabel } from "@/util/buildDisplayLabels";

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
  ) => React.ReactElement;
  totalAnnotationCount?: number;
  // Annotators give no severity and answer no scene-level questions (decided
  // 3 Oct 2026). Comes from the database through annotationGet, never the session.
  isAnnotator?: boolean;
}

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
  };

  set selectedId(value: string | null) {
    const { onSelect } = this.props;
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

  // Annotators give no severity and answer no scene-level questions (decided
  // 3 Oct 2026). Every role-dependent part of the tool reads these getters.
  private get askSeverity() {
    return !this.props.isAnnotator;
  }

  private get askScene() {
    return !this.props.isAnnotator;
  }

  // From 4 Oct 2026 annotators do Step 1 Objects only: boxes and categories,
  // with Keep or Not an object on every suggestion and no obstruction answer
  private get annotatorObjectStep() {
    return this.props.isAnnotator === true;
  }

  private markSceneStepStart = () => {
    if (this.sceneStepStartMs === null) {
      this.sceneStepStartMs = Date.now();
    }
  };

  public componentDidMount = () => {
    const currentCanvas = this.canvasRef.current;
    const currentImageCanvas = this.imageCanvasRef.current;
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
        }
      }
    }

    this.syncAnnotationData();
    this.syncSelectedId();
    this.setupCanvasScaling();
  };

  public componentDidUpdate = (preProps: IReactPictureAnnotationProps) => {
    const { width, height, image } = this.props;
    if (preProps.width !== width || preProps.height !== height) {
      this.setCanvasDPI();
      this.onShapeChange();
      this.onImageChange();
    }
    if (preProps.image !== image) {
      this.mountTime = Date.now();
      this.sceneStepStartMs = null;
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

    // Copy before sorting: Array#sort is in-place, and reordering
    // currentAnnotationData here would quietly reshuffle the same array the
    // canvas and the submit handler read from.
    const sortedAnnotations = [...this.currentAnnotationData].sort((a, b) =>
      a.id.localeCompare(b.id)
    );

    const displayLabels = buildDisplayLabels(sortedAnnotations);

    const { canvasScale } = this.state;
    const { askScene, askSeverity, annotatorObjectStep } = this;

    return (
      <Container as="section" width="wide" className="annotation-container">
        <div className="flex flex-row gap-6">

          {/* ── Left: Step 1 (65%, or the full width when there is no Step 2) ── */}
          <div style={{ flex: '65 1 0%' }} className="min-w-0">
            <div className="mb-3">
              {annotatorObjectStep ? (
                <>
                  <H2 className="text-lg font-bold text-ink mb-1">Step 1: Objects</H2>
                  <P className="text-body text-sm">
                    Box every object from the 18 categories that you can see anywhere in the image, on the sidewalk or not.
                    For each dashed yellow suggestion, check its category, fix the box if it is loose, then click Keep,
                    or click Not an object if it marks nothing real. Draw a box for every object the suggestions missed.
                  </P>
                </>
              ) : (
                <>
                  <H2 className="text-lg font-bold text-ink mb-1">Step 1: Identify Objects</H2>
                  <P className="text-body text-sm">
                    Review objects <span className="font-semibold text-ink">on or beside the sidewalk</span>.
                    For each dashed yellow box, decide whether it obstructs the path for <strong>you</strong>, traveling as you normally do.
                    Draw new boxes to label any missed objects.
                  </P>
                </>
              )}
            </div>

            <div className="flex flex-col gap-4 mb-6">
              <div className="w-full bg-surface-subtle rounded-card border border-line shadow-sm p-2">
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
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              {annotatorObjectStep ? this.renderObjectsCard(sortedAnnotations, displayLabels) : (
              <div id="box-review-section" className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
                <div className="bg-surface rounded-card border border-line shadow-sm p-4">
                  <H3><span className="text-lg font-bold text-ink">Confirmed Obstructions</span></H3>
                  <p className="text-xs text-muted mb-2">Suggestions you said obstruct the sidewalk.</p>
                  <ul className="flex flex-wrap gap-2">
                    {sortedAnnotations
                      .map((data) => {
                        if (!data.editable && data.selected) {
                          return (
                            <li
                              className="group border border-line rounded-control bg-surface hover:border-primary hover:shadow-md transition-all cursor-pointer flex items-center gap-1 pl-2 pr-1 py-1"
                              key={data.id}
                              onClick={() => {
                                this.currentAnnotationState.onMouseDown(data.mark.x + 1, data.mark.y + 1);
                                this.currentAnnotationState.onMouseUp();
                              }}
                            >
                              <span className="text-xs font-semibold text-ink whitespace-nowrap">
                                {displayLabels.get(data.id) ?? formatLabel(data.comment) ?? ""}
                              </span>
                              <button
                                className="shrink-0 bg-surface border border-line hover:bg-danger-soft hover:text-danger text-muted rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-bold transition-colors"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  this.selectedId = data.id;
                                  this.onUnselectObstruction();
                                }}
                              >
                                ×
                              </button>
                            </li>
                          );
                        } else {
                          return <div key={data.id} className="hidden" />;
                        }
                      })}
                  </ul>
                </div>
                <div className="bg-surface rounded-card border border-line shadow-sm p-4">
                  <H3><span className="text-lg font-bold text-ink">Your Drawn Obstructions</span></H3>
                  <p className="text-xs text-muted mb-2">Objects you drew. Answer Yes or No for each.</p>
                  <ul className="flex flex-wrap gap-2">
                    {sortedAnnotations
                      .map((data) => {
                        if (data.editable) {
                          return (
                            <li
                              className="group border border-line rounded-control bg-surface hover:border-primary hover:shadow-md transition-all cursor-pointer flex items-center gap-1 pl-2 pr-1 py-1"
                              key={data.id}
                              onClick={() => {
                                this.currentAnnotationState.onMouseDown(data.mark.x + 1, data.mark.y + 1);
                                this.currentAnnotationState.onMouseUp();
                              }}
                            >
                              <span className="text-xs font-semibold text-ink whitespace-nowrap">
                                {displayLabels.get(data.id) ?? "Select Option"}
                              </span>
                              {/* The obstruction answer, so an unanswered box shows before submitting */}
                              <span
                                className={`text-[10px] font-bold rounded-control px-1 ${data.obstructs === true
                                  ? "bg-primary text-white"
                                  : data.obstructs === false
                                    ? "bg-surface-subtle text-body border border-line"
                                    : "bg-danger-soft text-danger"
                                  }`}
                                title={data.obstructs == null ? "Not answered yet" : "Obstructs the sidewalk?"}
                              >
                                {data.obstructs === true ? "Yes" : data.obstructs === false ? "No" : "?"}
                              </span>
                              <button
                                className="shrink-0 bg-surface border border-line hover:bg-danger-soft hover:text-danger text-muted rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-bold transition-colors"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  this.selectedId = data.id;
                                  this.onDelete();
                                }}
                              >
                                ×
                              </button>
                            </li>
                          );
                        } else {
                          return <div key={data.id} className="hidden" />;
                        }
                      })}
                  </ul>
                </div>
              </div>
              )}
            </div>
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
          ) : this.renderTaxonomyGuide()}

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
          {this.props.currentAnnotationCount > 1 && (
            <Button variant="neutral" onClick={this.onPrevious}>
              Previous
            </Button>
          )}

          <Button submit onClick={this.submit} className="whitespace-nowrap">
            {this.props.totalAnnotationCount && this.props.currentAnnotationCount >= this.props.totalAnnotationCount ? "Finish Session" : "Next Image"}
          </Button>
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

  /** Selects a box as if it had been clicked, which opens its panel. */
  private selectBox = (box: IAnnotation) => {
    const mark = normalizeMark(box.mark);
    this.currentAnnotationState.onMouseDown(mark.x + 1, mark.y + 1);
    this.currentAnnotationState.onMouseUp();
  };

  /**
   * Annotators: the "Objects in This Image" card under the canvas. Keeps the
   * box-review-section id, which the tutorial points at.
   */
  private renderObjectsCard(sortedAnnotations: IAnnotation[], displayLabels: Map<string, string>) {
    const summary = summarizeObjectStep(sortedAnnotations);
    const duplicates = findNearDuplicates(sortedAnnotations);
    const labelOf = (box: IAnnotation) => displayLabels.get(box.id) ?? formatLabel(box.comment) ?? "Select a category";
    const tagFor = (box: IAnnotation) => {
      if (box.editable) return { text: "Drawn", className: "bg-blue-50 text-primary border border-blue-200" };
      if (box.selected === true) return { text: "Kept", className: "bg-primary text-white" };
      if (box.comment === NOT_AN_OBJECT) return { text: "Not an object", className: "bg-surface-subtle text-muted border border-line" };
      return { text: "To decide", className: "bg-danger-soft text-danger" };
    };
    const nextId = summary.toDecideIds[0];
    const nextBox = nextId != null ? sortedAnnotations.find((a) => a.id === nextId) : undefined;

    return (
      <div id="box-review-section" className="bg-surface rounded-card border border-line shadow-sm p-4 w-full">
        <H3><span className="text-lg font-bold text-ink">Objects in This Image</span></H3>
        <p className="text-xs text-muted mb-1">
          Suggestions decided: {summary.decided} of {summary.suggestions}
        </p>
        <p className="text-xs text-muted mb-3">Boxes you drew: {summary.drawn}</p>
        <ul className="flex flex-wrap gap-2">
          {sortedAnnotations.map((box) => {
            const tag = tagFor(box);
            return (
              <li
                key={box.id}
                className="group border border-line rounded-control bg-surface hover:border-primary hover:shadow-md transition-all cursor-pointer flex items-center gap-1.5 pl-2 pr-1 py-1"
                onClick={() => this.selectBox(box)}
              >
                <span className="text-xs font-semibold text-ink whitespace-nowrap">{labelOf(box)}</span>
                <span className={`text-[10px] font-bold rounded-control px-1 whitespace-nowrap ${tag.className}`}>{tag.text}</span>
              </li>
            );
          })}
        </ul>
        {nextBox && (
          <div className="mt-3">
            <Button variant="neutral" size="sm" onClick={() => this.selectBox(nextBox)}>
              Next suggestion to decide
            </Button>
          </div>
        )}
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

  private onPrevious = async () => {
    // 1. Check if we are at the start
    if (this.props.currentAnnotationCount <= 1) return;

    // 2. Save User Edits Locally (Just in case they drew something before going back)
    this.cacheCurrentImageEdits();

    // 3. Decrement the counter in Local Storage
    const newCount = (readCurrentCount() ?? 1) - 1;
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
    const durationMs = Date.now() - this.mountTime;

    const username = this.props.username;
    // Annotators (Step 1 Objects) send every decided suggestion, kept or Not an
    // object, and no obstruction answer. Contributors send the suggestions
    // they answered Yes or No.
    const objectStep = this.annotatorObjectStep;
    const noJudgment = (box: IAnnotation) => ({ ...box, obstructs: null, severity: null });
    const decidedSuggestions = this.currentAnnotationData.filter((element) =>
      !element.editable && (objectStep ? isDecidedForObjects(element) : (element.selected || element.isRejected))
    );
    const drawnBoxes = this.currentAnnotationData.filter(
      (element) => element.editable
    );
    // Both roles: marks normalized (positive width and height) and clipped to
    // the image before sending. initialState is left alone.
    const selectedObjects = this.tidyMarks(objectStep ? decidedSuggestions.map(noJudgment) : decidedSuggestions);
    const newObjects = this.tidyMarks(objectStep ? drawnBoxes.map(noJudgment) : drawnBoxes);

    const counts = buildSubmissionCounts(this.currentAnnotationData);
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
    const stepTimings = computeStepTimings(this.mountTime, this.sceneStepStartMs, submitTime, {
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

    const telemetryPayload = {
      imageDurationMs: durationMs,
      ...stepTimings,
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
      selectedObjectsID: selectedObjects,
      newObjects: newObjects,
      currentAnnotationCount: this.props.currentAnnotationCount + 1,
      telemetry: telemetryPayload,
    };
    const res = await fetch("/api/annotationSubmit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.status === 200) {
      // Fold the current UI state into the cached batch so 'Previous' can
      // restore it without another round trip
      this.cacheCurrentImageEdits();

      const newCount = (readCurrentCount() ?? this.props.currentAnnotationCount) + 1;
      writeCurrentCount(newCount);

      sessionStorage.setItem("isNavigatingImages", "true");
      Router.reload();
      window.scrollTo(0, 0);
    } else {
      this.setState({
        error: "We couldn't save that annotation. Check your connection and try again.",
      });
    }
  };

  /**
   * Writes the boxes, rating, and surface choice for the image on screen back
   * into the cached batch. Called before navigating in either direction so the
   * page reload that follows picks the work back up.
   */
  private cacheCurrentImageEdits = () => {
    const localData = readSessionData();
    if (!localData || !localData.imgRecords) return;

    const currentIndex = this.props.currentAnnotationCount - 1;
    const record = localData.imgRecords[currentIndex];
    if (!record) return;

    record.annotationList = this.tidyMarks(this.currentAnnotationData);
    record.userSliderValue = this.state.sliderValue;
    record.userPavementType = this.state.pavementType;
    record.userSceneLevel = this.askScene ? this.state.sceneLevel : null;
    writeSession({ data: localData });
  };

  public setAnnotationState = (annotationState: IAnnotationState) => {
    this.currentAnnotationState = annotationState;
  };

  public selectAnnotation = (data) => {
    const labels = buildDisplayLabels(this.currentAnnotationData);
    for (const item of this.shapes) {
      const isSelected = item.getAnnotationData().id === data.id;
      const { x, y, width: boxW } = item.paint(
        this.canvas2D,
        this.calculateShapePosition,
        isSelected,
        labels.get(item.getAnnotationData().id)
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

  public onShapeChange = () => {
    if (this.canvas2D && this.canvasRef.current) {
      this.canvas2D.clearRect(
        0,
        0,
        this.canvasRef.current.width,
        this.canvasRef.current.height
      );

      let hasSelectedItem = false;
      const labels = buildDisplayLabels(this.currentAnnotationData);

      for (const item of this.shapes) {
        const isSelected = item.getAnnotationData().id === this.selectedId;
        const { x, y, width: boxW } = item.paint(
          this.canvas2D,
          this.calculateShapePosition,
          isSelected,
          labels.get(item.getAnnotationData().id)
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
            editable: item.getAnnotationData().editable || false,
            selected: item.getAnnotationData().selected || false,
            isRejected: item.getAnnotationData().isRejected || false,
            obstructs: item.getAnnotationData().obstructs,
            severity: item.getAnnotationData().severity,
          });
        }
      }

      if (!hasSelectedItem) {
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
      this.currentAnnotationState.onMouseDown(-1, -1);
      this.currentAnnotationState.onMouseUp();
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

    this.currentAnnotationState.onMouseDown(-1, -1);
    this.currentAnnotationState.onMouseUp();
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

    this.currentAnnotationState.onMouseDown(-1, -1);
    this.currentAnnotationState.onMouseUp();
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

    this.currentAnnotationState.onMouseDown(-1, -1);
    this.currentAnnotationState.onMouseUp();
  };

  /** Closes the panel without changing the box (the check button). */
  private onClose = () => {
    this.currentAnnotationState.onMouseDown(-1, -1);
    this.currentAnnotationState.onMouseUp();
  };

  private onSetObstructs = (obstructs: boolean) => {
    if (this.annotatorObjectStep) return;
    const selectTarget = this.shapes.findIndex(
      (shape) => shape.getAnnotationData().id === this.selectedId
    );

    if (selectTarget >= 0) {
      const data = this.shapes[selectTarget].getAnnotationData();
      data.obstructs = obstructs;
      if (!obstructs) {
        data.severity = null;
      } else if (this.askSeverity && (data.severity === undefined || data.severity === null)) {
        // Contributors rate a drawn obstruction, starting the slider at 3
        data.severity = 3;
      }
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
      const wasFirstConfirmation = data.severity === null || data.severity === undefined;
      data.severity = severity as 1 | 2 | 3 | 4 | 5;
      data.obstructs = true;
      this.setState({ severity, obstructs: true });
      this.onShapeChange();

      // Only dismiss on first confirmation, not when editing existing severity
      if (wasFirstConfirmation && !data.editable) {
        this.currentAnnotationState.onMouseDown(-1, -1);
        this.currentAnnotationState.onMouseUp();
      }
    }
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
    this.currentAnnotationState.onMouseMove(positionX, positionY);
  };

  private onMouseUp: MouseEventHandler<HTMLCanvasElement> = () => {
    this.currentAnnotationState.onMouseUp();
  };

  private onMouseLeave: MouseEventHandler<HTMLCanvasElement> = () => {
    this.currentAnnotationState.onMouseLeave();
  };

  /**
   * Fires a complete synthetic click at the given image coordinates.
   *
   * Used to select a box programmatically — after drawing a new one, or when
   * clicking its thumbnail in the summary list. Running it through the same
   * state machine as a real click means selection behaves identically either
   * way, instead of needing a parallel path that could drift.
   *
   * The leading mouse-up settles whatever gesture was in flight, so the click
   * lands on a state machine that's actually idle.
   */
  public onMouseDownHack(positionX, positionY) {
    this.currentAnnotationState.onMouseUp();
    this.currentAnnotationState.onMouseDown(positionX, positionY);
    this.currentAnnotationState.onMouseUp();
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
