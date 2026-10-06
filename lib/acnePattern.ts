/**
 * Dominant acne-lesion pattern — determines which acne-care INGREDIENT
 * INFORMATION is relevant (e.g. adapalene for comedonal acne vs.
 * benzoyl peroxide/azelaic acid for inflammatory acne). This is an
 * AUTHOR-DEFINED classification, not from a specific named clinical
 * source — disclosed as such (see README.md). It is deliberately simple
 * (compare totals) rather than an invented numeric cutoff, since no
 * published source specifies one for this exact purpose.
 */

export type AcnePattern = "clear" | "comedonal_dominant" | "inflammatory_dominant" | "mixed";

export interface AcnePatternResult {
  pattern: AcnePattern;
  reason: string;
}

/**
 * All counts should be the user-CONFIRMED whole-face totals (see
 * ConfirmedCounts in lib/reviewCounts.ts).
 *
 * Nodules count toward the INFLAMMATORY side of this comparison — NICE
 * NG198 itself treats nodules as inflammatory lesions (its whole-face
 * inflammatory count = papules + pustules + nodules). A case with only
 * 1 nodule and nothing else is "inflammatory_dominant", not "clear" —
 * "clear" would silently leave it with no ingredient guidance at all
 * (see routineEngine.ts), which doesn't match how NICE treats a single
 * nodule (still within its Mild-to-Moderate category, still gets
 * standard topical guidance).
 *
 * This is DIFFERENT from an earlier, removed design where ANY nodule
 * overrode the whole pattern into a separate "nodule_present" category
 * regardless of a large papule/pustule count — that was a bug (it hid
 * genuine inflammatory-acne guidance behind a single nodule). Here,
 * nodules just add to the inflammatory side of a normal comedonal-vs-
 * inflammatory comparison, nothing more. Nodule-specific severity impact
 * and caution messaging still happen separately, in
 * lib/overallSeverity.ts's nodule-tier and noduleNote.
 */
export function determineAcnePattern(
  comedones: number,
  papules: number,
  pustules: number,
  nodules: number
): AcnePatternResult {
  const inflammatory = papules + pustules + nodules;
  const total = comedones + inflammatory;

  if (total === 0) {
    return { pattern: "clear", reason: "No lesions detected." };
  }

  if (comedones > 0 && inflammatory === 0) {
    return {
      pattern: "comedonal_dominant",
      reason: `${comedones} comedone${comedones === 1 ? "" : "s"} detected, with no papules, pustules, or nodules — comedonal (clogged-pore) acne is the dominant pattern.`,
    };
  }
  if (inflammatory > 0 && comedones === 0) {
    return {
      pattern: "inflammatory_dominant",
      reason: `${inflammatory} inflammatory lesion${inflammatory === 1 ? "" : "s"} detected (papules/pustules/nodules), with no comedones — inflammatory acne is the dominant pattern.`,
    };
  }
  if (comedones >= inflammatory * 2) {
    return {
      pattern: "comedonal_dominant",
      reason: `Comedones (${comedones}) substantially outnumber inflammatory lesions (${inflammatory}) — comedonal acne is the dominant pattern.`,
    };
  }
  if (inflammatory >= comedones * 2) {
    return {
      pattern: "inflammatory_dominant",
      reason: `Inflammatory lesions (${inflammatory}) substantially outnumber comedones (${comedones}) — inflammatory acne is the dominant pattern.`,
    };
  }
  return {
    pattern: "mixed",
    reason: `A mix of comedones (${comedones}) and inflammatory lesions (${inflammatory}) was detected — no single pattern dominates.`,
  };
}

export const ACNE_PATTERN_META: Record<AcnePattern, { label: string }> = {
  clear: { label: "Clear" },
  comedonal_dominant: { label: "Comedonal-dominant" },
  inflammatory_dominant: { label: "Inflammatory-dominant" },
  mixed: { label: "Mixed" },
};