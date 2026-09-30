"use client";

interface ConfidenceBadgeProps {
  confidence: number; // 0–1
}

function getLevel(confidence: number): { label: string; hex: string; dot: string } {
  if (confidence >= 0.75) return { label: "High confidence", hex: "#6F9A6A", dot: "🟢" };
  if (confidence >= 0.5) return { label: "Medium confidence", hex: "#D9A441", dot: "🟡" };
  return { label: "Low confidence", hex: "#B23A48", dot: "🔴" };
}

export default function ConfidenceBadge({ confidence }: ConfidenceBadgeProps) {
  const level = getLevel(confidence);
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
      style={{ backgroundColor: `${level.hex}1A`, color: level.hex }}
    >
      <span aria-hidden>{level.dot}</span>
      {level.label}
    </span>
  );
}
