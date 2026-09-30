/**
 * Dominant acne-lesion pattern — determines which acne-care INGREDIENT
 * INFORMATION is relevant (e.g. salicylic acid for comedonal acne vs.
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
 * IMPORTANT: nodules do NOT affect pattern classification here — a case
 * with 25 papules/pustules and 1 nodule is still "inflammatory_dominant",
 * not overridden into a separate "nodule" pattern. An earlier version of
 * this logic let any nodule override the pattern entirely, which meant a
 * genuinely large inflammatory burden lost its evidence-based ingredient
 * guidance just because one nodule was also present. Nodules now
 * influence the recommendation ONLY through lib/overallSeverity.ts's
 * nodule-tier and the accompanying noduleNote — a distinct signal that
 * combines with (rather than silently overrides) the pattern below.
 */
export function determineAcnePattern(
  comedones: number,
  papules: number,
  pustules: number,
  nodules: number
): AcnePatternResult {
  const inflammatory = papules + pustules;
  const total = comedones + inflammatory;

  if (total === 0 && nodules === 0) {
    return { pattern: "clear", reason: "No lesions detected." };
  }
  if (total === 0 && nodules > 0) {
    // Nodules only, nothing else to classify a comedonal/inflammatory
    // pattern from — treated as "clear" for INGREDIENT-PATTERN purposes;
    // the nodule itself is still fully accounted for via overallSeverity.
    return { pattern: "clear", reason: "No comedones or inflammatory lesions detected (aside from nodules, handled separately)." };
  }

  // Simple majority comparison — no invented numeric threshold, since
  // "dominant" here just means "the larger of the two non-nodule
  // categories", disclosed plainly rather than dressed up as a cutoff.
  if (comedones > 0 && inflammatory === 0) {
    return {
      pattern: "comedonal_dominant",
      reason: `${comedones} comedone${comedones === 1 ? "" : "s"} detected, with no papules or pustules — comedonal (clogged-pore) acne is the dominant pattern.`,
    };
  }
  if (inflammatory > 0 && comedones === 0) {
    return {
      pattern: "inflammatory_dominant",
      reason: `${inflammatory} papule${inflammatory === 1 ? "" : "s"}/pustule${inflammatory === 1 ? "" : "s"} detected, with no comedones — inflammatory acne is the dominant pattern.`,
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
