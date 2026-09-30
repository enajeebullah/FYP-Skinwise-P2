"use client";

import { ACNE_CONF_THRESHOLD, ACNE_IOU_THRESHOLD } from "@/lib/constants";

interface TechnicalDetailsCardProps {
  skinInferenceMs: number;
  acneInferenceMs: number;
}

export default function TechnicalDetailsCard({
  skinInferenceMs,
  acneInferenceMs,
}: TechnicalDetailsCardProps) {
  const rows = [
    { label: "Scan date", value: new Date().toLocaleString() },
    { label: "Skin type model", value: "MobileNetV2 (ONNX, 224×224 input)" },
    { label: "Acne detection model", value: "YOLO11m (ONNX, 640×640 input)" },
    { label: "Confidence threshold", value: ACNE_CONF_THRESHOLD.toFixed(2) },
    { label: "IoU (NMS) threshold", value: ACNE_IOU_THRESHOLD.toFixed(2) },
    { label: "Skin type inference", value: `${skinInferenceMs.toFixed(0)} ms` },
    { label: "Acne detection inference", value: `${acneInferenceMs.toFixed(0)} ms` },
    { label: "Total inference time", value: `${(skinInferenceMs + acneInferenceMs).toFixed(0)} ms` },
    { label: "Runs on", value: "SkinWISE FastAPI inference service (ONNX Runtime)" },
  ];

  return (
    <details className="group rounded-2xl border border-line bg-panel panel-elevated p-6 sm:p-8">
      <summary className="cursor-pointer list-none flex items-center justify-between">
        <p className="font-mono text-[11px] uppercase tracking-wider text-muted">
          Technical scan details
        </p>
        <span className="text-muted text-sm group-open:rotate-180 transition-transform">⌄</span>
      </summary>
      <div className="mt-5 grid lg:grid-cols-2 gap-x-8 gap-y-3">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex flex-col sm:flex-row sm:justify-between gap-0.5 sm:gap-2 text-sm border-b border-line/60 pb-2"
          >
            <span className="text-muted">{row.label}</span>
            <span className="text-ink font-mono text-xs sm:text-right">{row.value}</span>
          </div>
        ))}
      </div>
    </details>
  );
}
