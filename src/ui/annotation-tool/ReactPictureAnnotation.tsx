
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
import { NOT_AN_OBJECT, notAnObjectPatch } from "@/util/suggestionJudgment";

import { IAnnotation } from "./Annotation";
import { IAnnotationState } from "./annotation/AnnotationState";
import { DefaultAnnotationState } from "./annotation/DefaultAnnotationState";
import DefaultInputSection from "./DefaultInputSection";
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
  ) => React.ReactElement;
  totalAnnotationCount?: number;
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
function SidewalkWidthIcon({ type }: { type: string }) {
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

  const sidewalkEdges = (leftTop: number, leftBot: number, rightTop: number, rightBot: number) => (
    <g>
      <line x1={leftTop} y1={5} x2={leftBot} y2={75} stroke="currentColor" strokeWidth={2} opacity={0.35} />
      <line x1={rightTop} y1={5} x2={rightBot} y2={75} stroke="currentColor" strokeWidth={2} opacity={0.35} />
    </g>
  );

  switch (type) {
    case "noSidewalk":
      return (
        <svg viewBox="0 0 80 80" className="w-full h-full text-muted" aria-label="No sidewalk">
          <line x1={35} y1={5} x2={15} y2={75} stroke="currentColor" strokeWidth={2} strokeDasharray="6 4" opacity={0.25} />
          <line x1={45} y1={5} x2={65} y2={75} stroke="currentColor" strokeWidth={2} strokeDasharray="6 4" opacity={0.25} />
          <line x1={28} y1={30} x2={52} y2={54} stroke="currentColor" strokeWidth={2.5} opacity={0.4} />
          <line x1={52} y1={30} x2={28} y2={54} stroke="currentColor" strokeWidth={2.5} opacity={0.4} />
        </svg>
      );
    case "onePerson":
      return (
        <svg viewBox="0 0 80 80" className="w-full h-full text-ink" aria-label="One person width">
          {sidewalkEdges(33, 18, 47, 62)}
          {walkingFigure(40)}
        </svg>
      );
    case "twoPeople":
      return (
        <svg viewBox="0 0 80 80" className="w-full h-full text-ink" aria-label="Two people width">
          {sidewalkEdges(28, 8, 52, 72)}
          {walkingFigure(32)}
          {walkingFigure(50)}
        </svg>
      );
    case "threePlus":
      return (
        <svg viewBox="0 0 80 80" className="w-full h-full text-ink" aria-label="Three people width">
          {sidewalkEdges(24, 2, 56, 78)}
          {walkingFigure(22)}
          {walkingFigure(40)}
          {walkingFigure(58)}
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
      />
    ),
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
          if (currentRecord.userSceneLevel !== undefined) {
            this.setState({ sceneLevel: currentRecord.userSceneLevel });
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

    return (
      <Container as="section" width="wide" className="annotation-container">
        <div className="flex flex-row gap-6">

          {/* ── Left: Step 1 (65%) ── */}
          <div style={{ flex: '65 1 0%' }} className="min-w-0">
            <div className="mb-3">
              <H2 className="text-lg font-bold text-ink mb-1">Step 1: Identify Objects</H2>
              <P className="text-body text-sm">
                Review objects <span className="font-semibold text-ink">on or beside the sidewalk</span>.
                For each dashed yellow box, decide whether it obstructs the path for <strong>you</strong>, traveling as you normally do.
                Draw new boxes to label any missed objects.
              </P>
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
                          {inputElement(
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
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <div id="box-review-section" className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
                <div className="bg-surface rounded-card border border-line shadow-sm p-4">
                  <H3><span className="text-lg font-bold text-ink">Confirmed Obstructions</span></H3>
                  <p className="text-xs text-muted mb-2">Suggestions you confirmed as present.</p>
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
                  <p className="text-xs text-muted mb-2">Objects you identified that the model missed.</p>
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
            </div>
          </div>

          {/* ── Right: Step 2 (35%) ── */}
          <div style={{ flex: '35 1 0%' }} className="min-w-0 overflow-y-auto">
            <div id="scene-level-section" className="mb-6">
              <H2 className="text-lg font-bold text-ink mb-1">Step 2: Rate the Sidewalk</H2>
              <P className="text-body text-sm mb-4">
                Rate the following aspects of the sidewalk scene based on what you see in the image.
              </P>
              <div className="space-y-3">
                {/* Item 1 — Sidewalk Width */}
                <div className="bg-surface-subtle p-4 rounded-card border border-line">
                  <p className="text-base font-semibold text-ink mb-0.5">Sidewalk Width</p>
                  <p className="text-[11px] text-muted mb-2">How many people can comfortably walk side by side on the sidewalk?</p>
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { value: "no_sidewalk", label: "No Sidewalk", icon: "noSidewalk" as const },
                      { value: "one_person", label: "One Person", icon: "onePerson" as const },
                      { value: "two_people", label: "Two People", icon: "twoPeople" as const },
                      { value: "three_or_more", label: "Three+", icon: "threePlus" as const },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        className={`flex flex-col items-center p-3 rounded-card text-center transition-all border ${this.state.sceneLevel.sidewalkWidth === opt.value
                            ? 'border-primary bg-primary/10 text-primary ring-2 ring-primary/20'
                            : 'border-line bg-surface text-body hover:bg-primary/5 hover:border-primary/30'
                          }`}
                        onClick={() => {
                          this.markSceneStepStart();
                          const updates: Record<string, unknown> = { sidewalkWidth: opt.value };
                          if (opt.value === "no_sidewalk") updates.surfaceCondition = null;
                          this.setState({
                            sceneLevel: { ...this.state.sceneLevel, ...updates },
                          });
                        }}
                      >
                        <div className="w-16 h-16 mb-1.5 flex items-end justify-center">
                          <SidewalkWidthIcon type={opt.icon} />
                        </div>
                        <span className="text-xs font-semibold leading-tight">{opt.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Item 2 — Surface Condition (disabled when no sidewalk) */}
                {(() => {
                  const disabled = this.state.sceneLevel.sidewalkWidth === "no_sidewalk";
                  return (
                    <div className={`bg-surface-subtle p-4 rounded-card border border-line${disabled ? ' opacity-50' : ''}`}>
                      <p className="text-base font-semibold text-ink mb-0.5">Surface Condition</p>
                      <p className="text-[11px] text-muted mb-2">
                        {disabled ? "Not applicable — no sidewalk present" : "How would you describe the condition of the walking surface?"}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {([
                          { value: 1, label: "Even & well maintained" },
                          { value: 2, label: "Mostly even, minor defects" },
                          { value: 3, label: "Noticeably uneven or cracked" },
                          { value: 4, label: "Severely damaged or broken" },
                        ]).map((option) => (
                          <button
                            key={option.value}
                            disabled={disabled}
                            className={`flex-1 py-2 rounded-control text-xs font-semibold transition-all border ${!disabled && this.state.sceneLevel.surfaceCondition === option.value
                                ? 'border-primary bg-primary/10 text-primary ring-2 ring-primary/20'
                                : 'border-line bg-surface text-body' + (disabled ? ' cursor-not-allowed' : ' hover:bg-primary/5 hover:border-primary/30')
                              }`}
                            onClick={() => {
                              if (!disabled) {
                                this.markSceneStepStart();
                                this.setState({
                                  sceneLevel: { ...this.state.sceneLevel, surfaceCondition: option.value },
                                });
                              }
                            }}
                          >
                            <span className="block text-sm font-bold">{option.value}</span>
                            <span className="block text-[10px] mt-0.5">{option.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* Item 3 — Perceived Walkability */}
                <div className="bg-surface-subtle p-4 rounded-card border border-line">
                  <p className="text-base font-semibold text-ink mb-0.5">Perceived Walkability</p>
                  <p className="text-[11px] text-muted mb-2">How easy would this stretch be to walk?</p>
                  <div className="flex flex-wrap gap-2">
                    {([
                      { value: 1, label: "Very difficult" },
                      { value: 2, label: "Difficult" },
                      { value: 3, label: "Manageable" },
                      { value: 4, label: "Easy" },
                      { value: 5, label: "Very easy" },
                    ]).map((option) => (
                      <button
                        key={option.value}
                        className={`flex-1 py-2 rounded-control text-xs font-semibold transition-all border ${this.state.sceneLevel.walkability === option.value
                            ? 'border-primary bg-primary/10 text-primary ring-2 ring-primary/20'
                            : 'border-line bg-surface text-body hover:bg-primary/5 hover:border-primary/30'
                          }`}
                        onClick={() => {
                          this.markSceneStepStart();
                          this.setState({
                            sceneLevel: { ...this.state.sceneLevel, walkability: option.value },
                          });
                        }}
                      >
                        <span className="block text-sm font-bold">{option.value}</span>
                        <span className="block text-[10px] mt-0.5">{option.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Item 4 — Overall Accessibility */}
                <div className="bg-surface-subtle p-4 rounded-card border border-line">
                  <p className="text-base font-semibold text-ink mb-0.5">Overall Accessibility</p>
                  <p className="text-[11px] text-muted mb-2">How accessible is this sidewalk for people with mobility needs?</p>
                  <div className="flex flex-wrap gap-2">
                    {([
                      { value: 1, label: "Not accessible" },
                      { value: 2, label: "Slightly" },
                      { value: 3, label: "Moderately" },
                      { value: 4, label: "Mostly" },
                      { value: 5, label: "Fully accessible" },
                    ]).map((option) => (
                      <button
                        key={option.value}
                        className={`flex-1 py-2 rounded-control text-xs font-semibold transition-all border ${this.state.sceneLevel.overallAccessibility === option.value
                            ? 'border-primary bg-primary/10 text-primary ring-2 ring-primary/20'
                            : 'border-line bg-surface text-body hover:bg-primary/5 hover:border-primary/30'
                          }`}
                        onClick={() => {
                          this.markSceneStepStart();
                          this.setState({
                            sceneLevel: { ...this.state.sceneLevel, overallAccessibility: option.value },
                          });
                        }}
                      >
                        <span className="block text-sm font-bold">{option.value}</span>
                        <span className="block text-[10px] mt-0.5">{option.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>{/* end flex row */}

        {/* Error Message Display */}
        {this.state.error && (
          <div className="flex justify-center mt-6 mb-4">
            <div className="bg-danger-soft border border-danger-border text-danger px-6 py-3 rounded-control flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
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
    const selectedObjects = this.currentAnnotationData.filter(
      (element) => !element.editable && (element.selected || element.isRejected)
    );
    const selectedObjectsID = [];
    for (let i = 0; i < selectedObjects.length; i++) {
      selectedObjectsID.push(selectedObjects[i]);
    }
    const newObjects = this.currentAnnotationData.filter(
      (element) => element.editable
    );

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
    const stepTimings = computeStepTimings(this.mountTime, this.sceneStepStartMs, submitTime);
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
      sceneLevel,
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

    record.annotationList = this.currentAnnotationData;
    record.userSliderValue = this.state.sliderValue;
    record.userPavementType = this.state.pavementType;
    record.userSceneLevel = this.state.sceneLevel;
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

  private onSelectObstruction = () => {
    const selectTarget = this.shapes.findIndex(
      (shape) => shape.getAnnotationData().id === this.selectedId
    );

    let keepSelected = false;
    if (selectTarget >= 0) {
      const data = this.shapes[selectTarget].getAnnotationData();
      if (!data.editable) {
        if (!data.selected) {
          keepSelected = true;
        }
        data.selected = true;
        data.isRejected = false;
        data.obstructs = true;
        this.setState({ selected: true, isRejected: false, obstructs: true });
        this.onShapeChange();
      } else {
        data.obstructs = true;
        if (data.severity === undefined || data.severity === null) {
          data.severity = 3;
        }
        this.setState({ obstructs: true, severity: data.severity });
        this.onShapeChange();
      }
    }

    if (!keepSelected) {
      this.currentAnnotationState.onMouseDown(-1, -1);
      this.currentAnnotationState.onMouseUp();
    }
  };

  private onUnselectObstruction = () => {
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
      const patch = notAnObjectPatch();
      Object.assign(data, patch);
      this.setState({ selected: false, isRejected: true, obstructs: false, severity: null, inputComment: NOT_AN_OBJECT });
      this.onShapeChange();
    }

    this.currentAnnotationState.onMouseDown(-1, -1);
    this.currentAnnotationState.onMouseUp();
  };

  private onSetObstructs = (obstructs: boolean) => {
    const selectTarget = this.shapes.findIndex(
      (shape) => shape.getAnnotationData().id === this.selectedId
    );

    if (selectTarget >= 0) {
      const data = this.shapes[selectTarget].getAnnotationData();
      data.obstructs = obstructs;
      if (!obstructs) {
        data.severity = null;
      }
      this.setState({ obstructs, severity: obstructs ? this.state.severity : null });
      this.onShapeChange();
    }
  };

  private onSetSeverity = (severity: number) => {
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

  /* eslint-disable @typescript-eslint/no-unused-vars */
  private sliderValueText = (sliderValue) => {
    //   switch (sliderValue) {
    //     case 1:
    //       return "This sidewalk is completely unsafe and inaccessible for both abled pedestrians and PWPDs";
    //     case 2:
    //       return "This sidewalk is very unsafe for all pedestrians";
    //     case 3:
    //       return "This sidewalk is inconvenient for all pedestrians";
    //     case 4:
    //       return "This sidewalk is nearly acceptable for all pedestrians";
    //     case 5:
    //       return "This sidewalk is adequate for all pedestrians ";
    //     case 6:
    //       return "This sidewalk is unsafe for PWPDs ";
    //     case 7:
    //       return "This sidewalk is inconvenient for PWPDs";
    //     case 8:
    //       return "This sidewalk is accessible and safe for PWPDs";
    //     case 9:
    //       return "This sidewalk only has minor issues for PWPDs";
    //     case 10:
    //       return "This sidewalk has no accessibility nor safety issues for both abled pedestrians and PWPDs";
    //     default:
    //       return "Sidewalk Accessibility is inclusive to people with disabilities. ";
    //   }
    // };
    // Rate the sidewalk found on the image based on your understanding of sidewalk accessibility.
    // A score of 1 means that there is no sidewalk or the sidewalk in the image is completely unsafe
    // and inaccessible for both abled pedestrians and persons with physical disabilities. On the other
    // hand, a score of 10 means that the sidewalk has no accessibility nor safety issues for both abled pedestrians and PWPDs
    const message =
      "Rate the sidewalk found on the image based on your understanding of sidewalk accessibility. A score of 1 means that there is no sidewalk or the sidewalk in the image is completely unsafe and inaccessible for both abled pedestrians and persons with physical disabilities (PWPDs). On the other hand, a score of 10 means that the sidewalk has no accessibility nor safety issues for both abled pedestrians and PWPDs";
    return message;
  };
}
