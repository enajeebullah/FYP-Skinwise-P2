"use client";

/**
 * The user-CONFIRMED lesion counts — the ONLY input to Hayashi/NICE/
 * pattern scoring (see lib/hayashi.ts, lib/nice.ts, lib/acnePattern.ts).
 * Raw YOLO11m output is NEVER fed directly into scoring: it pre-fills
 * this structure as a starting suggestion, shown alongside the annotated
 * photo in LesionReviewCard.tsx, and the user reviews/edits every field
 * before a "reviewed" checkbox unlocks saving — the same
 * never-silently-trust-automatic-detection principle this project has
 * applied consistently (skin-type quiz, old GAGS calculator, landmark
 * pre-fill).
 *
 * Papules/pustules are split left/right because Hayashi's grading
 * criterion is specifically a HALF-FACE count (see lib/hayashi.ts).
 * Comedones and nodules are whole-face only — Hayashi excludes comedones
 * entirely, and NICE's nodule rule is whole-face, not per-half.
 */
export interface ConfirmedCounts {
  comedones: number;
  leftPapules: number;
  rightPapules: number;
  leftPustules: number;
  rightPustules: number;
  nodules: number;
}

export const EMPTY_CONFIRMED_COUNTS: ConfirmedCounts = {
  comedones: 0,
  leftPapules: 0,
  rightPapules: 0,
  leftPustules: 0,
  rightPustules: 0,
  nodules: 0,
};

export function totalPapules(c: ConfirmedCounts): number {
  return c.leftPapules + c.rightPapules;
}
export function totalPustules(c: ConfirmedCounts): number {
  return c.leftPustules + c.rightPustules;
}
export function totalLesions(c: ConfirmedCounts): number {
  return c.comedones + totalPapules(c) + totalPustules(c) + c.nodules;
}
