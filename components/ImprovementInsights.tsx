"use client";

import type { OverallSeverity } from "@/lib/overallSeverity";

interface ImprovementInsightsProps {
  previousTotalLesions: number;
  previousOverallSeverity: OverallSeverity;
  currentTotalLesions: number;
  currentOverallSeverity: OverallSeverity;
}

export default function ImprovementInsights({
  previousTotalLesions,
  previousOverallSeverity,
  currentTotalLesions,
  currentOverallSeverity,
}: ImprovementInsightsProps) {
  const lesionDelta = currentTotalLesions - previousTotalLesions;
  const severityRank: Record<OverallSeverity, number> = {
    clear: 0,
    mild: 1,
    moderate: 2,
    severe: 3,
  };
  const severityDelta =
    severityRank[currentOverallSeverity] - severityRank[previousOverallSeverity];
  const severityColor =
    severityDelta < 0 ? "#6F9A6A" : severityDelta > 0 ? "#B23A48" : "#221D24";

  return (
    <div className="rounded-2xl border border-line bg-panel panel-elevated p-6 sm:p-8">
      <p className="font-mono text-[11px] uppercase tracking-wider text-muted mb-4">
        Compared to your previous scan
      </p>

      <div className="grid grid-cols-2 gap-6">
        <div>
          <p className="text-xs text-muted">Total lesions</p>
          <p
            className="font-display text-2xl mt-0.5"
            style={{ color: lesionDelta > 0 ? "#B23A48" : lesionDelta < 0 ? "#6F9A6A" : "#221D24" }}
          >
            {lesionDelta === 0 ? "No change" : `${lesionDelta > 0 ? "+" : ""}${lesionDelta}`}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted">Overall Severity</p>
          <p
            className="font-display text-2xl mt-0.5"
            style={{ color: severityColor }}
          >
            {currentOverallSeverity.charAt(0).toUpperCase() + currentOverallSeverity.slice(1)}
          </p>
        </div>
      </div>

      <p className="text-sm text-ink/70 mt-5">
        {severityDelta < 0 && "Your Overall Severity has improved since your previous scan."}
        {severityDelta > 0 && "Your Overall Severity has increased since your previous scan."}
        {severityDelta === 0 && "Your Overall Severity is unchanged since your previous scan."}
      </p>
    </div>
  );
}
