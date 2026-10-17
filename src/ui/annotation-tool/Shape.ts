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

/**
 * Whether a box's outline is solid in the default view: a drawn box once it
 * has a category, a suggestion once it is answered. Dashed otherwise. Shared
 * with the landing page's preview of the task, so the two cannot drift.
 */
export function boxIsSolid({ selected, isRejected, editable, comment }: { selected?: boolean; isRejected?: boolean; editable?: boolean; comment?: string }) {
  if (editable) return Boolean(comment);
  return Boolean(selected || isRejected);
}

/**
 * A box's outline in the default view: 3 px and solid once decided (see
 * boxIsSolid), the style's line width and dashed 5 on 5 before. Shared with
 * the landing page's preview.
 */
export function boxLineStyle(data: { selected?: boolean; isRejected?: boolean; editable?: boolean; comment?: string }, lineWidth = defaultShapeStyle.lineWidth) {
  return boxIsSolid(data) ? { width: 3, dash: [] as number[] } : { width: lineWidth, dash: [5, 5] };
}

/** A box's label colours in the default view: its status colour, as boxStrokeColor. */
export function boxLabelColors({ selected, editable }: { selected?: boolean; isRejected?: boolean; editable?: boolean }) {
  if (editable) return { background: "#004aad", text: "white" }; // blue — user-drawn
  if (selected) return { background: "#16a34a", text: "white" }; // green — confirmed
  return { background: "#d97706", text: "#111827" }; // amber — rejected or undecided
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

/**
 * Where a box's name goes on the photo, given the names already placed (17 Oct
 * 2026, apple-design check). The first free spot of three:
 *   1. its box's top-left corner, where names have always been,
 *   2. just above its box, left edges aligned, when the corner is taken by an
 *      earlier name (boxes side by side, a row of parked motorcycles),
 *   3. below the earlier names it would cover, left edge on its box.
 * A spot above the top of the canvas is not used. If none is free (only when
 * names pile up past every check) it stays at the corner. The caller places
 * names in the lists' order, so a name never moves when another box is
 * clicked.
 */
export function placeLabel(
  box: IShapeBase,
  size: { width: number; height: number },
  placed: IShapeBase[],
  gap = 2
): IShapeBase {
  const at = (y: number) => ({ x: box.x, y, width: size.width, height: size.height });
  const overlaps = (a: IShapeBase, b: IShapeBase) =>
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  const free = (rect: IShapeBase) => rect.y >= 0 && !placed.some((p) => overlaps(rect, p));
  const corner = at(box.y);
  if (free(corner)) return corner;
  const above = at(box.y - size.height - gap);
  if (free(above)) return above;
  let rect = corner;
  for (let i = 0; i <= placed.length; i++) {
    const hit = placed.find((p) => overlaps(rect, p));
    if (!hit) return rect;
    rect = at(hit.y + hit.height + gap);
  }
  return corner;
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
    variant?: PaintVariant,
    labelAt?: { x: number; y: number }
  ) => IShapeBase;
  labelText: (displayLabel?: string) => string | null;
  measureLabel: (canvas2D: CanvasRenderingContext2D, labelText: string) => { width: number; height: number };
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
    variant: PaintVariant = "default",
    labelAt?: { x: number; y: number }
  ) => {
    const { x, y, width, height } = calculateTruePosition(
      this.annotationData.mark
    );
    this.labelRect = null;
    if (variant === "obstructions") {
      if (this.annotationData.comment !== "not_an_object") {
        this.paintObstructionAnswer(canvas2D, { x, y, width, height }, displayLabel, labelAt);
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

    const { comment } = this.annotationData;

    const strokeColor = boxStrokeColor(this.annotationData);
    const line = boxLineStyle(this.annotationData, lineWidth);
    canvas2D.setLineDash(line.dash);

    canvas2D.strokeStyle = strokeColor;
    canvas2D.lineWidth = line.width;
    canvas2D.strokeRect(x, y, width, height);
    canvas2D.setLineDash([]); // Reset dash for subsequent drawing (like shadows/labels)

    if (selectedAnnotation) {
      canvas2D.fillStyle = shapeBackground;
      canvas2D.fillRect(x, y, width, height);
    } else {
      if (comment) {
        const labelText = displayLabel ?? comment.split('_').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

        const label = boxLabelColors(this.annotationData);
        this.paintLabel(canvas2D, labelAt?.x ?? x, labelAt?.y ?? y, labelText, label.background, label.text);
      }
    }
    canvas2D.restore();

    return { x, y, width, height };
  };

  /** One box in the Obstructions step: red when marked, grey otherwise. No dash, box fill or transformer. */
  private paintObstructionAnswer = (
    canvas2D: CanvasRenderingContext2D,
    { x, y, width, height }: IShapeBase,
    displayLabel?: string,
    labelAt?: { x: number; y: number }
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
        labelAt?.x ?? x,
        labelAt?.y ?? y,
        labelText,
        marked ? "#dc2626" : "#e5e7eb",
        marked ? "white" : "#111827"
      );
    }
    canvas2D.restore();
  };

  /** The name painted on this box, or null when it has none */
  public labelText = (displayLabel?: string) => {
    const { comment } = this.annotationData;
    if (!comment) return null;
    return displayLabel ?? comment.split('_').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  };

  /** The size paintLabel draws a name at, so names can be placed before painting */
  public measureLabel = (canvas2D: CanvasRenderingContext2D, labelText: string) => {
    const { paddingX, paddingY, fontSize, fontFamily } = this.shapeStyle;
    canvas2D.save();
    canvas2D.font = `bold ${fontSize}px ${fontFamily}`;
    const width = canvas2D.measureText(labelText).width + paddingX * 2;
    canvas2D.restore();
    return { width, height: fontSize + paddingY * 2 };
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
