"use client";

import type { Routine } from "@/lib/routineEngine";
import { useEffect, useRef, useState } from "react";
import type { ComponentType, MouseEvent } from "react";
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

function ProductImageButton({
  src,
  alt,
  label,
  Icon,
  onOpen,
}: {
  src: string;
  alt: string;
  label: string;
  Icon: ComponentType;
  onOpen: (src: string, alt: string, event: MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      className="group relative grid h-[76px] w-[76px] shrink-0 place-items-center overflow-hidden rounded-xl border border-line/70 bg-white p-1.5 text-ink/70 transition-shadow hover:shadow-md motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6574d1] focus-visible:ring-offset-2 sm:h-24 sm:w-24 sm:p-2"
      aria-label={`Enlarge generic ${label.toLowerCase()} illustration`}
      onClick={(event) => onOpen(src, alt, event)}
    >
      <img
        src={src}
        alt={alt}
        className="h-full w-full object-contain"
        loading="lazy"
        onError={(event) => {
          event.currentTarget.style.display = "none";
          const button = event.currentTarget.parentElement;
          if (button instanceof HTMLButtonElement) button.disabled = true;
          const fallback = button?.querySelector("[aria-hidden='true']") as HTMLElement | null;
          if (fallback) fallback.style.display = "grid";
        }}
      />
      <span className="absolute inset-0 hidden place-items-center" aria-hidden="true">
        <Icon />
      </span>
    </button>
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
  const [preview, setPreview] = useState<{ src: string; alt: string } | null>(null);
  const previewTriggerRef = useRef<HTMLButtonElement | null>(null);
  const previewCloseRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!preview) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    previewCloseRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPreview(null);
      } else if (event.key === "Tab") {
        event.preventDefault();
        previewCloseRef.current?.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previewTriggerRef.current?.focus();
    };
  }, [preview]);

  const rows = [
    {
      key: "cleanser",
      label: "Cleanser",
      value: routine.cleanser,
      reason: routine.reasons.cleanser,
      Icon: CleanserIcon,
      image: "/images/products/cleanser.png",
    },
    {
      key: "moisturizer",
      label: "Moisturizer",
      value: routine.moisturizer,
      reason: routine.reasons.moisturizer,
      Icon: MoisturizerIcon,
      image: "/images/products/moisturizer.png",
    },
    {
      key: "sunscreen",
      label: "Sunscreen",
      value: routine.sunscreen,
      reason: routine.reasons.sunscreen,
      Icon: SunscreenIcon,
      image: "/images/products/sunscreen.png",
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
          {rows.map((row) => (
            <div
              key={row.key}
              className="flex min-w-0 items-center gap-4 rounded-xl border border-line/80 bg-paper/60 p-3 sm:p-4"
            >
              <ProductImageButton
                src={row.image}
                alt={`Generic illustration of a ${row.label.toLowerCase()} product; not a specific brand or verified product.`}
                label={row.label}
                Icon={row.Icon}
                onOpen={(src, alt, event) => {
                  previewTriggerRef.current = event.currentTarget;
                  setPreview({ src, alt });
                }}
              />

              <div className="min-w-0 flex-1 py-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
                  {row.label}
                </p>

                <p className="text-sm sm:text-[15px] leading-6 text-ink font-semibold mt-1">
                  {row.value}
                </p>

                <p className="text-[13px] leading-5 text-ink/65 mt-1.5">{row.reason}</p>
              </div>
            </div>
          ))}

          {!routine.professionalEvaluationRecommended && (
            <div className="flex min-w-0 items-center gap-4 rounded-xl border border-line/80 bg-paper/60 p-3 sm:p-4">
              <ProductImageButton
                src="/images/products/acne-care.png"
                alt="Generic illustration of an acne-care treatment bottle; not a specific brand or verified product."
                label="Acne-care"
                Icon={AcneCareIcon}
                onOpen={(src, alt, event) => {
                  previewTriggerRef.current = event.currentTarget;
                  setPreview({ src, alt });
                }}
              />

              <div className="min-w-0 flex-1 py-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
                  Acne-care ingredients and treatment options
                </p>

                <div className="mt-2 space-y-3">
                  {routine.acneCare.map((item) => (
                    <div key={item.ingredient}>
                      <p className="text-sm sm:text-[15px] leading-6 text-ink font-semibold">
                        {item.ingredient}
                      </p>

                      <p className="text-[13px] leading-5 text-ink/65 mt-1">
                        {item.reason}
                      </p>

                      {item.usageTip && (
                        <p className="text-xs leading-5 text-ink/55 mt-1.5 italic">
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
        <section className="mt-6 rounded-xl border border-[#8995d5]/25 bg-[#8995d5]/[0.06] px-4 py-4 sm:px-5" aria-labelledby="skincare-guidance-heading">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full border border-[#8995d5]/25 bg-white/70 text-sm font-semibold text-[#6574d1]" aria-hidden="true">i</span>
            <div className="min-w-0">
              <h3 id="skincare-guidance-heading" className="text-sm font-semibold tracking-wide text-ink">
                Important Skincare Guidance
              </h3>
              <p className="mt-1.5 text-xs leading-5 text-ink/65 sm:text-[13px]">
                These are common acne-care ingredients and treatment options,
                not a prescription. SkinWISE does not prescribe medicine —
                availability and prescription requirements vary by country.
                Adapalene and benzoyl peroxide can cause irritation; follow the
                product label, introduce new products cautiously and gradually,
                and ask a pharmacist or healthcare professional if you are
                unsure about local requirements or what is suitable for you.
                Always patch-test new products, and consult a dermatologist for
                anything beyond mild concerns.
              </p>
            </div>
          </div>
        </section>
      )}

      {preview && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/65 p-4 sm:p-8"
          onClick={(event) => {
            if (event.target === event.currentTarget) setPreview(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Product image preview"
            className="relative flex max-h-[90vh] max-w-[92vw] items-center justify-center rounded-2xl border border-white/60 bg-white p-3 shadow-2xl sm:p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              ref={previewCloseRef}
              type="button"
              aria-label="Close image preview"
              className="absolute right-2 top-2 z-10 grid h-10 w-10 place-items-center rounded-full border border-line bg-white/95 text-2xl leading-none text-ink shadow-sm transition-colors hover:bg-paper motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6574d1] focus-visible:ring-offset-2"
              onClick={() => setPreview(null)}
            >
              <span aria-hidden="true">×</span>
            </button>
            <img
              src={preview.src}
              alt={preview.alt}
              className="max-h-[82vh] max-w-[86vw] rounded-xl object-contain"
              onError={() => setPreview(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
