"use client";

import { OVERALL_SEVERITY_META, type OverallSeverity } from "@/lib/overallSeverity";

interface SeverityMeterProps {
  overallSeverity: OverallSeverity;
}

const SEVERITY_STAGES: OverallSeverity[] = ["clear", "mild", "moderate", "severe"];

const SEVERITY_DESCRIPTIONS: Record<OverallSeverity, string> = {
  clear: "No acne lesions were confirmed in this scan.",
  mild: "Mild acne activity. Follow a consistent routine and track changes over time.",
  moderate: "Moderate acne activity. Follow a consistent routine and track changes over time.",
  severe: "Severe acne activity. Consider discussing your results with a healthcare professional.",
};

export default function SeverityMeter({ overallSeverity }: SeverityMeterProps) {
  const overallMeta = OVERALL_SEVERITY_META[overallSeverity];
  const severityProgress = {
    clear: 0,
    mild: 34,
    moderate: 67,
    severe: 100,
  }[overallSeverity];

  return (
    <div
      className="severity-visual"
      style={{
        "--severity-color": overallMeta.hex,
        "--severity-progress": `${severityProgress}%`,
      } as React.CSSProperties}
    >
      <div
        className="severity-gauge"
        role="img"
        aria-label={`SkinWISE severity: ${overallMeta.label}`}
      >
        <span>{overallMeta.label}</span>
        <small>SkinWISE Severity</small>
      </div>
      <div className="severity-visual-copy">
        <h3>Overall Severity</h3>
        <strong className="severity-result" style={{ color: overallMeta.hex }}>
          {overallMeta.label}
        </strong>
        <p className="severity-summary-text">{SEVERITY_DESCRIPTIONS[overallSeverity]}</p>
        <ol className="severity-scale" aria-label={`Severity scale, ${overallMeta.label} selected`}>
          {SEVERITY_STAGES.map((stage) => (
            <li
              className={stage === overallSeverity ? "selected" : ""}
              key={stage}
              style={{ "--severity-color": OVERALL_SEVERITY_META[stage].hex } as React.CSSProperties}
            >
              <span />
              <small>{OVERALL_SEVERITY_META[stage].label}</small>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
