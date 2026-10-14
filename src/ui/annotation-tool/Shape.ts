import { IAnnotation } from "./Annotation";

/**
 * "obstructions" is the annotator's Obstructions step (4 Oct 2026): Not an
 * object boxes are hidden, marked objects are red and the rest grey.
 * "default" is every other view, contributors and the Objects step included.
 */
export type PaintVariant = "default" | "obstructions";


export const defaultShapeStyle: IShapeStyle = {
  paddingX: 12,
  paddingY: 4,
  lineWidth: 2,
  shadowBlur: 10,
  fontSize: 12,
  fontColor: "#212529",
  fontBackground: "#f8f9fa",
  fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen-Sans, Ubuntu, Cantarell, 'Helvetica Neue', Helvetica, Arial, sans-serif",
  shapeBackground: "hsla(210, 16%, 93%, 0.2)",
  shapeStrokeStyle: "#d97706",
  shapeShadowStyle: "hsla(210, 9%, 31%, 0.35)",
  transformerBackground: "#111827",
  transformerSize: 10,
};

/**
 * The style of a box drawn by the contributor or annotator. Shared by a box
 * dragged out with the mouse (DefaultAnnotationState) and one placed with Add
 * box on touch (9 Oct 2026), so the two look the same.
 */
export const drawnBoxStyle: IShapeStyle = {
  ...defaultShapeStyle,
  shapeStrokeStyle: "#16a34a",
};

/**
 * A box's outline colour in the default view, which encodes its status:
 * blue drawn by the user, green confirmed, amber rejected or undecided. The
 * touch corner handles are ringed in the same colour.
 */
export function boxStrokeColor({ selected, isRejected, editable }: { selected?: boolean; isRejected?: boolean; editable?: boolean }) {
  if (editable) return "#004aad"; // blue — user-drawn box
  if (selected) return "#16a34a"; // green — confirmed
  if (isRejected) return "#d97706"; // warning — rejected
  return "#d97706";
}

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
  /** Where the Obstructions view last drew the label, in stage px; null when it drew none. */
  labelRect: IShapeBase | null;
  onDragStart: (positionX: number, positionY: number) => void;
  onDrag: (positionX: number, positionY: number) => void;
  checkBoundary: (positionX: number, positionY: number) => boolean;
  paint: (
    canvas2D: CanvasRenderingContext2D,
    calculateTruePosition: (shapeData: IShapeBase) => IShapeBase,
    selected: boolean,
    displayLabel?: string,
    variant?: PaintVariant
  ) => IShapeBase;
  getAnnotationData: () => IAnnotation;
  adjustMark: (adjustBase: IShapeAdjustBase) => void;
  setComment: (comment: string) => void;
  equal: (data: IAnnotation) => boolean;
}

/**
 * A rectangle drawn on the canvas, wrapping the annotation data behind it.
 *
 * Holds a direct reference to that data and edits it in place, so dragging a
 * box updates the original object rather than a copy. That lets the component
 * read current positions straight off the shapes array with no syncing step.
 *
 * Rejected boxes are frozen — dragging and resizing both do nothing once
 * `isRejected` is set. Rejecting a suggestion is a judgement about the box as
 * the model drew it, so moving it afterwards would make that judgement
 * meaningless.
 */
export class RectShape implements IShape {
  private readonly annotationData: IAnnotation<IShapeData>;

  private readonly onChangeCallBack: () => void;

  private dragStartOffset: { offsetX: number; offsetY: number };

  public readonly shapeStyle: IShapeStyle;

