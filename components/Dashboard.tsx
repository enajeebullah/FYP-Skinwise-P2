"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ResultPanel from "./ResultPanel";
import AcneCanvas from "./AcneCanvas";
import SeverityMeter from "./SeverityMeter";
import WeatherCard from "./WeatherCard";
import RoutineCard from "./RoutineCard";
import AnalysisSummaryCard from "./AnalysisSummaryCard";
import AnalysisPipeline from "./AnalysisPipeline";
import TechnicalDetailsCard from "./TechnicalDetailsCard";
import ImprovementInsights from "./ImprovementInsights";
import LesionReviewCard from "./LesionReviewCard";
import { ACNE_CLASS_META, ACNE_CLASS_ORDER, CLASS_META, DEFAULT_SAFETY_FLAGS } from "@/lib/constants";
import type { SkinClass, SafetyFlags } from "@/lib/constants";
import type { PredictionResult } from "@/lib/model";
import type { AcneDetectionResult } from "@/lib/acneModel";
import { suggestConfirmedCountsFromLandmarks, type Point } from "@/lib/landmarks";
import { totalLesions, totalPapules, totalPustules, type ConfirmedCounts } from "@/lib/reviewCounts";
import { computeHayashiSeverity } from "@/lib/hayashi";
import { computeNiceCategory } from "@/lib/nice";
import { computeOverallSeverity } from "@/lib/overallSeverity";
import { determineAcnePattern } from "@/lib/acnePattern";
import { generateRoutine } from "@/lib/routineEngine";
import type { WeatherData } from "@/lib/weather";
import { createClient } from "@/lib/supabase/client";
import { generatePdfReport } from "@/lib/generateReport";

interface DashboardProps {
  imageSrc: string;
  skinResult: PredictionResult;
  confirmedSkinType: SkinClass;
  acneResult: AcneDetectionResult;
  landmarks: Point[] | null;
  analysisWarning: string | null;
  skinInferenceMs: number;
  acneInferenceMs: number;
  userId: string;
  onReset: () => void;
}

type SaveStatus = "pending" | "saving" | "saved" | "error";

interface PreviousScanSummary {
  total_lesions: number;
  overall_severity: "clear" | "mild" | "moderate" | "severe";
}

