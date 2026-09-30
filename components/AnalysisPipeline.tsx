"use client";

interface AnalysisPipelineProps {
  weatherStatus: "pending" | "done" | "skipped";
}

export default function AnalysisPipeline({ weatherStatus }: AnalysisPipelineProps) {
  const weatherLabel =
    weatherStatus === "pending"
      ? "Weather Pending…"
      : weatherStatus === "done"
      ? "Weather Retrieved"
      : "Weather Skipped";

  const steps = [
    { label: "Skin Type Classified", done: true },
    { label: "Lesions Detected", done: true },
    { label: "Severity Calculated", done: true },
    { label: weatherLabel, done: weatherStatus === "done" },
    { label: "Routine Generated", done: true },
  ];

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs font-mono text-muted">
      {steps.map((step, i) => (
        <span key={step.label} className="flex items-center gap-1.5">
          <span className={step.done ? "text-normal" : "text-muted"}>
            {step.done ? "✓" : "○"}
          </span>
          {step.label}
          {i < steps.length - 1 && <span className="text-line ml-2 hidden sm:inline">—</span>}
        </span>
      ))}
    </div>
  );
}
