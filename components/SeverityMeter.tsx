"use client";

import { OVERALL_SEVERITY_META, type OverallSeverity } from "@/lib/overallSeverity";
import Tooltip from "./Tooltip";

interface SeverityMeterProps {
  overallSeverity: OverallSeverity;
  noduleCount: number;
}

const SEVERITY_STAGES: Exclude<OverallSeverity, "clear">[] = ["mild", "moderate", "severe"];

export default function SeverityMeter({
  overallSeverity,
  noduleCount,
}: SeverityMeterProps) {
  const overallMeta = OVERALL_SEVERITY_META[overallSeverity];
  const overallTooltip = "Overall Severity is calculated from your confirmed lesion counts and is used to tailor the routine below.";

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-4">
        <span
          className="text-sm font-semibold rounded-full px-3 py-1 border"
          style={{ backgroundColor: `${overallMeta.hex}1A`, color: overallMeta.hex, borderColor: `${overallMeta.hex}55` }}
        >
          Overall Severity: {overallMeta.label}
        </span>
        <Tooltip text={overallTooltip} />
      </div>

      {overallSeverity !== "clear" && (
        <div className="mb-4">
          <div className="relative h-2.5 rounded-full overflow-hidden flex">
            {SEVERITY_STAGES.map((stage) => (
              <div
                key={stage}
                className="h-full flex-1"
                style={{
                  backgroundColor: OVERALL_SEVERITY_META[stage].hex,
                  opacity: stage === overallSeverity ? 1 : 0.28,
                }}
              />
            ))}
          </div>

          <div className="flex mt-1.5 font-mono text-[9px] uppercase tracking-wide text-muted">
            {SEVERITY_STAGES.map((stage, i) => (
              <span
                key={stage}
                className={`flex-1 ${i === 0 ? "text-left" : i === SEVERITY_STAGES.length - 1 ? "text-right" : "text-center"}`}
              >
                {OVERALL_SEVERITY_META[stage].label}
              </span>
            ))}
          </div>
        </div>
      )}

      {noduleCount > 0 && (
        <p className="text-xs text-muted pt-3 border-t border-line/60">
          {noduleCount} nodule{noduleCount === 1 ? "" : "s"} confirmed
        </p>
      )}
    </div>
  );
}
