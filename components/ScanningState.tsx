"use client";

export default function ScanningState({
  imageSrc,
  message = "Reading skin texture & tone…",
}: {
  imageSrc: string;
  message?: string;
}) {
  const acneStage = message.toLowerCase().includes("acne");
  const steps = [
    { label: "Face detection", state: "done" },
    { label: "Skin type analysis", state: acneStage ? "done" : "active" },
    { label: "Acne detection", state: acneStage ? "active" : "pending" },
    { label: "Generating results", state: "pending" },
  ];

  return (
    <div className="scanning-card animate-fadeUp" aria-live="polite">
      <div className="relative w-full max-w-xs mx-auto aspect-square rounded-2xl overflow-hidden border border-line">
        <img src={imageSrc} alt="Scanning" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-ink/10" />
        <div className="absolute left-0 right-0 h-1/3 bg-gradient-to-b from-transparent via-panel/40 to-transparent animate-scanline" />
        <div className="scanning-target" aria-hidden="true">
          <span />
        </div>
      </div>
      <h2 className="scanning-title">Analyzing your skin</h2>
      <p className="scanning-message">
        {message}
      </p>
      <ol className="analysis-stages">
        {steps.map((step) => (
          <li className={step.state} key={step.label}>
            <span aria-hidden="true">{step.state === "done" ? "✓" : step.state === "active" ? <i /> : ""}</span>
            {step.label}
            {step.state === "active" && <strong>In progress</strong>}
          </li>
        ))}
      </ol>
      <p className="scanning-privacy">Your photo is processed for this analysis and isn&rsquo;t saved to your account.</p>
    </div>
  );
}
