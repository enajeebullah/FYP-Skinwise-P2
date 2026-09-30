"use client";

import { CLASS_META, type SkinClass } from "@/lib/constants";
import { OVERALL_SEVERITY_META, type OverallSeverity } from "@/lib/overallSeverity";
import ConfidenceBadge from "./ConfidenceBadge";

interface AnalysisSummaryCardProps {
  skinType: SkinClass;
  overallSeverity: OverallSeverity;
  reviewed: boolean;
  totalLesions: number;
  confidence: number;
  analysisTimeSec: number;
  recommendationPaused: boolean;
}

export default function AnalysisSummaryCard({
  skinType,
  overallSeverity,
  reviewed,
  totalLesions,
  confidence,
  analysisTimeSec,
  recommendationPaused,
}: AnalysisSummaryCardProps) {
  const skinMeta = CLASS_META[skinType];
  const overallMeta = OVERALL_SEVERITY_META[overallSeverity];
  // Severity comes from the user-CONFIRMED lesion-count review further
  // down the page. Before the user has reviewed anything, the pre-filled
  // counts already drive a live Overall Severity preview, but it isn't
  // final — this shows an explicit "Not confirmed yet" instead of
  // presenting a possibly-wrong number as settled, when lesions were
  // detected.
  const showNotReviewed = !reviewed && totalLesions > 0;

  const rows = [
    { label: "Skin Type", value: skinMeta.label, color: skinMeta.hex },
    {
      label: "Overall Severity",
      value: showNotReviewed ? "Not confirmed yet" : overallMeta.label,
      color: showNotReviewed ? "#8A7F72" : overallMeta.hex,
    },
    { label: "Total Lesions", value: String(totalLesions), color: "#221D24" },
  ];

  return (
    <div className="summary-panel rounded-2xl border border-line bg-panel panel-elevated p-6 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <p className="font-mono text-[11px] uppercase tracking-wider text-muted">
          YOUR SKIN SNAPSHOT
        </p>
        <div className="flex items-center gap-2">
          <ConfidenceBadge confidence={confidence} />
        </div>
      </div>

      <div className="summary-stats-grid">
        {rows.map((row) => (
          <div className="summary-stat-card" key={row.label}>
            <span className="summary-stat-icon" aria-hidden="true">
              {row.label === "Skin Type" ? "◉" : row.label === "Overall Severity" ? "◎" : "✣"}
            </span>
            <p className="text-xs text-muted">{row.label}</p>
            <p className="font-display text-xl mt-0.5" style={{ color: row.color }}>
              {row.value}
            </p>
          </div>
        ))}
        <div className="summary-stat-card confidence-stat-card">
          <span className="summary-stat-icon" aria-hidden="true">⌁</span>
          <p className="text-xs text-muted">Skin confidence</p>
          <p className="font-display text-xl mt-0.5">{(confidence * 100).toFixed(1)}%</p>
          <div className="confidence-progress" aria-label={`${(confidence * 100).toFixed(1)}% confidence`}>
            <span style={{ width: `${Math.min(confidence * 100, 100)}%` }} />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 mt-5 pt-4 border-t border-line/60 text-xs font-mono">
        <span className="text-normal">✓ Analysis: Completed</span>
        <span className={recommendationPaused ? "text-[#8A6216]" : "text-normal"}>
          {recommendationPaused ? "⚠ Recommendation: Paused" : "✓ Recommendation: Available"}
        </span>
      </div>

      <p className="text-xs text-muted mt-3 font-mono">
        Analysed in {analysisTimeSec.toFixed(1)}s by the SkinWISE AI service
      </p>

      {showNotReviewed && (
        <p className="text-xs text-ink/70 mt-3 rounded-lg bg-paper border border-line px-3 py-2">
          {totalLesions} lesion{totalLesions === 1 ? "" : "s"} were detected below — confirm the{" "}
          <strong className="text-ink">lesion counts</strong> further down the page to get your
          Overall Severity and routine.
        </p>
      )}
    </div>
  );
}
