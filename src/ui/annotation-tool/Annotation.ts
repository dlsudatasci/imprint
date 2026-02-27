import { IShapeData } from "./Shape";

export interface IAnnotation<T = IShapeData> {
  comment?: string;
  id: string;
  mark: T;
  editable: boolean;
  selected: boolean;
  isRejected?: boolean;
  initialState?: { comment?: string; mark: T };
}
