"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ResultPanel from "./ResultPanel";
import AcneCanvas from "./AcneCanvas";
import SeverityMeter from "./SeverityMeter";
import WeatherCard from "./WeatherCard";
import RoutineCard from "./RoutineCard";
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
  const router = useRouter();
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
      return;
    }
    router.push("/#scanner");
  }

  return (
    <div className="dashboard-content animate-fadeUp">
      <header className="scan-result-header">
        <div className="scan-result-heading">
          <button
            type="button"
            className="scan-result-mark focus-ring"
            onClick={onReset}
            aria-label="Back to scan"
          >
            ←
          </button>
          <div>
            <p className="eyebrow">SCAN RESULTS</p>
            <h1>Your skin analysis results</h1>
          </div>
        </div>
        <div className="scan-result-actions">
          <span className="scan-result-complete"><i aria-hidden="true">✓</i> Analysis complete</span>
          <button
            onClick={handleDownloadReport}
            className="focus-ring scan-result-download"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M12 15V3m0 12 4-4m-4 4-4-4M4 16v4h16v-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Download PDF
          </button>
        </div>
      </header>

      {analysisWarning && (
        <p className="rounded-xl border border-[#D9A441]/40 bg-[#D9A441]/[0.08] px-4 py-3 text-sm text-[#765817]">
          {analysisWarning}
        </p>
      )}

      <AnalysisPipeline
        weatherStatus={!weatherResolved ? "pending" : weather ? "done" : "skipped"}
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
          <div className="acne-results-heading">
            <span className="acne-results-icon" aria-hidden="true">✳</span>
            <div>
              <h2>Acne lesion detection</h2>
              <p>Detected lesions are highlighted on your face.</p>
            </div>
          </div>

          <AcneCanvas ref={acneCanvasRef} imageSrc={imageSrc} detection={acneResult} />

          <div className="lesion-count-grid" aria-label="Lesion counts for review">
            {ACNE_CLASS_ORDER.map((cls) => {
              const count =
                cls === "comedone"
                  ? confirmedCounts.comedones
                  : cls === "nodules"
                    ? confirmedCounts.nodules
                    : cls === "papules"
                      ? totalPapules(confirmedCounts)
                      : totalPustules(confirmedCounts);

              return (
                <div className={`lesion-count-card lesion-count-${cls}`} key={cls}>
                  <span className="lesion-count-symbol" aria-hidden="true">
                    {cls === "comedone" ? "●" : cls === "nodules" ? "✦" : cls === "papules" ? "●" : "◉"}
                  </span>
                  <span className="lesion-count-label">{ACNE_CLASS_META[cls].label}</span>
                  <strong>{count}</strong>
                </div>
              );
            })}
          </div>

          <details className="count-edit-disclosure">
            <summary>{reviewed ? "Counts reviewed · edit counts" : "Review or edit lesion counts"}</summary>
            <LesionReviewCard
              counts={confirmedCounts}
              onChange={handleCountsChange}
              landmarksAvailable={!!landmarks}
              reviewed={reviewed}
              onReviewedChange={setReviewed}
            />
          </details>
        </div>
      </div>

      <div className="scan-confirm-bar">
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
            {saveStatus === "saving" ? "Saving…" : saveStatus === "error" ? "Retry" : "Confirm counts & save"}
          </button>
        )}
      </div>

      <section className="severity-results-card" aria-labelledby="severity-title">
        <div className="severity-results-heading">
          <span className="severity-results-icon" aria-hidden="true">✧</span>
          <h2 id="severity-title">Overall severity</h2>
        </div>
        <SeverityMeter
          overallSeverity={overall.overallSeverity}
        />
        {overall.overallSeverity === "severe" && (
          <div className="mt-5 rounded-xl border border-[#B23A48]/30 bg-[#B23A48]/[0.06] p-4">
            <p className="text-sm font-medium text-[#8F2F3A]">
              Dermatologist consultation is recommended.
            </p>
            <p className="mt-1 text-xs leading-5 text-ink/70">
              This AI-assisted result is not a diagnosis. A dermatologist will independently evaluate your concerns.
            </p>
            <a
              href="/consultations"
              className="mt-3 inline-flex rounded-lg bg-[#175BB3] px-4 py-2 text-sm font-medium text-white hover:bg-[#124A91]"
            >
              Consult Dermatologist Online
            </a>
          </div>
        )}
      </section>

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
        id="recommendations"
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
        </div>
      </div>
    </div>
  );
}
