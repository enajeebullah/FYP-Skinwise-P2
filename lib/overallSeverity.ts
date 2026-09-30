/**
 * Overall Severity — the single Mild/Moderate/Severe value that actually
 * drives routine-engine decisions (lib/routineEngine.ts). Combines THREE
 * signals, each doing a distinct job (see README.md for the full
 * rationale) so that no single signal can silently dominate the others:
 *
 *   1. Hayashi severity (lib/hayashi.ts) — lesion-count burden, from the
 *      worse half-face papule+pustule count. Published (Hayashi et al.
 *      2008).
 *   2. Nodule tier — SkinWISE's own graduated scale (1 nodule → Mild,
 *      2 → Moderate, 3+ → Severe). NOT from Hayashi or NICE directly;
 *      an author-defined, disclosed extension, chosen so a single nodule
 *      doesn't drown out a genuinely high papule/pustule count (and vice
 *      versa) the way a flat "any nodule = escalate" rule would.
 *   3. NICE NG198 ceiling (lib/nice.ts) — if NICE's own published
 *      thresholds (35+ inflammatory lesions, or 3+ nodules) are met, the
 *      case is forced to at least Severe here, regardless of what 1) and
 *      2) compute — NICE's escalation signal can only ever push the
 *      result UP, never down.
 *
 * Combination rule = max(Hayashi, NoduleTier), then apply the NICE floor.
 * This is a SkinWISE application-design choice — disclosed as such, not
 * presented as a published clinical algorithm in its own right.
 */

import type { HayashiSeverity } from "./hayashi";
import type { NiceCategory } from "./nice";

export type OverallSeverity = "clear" | "mild" | "moderate" | "severe";

const RANK: Record<OverallSeverity, number> = { clear: 0, mild: 1, moderate: 2, severe: 3 };

function hayashiToOverall(h: HayashiSeverity): OverallSeverity {
  if (h === "clear") return "clear";
  if (h === "mild") return "mild";
  if (h === "moderate") return "moderate";
  return "severe";
}

export function noduleTier(noduleCount: number): OverallSeverity {
  if (noduleCount <= 0) return "clear";
  if (noduleCount === 1) return "mild";
  if (noduleCount === 2) return "moderate";
  return "severe"; // 3+
}

/** A short, severity-appropriate caution note — shown ALONGSIDE whatever
 *  ingredient recommendation Overall Severity produces, never in place of
 *  it (except at 3+, where the Severe/professional-evaluation path
 *  already carries its own message and this returns null to avoid
 *  duplicating it). */
export function noduleNote(noduleCount: number): string | null {
  if (noduleCount <= 0) return null;
  if (noduleCount === 1) {
    return "1 nodule was also detected — keep an eye on it alongside the guidance above.";
  }
  if (noduleCount === 2) {
    return "2 nodules were detected — if these don't improve in a few weeks, consider a dermatologist visit, since nodules carry a higher scarring risk than other lesion types.";
  }
  return null; // 3+ already forces Severe / professional-evaluation messaging
}

export interface OverallSeverityResult {
  overallSeverity: OverallSeverity;
  hayashiContribution: OverallSeverity;
  noduleContribution: OverallSeverity;
  niceForcedFloor: boolean; // true if NICE's ceiling is what decided the result
  note: string | null;
}

export function computeOverallSeverity(
  hayashiSeverity: HayashiSeverity,
  noduleCount: number,
  niceCategory: NiceCategory,
  hasAnyLesion: boolean = false
): OverallSeverityResult {
  const hayashiContribution = hayashiToOverall(hayashiSeverity);
  const noduleContribution = noduleTier(noduleCount);

  let overallSeverity: OverallSeverity =
    RANK[hayashiContribution] >= RANK[noduleContribution] ? hayashiContribution : noduleContribution;

  // Any confirmed lesion at all (including comedones, which Hayashi
  // deliberately ignores) means the case is at least Mild — "Clear" is
  // reserved for a photo with genuinely nothing confirmed. This is a
  // labelling rule only; comedones still never raise severity above Mild.
  if (overallSeverity === "clear" && hasAnyLesion) {
    overallSeverity = "mild";
  }

  let niceForcedFloor = false;
  if (niceCategory === "moderate_to_severe" && RANK[overallSeverity] < RANK.severe) {
    overallSeverity = "severe";
    niceForcedFloor = true;
  }

  return {
    overallSeverity,
    hayashiContribution,
    noduleContribution,
    niceForcedFloor,
    note: noduleNote(noduleCount),
  };
}

export const OVERALL_SEVERITY_META: Record<OverallSeverity, { label: string; hex: string }> = {
  clear: { label: "Clear", hex: "#6F9A6A" },
  mild: { label: "Mild", hex: "#D9A441" },
  moderate: { label: "Moderate", hex: "#E07A5F" },
  severe: { label: "Severe", hex: "#B23A48" },
};