export default function Dashboard({
  imageSrc,
  skinResult,
  confirmedSkinType,
  acneResult,
  landmarks,
  analysisWarning,
  skinInferenceMs,
  acneInferenceMs,
  userId,
  onReset,
}: DashboardProps) {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [weatherResolved, setWeatherResolved] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("pending");
  const [previousScan, setPreviousScan] = useState<PreviousScanSummary | null>(null);
  const [safetyFlags, setSafetyFlags] = useState<SafetyFlags>(DEFAULT_SAFETY_FLAGS);
  const hasSavedRef = useRef(false);
  const hasFetchedPreviousRef = useRef(false);
  const hasFetchedSafetyRef = useRef(false);
  const acneCanvasRef = useRef<HTMLCanvasElement>(null);

  // The ONLY input to severity/pattern scoring — pre-filled from
  // YOLO11m + landmark left/right split (lib/landmarks.ts), but never
  // trusted silently: the user must review and tick "reviewed" (see
  // LesionReviewCard.tsx) before this can be saved. Raw YOLO output never
  // reaches scoring directly.
  const [confirmedCounts, setConfirmedCounts] = useState<ConfirmedCounts>(() =>
    suggestConfirmedCountsFromLandmarks(acneResult.boxes, landmarks)
  );
  const [reviewed, setReviewed] = useState(false);

  const hayashi = useMemo(
    () =>
      computeHayashiSeverity(
        confirmedCounts.leftPapules,
        confirmedCounts.leftPustules,
        confirmedCounts.rightPapules,
        confirmedCounts.rightPustules
      ),
    [confirmedCounts]
  );
  const nice = useMemo(
    () =>
      computeNiceCategory(
        totalPapules(confirmedCounts),
        totalPustules(confirmedCounts),
        confirmedCounts.nodules
      ),
    [confirmedCounts]
  );
  const pattern = useMemo(
    () =>
      determineAcnePattern(
        confirmedCounts.comedones,
        totalPapules(confirmedCounts),
        totalPustules(confirmedCounts),
        confirmedCounts.nodules
      ),
    [confirmedCounts]
  );
  const overall = useMemo(
    () =>
      computeOverallSeverity(
        hayashi.hayashiSeverity,
        confirmedCounts.nodules,
        nice.niceCategory,
        totalLesions(confirmedCounts) > 0
      ),
    [hayashi.hayashiSeverity, confirmedCounts, nice.niceCategory]
  );

  const confirmedTotal = totalLesions(confirmedCounts);
  // A confirmed-empty form (all zeros, explicitly reviewed) is a valid
  // "Clear" result — only an UNREVIEWED form with detected lesions blocks
  // saving, matching the same principle used throughout this project.
  const needsReview = acneResult.total > 0 && !reviewed;

  function handleCountsChange(counts: ConfirmedCounts) {
    setConfirmedCounts(counts);
  }

  const routine = useMemo(
    () =>
      generateRoutine({
        skinType: confirmedSkinType,
        acnePattern: pattern.pattern,
        overallSeverity: overall.overallSeverity,
        noduleNote: overall.note,
        weather,
        safetyFlags,
      }),
    [confirmedSkinType, pattern.pattern, overall.overallSeverity, overall.note, weather, safetyFlags]
  );

  function handleWeatherReady(w: WeatherData | null) {
    setWeather(w);
    setWeatherResolved(true);
  }

  function handleDownloadReport() {
    if (!acneCanvasRef.current) return;
    generatePdfReport({
      annotatedCanvas: acneCanvasRef.current,
      skinType: confirmedSkinType,
      skinConfidence: skinResult.topConfidence,
      acneResult,
      confirmedCounts,
      overall,
      pattern,
      weather,
      routine,
    });
  }

  // Fetches the user's Safety Profile once — active-treatment recommendations
  // are paused (not the analysis) if any contraindication flag is set.
  useEffect(() => {
    if (hasFetchedSafetyRef.current) return;
    hasFetchedSafetyRef.current = true;

    async function fetchSafetyProfile() {
      const supabase = createClient();
      const { data } = await supabase
        .from("profiles")
        .select("safety_flags")
        .eq("id", userId)
        .maybeSingle();
      if (data?.safety_flags) {
        setSafetyFlags({ ...DEFAULT_SAFETY_FLAGS, ...data.safety_flags });
      }
    }

    fetchSafetyProfile();
  }, [userId]);

  // Fetches the user's most recent EXISTING scan once, before this one is
  // saved, so "Improvement Insights" has a genuine "previous" to compare
  // against (not the one we're about to insert).
  useEffect(() => {
    if (hasFetchedPreviousRef.current) return;
    hasFetchedPreviousRef.current = true;

    async function fetchPrevious() {
      const supabase = createClient();
      const { data } = await supabase
        .from("scans")
        .select("total_lesions, overall_severity")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) setPreviousScan(data as PreviousScanSummary);
    }

    fetchPrevious();
  }, []);

  // Saves one row per completed scan to Supabase — powers the /history
  // page's progress tracking. Only happens once the user explicitly
  // confirms the lesion-count review (see the "Confirm & Save" button
  // below) — saving before review would lock in a possibly-wrong count.
  async function saveScan() {
    if (hasSavedRef.current) return;
    hasSavedRef.current = true;
    setSaveStatus("saving");
    const supabase = createClient();
    const { error } = await supabase.from("scans").insert({
      user_id: userId,
      skin_type: confirmedSkinType,
      skin_confidence: skinResult.topConfidence,
      lesion_counts: acneResult.counts,
      total_lesions: acneResult.total,
      confirmed_counts: confirmedCounts,
      overall_severity: overall.overallSeverity,
      acne_pattern: pattern.pattern,
      weather: weather,
      routine: routine,
      recommendation_paused: routine.recommendationPaused,
      paused_reasons: routine.pausedReasons,
      professional_evaluation_recommended: routine.professionalEvaluationRecommended,
    });
    setSaveStatus(error ? "error" : "saved");
    if (error) {
      hasSavedRef.current = false; // allow retry on failure
      console.error("Failed to save scan:", error.message);
    }
  }

  return (
    <div className="dashboard-content animate-fadeUp">
      <section className="analysis-hero">
        <div className="analysis-hero-copy">
          <p className="eyebrow">AI SKIN ANALYSIS SUMMARY</p>
          <h1>Your Skin Analysis is Complete</h1>
          <p className="analysis-hero-description">
            Here&rsquo;s what we found in your skin scan, with personalized
            recommendations based on your skin type, acne severity and local weather.
          </p>
          <div className="analysis-hero-badge">
            <span className="hero-sparkle" aria-hidden="true">✦</span>
            SkinWISE AI <span aria-hidden="true">·</span> YOLO11m acne detection
          </div>
        </div>
        <div className="analysis-hero-photo">
          <img src={imageSrc} alt="Photo used for your skin analysis" />
          <div className="hero-photo-caption">Your scan · analyzed privately on this device</div>
        </div>
        <div className="analysis-hero-promise">
          <span>Better Analysis</span>
          <span>for Healthier Skin</span>
          <i aria-hidden="true" />
        </div>
      </section>

      <AnalysisPipeline
        weatherStatus={!weatherResolved ? "pending" : weather ? "done" : "skipped"}
      />

      {analysisWarning && (
        <p className="rounded-xl border border-[#D9A441]/40 bg-[#D9A441]/[0.08] px-4 py-3 text-sm text-[#765817]">
          {analysisWarning}
        </p>
      )}

      <AnalysisSummaryCard
        skinType={confirmedSkinType}
        overallSeverity={overall.overallSeverity}
        reviewed={reviewed}
        totalLesions={acneResult.total}
        confidence={skinResult.topConfidence}
        analysisTimeSec={(skinInferenceMs + acneInferenceMs) / 1000}
        recommendationPaused={routine.recommendationPaused}
      />

      <div className="analysis-results-grid">
      <div className="skin-results-overview">
        <ResultPanel result={skinResult} imageSrc={imageSrc} />

        {confirmedSkinType !== skinResult.topClass && (
          <p className="mt-3 text-xs text-muted">
            You confirmed this as <strong>{CLASS_META[confirmedSkinType].label.toLowerCase()}</strong> skin
            via the quiz — the routine below uses that instead of the scan&rsquo;s top result.
          </p>
        )}
      </div>

      <div id="acne-detection" className="acne-results-card rounded-2xl border border-line bg-panel panel-elevated p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <p className="font-mono text-[11px] uppercase tracking-wider text-muted">
            Acne lesion detection · YOLO11m
          </p>
        </div>

        <AcneCanvas ref={acneCanvasRef} imageSrc={imageSrc} detection={acneResult} />

        <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {ACNE_CLASS_ORDER.map((cls) => (
            <div key={cls} className="text-center rounded-xl bg-paper border border-line py-3">
              <p className="font-display text-2xl" style={{ color: ACNE_CLASS_META[cls].hex }}>
                {acneResult.counts[cls]}
              </p>
              <p className="text-xs text-muted mt-0.5">{ACNE_CLASS_META[cls].label}</p>
            </div>
          ))}
        </div>

        <p className="text-sm text-ink/70 mt-5 mb-5">
          {acneResult.total === 0
            ? "No lesions detected — this photo reads as clear."
            : `${acneResult.total} total lesion${acneResult.total === 1 ? "" : "s"} detected by YOLO11m — confirm the counts below before they're used for severity grading.`}
        </p>

        <div className="pt-5 border-t border-line">
          <SeverityMeter
            overallSeverity={overall.overallSeverity}
            noduleCount={confirmedCounts.nodules}
          />
        </div>
      </div>
      </div>

      <LesionReviewCard
        counts={confirmedCounts}
        onChange={handleCountsChange}
        landmarksAvailable={!!landmarks}
        reviewed={reviewed}
        onReviewedChange={setReviewed}
      />

      <div className="flex items-center justify-between rounded-2xl border border-line bg-panel panel-elevated px-6 py-4">
        <p className="text-xs text-muted">
          {saveStatus === "pending" &&
            (needsReview
              ? `${acneResult.total} lesion${acneResult.total === 1 ? "" : "s"} detected — check the counts above and tick "reviewed" before saving.`
              : "Review the counts above, then confirm to save this scan and see your routine.")}
          {saveStatus === "saving" && "Saving to your history…"}
          {saveStatus === "saved" && "✓ Saved to your history"}
          {saveStatus === "error" && "Couldn't save this scan — check your connection and try again"}
        </p>
        {saveStatus !== "saved" && (
          <button
            onClick={saveScan}
            disabled={saveStatus === "saving" || needsReview}
            className="shrink-0 rounded-lg bg-ink text-paper text-sm font-medium px-4 py-2 disabled:opacity-60"
          >
            {saveStatus === "saving" ? "Saving…" : saveStatus === "error" ? "Retry" : "Confirm & Save"}
          </button>
        )}
      </div>

      {previousScan && (
        <ImprovementInsights
          previousTotalLesions={previousScan.total_lesions}
          previousOverallSeverity={previousScan.overall_severity}
          currentTotalLesions={confirmedTotal}
          currentOverallSeverity={overall.overallSeverity}
        />
      )}

      <div id="weather" className="weather-section">
        <WeatherCard onWeatherReady={handleWeatherReady} />
      </div>

      <RoutineCard
        id="routine"
        routine={routine}
        skinType={confirmedSkinType}
        overallSeverity={overall.overallSeverity}
        acnePattern={pattern.pattern}
        hasWeather={weather !== null}
        reviewed={reviewed || acneResult.total === 0}
      />

      <p className="text-xs text-muted -mt-4">
        <a href="/safety-profile" className="underline underline-offset-4 hover:text-ink">
          Manage your Safety Profile
        </a>{" "}
        — update this anytime if your situation changes.
      </p>

      <TechnicalDetailsCard skinInferenceMs={skinInferenceMs} acneInferenceMs={acneInferenceMs} />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button
            onClick={onReset}
            className="focus-ring text-sm font-medium underline underline-offset-4 text-ink/70 hover:text-ink"
          >
            Scan another photo
          </button>
          <button
            onClick={handleDownloadReport}
            className="focus-ring inline-flex items-center gap-2 rounded-full bg-ink text-paper px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M12 16V4M12 16l-4-4M12 16l4-4M4 20h16"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Download PDF report
          </button>
        </div>
      </div>
    </div>
  );
}
