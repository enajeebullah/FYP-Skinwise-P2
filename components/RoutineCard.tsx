"use client";

import type { Routine } from "@/lib/routineEngine";
import { CLASS_META, type SkinClass } from "@/lib/constants";
import {
  OVERALL_SEVERITY_META,
  type OverallSeverity,
} from "@/lib/overallSeverity";
import { ACNE_PATTERN_META, type AcnePattern } from "@/lib/acnePattern";

function CleanserIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M9 3h6v3.5l2 2V21H7V8.5l2-2V3z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M7 13h10" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function MoisturizerIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3s6 6.8 6 11.2A6 6 0 1 1 6 14.2C6 9.8 12 3 12 3z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SunscreenIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle
        cx="12"
        cy="12"
        r="4.5"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M12 2v2.5M12 19.5V22M22 12h-2.5M4.5 12H2M19 5l-1.8 1.8M6.8 17.2 5 19M19 19l-1.8-1.8M6.8 6.8 5 5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function AcneCareIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect
        x="4"
        y="4"
        width="16"
        height="16"
        rx="4"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M8 12h8M12 8v8"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PausedIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3 2 20h20L12 3z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M12 9v5M12 17h.01"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ReferralIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle
        cx="12"
        cy="8"
        r="3.2"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M5 20c1.2-4 4-6 7-6s5.8 2 7 6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

interface RoutineCardProps {
  id?: string;
  routine: Routine;
  skinType: SkinClass;
  overallSeverity: OverallSeverity;
  acnePattern: AcnePattern;
  hasWeather: boolean;
  reviewed: boolean;
}

