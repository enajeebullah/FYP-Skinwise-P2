import type { Routine } from "./routineEngine";

export function isRoutine(value: unknown): value is Routine {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  const reasons = candidate.reasons;

  return (
    typeof candidate.cleanser === "string" &&
    typeof candidate.moisturizer === "string" &&
    typeof candidate.sunscreen === "string" &&
    Array.isArray(candidate.acneCare) &&
    candidate.acneCare.every(
      (item: unknown) =>
        !!item &&
        typeof item === "object" &&
        typeof (item as Record<string, unknown>).ingredient === "string" &&
        typeof (item as Record<string, unknown>).reason === "string" &&
        ((item as Record<string, unknown>).usageTip === undefined ||
          typeof (item as Record<string, unknown>).usageTip === "string") &&
        // timeOfDay is intentionally NOT required — older saved scans
        // (from before this field existed) won't have it, and we don't
        // want to invalidate their whole routine just for a missing
        // display-ordering hint. See RoutinePage's acne-care split logic
        // for how a missing value is handled at display time instead of
        // at validation time (it falls back to the Evening column).
        ((item as Record<string, unknown>).timeOfDay === undefined ||
          (item as Record<string, unknown>).timeOfDay === "AM" ||
          (item as Record<string, unknown>).timeOfDay === "PM")
    ) &&
    !!reasons &&
    typeof reasons === "object" &&
    typeof (reasons as Record<string, unknown>).cleanser === "string" &&
    typeof (reasons as Record<string, unknown>).moisturizer === "string" &&
    typeof (reasons as Record<string, unknown>).sunscreen === "string" &&
    Array.isArray(candidate.explanations) &&
    candidate.explanations.every((item: unknown) => typeof item === "string") &&
    typeof candidate.recommendationPaused === "boolean" &&
    Array.isArray(candidate.pausedReasons) &&
    candidate.pausedReasons.every((item: unknown) => typeof item === "string") &&
    typeof candidate.professionalEvaluationRecommended === "boolean" &&
    (candidate.professionalEvaluationReason === null ||
      typeof candidate.professionalEvaluationReason === "string") &&
    (candidate.noduleNote === null || typeof candidate.noduleNote === "string")
  );
}