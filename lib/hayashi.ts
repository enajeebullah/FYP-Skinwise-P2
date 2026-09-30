/**
 * Hayashi acne severity grading — Hayashi N, Akamatsu H, Kawashima M;
 * Acne Study Group. "Establishment of grading criteria for acne
 * severity." J Dermatol. 2008;35:255–260.
 *
 * VERIFIED against the original paper's own finding: dermatologists'
 * global severity impressions correlated with the number of papules +
 * pustules on HALF of the face, but did NOT correlate with comedone
 * counts. The published thresholds (per half-face):
 *   0–5   → Mild
 *   6–20  → Moderate
 *   21–50 → Severe
 *   >50   → Severe (mapped to the app's top tier)
 *
 * This internal lesion-count signal is combined with the escalation
 * signal in lib/overallSeverity.ts. Only the app's four supported overall
 * labels are returned from this calculation.
 *
 * Nodules and comedones are NEVER added to this count — this matches the
 * published criterion exactly, not a SkinWISE simplification.
 */

export type HayashiSeverity = "clear" | "mild" | "moderate" | "severe";

export interface HayashiResult {
  leftCount: number;
  rightCount: number;
  /** The worse of the two halves — this is what determines the category. */
  hayashiCount: number;
  hayashiSeverity: HayashiSeverity;
}

export function severityForHalfFaceCount(count: number): HayashiSeverity {
  if (count === 0) return "clear";
  if (count <= 5) return "mild";
  if (count <= 20) return "moderate";
  return "severe";
}

/**
 * `leftPapules`/`leftPustules`/`rightPapules`/`rightPustules` should come
 * from the user-CONFIRMED lesion review (see LesionReviewCard.tsx / the
 * `ConfirmedCounts` type in lib/reviewCounts.ts) — never fed straight from
 * raw YOLO output, per the project's own established "never silently
 * trust automatic detection" principle.
 */
export function computeHayashiSeverity(
  leftPapules: number,
  leftPustules: number,
  rightPapules: number,
  rightPustules: number
): HayashiResult {
  const leftCount = leftPapules + leftPustules;
  const rightCount = rightPapules + rightPustules;
  const hayashiCount = Math.max(leftCount, rightCount);
  return {
    leftCount,
    rightCount,
    hayashiCount,
    hayashiSeverity: severityForHalfFaceCount(hayashiCount),
  };
}
