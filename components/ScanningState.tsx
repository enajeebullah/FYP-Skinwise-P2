"use client";

export default function ScanningState({
  imageSrc,
  message = "Reading skin texture & tone…",
}: {
  imageSrc: string;
  message?: string;
}) {
  return (
    <div className="rounded-2xl border border-line bg-panel panel-elevated p-6 sm:p-8 animate-fadeUp">
      <div className="relative w-full max-w-xs mx-auto aspect-square rounded-xl overflow-hidden border border-line">
        <img src={imageSrc} alt="Scanning" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-ink/10" />
        <div className="absolute left-0 right-0 h-1/3 bg-gradient-to-b from-transparent via-panel/40 to-transparent animate-scanline" />
      </div>
      <p className="text-center font-mono text-xs uppercase tracking-wider text-muted mt-5 animate-pulseSoft">
        {message}
      </p>
    </div>
  );
}
