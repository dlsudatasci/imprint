import { IShape, IShapeBase, boxStrokeColor } from "./Shape";
import { pickCorner, markCorners, TOUCH_HANDLE_HIT_PX, TOUCH_HANDLE_DOT_PX } from "./touchGeometry";

/** "mouse": eight square handles. "touch": four round corner handles (9 Oct 2026). */
export type TransformerMode = "mouse" | "touch";

export interface ITransformer {
  /** "mouse" or "touch" handles */
  mode?: TransformerMode;
  /** Touch mode: the corner handle a point (image px) is on, or null */
  touchCornerAt?: (positionX: number, positionY: number) => 0 | 1 | 2 | 3 | null;
  /** The handle being dragged, where it is now (image px), or null */
  activeHandlePoint?: () => { x: number; y: number } | null;
  checkBoundary: (positionX: number, positionY: number) => boolean;
  startTransformation: (positionX: number, positionY: number) => void;
  onTransformation: (positionX: number, positionY: number) => void;
  paint: (
    canvas2D: CanvasRenderingContext2D,
    calculateTruePosition: (shapeData: IShapeBase) => IShapeBase,
    scale: number
  ) => void;
}

/**
 * The eight drag handles around a selected box.
 *
 * Each handle turns a cursor position into a resize, and they behave
 * differently: corner handles resize both axes, edge handles only one. A top or
 * left handle also has to adjust width or height to compensate for moving the
 * box's origin, otherwise the opposite edge drifts along with it.
 *
 * Handle positions are recalculated from the box on every read rather than
 * stored, so they follow it as it moves.
 *
 * In touch mode (9 Oct 2026) there are four round handles at the corners
 * instead, sized in CSS px so a finger can grab them at any zoom: a 10 px dot
 * with a 22 px reach. The touch gesture moves a corner itself (moveCorner in
 * touchGeometry.ts). A rejected box gets no handles, since it cannot move.
 */
export default class Transformer implements ITransformer {
  private readonly shape: IShape;
  private currentNodeCenterIndex: number;
  private scale: number;
  public readonly mode: TransformerMode;
  // Stage px to CSS px, so touch handles keep their size on screen
  private canvasScale: number;

  // Divided by scale so the handles stay a constant size on screen regardless
  // of how far the image is zoomed — otherwise they'd shrink to nothing on a
  // zoomed-out image and swallow the box when zoomed in
  private get nodeWidth() {
    return this.shape.shapeStyle.transformerSize / this.scale;
  }

  constructor(shape: IShape, scale: number, mode: TransformerMode = "mouse", canvasScale = 1) {
    this.shape = shape;
    this.scale = scale;
    this.mode = mode;
    this.canvasScale = canvasScale > 0 ? canvasScale : 1;
  }

  /** The touch handle a point (image px) is on: 0 to 3 from top-left clockwise, or null. */
  public touchCornerAt = (positionX: number, positionY: number) => {
    if (this.mode !== "touch" || this.shape.getAnnotationData().isRejected) return null;
    const reach = TOUCH_HANDLE_HIT_PX / (this.scale * this.canvasScale);
    return pickCorner(this.shape.getAnnotationData().mark, { x: positionX, y: positionY }, reach);
  };

  public checkBoundary = (positionX: number, positionY: number) => {
    if (this.mode === "touch") return this.touchCornerAt(positionX, positionY) !== null;
    const currentCenterIndex = this.getCenterIndexByCursor(
      positionX,
      positionY
    );
    return currentCenterIndex >= 0;
  };

  public startTransformation = (positionX: number, positionY: number) => {
    if (this.mode === "touch") {
      // The four corners in the eight-handle table: top-left, top-right, bottom-right, bottom-left
      const corner = this.touchCornerAt(positionX, positionY);
      this.currentNodeCenterIndex = corner === null ? -1 : [0, 2, 7, 5][corner];
      return;
    }
    this.currentNodeCenterIndex = this.getCenterIndexByCursor(
      positionX,
      positionY
    );
  };

  /**
   * Where the handle being dragged is now, image px, for the magnifier
   * (10 Oct 2026). Read from the box as it is, so it follows the resize. Null
   * when no handle is being dragged.
   */
  public activeHandlePoint = () => {
    const handle = this.getAllCentersTable()[this.currentNodeCenterIndex];
    return handle ? { x: handle.x, y: handle.y } : null;
  };

  public onTransformation = (positionX: number, positionY: number) => {
    const currentCentersTable = this.getAllCentersTable();
    if (!currentCentersTable[this.currentNodeCenterIndex]) return;
    currentCentersTable[this.currentNodeCenterIndex].adjust(
      positionX,
      positionY
    );
  };

