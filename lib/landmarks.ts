import type { AcneBox } from "./acneModel";
import { EMPTY_CONFIRMED_COUNTS, type ConfirmedCounts } from "./reviewCounts";

export interface Point {
  x: number;
  y: number;
}

const NUM_LANDMARKS = 68;
const NOSE_BRIDGE = [27, 28, 29, 30];

function avgX(points: Point[], indices: number[]): number {
  return indices.reduce((sum, index) => sum + points[index].x, 0) / indices.length;
}

export function getFaceMidlineX(points: Point[]): number {
  return avgX(points, NOSE_BRIDGE);
}

export function suggestConfirmedCountsFromLandmarks(
  boxes: AcneBox[],
  landmarks: Point[] | null
): ConfirmedCounts {
  const counts: ConfirmedCounts = { ...EMPTY_CONFIRMED_COUNTS };
  if (!landmarks || landmarks.length !== NUM_LANDMARKS) {
    for (const box of boxes) {
      if (box.className === "comedone") counts.comedones++;
      else if (box.className === "nodules") counts.nodules++;
    }
    return counts;
  }

  const midlineX = getFaceMidlineX(landmarks);
  for (const box of boxes) {
    const isLeft = (box.x1 + box.x2) / 2 <= midlineX;
    if (box.className === "comedone") counts.comedones++;
    else if (box.className === "nodules") counts.nodules++;
    else if (box.className === "papules") {
      if (isLeft) counts.leftPapules++;
      else counts.rightPapules++;
    } else if (box.className === "pustules") {
      if (isLeft) counts.leftPustules++;
      else counts.rightPustules++;
    }
  }
  return counts;
}
