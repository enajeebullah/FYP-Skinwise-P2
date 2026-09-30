"use client";

import { useEffect, useRef, useState } from "react";

interface CameraCaptureProps {
  onImageReady: (dataUrl: string) => void;
}

export default function CameraCapture({ onImageReady }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: 640, height: 640 },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setReady(true);
        }
      } catch (err) {
        setError(
          "Couldn't access the camera. Check your browser's camera permission and try again."
        );
      }
    }

    start();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function capture() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    const size = Math.min(video.videoWidth, video.videoHeight);
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const offsetX = (video.videoWidth - size) / 2;
    const offsetY = (video.videoHeight - size) / 2;
    ctx.drawImage(video, offsetX, offsetY, size, size, 0, 0, size, size);
    onImageReady(canvas.toDataURL("image/jpeg", 0.92));
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-line bg-panel panel-elevated p-8 text-center">
        <p className="text-sm text-ink/80">{error}</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-line bg-panel panel-elevated p-6 text-center">
      <div className="relative w-full max-w-xs mx-auto aspect-square rounded-xl overflow-hidden border border-line bg-ink/5">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover -scale-x-100"
        />
        {!ready && (
          <p className="absolute inset-0 flex items-center justify-center font-mono text-xs text-muted">
            Starting camera…
          </p>
        )}
      </div>
      <button
        onClick={capture}
        disabled={!ready}
        className="focus-ring mt-5 inline-flex items-center justify-center rounded-full bg-ink text-paper px-6 py-2.5 text-sm font-medium disabled:opacity-40 transition-opacity hover:opacity-90"
      >
        Capture photo
      </button>
    </div>
  );
}
