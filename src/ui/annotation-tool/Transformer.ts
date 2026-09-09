import { IShape, IShapeBase } from "./Shape";

export interface ITransformer {
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
 */
export default class Transformer implements ITransformer {
  private readonly shape: IShape;
  private currentNodeCenterIndex: number;
  private scale: number;

  // Divided by scale so the handles stay a constant size on screen regardless
  // of how far the image is zoomed — otherwise they'd shrink to nothing on a
  // zoomed-out image and swallow the box when zoomed in
  private get nodeWidth() {
    return this.shape.shapeStyle.transformerSize / this.scale;
  }

  constructor(shape: IShape, scale: number) {
    this.shape = shape;
    this.scale = scale;
  }

  public checkBoundary = (positionX: number, positionY: number) => {
    const currentCenterIndex = this.getCenterIndexByCursor(
      positionX,
      positionY
    );
    return currentCenterIndex >= 0;
  };

  public startTransformation = (positionX: number, positionY: number) => {
    this.currentNodeCenterIndex = this.getCenterIndexByCursor(
      positionX,
      positionY
    );
  };

  public onTransformation = (positionX: number, positionY: number) => {
    const currentCentersTable = this.getAllCentersTable();
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
