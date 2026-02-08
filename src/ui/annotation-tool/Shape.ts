import { IAnnotation } from "./Annotation";


export const defaultShapeStyle: IShapeStyle = {
  paddingX: 12,
  paddingY: 4,
  lineWidth: 2,
  shadowBlur: 10,
  fontSize: 12,
  fontColor: "#212529",
  fontBackground: "#f8f9fa",
  fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen-Sans, Ubuntu, Cantarell, 'Helvetica Neue', Helvetica, Arial, sans-serif",
  shapeBackground: "hsla(210, 16%, 93%, 0.2)",
  shapeStrokeStyle: "yellow",
  shapeShadowStyle: "hsla(210, 9%, 31%, 0.35)",
  transformerBackground: "black",
  transformerSize: 10,
};

export interface IShapeStyle {
  paddingX: number;
  paddingY: number;
  lineWidth: number;
  shadowBlur: number;
  fontSize: number;
  fontColor: string;
  fontBackground: string;
  fontFamily: string;
  shapeBackground: string;
  shapeStrokeStyle: string;
  shapeShadowStyle: string;
  transformerBackground: string;
  transformerSize: number;
}

export interface IShapeBase {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface IShapeAdjustBase {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export interface IShapeData extends IShapeBase {
  type: string;
}

export interface IRectShapeData extends IShapeData {
  type: "RECT";
}

export interface IShape {
  shapeStyle: IShapeStyle;
  onDragStart: (positionX: number, positionY: number) => void;
  onDrag: (positionX: number, positionY: number) => void;
  checkBoundary: (positionX: number, positionY: number) => boolean;
  paint: (
    canvas2D: CanvasRenderingContext2D,
    calculateTruePosition: (shapeData: IShapeBase) => IShapeBase,
    selected: boolean
  ) => IShapeBase;
  getAnnotationData: () => IAnnotation;
  adjustMark: (adjustBase: IShapeAdjustBase) => void;
  setComment: (comment: string) => void;
  equal: (data: IAnnotation) => boolean;
}

export class RectShape implements IShape {
  private readonly annotationData: IAnnotation<IShapeData>;

  private readonly onChangeCallBack: () => void;

  private dragStartOffset: { offsetX: number; offsetY: number };

  public readonly shapeStyle: IShapeStyle;

  constructor(
    data: IAnnotation<IShapeData>,
    onChange: () => void,
    shapeStyle: IShapeStyle = defaultShapeStyle
  ) {
    this.annotationData = data;
    this.onChangeCallBack = onChange;
    this.shapeStyle = shapeStyle;
  }

  public onDragStart = (positionX: number, positionY: number) => {
    if (this.annotationData.editable) {
      const { x, y } = this.annotationData.mark;
      this.dragStartOffset = {
        offsetX: positionX - x,
        offsetY: positionY - y,
      };
    }
  };

  public onDrag = (positionX: number, positionY: number) => {
    if (this.annotationData.editable) {
      this.annotationData.mark.x = positionX - this.dragStartOffset.offsetX;
      this.annotationData.mark.y = positionY - this.dragStartOffset.offsetY;
      this.onChangeCallBack();
    }
  };

  public checkBoundary = (positionX: number, positionY: number) => {
    const {
      mark: { x, y, width, height },
    } = this.annotationData;

    return (
      ((positionX > x && positionX < x + width) ||
        (positionX < x && positionX > x + width)) &&
      ((positionY > y && positionY < y + height) ||
        (positionY < y && positionY > y + height))
    );
  };

