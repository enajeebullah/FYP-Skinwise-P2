import type { AcneClass } from "./constants";

export interface AcneBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  score: number;
  classId: number;
  className: AcneClass;
}

export interface AcneDetectionResult {
  boxes: AcneBox[];
  counts: Record<AcneClass, number>;
  total: number;
}
