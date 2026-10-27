"use client";

import { CLASS_META, CLASS_ORDER, SKIN_LOW_MARGIN_THRESHOLD, type SkinClass } from "@/lib/constants";
import { getConfidenceMargin, type PredictionResult } from "@/lib/model";
import ConfidenceBadge from "./ConfidenceBadge";
import Tooltip from "./Tooltip";

interface ResultPanelProps {
  result: PredictionResult;
  imageSrc: string;
  showConfidenceDetails?: boolean;
  displaySkinType?: SkinClass;
  guidance?: { title: string; body: string }[];
}

export default function ResultPanel({
  result,
  imageSrc,
  showConfidenceDetails = true,
  displaySkinType,
  guidance,
}: ResultPanelProps) {
  const top = CLASS_META[displaySkinType ?? result.topClass];
  const margin = showConfidenceDetails ? getConfidenceMargin(result.scores) : 0;
  const isAmbiguous = margin < SKIN_LOW_MARGIN_THRESHOLD;

  return (
    <div className={`result-panel animate-fadeUp rounded-2xl border border-line bg-panel panel-elevated p-6 sm:p-8${showConfidenceDetails ? "" : " result-panel-no-confidence"}`}>
      <div className="flex flex-col sm:flex-row gap-6">
        <img
          src={imageSrc}
          alt="Analysed photo"
          className="w-full sm:w-40 h-40 object-cover rounded-xl border border-line"
        />

        <div className="flex-1">
          <p className="font-mono text-[11px] uppercase tracking-wider text-muted">
            {displaySkinType
              ? "Confirmed skin type"
              : showConfidenceDetails
                ? "Scan result"
                : "AI detection result"}
          </p>
          <h3 className="font-display text-3xl mt-1" style={{ color: top.hex }}>
            {top.label} skin
          </h3>
          {showConfidenceDetails && <div className="flex items-center gap-2 mt-1.5">
            <span className="text-sm text-muted">
              {(result.topConfidence * 100).toFixed(1)}% confidence
            </span>
            <ConfidenceBadge confidence={result.topConfidence} />
          </div>}
          <p className="mt-3 text-[15px] leading-relaxed text-ink/80">
            {top.blurb}
          </p>
        </div>
      </div>

      {guidance?.length ? (
        <section className="skin-guidance" aria-labelledby="skin-guidance-title">
          <h4 id="skin-guidance-title">Skin care guidance</h4>
          <div className="skin-guidance-grid">
            {guidance.map((item) => (
              <article className="skin-guidance-card" key={item.title}>
                <strong>{item.title}</strong>
                <p>{item.body}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {showConfidenceDetails && isAmbiguous && (
        <p className="mt-5 text-xs text-ink/70 rounded-lg bg-paper border border-line px-3 py-2">
          The top two skin types are very close ({(margin * 100).toFixed(0)}
          -point gap) — the model isn&rsquo;t confidently picking one. This
          can happen with unusual lighting, or a photo that isn&rsquo;t a
          clear close-up of skin. If this doesn&rsquo;t look right, try the
          quiz below or a different photo.
        </p>
      )}

      {showConfidenceDetails && <div className="mt-8">
        <div className="flex items-center gap-1.5 mb-3">
          <p className="font-mono text-[11px] uppercase tracking-wider text-muted">
            Model confidence
          </p>
          <Tooltip text="Direct output from the CNN's softmax layer — the three percentages always add to 100%. Not adjusted or filtered in any way." />
        </div>
        <div className="grid grid-cols-3 gap-3">
          {CLASS_ORDER.map((cls) => {
            const meta = CLASS_META[cls];
            const pct = result.scores[cls] * 100;
            return (
              <div key={cls}>
                <div className="flex justify-between text-xs font-mono mb-1.5">
                  <span style={{ color: meta.hex }}>{meta.label}</span>
                  <span className="text-muted">{pct.toFixed(1)}%</span>
                </div>
                <div className="h-2 rounded-full bg-line overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700 ease-out"
                    style={{ width: `${pct}%`, backgroundColor: meta.hex }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>}
    </div>
  );
}