  public paint = (
    canvas2D: CanvasRenderingContext2D,
    calculateTruePosition: (shapeData: IShapeBase) => IShapeBase,
    selectedAnnotation: boolean
  ) => {
    const { x, y, width, height } = calculateTruePosition(
      this.annotationData.mark
    );
    canvas2D.save();
    const {
      paddingX,
      paddingY,
      lineWidth,
      shadowBlur,
      fontSize,
      fontFamily,
      shapeBackground,
      shapeShadowStyle,
    } = this.shapeStyle;

    canvas2D.shadowBlur = shadowBlur;
    canvas2D.shadowColor = shapeShadowStyle;

    const { selected, isRejected, editable, comment } = this.annotationData;

    let strokeColor: string;
    let isSolid = false;

    if (editable) {
      strokeColor = "orange";
      if (comment) {
        isSolid = true;
      }
    } else if (selected) {
      strokeColor = "#28a745"; // Success green
      isSolid = true;
    } else if (isRejected) {
      strokeColor = "#dc3545"; // Danger red
      isSolid = true;
    } else {
      strokeColor = "yellow";
      isSolid = false;
    }

    let currentLineWidth = lineWidth;
    if (isSolid) {
      currentLineWidth = 3;
      canvas2D.setLineDash([]);
    } else {
      canvas2D.setLineDash([5, 5]);
    }

    canvas2D.strokeStyle = strokeColor;
    canvas2D.lineWidth = currentLineWidth;
    canvas2D.strokeRect(x, y, width, height);
    canvas2D.setLineDash([]); // Reset dash for subsequent drawing (like shadows/labels)
    canvas2D.restore();
    if (selectedAnnotation) {
      canvas2D.fillStyle = shapeBackground;
      canvas2D.fillRect(x, y, width, height);
    } else {
      if (comment) {
        canvas2D.font = `bold ${fontSize}px ${fontFamily}`;
        const metrics = canvas2D.measureText(comment);
        canvas2D.save();

        let labelBgColor = "yellow";
        const labelTextColor = "black";

        if (editable) {
          labelBgColor = "orange";
        } else if (selected) {
          labelBgColor = "#28a745"; // Success green
        } else if (isRejected) {
          labelBgColor = "#dc3545"; // Danger red
        }

        canvas2D.fillStyle = labelBgColor;

        // Draw rounded rectangle background
        const rectX = x;
        const rectY = y;
        const rectW = metrics.width + paddingX * 2;
        const rectH = fontSize + paddingY * 2;
        const radius = 5;

        canvas2D.beginPath();
        canvas2D.moveTo(rectX + radius, rectY);
        canvas2D.lineTo(rectX + rectW - radius, rectY);
        canvas2D.quadraticCurveTo(rectX + rectW, rectY, rectX + rectW, rectY + radius);
        canvas2D.lineTo(rectX + rectW, rectY + rectH - radius);
        canvas2D.quadraticCurveTo(rectX + rectW, rectY + rectH, rectX + rectW - radius, rectY + rectH);
        canvas2D.lineTo(rectX + radius, rectY + rectH);
        canvas2D.quadraticCurveTo(rectX, rectY + rectH, rectX, rectY + rectH - radius);
        canvas2D.lineTo(rectX, rectY + radius);
        canvas2D.quadraticCurveTo(rectX, rectY, rectX + radius, rectY);
        canvas2D.closePath();
        canvas2D.fill();

        canvas2D.textBaseline = "middle";
        canvas2D.fillStyle = labelTextColor;

        canvas2D.fillText(comment, x + paddingX, y + rectH / 2);
      }
    }
    canvas2D.restore();

    return { x, y, width, height };
  };

  public adjustMark = ({
    x = this.annotationData.mark.x,
    y = this.annotationData.mark.y,
    width = this.annotationData.mark.width,
    height = this.annotationData.mark.height,
  }: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  }) => {
    if (this.annotationData.editable) {
      this.annotationData.mark.x = x;
      this.annotationData.mark.y = y;
      this.annotationData.mark.width = width;
      this.annotationData.mark.height = height;
      this.onChangeCallBack();
    }
  };

  public getAnnotationData = () => {
    return this.annotationData;
  };

  public setComment = (comment: string) => {
    this.annotationData.comment = comment;
  };

  public equal = (data: IAnnotation) => {
    return (
      data.id === this.annotationData.id &&
      data.comment === this.annotationData.comment &&
      data.mark.x === this.annotationData.mark.x &&
      data.mark.y === this.annotationData.mark.y &&
      data.mark.width === this.annotationData.mark.width &&
      data.mark.height === this.annotationData.mark.height
    );
  };
}
