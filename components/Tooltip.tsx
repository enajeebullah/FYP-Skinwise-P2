"use client";

import { useState } from "react";

interface TooltipProps {
  text: string;
}

export default function Tooltip({ text }: TooltipProps) {
  const [open, setOpen] = useState(false);

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((v) => !v)}
        aria-label="More info"
        className="focus-ring h-4 w-4 rounded-full border border-muted/50 text-muted text-[10px] leading-none flex items-center justify-center hover:border-ink hover:text-ink transition-colors"
      >
        i
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute z-20 bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 rounded-lg bg-ink text-paper text-xs leading-relaxed px-3 py-2 shadow-lg"
        >
          {text}
          <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-ink" />
        </span>
      )}
    </span>
  );
}
