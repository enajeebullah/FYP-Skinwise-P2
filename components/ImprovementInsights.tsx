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
    <section className="improvement-insights-card">
      <p className="improvement-insights-kicker">
        Compared to your previous scan
      </p>

      <div className="improvement-insights-grid">
        <div>
          <span>Total lesions</span>
          <strong
            style={{ color: lesionDelta > 0 ? "#B23A48" : lesionDelta < 0 ? "#6F9A6A" : "#221D24" }}
          >
            {lesionDelta === 0 ? "No change" : `${lesionDelta > 0 ? "+" : ""}${lesionDelta}`}
          </strong>
        </div>
        <div>
          <span>Overall Severity</span>
          <strong
            style={{ color: severityColor }}
          >
            {currentOverallSeverity.charAt(0).toUpperCase() + currentOverallSeverity.slice(1)}
          </strong>
        </div>
      </div>

      <p className="improvement-insights-message">
        {severityDelta < 0 && "Your Overall Severity has improved since your previous scan."}
        {severityDelta > 0 && "Your Overall Severity has increased since your previous scan."}
        {severityDelta === 0 && "Your Overall Severity is unchanged since your previous scan."}
      </p>
    </section>
  );
}
