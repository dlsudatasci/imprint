
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
import { P } from "../Typography";
import { H2 } from "../Typography";
import { H3 } from "../Typography";

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
    id: string
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
      id: string
    ) => (
      <DefaultInputSection
        key={id}
        value={value}
        onChange={onChange}
        onDelete={onDelete}
        onSelectObstruction={onSelectObstruction}
        onUnselectObstruction={onUnselectObstruction}
        editable={editable}
        selected={selected}
        isRejected={isRejected}
      />
    ),
  };

  public state = {
    inputPosition: {
      left: 0,
      top: 0,
    },
    showInput: false,
    inputComment: "",
    editable: false,
    selected: false,
    sliderValue: 5,
    pavementType: "",
    error: null as string | null,
    isRejected: false,
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
      const localData = JSON.parse(localStorage.getItem("annotationSetData"));
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

  private renderImageCrop = (data: IAnnotation) => {
    const img = this.currentImageElement;
    if (!img || !img.naturalWidth || data.mark.width === 0 || data.mark.height === 0) {
      return <div className="w-full h-full bg-gray-100 animate-pulse"></div>;
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
    } = this.state;

    return (
      <section className="annotation-container max-w-7xl mx-auto">
        <div className="mb-6">
          <H2 className="text-2xl font-bold text-gray-900 mb-2">Step 1: Identify Obstruction</H2>
          <P className="text-gray-600 text-lg">
            Identify objects <span className="font-semibold text-gray-900">only on the sidewalk surface</span>.
            For existing dashed yellow boxes, click &quot;Yes&quot; if they block the pathway, or &quot;No&quot; if they do not. Draw new boxes to label missed obstructions.
            If there are no obstructions, skip to the next step.
          </P>
        </div>

        {/* Annotation Tool */}
        <div className="flex flex-col gap-8 mb-12">
          <div className="w-full overflow-x-auto bg-gray-50 rounded-2xl border border-gray-200 shadow-sm flex items-center justify-center p-4">
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
                <div className="rp-selected-input" style={inputPosition}>
                  {inputElement(
                    inputComment,
                    this.onInputCommentChange,
                    this.onDelete,
                    this.onSelectObstruction,
                    this.onUnselectObstruction,
                    editable,
                    selected,
                    isRejected,
                    this.selectedId || ""
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-5xl mx-auto">
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
              <H3><span className="text-lg font-bold text-gray-900">Selected Obstructions</span></H3>
              <p className="text-sm text-gray-500 mb-4">Objects you identified as obstructions.</p>
              <ul className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {this.currentAnnotationData
                  .sort((a, b) => a.id.localeCompare(b.id))
                  .map((data) => {
                    if (!data.editable && data.selected) {
                      return (
                        <li 
                          className="relative group border border-gray-200 rounded-xl overflow-hidden bg-white hover:border-primary hover:shadow-md transition-all cursor-pointer flex flex-col" 
                          key={data.id}
                          onClick={() => {
                            this.currentAnnotationState.onMouseDown(data.mark.x + 1, data.mark.y + 1);
                            this.currentAnnotationState.onMouseUp();
                          }}
                        >
                          <button
                            className="absolute top-1 right-1 bg-white/90 hover:bg-red-50 hover:text-red-600 text-gray-500 rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold shadow-sm backdrop-blur-sm transition-colors z-10"
                            onClick={(e) => {
                              e.stopPropagation();
                              this.selectedId = data.id;
                              this.onUnselectObstruction();
                            }}
                          >
                            ×
                          </button>
                          <div className="w-full h-24 bg-gray-50 flex items-center justify-center relative border-b border-gray-100">
                            {this.renderImageCrop(data)}
                          </div>
                          <div className="p-2 text-center">
                            <span className="text-xs font-semibold text-gray-800 truncate block">
                              {data.comment.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                            </span>
                          </div>
                        </li>
                      );
                    } else {
                      return <div key={data.id} className="hidden" />;
                    }
                  })}
              </ul>
            </div>
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
              <H3><span className="text-lg font-bold text-gray-900">New Obstructions</span></H3>
              <p className="text-sm text-gray-500 mb-4">Objects that you have drawn yourself.</p>
              <ul className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {this.currentAnnotationData
                  .sort((a, b) => a.id.localeCompare(b.id))
                  .map((data) => {
                    if (data.editable) {
                      return (
                        <li 
                          className="relative group border border-gray-200 rounded-xl overflow-hidden bg-white hover:border-primary hover:shadow-md transition-all cursor-pointer flex flex-col" 
                          key={data.id}
                          onClick={() => {
                            this.currentAnnotationState.onMouseDown(data.mark.x + 1, data.mark.y + 1);
                            this.currentAnnotationState.onMouseUp();
                          }}
                        >
                          <button
                            className="absolute top-1 right-1 bg-white/90 hover:bg-red-50 hover:text-red-600 text-gray-500 rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold shadow-sm backdrop-blur-sm transition-colors z-10"
                            onClick={(e) => {
                              e.stopPropagation();
                              this.selectedId = data.id;
                              this.onDelete();
                            }}
                          >
                            ×
                          </button>
                          <div className="w-full h-24 bg-gray-50 flex items-center justify-center relative border-b border-gray-100">
                            {this.renderImageCrop(data)}
                          </div>
                          <div className="p-2 text-center">
                            <span className="text-xs font-semibold text-gray-800 truncate block">
                              {data.comment !== undefined && data.comment !== "" && data.comment !== "---"
                                ? data.comment.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
                                : "Select Option"}
                            </span>
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

        {/* Step 2: Slider */}
        <div className="border-t border-gray-200 pt-10 mb-10">
          <H2 className="text-2xl font-bold text-gray-900 mb-2">Step 2: Rate Sidewalk Accessibility</H2>
          <P className="text-gray-600 text-lg mb-8">
            Rate the accessibility from 1 (Dangerous/Inaccessible) to 10 (Safe/Accessible).
          </P>
          <div className="max-w-4xl mx-auto bg-gray-50 p-8 rounded-3xl border border-gray-200 shadow-sm">
            <div className="text-center mb-6">
              <span className="text-5xl font-extrabold text-primary">{sliderValue}</span>
              <span className="text-xl text-gray-500 font-medium ml-2">/ 10</span>
            </div>
            <div className="flex items-start justify-between gap-4 md:gap-6">
              <span className="text-sm md:text-base font-semibold text-slate-700 whitespace-nowrap -mt-1">Dangerous & Inaccessible</span>
              <div className="flex-1 w-full relative min-w-[200px]">
                <input
                  type="range"
                  min="1"
                  max="10"
                  step="1"
                  value={sliderValue}
                  id="accessibilityScore"
                  className="w-full h-4 bg-gray-200 rounded-full appearance-none cursor-pointer accent-primary focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                  onChange={(e) => {
                    this.setState({
                      ...this.state,
                      sliderValue: e.target.valueAsNumber,
                    });
                  }}
                />
                <div className="flex justify-between text-sm text-gray-400 mt-3 font-semibold px-1">
                  <span>1</span><span>2</span><span>3</span><span>4</span><span>5</span><span>6</span><span>7</span><span>8</span><span>9</span><span>10</span>
                </div>
              </div>
              <span className="text-sm md:text-base font-semibold text-slate-700 whitespace-nowrap -mt-1">Safe & Accessible</span>
            </div>
          </div>
        </div>

        {/* Step 3: Radios */}
        <div className="border-t border-gray-200 pt-10 mb-10">
          <H2 className="text-2xl font-bold text-gray-900 mb-2">Step 3: Choose the Surface Type</H2>
          <P className="text-gray-600 text-lg mb-8">
            Select the surface type that best describes the sidewalk.
          </P>
          <fieldset className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
            {[
              { id: "smooth_paving", label: "Smooth Surface", img: "/images/annotationTool/smooth_paving.png" },
              { id: "rough_paving", label: "Rough Surface", img: "/images/annotationTool/rough_paving.jpg" },
              { id: "slippery_paving", label: "Tile/Slippery", img: "/images/annotationTool/tile_slippery_sidewalk.jpg" },
              { id: "no_sidewalk", label: "No Sidewalk", img: "/images/annotationTool/no_sidewalk.png" }
            ].map(option => (
              <label
                key={option.id}
                htmlFor={option.id}
                className={`cursor-pointer rounded-2xl border-2 overflow-hidden transition-all duration-300 block group flex flex-col h-full ${this.state.pavementType === option.id
                  ? 'border-primary ring-4 ring-primary/20 shadow-md transform -translate-y-1'
                  : 'border-gray-200 hover:border-gray-300 hover:shadow-sm bg-white'
                  }`}
              >
                <input
                  type="radio"
                  name="surface_type"
                  id={option.id}
                  value={option.id}
                  className="sr-only"
                  onChange={(e) => {
                    this.setState({
                      ...this.state,
                      pavementType: e.target.value,
                    });
                  }}
                  checked={this.state.pavementType === option.id}
                />
                <div className="h-40 bg-gray-100 overflow-hidden relative shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={option.img} alt={option.label} className="w-full h-full object-cover" />
                </div>
                <div className="p-5 flex flex-col items-center bg-white flex-1">
                  <span className={`font-bold text-lg mb-2 ${this.state.pavementType === option.id ? 'text-primary' : 'text-gray-900'}`}>
                    {option.label}
                  </span>
                  <p className="text-sm text-gray-600 text-center leading-relaxed">
                    {this.surfaceTypeText(option.id)}
                  </p>
                </div>
              </label>
            ))}
          </fieldset>
        </div>

        {/* Error Message Display */}
        {this.state.error && (
          <div className="flex justify-center mt-6 mb-4">
            <div className="bg-red-50 border border-red-200 text-red-700 px-6 py-3 rounded-lg flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-300 shadow-sm">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span className="font-medium">{this.state.error}</span>
            </div>
          </div>
        )}

        <div className="flex justify-center my-10 gap-4">
          {this.props.currentAnnotationCount > 1 && (
            <button
              className="transition-all duration-500 ease-in-out font-semibold py-3 px-8 text-lg rounded-[2rem] border hover:-translate-y-0.5 hover:shadow-md border-gray-200 text-accent hover:border-accent bg-white whitespace-nowrap"
              type="button"
              onClick={this.onPrevious}
            >
              Previous
            </button>
          )}

          <button
            className="transition-all duration-500 ease-in-out font-semibold py-3 px-8 text-lg rounded-[2rem] border hover:-translate-y-0.5 hover:shadow-md bg-primary border-primary text-white hover:bg-opacity-90 flex items-center whitespace-nowrap"
            type="submit"
            onClick={this.submit}
          >
            {this.props.totalAnnotationCount && this.props.currentAnnotationCount >= this.props.totalAnnotationCount ? "Finish Session" : "Next Image"}
          </button>
        </div>
      </section>
    );
  }

  private onPrevious = async () => {
    // 1. Check if we are at the start
    if (this.props.currentAnnotationCount <= 1) return;

    // 2. Save User Edits Locally (Just in case they drew something before going back)
    const localData = JSON.parse(localStorage.getItem("annotationSetData"));
    if (localData && localData.imgRecords) {
      const currentIndex = this.props.currentAnnotationCount - 1;
      if (localData.imgRecords[currentIndex]) {
        localData.imgRecords[currentIndex].annotationList = this.currentAnnotationData;
        localData.imgRecords[currentIndex].userSliderValue = this.state.sliderValue;
        localData.imgRecords[currentIndex].userPavementType = this.state.pavementType;
        localStorage.setItem("annotationSetData", JSON.stringify(localData));
      }
    }

    // 3. Decrement the counter in Local Storage
    const currentCount = parseInt(localStorage.getItem("annotationCurrentCount") || "1");
    const newCount = currentCount - 1;
    window.localStorage.setItem("annotationCurrentCount", JSON.stringify(newCount));

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

  private submit = async () => {
    // isLoading(true);

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
            const normalizedInit = init.comment ? init.comment.toLowerCase().replace(/_/g, " ") : "";
            const normalizedObj = obj.comment ? obj.comment.toLowerCase().replace(/_/g, " ") : "";

            if (normalizedInit !== normalizedObj) isModified = true;

            // Allow a small 3-pixel tolerance for accidental mouse twitches when clicking
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

    const telemetryPayload = {
      imageDurationMs: durationMs,
      manualBoxCount,
      acceptedSuggestionCount,
      modifiedSuggestionCount,
      deletedSuggestionCount,
      totalBoxesSubmitted: manualBoxCount + acceptedSuggestionCount + modifiedSuggestionCount,
    };

    this.setState({ error: null });

    // Enforce that all existing annotations are explicitly confirmed or rejected
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
            "You have an unlabeled obstruction. Please select a label for all the boxes.",
        });
        return; // Stop the submission here
      }
    }

    if (this.state.pavementType === "") {
      this.setState({
        error: "Please select the surface type of the sidewalk.",
      });
      return;
    }

    const body = {
      username: username,
      imageID: this.props.imageID,
      city: this.props.city,
      accessibilityRating: this.state.sliderValue,
      pavementType: this.state.pavementType,
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
      // --- Save User Edits Locally ---
      const localData = JSON.parse(localStorage.getItem("annotationSetData"));
      if (localData && localData.imgRecords) {
        const currentIndex = this.props.currentAnnotationCount - 1;
        if (localData.imgRecords[currentIndex]) {
          // Merge current UI state into the cached payload so 'Previous' loads it
          localData.imgRecords[currentIndex].annotationList = this.currentAnnotationData;
          localData.imgRecords[currentIndex].userSliderValue = this.state.sliderValue;
          localData.imgRecords[currentIndex].userPavementType = this.state.pavementType;
          localStorage.setItem("annotationSetData", JSON.stringify(localData));
        }
      }

      const newCount =
        parseInt(localStorage.getItem("annotationCurrentCount")) + 1;
      window.localStorage.setItem(
        "annotationCurrentCount",
        JSON.stringify(newCount)
      );
      sessionStorage.setItem("isNavigatingImages", "true");
      Router.reload();
      window.scrollTo(0, 0);
      // Add ui to indicate sucessful submission
    } else {
      // isLoading(false);
      // Insert Error stuff
    }
  };

  public setAnnotationState = (annotationState: IAnnotationState) => {
    this.currentAnnotationState = annotationState;
  };

  public selectAnnotation = (data) => {
    for (const item of this.shapes) {
      const isSelected = item.getAnnotationData().id === data.id;
      const { x, y, height } = item.paint(
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

        this.setState({
          showInput: true,
          inputPosition: {
            left: x,
            top: y + height + this.props.marginWithInput,
          },
          inputComment: item.getAnnotationData().comment || "",
          editable: item.getAnnotationData().editable || false,
          selected: item.getAnnotationData().selected || false,
          isRejected: item.getAnnotationData().isRejected || false,
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
        const { x, y, height } = item.paint(
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

          this.setState({
            showInput: true,
            inputPosition: {
              left: x,
              top: y + height + this.props.marginWithInput,
            },
            inputComment: item.getAnnotationData().comment || "",
            editable: item.getAnnotationData().editable || false,
            selected: item.getAnnotationData().selected || false,
            isRejected: item.getAnnotationData().isRejected || false,
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

  private syncAnnotationData = () => {
    const { annotationData } = this.props;

    const refreshShapesWithAnnotationData = () => {
      this.selectedId = null;
      this.shapes = annotationData.map(
        (eachAnnotationData) => {
          if (!eachAnnotationData.editable && !eachAnnotationData.initialState) {
            eachAnnotationData.initialState = {
              comment: eachAnnotationData.comment,
              mark: { ...eachAnnotationData.mark }
            };
            // Default pre-annotations to neutral (Yellow Dashed)
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
        this.setState({ selected: true, isRejected: false });
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
        this.setState({ selected: false, isRejected: true });
        this.onShapeChange();
      }
    }

    this.currentAnnotationState.onMouseDown(-1, -1);
    this.currentAnnotationState.onMouseUp();
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
