"use client";

import { useMemo, useRef, useState } from "react";
import HistoryChart from "@/components/HistoryChart";
import { createClient } from "@/lib/supabase/client";
import { ACNE_CLASS_META, ACNE_CLASS_ORDER } from "@/lib/constants";
import { OVERALL_SEVERITY_META, type OverallSeverity } from "@/lib/overallSeverity";

function formatScanDate(dateStr: string): string {
  const d = new Date(dateStr);
  const isToday = d.toDateString() === new Date().toDateString();
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (isToday) return `Today, ${time}`;
  return `${d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}, ${time}`;
}

// Matches the shape of a row in the `scans` table (see supabase/schema.sql).
interface ScanRow {
  id: string;
  created_at: string;
  skin_type: string;
  overall_severity: string;
  total_lesions: number;
  lesion_counts: Record<string, number>;
  routine: { cleanser?: string; moisturizer?: string; sunscreen?: string } | null;
}

interface HistoryViewProps {
  initialScans: ScanRow[];
  loadError: string | null;
  userId: string;
}

export default function HistoryView({ initialScans, loadError, userId }: HistoryViewProps) {
  const [scans, setScans] = useState<ScanRow[]>(initialScans);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [pendingDeleteAll, setPendingDeleteAll] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const latestScanRef = useRef<HTMLDetailsElement>(null);

  function viewLastScan() {
    const el = latestScanRef.current;
    if (!el) return;
    el.open = true;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const chartPoints = useMemo(
    () =>
      scans
        .slice()
        .reverse()
        .map((s) => ({ date: s.created_at, score: s.total_lesions })),
    [scans]
  );

  // "Best" here means the lowest total lesion count seen.
  const scores = chartPoints.map((p) => p.score);
  const bestScore = scores.length ? Math.min(...scores) : null;
  const avgScore = scores.length
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : null;
  const latestScore = scores.length ? scores[scores.length - 1] : null;

  async function confirmDelete(id: string) {
    setDeletingId(id);
    const supabase = createClient();
    const { error } = await supabase.from("scans").delete().eq("id", id);
    setDeletingId(null);
    setPendingDeleteId(null);
    if (error) {
      console.error("Failed to delete scan:", error.message);
      return;
    }
    setScans((prev) => prev.filter((s) => s.id !== id));
  }

  async function confirmDeleteAll() {
    setDeletingAll(true);
    const supabase = createClient();
    const { error } = await supabase.from("scans").delete().eq("user_id", userId);
    setDeletingAll(false);
    setPendingDeleteAll(false);
    if (error) {
      console.error("Failed to delete all scans:", error.message);
      return;
    }
    setScans([]);
  }

  return (
    <>
      <div className="flex flex-wrap gap-3">
        <button
          onClick={viewLastScan}
          disabled={scans.length === 0}
          className="focus-ring inline-flex items-center gap-2 rounded-full border border-line px-4 py-2 text-sm font-medium hover:bg-paper transition-colors disabled:opacity-40"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M12 8v4l3 2M21 12a9 9 0 1 1-3-6.7"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path d="M21 3v5h-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          View Last Scan
        </button>
        <a
          href="/"
          className="focus-ring inline-flex items-center gap-2 rounded-full bg-ink text-paper px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          New Scan
        </a>
      </div>

      <div className="rounded-2xl border border-line bg-panel panel-elevated p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-2">
          <p className="font-mono text-[11px] uppercase tracking-wider text-muted">
            Total lesions over time
          </p>
          {bestScore !== null && (
            <div className="flex items-center gap-5 font-mono text-[11px]">
              <span className="text-muted">
                Best <span className="text-ink font-medium">{bestScore}</span>
              </span>
              <span className="text-muted">
                Average <span className="text-ink font-medium">{avgScore}</span>
              </span>
              <span className="text-muted">
                Latest{" "}
                <span className="font-medium text-ink">{latestScore}</span>
              </span>
            </div>
          )}
        </div>
        <HistoryChart points={chartPoints} />
      </div>

      {loadError && (
        <p className="text-sm text-red-600">Couldn&rsquo;t load your history: {loadError}</p>
      )}

      {scans.length > 0 && (
        <div className="flex justify-end">
          {pendingDeleteAll ? (
            <div className="flex items-center gap-3 text-sm">
              <span className="text-ink/70">Delete all {scans.length} scans? This can&rsquo;t be undone.</span>
              <button
                onClick={confirmDeleteAll}
                disabled={deletingAll}
                className="focus-ring font-medium text-red-600 hover:underline disabled:opacity-50"
              >
                {deletingAll ? "Deleting…" : "Confirm delete all"}
              </button>
              <button
                onClick={() => setPendingDeleteAll(false)}
                className="focus-ring text-muted hover:text-ink"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setPendingDeleteAll(true)}
              className="focus-ring text-sm text-muted hover:text-red-600 underline underline-offset-4"
            >
              Delete all history
            </button>
          )}
        </div>
      )}

      {scans.length === 0 && (
        <div className="rounded-2xl border border-line bg-panel panel-elevated p-8 text-center">
          <p className="text-sm text-ink/70">
            No scans yet.{" "}
            <a href="/" className="underline underline-offset-4">
              Run your first scan
            </a>{" "}
            to start tracking your progress.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {scans.map((scan, index) => {
          const overallMeta = OVERALL_SEVERITY_META[(scan.overall_severity as OverallSeverity) ?? "clear"];
          const isPendingDelete = pendingDeleteId === scan.id;

          return (
            <details
              key={scan.id}
              ref={index === 0 ? latestScanRef : undefined}
              className="group rounded-2xl border border-line bg-panel panel-elevated overflow-hidden hover:border-ink/20 transition-colors"
            >
              <summary
                className="cursor-pointer list-none flex flex-wrap items-center justify-between gap-3 pl-4 pr-5 py-4"
                style={{ borderLeft: `4px solid ${overallMeta.hex}` }}
              >
                <div className="flex items-center gap-4">
                  <div
                    className="shrink-0 rounded-full px-3 py-2 font-mono text-xs"
                    style={{
                      backgroundColor: `${overallMeta.hex}1A`,
                      color: overallMeta.hex,
                    }}
                  >
                    {scan.total_lesions} lesion{scan.total_lesions === 1 ? "" : "s"}
                  </div>
                  <div>
                    <p className="text-sm font-medium capitalize">
                      {scan.skin_type} skin
                    </p>
                    <p className="text-xs text-muted mt-0.5">{formatScanDate(scan.created_at)}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className="text-xs font-medium px-2.5 py-1 rounded-full"
                    style={{ backgroundColor: `${overallMeta.hex}1A`, color: overallMeta.hex }}
                  >
                    Overall Severity: {overallMeta.label}
                  </span>
                  {isPendingDelete ? (
                    <span
                      className="flex items-center gap-1.5"
                      onClick={(e) => e.preventDefault()}
                    >
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          confirmDelete(scan.id);
                        }}
                        disabled={deletingId === scan.id}
                        className="focus-ring text-xs font-medium text-red-600 hover:underline disabled:opacity-50"
                      >
                        {deletingId === scan.id ? "Deleting…" : "Confirm delete"}
                      </button>
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setPendingDeleteId(null);
                        }}
                        className="focus-ring text-xs text-muted hover:text-ink"
                      >
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setPendingDeleteId(scan.id);
                      }}
                      aria-label="Delete this scan"
                      title="Delete this scan"
                      className="focus-ring text-muted hover:text-red-600 p-1.5 rounded-full hover:bg-red-50 transition-colors"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
                        <path
                          d="M4 7h16M9 7V4h6v3m-9 0 1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  )}
                </div>
              </summary>

              <div className="mx-5 mb-5 pt-4 border-t border-line grid sm:grid-cols-2 gap-6">
                <div>
                  <p className="text-xs font-mono uppercase tracking-wide text-muted mb-2">
                    Lesion breakdown
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {ACNE_CLASS_ORDER.map((cls) => (
                      <p key={cls} className="text-sm">
                        <span style={{ color: ACNE_CLASS_META[cls].hex }}>
                          {ACNE_CLASS_META[cls].label}
                        </span>
                        : {scan.lesion_counts?.[cls] ?? 0}
                      </p>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-xs font-mono uppercase tracking-wide text-muted mb-2">
                    Routine at the time
                  </p>
                  <p className="text-sm">{scan.routine?.cleanser}</p>
                  <p className="text-sm">{scan.routine?.moisturizer}</p>
                  <p className="text-sm">{scan.routine?.sunscreen}</p>
                </div>
              </div>
            </details>
          );
        })}
      </div>
    </>
  );
}
