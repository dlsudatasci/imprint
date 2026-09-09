
import Button from '../Button';
import React, { MouseEventHandler } from "react";
import Router from "next/router";

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
    ) => (
      <DefaultInputSection
        key={id}
        value={value}
        onChange={onChange}
        onDelete={onDelete}
        onSelectObstruction={onSelectObstruction}
        onUnselectObstruction={onUnselectObstruction}
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
      sidewalkPresent: null as string | null,
      surfaceCondition: null as number | null,
      walkability: null as number | null,
      overallAccessibility: null as number | null,
    },
    error: null as string | null,
    isRejected: false,
    obstructs: undefined as boolean | undefined,
    severity: undefined as number | null | undefined,
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
  private selectedIdTrueValue: string | null;
  private canvasRef = React.createRef<HTMLCanvasElement>();
  private canvas2D?: CanvasRenderingContext2D | null;
  private imageCanvasRef = React.createRef<HTMLCanvasElement>();
  private imageCanvas2D?: CanvasRenderingContext2D | null;
  private currentImageElement?: HTMLImageElement;
  private currentAnnotationState: IAnnotationState = new DefaultAnnotationState(
    this
  );
  // Start of the timer behind the "average seconds per image" dashboard stat.
  // Reset in componentDidUpdate when the image changes, so it measures time on
  // the current photo rather than since the component first mounted.
  private mountTime: number = Date.now();

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

  /**
   * Thumbnail of one box, for the summary lists below the canvas.
   *
   * Crops with CSS rather than a second canvas: the full image is blown up and
   * offset inside an overflow-hidden window so only the box's region shows.
   * Percentages relative to the box size mean the same markup works at any
   * thumbnail size, and the browser reuses the already-decoded image.
   *
   * Negative width/height are normalized first — a box dragged up-and-left has
   * them, and they'd otherwise produce a crop offset the wrong way.
   */
  private renderImageCrop = (data: IAnnotation) => {
    const img = this.currentImageElement;
    if (!img || !img.naturalWidth || data.mark.width === 0 || data.mark.height === 0) {
      return <div className="w-full h-full bg-surface-subtle animate-pulse"></div>;
    }

    let { x, y, width, height } = data.mark;
    if (width < 0) {
      x += width;
      width = Math.abs(width);
    }
    if (height < 0) {
      y += height;
      height = Math.abs(height);
    }

    const imgWidthPct = (img.naturalWidth / width) * 100;
    const imgHeightPct = (img.naturalHeight / height) * 100;
    const leftPct = -(x / width) * 100;
    const topPct = -(y / height) * 100;

    return (
      <div className="w-full h-full overflow-hidden relative">
        {/* eslint-disable-next-line @next/next/no-img-element -- this reuses
            the already-decoded canvas image element, so next/image would only
            add a second network fetch */}
        <img
          src={img.src}
          style={{
            position: 'absolute',
            width: `${imgWidthPct}%`,
            height: `${imgHeightPct}%`,
            left: `${leftPct}%`,
            top: `${topPct}%`,
            maxWidth: 'none'
          }}
          alt="Annotation Crop"
        />
      </div>
    );
  };

  public render() {
    const { width, height, inputElement } = this.props;
    const {
      showInput,
      inputPosition,
      inputComment,
      editable,
      selected,
      sliderValue,
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

    return (
      <Container as="section" className="annotation-container">
        <div className="mb-6">
          <H2 className="text-2xl font-bold text-ink mb-2">Step 1: Identify Objects</H2>
          <P className="text-body text-lg">
            Review objects <span className="font-semibold text-ink">on or beside the sidewalk</span>.
            For each dashed yellow box, decide whether it obstructs the path for <strong>you</strong>, traveling as you normally do.
            Draw new boxes to label any missed objects. Rate how severely each obstruction affects passage.
          </P>
        </div>

        {/* Annotation Tool */}
        <div className="flex flex-col gap-8 mb-12">
          <div className="w-full overflow-x-auto bg-surface-subtle rounded-card border border-line shadow-sm flex items-center justify-center p-4">
            <div className="rp-stage relative" style={{ width, height }}>
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
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-5xl mx-auto">
            <div className="bg-surface rounded-card border border-line shadow-sm p-6">
              <H3><span className="text-lg font-bold text-ink">Confirmed Objects</span></H3>
              <p className="text-sm text-muted mb-4">Model suggestions you reviewed.</p>
              <ul className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {sortedAnnotations
                  .map((data) => {
                    if (!data.editable && data.selected) {
                      return (
                        <li
                          className="relative group border border-line rounded-control overflow-hidden bg-surface hover:border-primary hover:shadow-md transition-all cursor-pointer flex flex-col"
                          key={data.id}
                          onClick={() => {
                            this.currentAnnotationState.onMouseDown(data.mark.x + 1, data.mark.y + 1);
                            this.currentAnnotationState.onMouseUp();
                          }}
                        >
                          <button
                            className="absolute top-1 right-1 bg-surface border border-line hover:bg-danger-soft hover:text-danger text-muted rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold transition-colors duration-300 z-10"
                            onClick={(e) => {
                              e.stopPropagation();
                              this.selectedId = data.id;
                              this.onUnselectObstruction();
                            }}
                          >
                            ×
                          </button>
                          <div className="w-full h-24 bg-surface-subtle flex items-center justify-center relative border-b border-line-card">
                            {this.renderImageCrop(data)}
                          </div>
                          <div className="p-2 text-center">
                            <span className="text-xs font-semibold text-ink truncate block">
                              {data.comment.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                            </span>
                            {data.severity != null && (
                              <span className="text-[10px] text-muted">Severity: {data.severity}/5</span>
                            )}
                          </div>
                        </li>
                      );
                    } else {
                      return <div key={data.id} className="hidden" />;
                    }
                  })}
              </ul>
            </div>
            <div className="bg-surface rounded-card border border-line shadow-sm p-6">
              <H3><span className="text-lg font-bold text-ink">Your Drawn Objects</span></H3>
              <p className="text-sm text-muted mb-4">Objects that you have drawn yourself.</p>
              <ul className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {sortedAnnotations
                  .map((data) => {
                    if (data.editable) {
                      return (
                        <li 
                          className="relative group border border-line rounded-control overflow-hidden bg-surface hover:border-primary hover:shadow-md transition-all cursor-pointer flex flex-col" 
                          key={data.id}
                          onClick={() => {
                            this.currentAnnotationState.onMouseDown(data.mark.x + 1, data.mark.y + 1);
                            this.currentAnnotationState.onMouseUp();
                          }}
                        >
                          <button
                            className="absolute top-1 right-1 bg-surface border border-line hover:bg-danger-soft hover:text-danger text-muted rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold transition-colors duration-300 z-10"
                            onClick={(e) => {
                              e.stopPropagation();
                              this.selectedId = data.id;
                              this.onDelete();
                            }}
                          >
                            ×
                          </button>
                          <div className="w-full h-24 bg-surface-subtle flex items-center justify-center relative border-b border-line-card">
                            {this.renderImageCrop(data)}
                          </div>
                          <div className="p-2 text-center">
                            <span className="text-xs font-semibold text-ink truncate block">
                              {data.comment !== undefined && data.comment !== "" && data.comment !== "---"
                                ? data.comment.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
                                : "Select Option"}
                            </span>
                            {data.obstructs === true && data.severity != null && (
                              <span className="text-[10px] text-muted">Severity: {data.severity}/5</span>
                            )}
                            {data.obstructs === false && (
                              <span className="text-[10px] text-muted">Not obstructing</span>
                            )}
                          </div>
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

        {/* Step 2: Scene-Level Assessment */}
        <div className="border-t border-line pt-10 mb-10">
          <H2 className="text-2xl font-bold text-ink mb-2">Step 2: Rate the Sidewalk</H2>
          <P className="text-body text-lg mb-8">
            Rate the following aspects of the sidewalk scene based on what you see in the image.
          </P>
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Item 1 — Sidewalk Presence */}
            <div className="bg-surface-subtle p-6 rounded-card border border-line">
              <p className="font-semibold text-ink mb-1">Sidewalk Presence</p>
              <p className="text-sm text-muted mb-4">Is there a sidewalk or designated pedestrian path in this image?</p>
              <div className="flex gap-3">
                {[
                  { value: "yes", label: "Yes, along the route" },
                  { value: "partial", label: "Partly / interrupted" },
                  { value: "no", label: "No sidewalk" },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    className={`flex-1 py-3 rounded-control text-sm font-semibold transition-all border ${
                      this.state.sceneLevel.sidewalkPresent === opt.value
                        ? 'border-primary bg-primary/10 text-primary ring-2 ring-primary/20'
                        : 'border-line bg-surface text-body hover:bg-primary/5 hover:border-primary/30'
                    }`}
                    onClick={() => {
                      const updates: Record<string, unknown> = { sidewalkPresent: opt.value };
                      if (opt.value === "no") updates.surfaceCondition = null;
                      this.setState({
                        sceneLevel: { ...this.state.sceneLevel, ...updates },
                      });
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Item 2 — Surface Condition (disabled when no sidewalk) */}
            {(() => {
              const disabled = this.state.sceneLevel.sidewalkPresent === "no";
              return (
                <div className={`bg-surface-subtle p-6 rounded-card border border-line${disabled ? ' opacity-50' : ''}`}>
                  <p className="font-semibold text-ink mb-1">Surface Condition</p>
                  <p className="text-sm text-muted mb-4">
                    {disabled ? "Not applicable — no sidewalk present" : "How would you describe the condition of the walking surface?"}
                  </p>
                  <div className="flex gap-2">
                    {([
                      { value: 1, label: "Even & well maintained" },
                      { value: 2, label: "Mostly even, minor defects" },
                      { value: 3, label: "Noticeably uneven or cracked" },
                      { value: 4, label: "Severely damaged or broken" },
                    ]).map((option) => (
                      <button
                        key={option.value}
                        disabled={disabled}
                        className={`flex-1 py-3 rounded-control text-sm font-semibold transition-all border ${
                          !disabled && this.state.sceneLevel.surfaceCondition === option.value
                            ? 'border-primary bg-primary/10 text-primary ring-2 ring-primary/20'
                            : 'border-line bg-surface text-body' + (disabled ? ' cursor-not-allowed' : ' hover:bg-primary/5 hover:border-primary/30')
                        }`}
                        onClick={() => {
                          if (!disabled) {
                            this.setState({
                              sceneLevel: { ...this.state.sceneLevel, surfaceCondition: option.value },
                            });
                          }
                        }}
                      >
                        <span className="block text-lg font-bold">{option.value}</span>
                        <span className="block text-xs mt-0.5">{option.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Item 3 — Perceived Walkability */}
            <div className="bg-surface-subtle p-6 rounded-card border border-line">
              <p className="font-semibold text-ink mb-1">Perceived Walkability</p>
              <p className="text-sm text-muted mb-4">Thinking about how you normally travel, how easy would this stretch be to walk?</p>
              <div className="flex gap-2">
                {([
                  { value: 1, label: "Very difficult" },
                  { value: 2, label: "Difficult" },
                  { value: 3, label: "Manageable" },
                  { value: 4, label: "Easy" },
                  { value: 5, label: "Very easy" },
                ]).map((option) => (
                  <button
                    key={option.value}
                    className={`flex-1 py-3 rounded-control text-sm font-semibold transition-all border ${
                      this.state.sceneLevel.walkability === option.value
                        ? 'border-primary bg-primary/10 text-primary ring-2 ring-primary/20'
                        : 'border-line bg-surface text-body hover:bg-primary/5 hover:border-primary/30'
                    }`}
                    onClick={() => {
                      this.setState({
                        sceneLevel: { ...this.state.sceneLevel, walkability: option.value },
                      });
                    }}
                  >
                    <span className="block text-lg font-bold">{option.value}</span>
                    <span className="block text-xs mt-0.5">{option.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Item 4 — Overall Accessibility */}
            <div className="bg-surface-subtle p-6 rounded-card border border-line">
              <p className="font-semibold text-ink mb-1">Overall Accessibility</p>
              <p className="text-sm text-muted mb-4">Overall, how accessible is this sidewalk for people with mobility needs?</p>
              <div className="flex gap-2">
                {([
                  { value: 1, label: "Not accessible" },
                  { value: 2, label: "Slightly" },
                  { value: 3, label: "Moderately" },
                  { value: 4, label: "Mostly" },
                  { value: 5, label: "Fully accessible" },
                ]).map((option) => (
                  <button
                    key={option.value}
                    className={`flex-1 py-3 rounded-control text-sm font-semibold transition-all border ${
                      this.state.sceneLevel.overallAccessibility === option.value
                        ? 'border-primary bg-primary/10 text-primary ring-2 ring-primary/20'
                        : 'border-line bg-surface text-body hover:bg-primary/5 hover:border-primary/30'
                    }`}
                    onClick={() => {
                      this.setState({
                        sceneLevel: { ...this.state.sceneLevel, overallAccessibility: option.value },
                      });
                    }}
                  >
                    <span className="block text-lg font-bold">{option.value}</span>
                    <span className="block text-xs mt-0.5">{option.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

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

    let manualBoxCount = 0;
    let acceptedSuggestionCount = 0;
    let modifiedSuggestionCount = 0;
    let deletedSuggestionCount = 0;

    // Model scorecard. Splitting confirmations into "accepted as-is" versus
    // "had to be corrected" is the useful signal — a suggestion the user
    // nudged into place was nearly right, one they redrew was not, and a flat
    // acceptance rate hides the difference.
    for (const obj of this.currentAnnotationData) {
      if (obj.editable) {
        manualBoxCount++;
      } else {
        if (obj.isRejected) {
          deletedSuggestionCount++;
        } else if (obj.selected) {
          const init = obj.initialState;
          let isModified = false;
          if (init) {
            // Compare labels loosely: "parked_car" and "Parked Car" are the
            // same answer typed two ways, not a correction
            const normalizedInit = init.comment ? init.comment.toLowerCase().replace(/_/g, " ") : "";
            const normalizedObj = obj.comment ? obj.comment.toLowerCase().replace(/_/g, " ") : "";

            if (normalizedInit !== normalizedObj) isModified = true;

            // 3px of slack: clicking a box to confirm it often drags it a pixel
            // or two, and counting that as "the model was wrong" would quietly
            // understate how well it's doing
            if (
              Math.abs(init.mark.x - obj.mark.x) > 3 ||
              Math.abs(init.mark.y - obj.mark.y) > 3 ||
              Math.abs(init.mark.width - obj.mark.width) > 3 ||
              Math.abs(init.mark.height - obj.mark.height) > 3
            ) {
              isModified = true;
            }
          }
          if (isModified) {
            modifiedSuggestionCount++;
          } else {
            acceptedSuggestionCount++;
          }
        }
      }
    }

    let obstructionCount = 0;
    let nonObstructionCount = 0;
    for (const obj of this.currentAnnotationData) {
      if (obj.isRejected) continue;
      if (obj.obstructs === true) obstructionCount++;
      else if (obj.obstructs === false) nonObstructionCount++;
    }

    const telemetryPayload = {
      imageDurationMs: durationMs,
      manualBoxCount,
      acceptedSuggestionCount,
      modifiedSuggestionCount,
      deletedSuggestionCount,
      totalBoxesSubmitted: manualBoxCount + acceptedSuggestionCount + modifiedSuggestionCount,
      obstructionCount,
      nonObstructionCount,
    };

    this.setState({ error: null });

    // Every suggestion needs an explicit yes or no. Silence isn't the same as
    // "no" — an unanswered box means we don't know whether the model was right,
    // which is exactly what this exercise is trying to find out.
    const unconfirmedExistingAnnotations = this.currentAnnotationData.filter(
      (element) => !element.editable && !element.selected && !element.isRejected
    );

    if (unconfirmedExistingAnnotations.length > 0) {
      this.setState({
        error: "Please click Yes or No on all existing annotations before submitting.",
      });
      return;
    }

    const objectsToValidate = [...newObjects, ...selectedObjects];
    for (const object of objectsToValidate) {
      if (!object.comment || object.comment === "---") {
        this.setState({
          error:
            "You have an unlabeled object. Please select a label for all the boxes.",
        });
        return;
      }
    }

    // Every box needs an explicit obstruction judgment
    const allBoxes = [...this.currentAnnotationData.filter(e => !e.editable && !e.isRejected), ...newObjects];
    for (const object of allBoxes) {
      if (object.obstructs === undefined || object.obstructs === null) {
        this.setState({
          error: "Please indicate whether each object obstructs the sidewalk.",
        });
        return;
      }
      if (object.obstructs === true && (object.severity === undefined || object.severity === null)) {
        this.setState({
          error: "Please rate the severity of each obstruction (1–5).",
        });
        return;
      }
    }

    const { sceneLevel } = this.state;
    if (!sceneLevel.sidewalkPresent) {
      this.setState({ error: "Please indicate whether a sidewalk is present." });
      return;
    }
    if (sceneLevel.sidewalkPresent !== "no" && sceneLevel.surfaceCondition === null) {
      this.setState({ error: "Please rate the surface condition." });
      return;
    }
    if (sceneLevel.walkability === null) {
      this.setState({ error: "Please rate the walkability." });
      return;
    }
    if (sceneLevel.overallAccessibility === null) {
      this.setState({ error: "Please rate the overall accessibility." });
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
    for (const item of this.shapes) {
      const isSelected = item.getAnnotationData().id === data.id;
      const { x, y, width: boxW, height } = item.paint(
        this.canvas2D,
        this.calculateShapePosition,
        isSelected
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

      for (const item of this.shapes) {
        const isSelected = item.getAnnotationData().id === this.selectedId;
        const { x, y, width: boxW, height } = item.paint(
          this.canvas2D,
          this.calculateShapePosition,
          isSelected
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

    const refreshShapesWithAnnotationData = () => {
      this.selectedId = null;
      this.shapes = annotationData.map(
        (eachAnnotationData) => {
          if (!eachAnnotationData.editable && !eachAnnotationData.initialState) {
            // Snapshot the model's version before the user can touch it —
            // submit() diffs against this to tell "accepted" from "corrected".
            // The mark is copied, not referenced, since dragging mutates it.
            eachAnnotationData.initialState = {
              comment: eachAnnotationData.comment,
              mark: { ...eachAnnotationData.mark }
            };
            // Start every suggestion unanswered, so the user has to actively
            // rule on it rather than inheriting a default
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

    for (const annotationDataItem of annotationData) {
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
