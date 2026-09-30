"use client";

import type { ConfirmedCounts } from "@/lib/reviewCounts";
import Tooltip from "./Tooltip";

interface LesionReviewCardProps {
  counts: ConfirmedCounts;
  onChange: (counts: ConfirmedCounts) => void;
  landmarksAvailable: boolean;
  reviewed: boolean;
  onReviewedChange: (reviewed: boolean) => void;
}

function NumberField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="rounded-xl bg-paper border border-line p-3">
      <label htmlFor={id} className="text-sm font-medium text-ink block mb-1.5">
        {label}
      </label>
      <input
        id={id}
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(Math.max(0, parseInt(e.target.value || "0", 10)))}
        className="w-full rounded-lg border border-line bg-panel text-sm px-2.5 py-1.5 text-ink font-mono"
      />
    </div>
  );
}

/**
 * Editable, user-confirmed lesion counts — the ONLY input severity and
 * pattern scoring ever reads (see lib/reviewCounts.ts). YOLO11m's raw
 * detections pre-fill these fields (including the left/right split, when
 * facial landmarks succeeded), but scoring never happens on raw output —
 * only on whatever is currently in this form, and only once the user
 * ticks "reviewed". This mirrors the same never-silently-trust-automatic-
 * detection principle this project has applied throughout (skin-type
 * quiz, the old GAGS calculator's manual regions, landmark pre-fill).
 */
export default function LesionReviewCard({
  counts,
  onChange,
  landmarksAvailable,
  reviewed,
  onReviewedChange,
}: LesionReviewCardProps) {
  function set<K extends keyof ConfirmedCounts>(key: K, value: number) {
    onChange({ ...counts, [key]: value });
  }

  return (
    <div className="rounded-2xl border border-line bg-panel panel-elevated p-6 sm:p-8">
      <div className="flex items-center gap-1.5 mb-1">
        <p className="font-mono text-[11px] uppercase tracking-wider text-muted">
          Confirm lesion counts
        </p>
        <Tooltip text="YOLO11m's detections pre-fill these counts, but scoring only ever uses what's confirmed here — never raw model output directly. Check each count against the annotated photo above and correct anything that looks off." />
      </div>
      <p className="text-xs text-muted mb-5">
        {landmarksAvailable
          ? "Pre-filled from the detected boxes above, split left/right using facial landmarks — check against your photo and correct anything that looks off."
          : "Facial landmarks weren't available to auto-split left/right — comedone and nodule counts are pre-filled, but please enter the left/right papule and pustule split yourself, looking at the annotated photo above."}
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <NumberField
          id="cf-comedones"
          label="Comedones (whole face)"
          value={counts.comedones}
          onChange={(v) => set("comedones", v)}
        />
        <NumberField
          id="cf-nodules"
          label="Nodules (whole face)"
          value={counts.nodules}
          onChange={(v) => set("nodules", v)}
        />
      </div>

      <div className="mt-4 pt-4 border-t border-line border-dashed">
        <p className="text-xs font-medium text-ink mb-2">
          Papules &amp; Pustules — split by face half
          <span className="text-muted font-normal"> (used for severity grading)</span>
        </p>
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            id="cf-left-papules"
            label="Left half — Papules"
            value={counts.leftPapules}
            onChange={(v) => set("leftPapules", v)}
          />
          <NumberField
            id="cf-right-papules"
            label="Right half — Papules"
            value={counts.rightPapules}
            onChange={(v) => set("rightPapules", v)}
          />
          <NumberField
            id="cf-left-pustules"
            label="Left half — Pustules"
            value={counts.leftPustules}
            onChange={(v) => set("leftPustules", v)}
          />
          <NumberField
            id="cf-right-pustules"
            label="Right half — Pustules"
            value={counts.rightPustules}
            onChange={(v) => set("rightPustules", v)}
          />
        </div>
      </div>

      {/* Mandatory review gate — mirrors the checkbox used for landmark
          pre-fill throughout this project. Without it, a pre-filled form
          could be "Confirm & Save"-d without anyone having looked at it,
          which would silently save an unreviewed AI guess as if it were
          a clinician-confirmed count. */}
      <label className="mt-5 flex items-start gap-2 rounded-lg bg-paper border border-line px-3 py-2.5 cursor-pointer">
        <input
          type="checkbox"
          checked={reviewed}
          onChange={(e) => onReviewedChange(e.target.checked)}
          className="mt-0.5"
        />
        <span className="text-xs text-ink">
          I&rsquo;ve checked these counts against my photo above and corrected
          anything that looked wrong.
        </span>
      </label>
    </div>
  );
}
