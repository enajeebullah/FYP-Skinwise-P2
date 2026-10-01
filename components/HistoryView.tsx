"use client";

import { useMemo, useRef, useState } from "react";
import HistoryChart from "@/components/HistoryChart";
import { createClient } from "@/lib/supabase/client";
import { ACNE_CLASS_META, ACNE_CLASS_ORDER } from "@/lib/constants";
import {
  OVERALL_SEVERITY_META,
  type OverallSeverity,
} from "@/lib/overallSeverity";

const SEVERITY_ORDER: OverallSeverity[] = ["clear", "mild", "moderate", "severe"];
type DateRange = "7" | "30" | "90" | "all";

function isSeverity(value: string): value is OverallSeverity {
  return SEVERITY_ORDER.includes(value as OverallSeverity);
}

function getSeverity(value: string): OverallSeverity {
  return isSeverity(value) ? value : "clear";
}

function formatScanDate(dateStr: string): string {
  const date = new Date(dateStr);
  const isToday = date.toDateString() === new Date().toDateString();
  const time = date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  if (isToday) return `Today · ${time}`;
  return `${date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })} · ${time}`;
}

function formatShortDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function severityAverage(scans: ScanRow[]): OverallSeverity | null {
  if (!scans.length) return null;
  const average =
    scans.reduce((sum, scan) => sum + SEVERITY_ORDER.indexOf(getSeverity(scan.overall_severity)), 0) /
    scans.length;
  return SEVERITY_ORDER[Math.round(average)];
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

export default function HistoryView({
  initialScans,
  loadError,
  userId,
}: HistoryViewProps) {
  const [scans, setScans] = useState<ScanRow[]>(initialScans);
  const [severityFilter, setSeverityFilter] = useState<OverallSeverity | "all">(
    "all"
  );
  const [dateRange, setDateRange] = useState<DateRange>("all");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [pendingDeleteAll, setPendingDeleteAll] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const latestScanRef = useRef<HTMLDetailsElement>(null);

  function viewLastScan() {
    const element = latestScanRef.current;
    if (!element) return;
    element.open = true;
    element.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const visibleScans = useMemo(() => {
    const cutoff =
      dateRange === "all"
        ? null
        : Date.now() - Number(dateRange) * 24 * 60 * 60 * 1000;
    return scans.filter((scan) => {
      const matchesSeverity =
        severityFilter === "all" ||
        getSeverity(scan.overall_severity) === severityFilter;
      const matchesDate =
        cutoff === null || new Date(scan.created_at).getTime() >= cutoff;
      return matchesSeverity && matchesDate;
    });
  }, [dateRange, scans, severityFilter]);

  const chartPoints = useMemo(
    () =>
      visibleScans
        .slice()
        .reverse()
        .map((scan) => ({
          date: scan.created_at,
          severity: getSeverity(scan.overall_severity),
        })),
    [visibleScans]
  );

  const average = severityAverage(scans);
  const latestScan = scans[0] ?? null;
  const firstSeverity = scans.length
    ? SEVERITY_ORDER.indexOf(getSeverity(scans[scans.length - 1].overall_severity))
    : null;
  const latestSeverity = latestScan
    ? SEVERITY_ORDER.indexOf(getSeverity(latestScan.overall_severity))
    : null;
  const trend =
    firstSeverity === null || latestSeverity === null
      ? "Just starting"
      : latestSeverity < firstSeverity
        ? "Improving"
        : latestSeverity > firstSeverity
          ? "Needs attention"
          : "Steady";
  const trendColor =
    trend === "Improving" ? "#299A7A" : trend === "Needs attention" ? "#E17A68" : "#6675D9";

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
    setScans((previous) => previous.filter((scan) => scan.id !== id));
  }

  async function confirmDeleteAll() {
    setDeletingAll(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("scans")
      .delete()
      .eq("user_id", userId);
    setDeletingAll(false);
    setPendingDeleteAll(false);
    if (error) {
      console.error("Failed to delete all scans:", error.message);
      return;
    }
    setScans([]);
  }

  return (
    <div className="history-page">
      <header className="history-hero">
        <span className="history-hero-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="8.5" />
            <path d="M12 7v5l3 2" />
          </svg>
        </span>
        <div>
          <p>SCAN HISTORY</p>
          <h1>Your Scan History</h1>
          <span>View and track your previous scans and skin progress over time.</span>
        </div>
        <div className="history-hero-art" aria-hidden="true">
          <span className="history-art-orbit" />
          <span className="history-art-card history-art-card-back">◉</span>
          <span className="history-art-card history-art-card-front">✦</span>
          <span className="history-art-caption">Better<br />Skin Journey ♡</span>
        </div>
      </header>

      {loadError && (
        <p className="history-load-error" role="alert">
          Couldn&rsquo;t load your history: {loadError}
        </p>
      )}

      <section className="history-stat-grid" aria-label="Scan history summary">
        <article className="history-stat-card history-stat-total">
          <span className="history-stat-icon" aria-hidden="true">▧</span>
          <div>
            <p>Total Scans</p>
            <strong>{scans.length}</strong>
            <small>{scans.length ? "Your saved skin check-ins" : "Start with your first scan"}</small>
          </div>
        </article>
        <article
          className="history-stat-card history-stat-average"
          title="Rounded mean of saved severity categories, ranked from Clear to Severe"
        >
          <span className="history-stat-icon" aria-hidden="true">✓</span>
          <div>
            <p>Avg. Severity</p>
            <strong>{average ? OVERALL_SEVERITY_META[average].label : "—"}</strong>
            <small>{scans.length ? `Across ${scans.length} scan${scans.length === 1 ? "" : "s"}` : "No scans yet"}</small>
          </div>
        </article>
        <article className="history-stat-card history-stat-latest">
          <span className="history-stat-icon" aria-hidden="true">▦</span>
          <div>
            <p>Latest Scan</p>
            <strong className="history-stat-date">
              {latestScan ? formatShortDate(latestScan.created_at) : "—"}
            </strong>
            <small style={{ color: latestScan ? OVERALL_SEVERITY_META[getSeverity(latestScan.overall_severity)].hex : undefined }}>
              {latestScan ? OVERALL_SEVERITY_META[getSeverity(latestScan.overall_severity)].label : "Waiting for your first scan"}
            </small>
          </div>
        </article>
        <article
          className="history-stat-card history-stat-trend"
          title="Compares your oldest saved severity category with your latest"
        >
          <span className="history-stat-icon" aria-hidden="true">↗</span>
          <div>
            <p>Trend</p>
            <strong style={{ color: trendColor }}>{trend}</strong>
            <small>{scans.length > 1 ? "Compared with earlier scans" : "Need more scans to compare"}</small>
          </div>
        </article>
      </section>

      <section className="history-insights-grid">
        <article className="history-panel history-trend-panel">
          <div className="history-panel-heading">
            <div>
              <h2>Severity Trend</h2>
              <p>How your skin severity changed over time</p>
            </div>
            <label className="history-range-select">
              <span className="sr-only">Filter chart date range</span>
              <select
                value={dateRange}
                onChange={(event) => setDateRange(event.target.value as DateRange)}
              >
                <option value="7">Last 7 days</option>
                <option value="30">Last 30 days</option>
                <option value="90">Last 90 days</option>
                <option value="all">All scans</option>
              </select>
            </label>
          </div>
          <HistoryChart points={chartPoints} />
        </article>

        <aside className="history-panel history-filter-panel">
          <div className="history-panel-heading">
            <div>
              <h2><span aria-hidden="true">▽</span> Filter History</h2>
            </div>
          </div>
          <div className="history-filter-options" aria-label="Filter by severity">
            {(["all", ...SEVERITY_ORDER] as const).map((severity) => (
              <button
                key={severity}
                type="button"
                className={severityFilter === severity ? "active" : ""}
                aria-pressed={severityFilter === severity}
                onClick={() => setSeverityFilter(severity)}
              >
                {severity === "all"
                  ? "All"
                  : OVERALL_SEVERITY_META[severity].label}
              </button>
            ))}
          </div>
          <div className="history-filter-range">
            <span aria-hidden="true">▦</span>
            {dateRange === "all" ? "All scan dates" : `Last ${dateRange} days`}
            <span aria-hidden="true">⌄</span>
          </div>
          <div className="history-encouragement">
            <span aria-hidden="true">✧</span>
            <p>
              <strong>{trend === "Improving" ? "Your skin is getting better!" : "Every scan tells a story."}</strong>
              <small>Keep up with your routine and healthy habits.</small>
            </p>
          </div>
        </aside>
      </section>

      <section className="history-list-panel">
        <div className="history-list-heading">
          <div>
            <h2>Previous Scans</h2>
            <p>{visibleScans.length} of {scans.length} scans</p>
          </div>
          <div className="history-list-actions">
            <button
              type="button"
              onClick={viewLastScan}
              disabled={visibleScans.length === 0}
              className="history-view-last"
            >
              View latest
            </button>
            {scans.length > 0 && (
              pendingDeleteAll ? (
                <div className="history-delete-all-confirm">
                  <span>Delete all {scans.length} scans?</span>
                  <button type="button" onClick={confirmDeleteAll} disabled={deletingAll}>
                    {deletingAll ? "Deleting…" : "Confirm"}
                  </button>
                  <button type="button" onClick={() => setPendingDeleteAll(false)}>Cancel</button>
                </div>
              ) : (
                <button
                  type="button"
                  className="history-delete-all"
                  onClick={() => setPendingDeleteAll(true)}
                >
                  Delete all
                </button>
              )
            )}
          </div>
        </div>

        {scans.length === 0 ? (
          <div className="history-empty">
            <span aria-hidden="true">◷</span>
            <h3>Your history starts here</h3>
            <p>Complete a skin scan to begin tracking your progress over time.</p>
            <a href="/">Start your first scan</a>
          </div>
        ) : visibleScans.length === 0 ? (
          <div className="history-empty history-empty-filtered">
            <p>No scans match these filters.</p>
            <button
              type="button"
              onClick={() => {
                setSeverityFilter("all");
                setDateRange("all");
              }}
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div className="history-scan-list">
            {visibleScans.map((scan, index) => {
              const severity = getSeverity(scan.overall_severity);
              const severityMeta = OVERALL_SEVERITY_META[severity];
              const pending = pendingDeleteId === scan.id;
              const counts = scan.lesion_counts ?? {};

              return (
                <details
                  key={scan.id}
                  ref={index === 0 ? latestScanRef : undefined}
                  className="history-scan-row"
                >
                  <summary>
                    <span className={`history-scan-avatar history-avatar-${severity}`} aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none">
                        <path d="M12 3.5c-4 0-6.5 3.2-6.5 7.6v2.1c0 4.3 2.7 7.3 6.5 7.3s6.5-3 6.5-7.3v-2.1c0-4.4-2.5-7.6-6.5-7.6Z" />
                        <path d="M6 9c1.1-3.7 3.1-5.5 6-5.5s4.9 1.8 6 5.5M9 12h.01M15 12h.01" />
                      </svg>
                    </span>
                    <span className="history-scan-info">
                      <span className="history-scan-date">{formatScanDate(scan.created_at)}</span>
                      <span className="history-scan-type">◉ {scan.skin_type} skin</span>
                    </span>
                    <span className={`history-severity-pill history-severity-${severity}`}>
                      <i /> {severityMeta.label}
                    </span>
                    <span className="history-row-counts">
                      <span className="history-row-count-title">Lesion Count</span>
                      {ACNE_CLASS_ORDER.map((cls) => (
                        <span className="history-row-count" key={cls}>
                          <i style={{ backgroundColor: ACNE_CLASS_META[cls].hex }} />
                          {ACNE_CLASS_META[cls].label} {counts[cls] ?? 0}
                        </span>
                      ))}
                    </span>
                    {pending ? (
                      <span className="history-row-delete-confirm" onClick={(event) => event.preventDefault()}>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            confirmDelete(scan.id);
                          }}
                          disabled={deletingId === scan.id}
                        >
                          {deletingId === scan.id ? "Deleting…" : "Confirm"}
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            setPendingDeleteId(null);
                          }}
                        >
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <>
                        <span className="history-details-action" aria-hidden="true">View details</span>
                        <button
                          type="button"
                          className="history-delete-button"
                          aria-label={`Delete scan from ${formatScanDate(scan.created_at)}`}
                          title="Delete this scan"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            setPendingDeleteId(scan.id);
                          }}
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
                            <path d="M4 7h16M9 7V4h6v3m-9 0 1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                      </>
                    )}
                  </summary>

                  <div className="history-scan-details">
                    <div>
                      <h3>Lesion breakdown</h3>
                      <div className="history-detail-counts">
                        {ACNE_CLASS_ORDER.map((cls) => (
                          <span key={cls}>
                            <i style={{ backgroundColor: ACNE_CLASS_META[cls].hex }} />
                            {ACNE_CLASS_META[cls].label}: {counts[cls] ?? 0}
                          </span>
                        ))}
                      </div>
                      <p className="history-total-lesions">{scan.total_lesions} total lesions recorded</p>
                    </div>
                    <div>
                      <h3>Routine at the time</h3>
                      <p>{scan.routine?.cleanser || "No cleanser recorded"}</p>
                      <p>{scan.routine?.moisturizer || "No moisturizer recorded"}</p>
                      <p>{scan.routine?.sunscreen || "No sunscreen recorded"}</p>
                    </div>
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