  /** Where the Obstructions view last drew this box's label, in stage px; null when it drew none. */
  public labelRect: IShapeBase | null = null;

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
    if (!this.annotationData.isRejected) {
      const { x, y } = this.annotationData.mark;
      this.dragStartOffset = {
        offsetX: positionX - x,
        offsetY: positionY - y,
      };
    }
  };

  public onDrag = (positionX: number, positionY: number) => {
    if (!this.annotationData.isRejected) {
      if (!this.dragStartOffset) {
        this.onDragStart(positionX, positionY);
      }
      this.annotationData.mark.x = positionX - this.dragStartOffset.offsetX;
      this.annotationData.mark.y = positionY - this.dragStartOffset.offsetY;
      this.onChangeCallBack();
    }
  };

  /**
   * Is this point inside the box?
   *
   * Each axis is compared both ways round because width and height can be
   * negative — drawing up and to the left produces that, and the values are
   * never normalised. Checking both orderings means the box registers hits
   * whichever direction it was drawn in.
   */
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

  /**
   * Draws the box and its label, and returns the on-screen rect so the caller
   * can position the popup input beneath it.
   *
   * Colour and line style encode the box's status at a glance, which is the
   * whole visual language of the tool:
   *
   *   yellow dashed  a suggestion nobody has ruled on yet — the only state the
   *                  form refuses to submit on
   *   green solid    confirmed as an obstruction
   *   yellow solid   rejected; kept visible so it's clear it was considered
   *   blue           drawn by the user (dashed until they pick a label)
   *
   * In the "obstructions" variant (the annotator's Obstructions step) the boxes
   * are locked and only the obstruction answer is shown:
   *
   *   red solid      marked as obstructing
   *   grey solid     not marked
   *   (hidden)       Not an object; still returns its position for callers
   *
   * `selectedAnnotation` means "currently clicked", which is different from the
   * annotation's own `selected` flag — that one is the user's verdict. When a
   * box is clicked its label is suppressed in favour of a fill, because the
   * popup input is about to cover that spot anyway.
   */
  public paint = (
    canvas2D: CanvasRenderingContext2D,
    calculateTruePosition: (shapeData: IShapeBase) => IShapeBase,
    selectedAnnotation: boolean,
    displayLabel?: string,
    variant: PaintVariant = "default"
  ) => {
    const { x, y, width, height } = calculateTruePosition(
      this.annotationData.mark
    );
    this.labelRect = null;
    if (variant === "obstructions") {
      if (this.annotationData.comment !== "not_an_object") {
        this.paintObstructionAnswer(canvas2D, { x, y, width, height }, displayLabel);
      }
      return { x, y, width, height };
    }
    // Paired with the restore() at the end. Shadow, dash, and fill settings are
    // all changed below and every shape paints onto the same shared context, so
    // leaving any of them set would bleed into the next box drawn.
    canvas2D.save();
    const {
      lineWidth,
      shadowBlur,
      shapeBackground,
      shapeShadowStyle,
    } = this.shapeStyle;

    canvas2D.shadowBlur = shadowBlur;
    canvas2D.shadowColor = shapeShadowStyle;

    const { selected, isRejected, editable, comment } = this.annotationData;

    const strokeColor = boxStrokeColor(this.annotationData);
    let isSolid = false;

    if (editable) {
      if (comment) {
        isSolid = true;
      }
    } else if (selected) {
      isSolid = true;
    } else if (isRejected) {
      isSolid = true;
    } else {
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

    if (selectedAnnotation) {
      canvas2D.fillStyle = shapeBackground;
      canvas2D.fillRect(x, y, width, height);
    } else {
      if (comment) {
        const labelText = displayLabel ?? comment.split('_').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

        let labelBgColor = "#d97706";
        let labelTextColor = "#111827";

        if (editable) {
          labelBgColor = "#004aad"; // blue — user-drawn
          labelTextColor = "white";
        } else if (selected) {
          labelBgColor = "#16a34a"; // green — confirmed
          labelTextColor = "white";
        } else if (isRejected) {
          labelBgColor = "#d97706"; // warning
          labelTextColor = "#111827";
        }

        this.paintLabel(canvas2D, x, y, labelText, labelBgColor, labelTextColor);
      }
    }
    canvas2D.restore();

    return { x, y, width, height };
  };

  /** One box in the Obstructions step: red when marked, grey otherwise. No dash, box fill or transformer. */
  private paintObstructionAnswer = (
    canvas2D: CanvasRenderingContext2D,
    { x, y, width, height }: IShapeBase,
    displayLabel?: string
  ) => {
    const marked = this.annotationData.obstructs === true;
    canvas2D.save();
    canvas2D.setLineDash([]);
    canvas2D.strokeStyle = marked ? "#dc2626" : "#6b7280";
    canvas2D.lineWidth = marked ? 3 : 2;
    canvas2D.strokeRect(x, y, width, height);

    const { comment } = this.annotationData;
    if (comment) {
      const labelText = displayLabel ?? comment.split('_').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      // Kept so a click on the label marks this box (pickJudgeLabel)
      this.labelRect = this.paintLabel(
        canvas2D,
        x,
        y,
        labelText,
        marked ? "#dc2626" : "#e5e7eb",
        marked ? "white" : "#111827"
      );
    }
    canvas2D.restore();
  };

  /**
   * A box's label: the text on a rounded rectangle at the box's top-left
   * corner. Shared by the default view and the Obstructions view so labels look
   * the same in both.
   */
  private paintLabel = (
    canvas2D: CanvasRenderingContext2D,
    x: number,
    y: number,
    labelText: string,
    background: string,
    textColor: string
  ) => {
    const { paddingX, paddingY, fontSize, fontFamily } = this.shapeStyle;
    canvas2D.font = `bold ${fontSize}px ${fontFamily}`;
    const rectW = canvas2D.measureText(labelText).width + paddingX * 2;
    const rectH = fontSize + paddingY * 2;
    const radius = 5;

    canvas2D.fillStyle = background;
    canvas2D.beginPath();
    canvas2D.moveTo(x + radius, y);
    canvas2D.lineTo(x + rectW - radius, y);
    canvas2D.quadraticCurveTo(x + rectW, y, x + rectW, y + radius);
    canvas2D.lineTo(x + rectW, y + rectH - radius);
    canvas2D.quadraticCurveTo(x + rectW, y + rectH, x + rectW - radius, y + rectH);
    canvas2D.lineTo(x + radius, y + rectH);
    canvas2D.quadraticCurveTo(x, y + rectH, x, y + rectH - radius);
    canvas2D.lineTo(x, y + radius);
    canvas2D.quadraticCurveTo(x, y, x + radius, y);
    canvas2D.closePath();
    canvas2D.fill();

    canvas2D.textBaseline = "middle";
    canvas2D.fillStyle = textColor;
    canvas2D.fillText(labelText, x + paddingX, y + rectH / 2);
    return { x, y, width: rectW, height: rectH };
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
    if (!this.annotationData.isRejected) {
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

  /**
   * Cheap identity-and-geometry check used by syncAnnotationData to decide
   * whether incoming props still describe the shapes it already has.
   *
   * Compares position and label only — the verdict flags are deliberately left
   * out, since those change constantly through user interaction and shouldn't
   * trigger a full rebuild of the shapes array.
   */
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
