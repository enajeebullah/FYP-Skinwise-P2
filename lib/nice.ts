/**
 * NICE NG198 clinical escalation category — "Acne vulgaris: management",
 * National Institute for Health and Care Excellence, 2021.
 *
 * VERIFIED against the guideline committee's own published wording:
 *   Mild-to-moderate: any number of comedones; UP TO 34 inflammatory
 *     lesions (papules + pustules + nodules, with or without comedones);
 *     OR up to 2 nodules.
 *   Moderate-to-severe: 35 OR MORE inflammatory lesions; OR 3 OR MORE
 *     nodules.
 *
 * This is an independent clinical escalation/treatment-category signal.
 * It answers a different question from the lesion-count signal in
 * lib/hayashi.ts and is used as a floor when computing Overall Severity:
 * it can raise severity to Severe, but never lower it.
 *
 * Do NOT change these numbers (34/35, 2/3) — they are the literal
 * published thresholds, not tunable parameters.
 */

export type NiceCategory = "mild_to_moderate" | "moderate_to_severe";

export interface NiceResult {
  inflammatoryCount: number; // papules + pustules + nodules, whole face
  noduleCount: number;
  niceCategory: NiceCategory;
}

/**
 * `papules`/`pustules`/`nodules` should be the user-CONFIRMED whole-face
 * counts (see ConfirmedCounts in lib/reviewCounts.ts), not raw YOLO
 * output.
 */
export function computeNiceCategory(papules: number, pustules: number, nodules: number): NiceResult {
  const inflammatoryCount = papules + pustules + nodules;
  const niceCategory: NiceCategory =
    inflammatoryCount >= 35 || nodules >= 3 ? "moderate_to_severe" : "mild_to_moderate";
  return { inflammatoryCount, noduleCount: nodules, niceCategory };
}