  public paint = (
    canvas2D: CanvasRenderingContext2D,
    calculateTruePosition: (shapeData: IShapeBase) => IShapeBase,
    scale: number
  ) => {
    this.scale = scale;
    if (this.mode === "touch") {
      this.paintTouchHandles(canvas2D, calculateTruePosition);
      return;
    }

    const allCentersTable = this.getAllCentersTable();
    canvas2D.save();
    canvas2D.fillStyle = this.shape.shapeStyle.transformerBackground;

    for (const item of allCentersTable) {
      const { x, y, width, height } = calculateTruePosition({
        x: item.x - this.nodeWidth / 2,
        y: item.y - this.nodeWidth / 2,
        width: this.nodeWidth,
        height: this.nodeWidth,
      });
      canvas2D.fillRect(x, y, width, height);
    }

    canvas2D.restore();
  };

  /** Four round handles: white, ringed in the box's colour, with a soft shadow. */
  private paintTouchHandles = (
    canvas2D: CanvasRenderingContext2D,
    calculateTruePosition: (shapeData: IShapeBase) => IShapeBase
  ) => {
    const data = this.shape.getAnnotationData();
    if (data.isRejected) return;
    const radius = TOUCH_HANDLE_DOT_PX / this.canvasScale;
    canvas2D.save();
    canvas2D.setLineDash([]);
    for (const corner of markCorners(data.mark)) {
      const { x, y } = calculateTruePosition({ x: corner.x, y: corner.y, width: 0, height: 0 });
      canvas2D.beginPath();
      canvas2D.arc(x, y, radius, 0, Math.PI * 2);
      canvas2D.shadowColor = "rgba(15, 23, 42, 0.35)";
      canvas2D.shadowBlur = 6 / this.canvasScale;
      canvas2D.fillStyle = "#ffffff";
      canvas2D.fill();
      canvas2D.shadowColor = "transparent";
      canvas2D.shadowBlur = 0;
      canvas2D.lineWidth = 2.5 / this.canvasScale;
      canvas2D.strokeStyle = boxStrokeColor(data);
      canvas2D.stroke();
    }
    canvas2D.restore();
  };

  private getCenterIndexByCursor = (positionX: number, positionY: number) => {
    const allCentersTable = this.getAllCentersTable();
    return allCentersTable.findIndex((item) =>
      this.checkEachRectBoundary(item.x, item.y, positionX, positionY)
    );
  };

  private checkEachRectBoundary = (
    rectCenterX: number,
    rectCenterY: number,
    positionX: number,
    positionY: number
  ) => {
    return (
      Math.abs(positionX - rectCenterX) <= this.nodeWidth / 2 &&
      Math.abs(positionY - rectCenterY) <= this.nodeWidth / 2
    );
  };

  /**
   * The eight handles, in a fixed order that startTransformation's index
   * depends on: top-left, top-centre, top-right, mid-left, mid-right,
   * bottom-left, bottom-centre, bottom-right.
   *
   * Each carries its own `adjust`, closing over the mark as it was when the
   * drag began — that captured origin is what the new width and height are
   * measured against.
   */
  private getAllCentersTable = () => {
    const { shape } = this;
    const { x, y, width, height } = shape.getAnnotationData().mark;
    return [
      {
        x,
        y,
        adjust: (positionX: number, positionY: number) => {
          shape.adjustMark({
            x: positionX,
            y: positionY,
            width: width + x - positionX,
            height: height + y - positionY,
          });
        },
      },
      {
        x: x + width / 2,
        y,
        adjust: (_: number, positionY: number) => {
          shape.adjustMark({
            y: positionY,
            height: height + y - positionY,
          });
        },
      },
      {
        x: x + width,
        y,
        adjust: (positionX: number, positionY: number) => {
          shape.adjustMark({
            x,
            y: positionY,
            width: positionX - x,
            height: y + height - positionY,
          });
        },
      },
      {
        x,
        y: y + height / 2,
        adjust: (positionX: number) => {
          shape.adjustMark({
            x: positionX,
            width: width + x - positionX,
          });
        },
      },
      {
        x: x + width,
        y: y + height / 2,
        adjust: (positionX: number) => {
          shape.adjustMark({ width: positionX - x });
        },
      },
      {
        x,
        y: y + height,
        adjust: (positionX: number, positionY: number) => {
          shape.adjustMark({
            x: positionX,
            width: width + x - positionX,
            height: positionY - y,
          });
        },
      },
      {
        x: x + width / 2,
        y: y + height,
        adjust: (_: number, positionY: number) => {
          shape.adjustMark({
            height: positionY - y,
          });
        },
      },
      {
        x: x + width,
        y: y + height,
        adjust: (positionX: number, positionY: number) => {
          shape.adjustMark({
            width: positionX - x,
            height: positionY - y,
          });
        },
      },
    ];
  };
}
