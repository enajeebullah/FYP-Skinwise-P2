"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { ACNE_CLASS_META } from "@/lib/constants";
import type { AcneDetectionResult } from "@/lib/acneModel";

interface AcneCanvasProps {
  imageSrc: string;
  detection: AcneDetectionResult;
}

const AcneCanvas = forwardRef<HTMLCanvasElement, AcneCanvasProps>(
  ({ imageSrc, detection }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    useImperativeHandle(ref, () => canvasRef.current as HTMLCanvasElement);

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const img = new Image();
      img.onload = () => {
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        ctx.drawImage(img, 0, 0);

        const lineWidth = Math.max(2, Math.round(img.naturalWidth / 300));
        ctx.font = `${Math.max(12, Math.round(img.naturalWidth / 45))}px sans-serif`;

        for (const box of detection.boxes) {
          const meta = ACNE_CLASS_META[box.className];
          ctx.strokeStyle = meta.hex;
          ctx.lineWidth = lineWidth;
          ctx.strokeRect(box.x1, box.y1, box.x2 - box.x1, box.y2 - box.y1);

          const label = `${meta.label} ${(box.score * 100).toFixed(0)}%`;
          const textWidth = ctx.measureText(label).width;
          const textHeight = Math.max(14, Math.round(img.naturalWidth / 40));

          ctx.fillStyle = meta.hex;
          ctx.fillRect(box.x1, Math.max(0, box.y1 - textHeight), textWidth + 8, textHeight);
          ctx.fillStyle = "#FFFFFF";
          ctx.fillText(label, box.x1 + 4, Math.max(textHeight - 3, box.y1 - 4));
        }
      };
      img.src = imageSrc;
    }, [imageSrc, detection]);

    return (
      <canvas
        ref={canvasRef}
        className="w-full rounded-xl border border-line"
        aria-label="Photo with detected acne lesions highlighted"
      />
    );
  }
);

AcneCanvas.displayName = "AcneCanvas";

export default AcneCanvas;