export default function RoutineCard({
  id,
  routine,
  skinType,
  overallSeverity,
  acnePattern,
  hasWeather,
  reviewed,
}: RoutineCardProps) {
  const rows = [
    {
      key: "cleanser",
      label: "Cleanser",
      value: routine.cleanser,
      reason: routine.reasons.cleanser,
      Icon: CleanserIcon,
    },
    {
      key: "moisturizer",
      label: "Moisturizer",
      value: routine.moisturizer,
      reason: routine.reasons.moisturizer,
      Icon: MoisturizerIcon,
    },
    {
      key: "sunscreen",
      label: "Sunscreen",
      value: routine.sunscreen,
      reason: routine.reasons.sunscreen,
      Icon: SunscreenIcon,
    },
  ];

  const skinMeta = CLASS_META[skinType];
  const overallMeta = OVERALL_SEVERITY_META[overallSeverity];
  const patternMeta = ACNE_PATTERN_META[acnePattern];

  return (
    <div
      id={id}
      className="routine-panel rounded-2xl border border-line bg-panel panel-elevated p-6 sm:p-8"
    >
      <p className="font-mono text-[11px] uppercase tracking-wider text-muted mb-1">
        Your product recommendations
      </p>

      <p className="text-sm text-ink/60 mb-4">
        What to use, based on your Overall Severity, detected lesion pattern,
        and predicted skin type
        {hasWeather ? ", and local weather" : ""}.
      </p>

      {!reviewed && (
        <p className="text-xs text-ink/70 mb-5 rounded-lg bg-paper border border-line px-3 py-2">
          This routine is based on the lesion counts above, which you
          haven&rsquo;t confirmed yet — tick the review checkbox above for an
          accurate routine.
        </p>
      )}

      <div className="flex flex-wrap gap-2 mb-6">
        <span
          className="text-xs font-semibold rounded-full px-2.5 py-1 border"
          style={{
            backgroundColor: `${overallMeta.hex}1A`,
            color: overallMeta.hex,
            borderColor: `${overallMeta.hex}55`,
          }}
        >
          Overall Severity: {overallMeta.label}
        </span>

        <span
          className="text-xs font-medium rounded-full px-2.5 py-1"
          style={{
            backgroundColor: `${skinMeta.hex}1A`,
            color: skinMeta.hex,
          }}
        >
          {skinMeta.label} skin
        </span>

        <span className="text-xs font-medium rounded-full px-2.5 py-1 bg-line/50 text-ink/70">
          Pattern: {patternMeta.label}
        </span>

        {hasWeather && (
          <span className="text-xs font-medium rounded-full px-2.5 py-1 bg-line/50 text-ink/70">
            Weather-adjusted
          </span>
        )}

        {routine.recommendationPaused && (
          <span className="text-xs font-medium rounded-full px-2.5 py-1 bg-[#D9A441]/15 text-[#8A6216]">
            ⚠ Personalised routine paused
          </span>
        )}
      </div>

      {routine.noduleNote && (
        <div className="flex gap-3 rounded-xl border border-[#D9A441]/40 bg-[#D9A441]/[0.06] p-4 mb-5">
          <div className="h-9 w-9 shrink-0 rounded-full bg-[#D9A441]/15 text-[#8A6216] border border-[#D9A441]/40 flex items-center justify-center">
            <ReferralIcon />
          </div>

          <div>
            <p className="text-xs font-mono uppercase tracking-wide text-muted">
              Nodule note
            </p>

            <p className="text-sm text-ink/80 mt-1">{routine.noduleNote}</p>
          </div>
        </div>
      )}

      {routine.professionalEvaluationRecommended && (
        <div className="flex gap-3 rounded-xl border border-[#B23A48]/40 bg-[#B23A48]/[0.06] p-4 mb-5">
          <div className="h-9 w-9 shrink-0 rounded-full bg-[#B23A48]/15 text-[#B23A48] border border-[#B23A48]/40 flex items-center justify-center">
            <ReferralIcon />
          </div>

          <div>
            <p className="text-xs font-mono uppercase tracking-wide text-muted">
              Professional evaluation recommended
            </p>

            <p className="text-sm text-ink/80 mt-1">
              {routine.professionalEvaluationReason}
            </p>
          </div>
        </div>
      )}

      {routine.recommendationPaused ? (
        <div className="flex gap-3 rounded-xl border border-[#D9A441]/40 bg-[#D9A441]/[0.06] p-4">
          <div className="h-9 w-9 shrink-0 rounded-full bg-[#D9A441]/15 text-[#8A6216] border border-[#D9A441]/40 flex items-center justify-center">
            <PausedIcon />
          </div>

          <div>
            <p className="text-xs font-mono uppercase tracking-wide text-muted">
              Cleanser, moisturizer, sunscreen &amp; acne-care — paused
            </p>

            <p className="text-sm text-ink/80 mt-1">
              {routine.reasons.cleanser}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {rows.map((row) => (
            <div
              key={row.key}
              className="flex gap-3 pb-5 border-b border-line/60 last:border-b-0 last:pb-0"
            >
              <div className="h-9 w-9 shrink-0 rounded-full bg-paper border border-line flex items-center justify-center text-ink/70">
                <row.Icon />
              </div>

              <div>
                <p className="text-xs font-mono uppercase tracking-wide text-muted">
                  {row.label}
                </p>

                <p className="text-[15px] text-ink font-medium mt-0.5">
                  {row.value}
                </p>

                <p className="text-sm text-ink/60 mt-1">{row.reason}</p>
              </div>
            </div>
          ))}

          {!routine.professionalEvaluationRecommended && (
            <div className="flex gap-3">
              <div className="h-9 w-9 shrink-0 rounded-full bg-paper border border-line flex items-center justify-center text-ink/70">
                <AcneCareIcon />
              </div>

              <div className="flex-1">
                <p className="text-xs font-mono uppercase tracking-wide text-muted">
                  Acne-care ingredients to look for (over-the-counter)
                </p>

                <div className="mt-2 space-y-3">
                  {routine.acneCare.map((item) => (
                    <div key={item.ingredient}>
                      <p className="text-[15px] text-ink font-medium">
                        {item.ingredient}
                      </p>

                      <p className="text-sm text-ink/60 mt-0.5">
                        {item.reason}
                      </p>

                      {item.usageTip && (
                        <p className="text-xs text-ink/50 mt-1 italic">
                          💡 {item.usageTip}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {!routine.recommendationPaused && (
        <p className="text-xs text-muted mt-6 pt-4 border-t border-line/60">
          These are common over-the-counter acne-care ingredients to look for,
          not a prescription. SkinWISE does not prescribe medicine —
          availability and prescription requirements vary by country, so ask a
          pharmacist if any of these require one where you are. Always
          patch-test new products, and consult a dermatologist for anything
          beyond mild concerns.
        </p>
      )}
    </div>
  );
}