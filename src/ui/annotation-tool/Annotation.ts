import { IShapeData } from "./Shape";

/**
 * The shape of one box drawn on an image.
 *
 * Boxes come from two sources, and `editable` tells them apart:
 *
 *   editable: true   the contributor drew it. Freely movable and deletable.
 *   editable: false  the detection model suggested it. It can't be deleted,
 *                    only judged — whether the model was right is itself
 *                    research data worth keeping.
 *
 * For a suggestion, `selected` and `isRejected` carry that judgement, giving
 * three meaningful states: both false means untouched (drawn as a yellow dashed
 * box, and the form won't submit while any remain), `selected` means it does
 * block the path, `isRejected` means it doesn't.
 *
 * `comment` holds the obstruction label, such as "tree" or "parked_car". It is
 * underscored because it doubles as a machine-readable class; the interface
 * title-cases it for display.
 *
 * `initialState` snapshots the suggestion as the model gave it, before any
 * edits. Comparing against it at submit time is how telemetry distinguishes a
 * suggestion accepted as-is from one the user had to nudge into place — that
 * ratio is a direct read on how good the model actually is.
 */
export interface IAnnotation<T = IShapeData> {
  comment?: string;
  id: string;
  mark: T;
  editable: boolean;
  selected: boolean;
  isRejected?: boolean;
  obstructs?: boolean;
  severity?: 1 | 2 | 3 | 4 | 5 | null;
  initialState?: { comment?: string; mark: T };
}
