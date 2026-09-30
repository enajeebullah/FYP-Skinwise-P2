"use client";

import { useCallback, useRef, useState } from "react";

interface UploadPanelProps {
  onImageReady: (dataUrl: string) => void;
}

export default function UploadPanel({ onImageReady }: UploadPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFile = useCallback(
    (file: File | undefined) => {
      if (!file || !file.type.startsWith("image/")) return;
      const reader = new FileReader();
      reader.onload = () => onImageReady(reader.result as string);
      reader.readAsDataURL(file);
    },
    [onImageReady]
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        handleFile(e.dataTransfer.files?.[0]);
      }}
      onClick={() => inputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
      }}
      className={`focus-ring cursor-pointer rounded-2xl border-2 border-dashed p-10 text-center transition-colors ${
        isDragging ? "border-ink bg-ink/5" : "border-line hover:border-ink/40"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      <svg
        width="40"
        height="40"
        viewBox="0 0 24 24"
        fill="none"
        className="mx-auto mb-3 text-muted"
        aria-hidden
      >
        <path
          d="M12 16V4M12 4l-4 4M12 4l4 4M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <p className="font-medium text-ink">Drop a facial photo here</p>
      <p className="text-sm text-muted mt-1">Upload a JPG, PNG, or WebP photo</p>
    </div>
  );
}
