"use client";

import { useState } from "react";
import UploadPanel from "@/components/UploadPanel";
import CameraCapture from "@/components/CameraCapture";
import ScanningState from "@/components/ScanningState";
import ConfirmSkinType from "@/components/ConfirmSkinType";
import Dashboard from "@/components/Dashboard";
import type { PredictionResult } from "@/lib/model";
import type { AcneDetectionResult } from "@/lib/acneModel";
import type { Point } from "@/lib/landmarks";
import { analyzeAcne, analyzeSkin, type FaceBox } from "@/lib/inferenceApi";
import type { SkinClass } from "@/lib/constants";

type Mode = "upload" | "camera";
type Stage =
  | "idle"
  | "scanning-skin"
  | "confirm-skin"
  | "scanning-acne"
  | "dashboard"
  | "error"
  | "no-face"
  | "not-human-skin";

export default function ScannerApp({ userId }: { userId: string }) {
  const [mode, setMode] = useState<Mode>("upload");
  const [stage, setStage] = useState<Stage>("idle");
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [skinResult, setSkinResult] = useState<PredictionResult | null>(null);
  const [confirmedSkinType, setConfirmedSkinType] = useState<SkinClass | null>(null);
  const [acneResult, setAcneResult] = useState<AcneDetectionResult | null>(null);
  const [faceBoxPx, setFaceBoxPx] = useState<FaceBox | null>(null);
  const [landmarks, setLandmarks] = useState<Point[] | null>(null);
  const [skinInferenceMs, setSkinInferenceMs] = useState(0);
  const [acneInferenceMs, setAcneInferenceMs] = useState(0);
  const [analysisWarning, setAnalysisWarning] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleImageReady(dataUrl: string) {
    setImageSrc(dataUrl);
    setStage("scanning-skin");
    setErrorMsg(null);
    setSkinResult(null);
    setConfirmedSkinType(null);
    setAcneResult(null);

    setAnalysisWarning(null);
    try {
      const analysis = await analyzeSkin(dataUrl);
      setSkinInferenceMs(analysis.skinInferenceMs);
      setFaceBoxPx(analysis.faceBoxPx);
      if (analysis.status === "no_face") {
        setStage("no-face");
        return;
      }
      if (analysis.status === "not_human_skin") {
        setStage("not-human-skin");
        return;
      }
      if (!analysis.skinResult) {
        throw new Error("The AI service returned an incomplete skin analysis.");
      }
      setSkinResult(analysis.skinResult);
      setStage("confirm-skin");
    } catch (err) {
      console.error("Skin analysis request failed:", err);
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "The AI service could not process that photo. Please try again."
      );
      setStage("error");
    }
  }

  async function proceedToAcneScan(finalType: SkinClass) {
    setConfirmedSkinType(finalType);
    setStage("scanning-acne");

    if (!imageSrc) {
      setErrorMsg("Something went wrong — please scan the photo again.");
      setStage("error");
      return;
    }

    try {
      const analysis = await analyzeAcne(imageSrc, faceBoxPx);
      setAcneInferenceMs(analysis.acneInferenceMs);
      setAcneResult(analysis.acneResult);
      setLandmarks(analysis.landmarks);
      setAnalysisWarning(analysis.landmarkWarning);
      setStage("dashboard");
    } catch (err) {
      console.error("Acne analysis request failed:", err);
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "The AI service could not process that photo. Please try again."
      );
      setStage("error");
    }
  }

  function reset() {
    setStage("idle");
    setImageSrc(null);
    setSkinResult(null);
    setConfirmedSkinType(null);
    setAcneResult(null);
    setSkinInferenceMs(0);
    setAcneInferenceMs(0);
    setAnalysisWarning(null);
    setErrorMsg(null);
    setFaceBoxPx(null);
    setLandmarks(null);
  }

  if (stage === "confirm-skin" && skinResult && imageSrc) {
    return (
      <ConfirmSkinType
        imageSrc={imageSrc}
        skinResult={skinResult}
        onContinue={proceedToAcneScan}
        onStartOver={reset}
      />
    );
  }

  if (
    stage === "dashboard" &&
    skinResult &&
    confirmedSkinType &&
    acneResult &&
    imageSrc
  ) {
    return (
      <Dashboard
        imageSrc={imageSrc}
        skinResult={skinResult}
        confirmedSkinType={confirmedSkinType}
        acneResult={acneResult}
        landmarks={landmarks}
        analysisWarning={analysisWarning}
        skinInferenceMs={skinInferenceMs}
        acneInferenceMs={acneInferenceMs}
        userId={userId}
        onReset={reset}
      />
    );
  }

  return (
    <section className="scanner-start max-w-5xl mx-auto px-6 pt-16 pb-8 grid md:grid-cols-2 gap-14 items-start">
      <div>
        <p className="font-mono text-xs uppercase tracking-wider text-muted mb-4">
          Photo in → reading out
        </p>
        <h1 className="font-display text-[2.6rem] sm:text-5xl leading-[1.08]">
          Your skin, read in one frame.
        </h1>
        <p className="mt-5 text-[17px] leading-relaxed text-ink/75 max-w-md">
          Upload a clear frontal photo or use your camera. SkinWISE reads
          your skin type, detects and grades acne lesions, pulls in live
          weather, and builds a personalised routine. AI analysis runs on
          your configured SkinWISE server; uploaded photos are not saved by
          the inference API.
        </p>

        <div className="mt-8 space-y-3 max-w-sm">
          {(["dry", "normal", "oily"] as const).map((c) => (
            <div key={c} className="flex items-center gap-3 text-sm">
              <span
                className="h-2 w-2 rounded-full shrink-0"
                style={{
                  backgroundColor:
                    c === "dry" ? "#C6875A" : c === "normal" ? "#6F9A6A" : "#2F7189",
                }}
              />
              <span className="text-ink/70">
                {c === "dry" && "Dry — tighter barrier, lower sebum output"}
                {c === "normal" && "Normal — balanced oil and hydration"}
                {c === "oily" && "Oily — higher sebum, visible shine by midday"}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div>
        {stage === "idle" && (
          <>
            <div className="flex gap-1 mb-4 rounded-full bg-line/60 p-1 w-fit">
              {(["upload", "camera"] as Mode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`focus-ring rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                    mode === m ? "bg-ink text-paper" : "text-ink/60 hover:text-ink"
                  }`}
                >
                  {m === "upload" ? "Upload photo" : "Use camera"}
                </button>
              ))}
            </div>

            {mode === "upload" ? (
              <UploadPanel onImageReady={handleImageReady} />
            ) : (
              <CameraCapture onImageReady={handleImageReady} />
            )}
            <div className="scanner-tips">
              <p>For the clearest result</p>
              <ul>
                <li>Face the camera straight on in soft, even light.</li>
                <li>Keep your face clear of filters, makeup, and obstructions.</li>
                <li>Use a sharp, close-up photo with your full face in frame.</li>
              </ul>
            </div>
          </>
        )}

        {stage === "scanning-skin" && imageSrc && (
          <ScanningState imageSrc={imageSrc} message="Reading skin texture & tone…" />
        )}

        {stage === "scanning-acne" && imageSrc && (
          <ScanningState imageSrc={imageSrc} message="Scanning for acne lesions…" />
        )}

        {stage === "no-face" && imageSrc && (
          <div className="animate-fadeUp rounded-2xl border border-line bg-panel panel-elevated p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row gap-6 items-start">
              <img
                src={imageSrc}
                alt="Uploaded photo"
                className="w-full sm:w-32 h-32 object-cover rounded-xl border border-line opacity-60"
              />
              <div className="flex-1">
                <p className="font-mono text-[11px] uppercase tracking-wider text-muted">
                  Scan result
                </p>
                <h3 className="font-display text-2xl mt-1 text-ink">
                  This isn&rsquo;t a face
                </h3>
                <p className="mt-3 text-[15px] leading-relaxed text-ink/75">
                  No face was detected in this photo, so the skin type can&rsquo;t
                  be read. Please upload or capture a clear, well-lit frontal
                  face photo.
                </p>
              </div>
            </div>
            <button
              onClick={reset}
              className="focus-ring mt-6 text-sm font-medium underline underline-offset-4 text-ink/70 hover:text-ink"
            >
              Try another photo
            </button>
          </div>
        )}

        {stage === "not-human-skin" && imageSrc && (
          <div className="animate-fadeUp rounded-2xl border border-line bg-panel panel-elevated p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row gap-6 items-start">
              <img
                src={imageSrc}
                alt="Uploaded photo"
                className="w-full sm:w-32 h-32 object-cover rounded-xl border border-line opacity-60"
              />
              <div className="flex-1">
                <p className="font-mono text-[11px] uppercase tracking-wider text-muted">
                  Scan result
                </p>
                <h3 className="font-display text-2xl mt-1 text-ink">
                  This doesn&rsquo;t look like human skin
                </h3>
                <p className="mt-3 text-[15px] leading-relaxed text-ink/75">
                  Something face-shaped was detected, but the skin tone in
                  the photo doesn&rsquo;t match human skin colouring closely
                  enough to analyse. Please upload or capture a clear photo
                  of your own face.
                </p>
              </div>
            </div>
            <button
              onClick={reset}
              className="focus-ring mt-6 text-sm font-medium underline underline-offset-4 text-ink/70 hover:text-ink"
            >
              Try another photo
            </button>
          </div>
        )}

        {stage === "error" && (
          <div className="rounded-2xl border border-line bg-panel panel-elevated p-8 text-center">
            <p className="text-sm text-ink/80">{errorMsg}</p>
            <p className="mt-2 text-xs text-muted">
              Please upload a JPG, PNG, or WebP image.
            </p>
            <button
              onClick={reset}
              className="focus-ring mt-4 text-sm font-medium underline underline-offset-4"
            >
              Try again
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
