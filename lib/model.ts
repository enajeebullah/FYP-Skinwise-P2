import type { SkinClass } from "./constants";

export interface PredictionResult {
  scores: Record<SkinClass, number>;
  topClass: SkinClass;
  topConfidence: number;
}

/**
 * Gap between the top-2 predicted classes. A small margin means the
 * model is effectively torn between two classes rather than confidently
 * picking one — often a sign the photo isn't a clear, real human-skin
 * close-up (verified on a test case: a monkey photo scored top=61.9%
 * with a ~1-point margin between Normal/Oily, vs a typical clear human
 * photo having a much larger gap). See SKIN_LOW_MARGIN_THRESHOLD.
 */
export function getConfidenceMargin(scores: Record<SkinClass, number>): number {
  const sorted = Object.values(scores).sort((a, b) => b - a);
  return (sorted[0] ?? 0) - (sorted[1] ?? 0);
}
