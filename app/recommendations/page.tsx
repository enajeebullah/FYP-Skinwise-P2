import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import RoutineCard from "@/components/RoutineCard";
import { isRoutine } from "@/lib/routineValidation";
import type { SkinClass } from "@/lib/constants";
import type { OverallSeverity } from "@/lib/overallSeverity";
import type { AcnePattern } from "@/lib/acnePattern";
import { createClient } from "@/lib/supabase/server";

interface SavedRecommendationScan {
  created_at: string;
  skin_type: string;
  overall_severity: string;
  acne_pattern: string;
  weather: unknown;
  routine: unknown;
}

const SKIN_CLASSES: SkinClass[] = ["dry", "normal", "oily"];
const SEVERITIES: OverallSeverity[] = ["clear", "mild", "moderate", "severe"];
const ACNE_PATTERNS: AcnePattern[] = [
  "clear",
  "comedonal_dominant",
  "inflammatory_dominant",
  "mixed",
];

export default async function RecommendationsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data, error } = await supabase
    .from("scans")
    .select("created_at, skin_type, overall_severity, acne_pattern, weather, routine")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const scan = data as SavedRecommendationScan | null;
  const routine = scan && isRoutine(scan.routine) ? scan.routine : null;
  const skinType =
    scan && SKIN_CLASSES.includes(scan.skin_type as SkinClass)
      ? (scan.skin_type as SkinClass)
      : null;
  const overallSeverity =
    scan && SEVERITIES.includes(scan.overall_severity as OverallSeverity)
      ? (scan.overall_severity as OverallSeverity)
      : null;
  const acnePattern =
    scan && ACNE_PATTERNS.includes(scan.acne_pattern as AcnePattern)
      ? (scan.acne_pattern as AcnePattern)
      : null;

  return (
    <AppShell
      activeSection="recommendations"
      email={user.email ?? ""}
      fullName={user.user_metadata?.full_name ?? null}
      pageTitle="Product recommendations"
    >
      <main className="dashboard-content routine-guide-page">
        <header className="routine-guide-hero">
          <div>
            <p className="routine-guide-eyebrow">PERSONALISED FOR YOUR SKIN</p>
            <h1>What to use</h1>
            <p>
              Product types and acne-care ingredients selected from your
              latest confirmed scan.
            </p>
          </div>
          <div className="routine-guide-hero-icon" aria-hidden="true">✧</div>
        </header>

        {error ? (
          <section className="routine-guide-state routine-guide-error" role="alert">
            <h2>We couldn’t load your recommendations</h2>
            <p>{error.message}</p>
          </section>
        ) : !scan ? (
          <section className="routine-guide-state">
            <span className="routine-guide-state-icon" aria-hidden="true">✧</span>
            <h2>Recommendations will appear here</h2>
            <p>
              Complete a skin scan and confirm its results to see product
              recommendations matched to your skin.
            </p>
            <a className="routine-guide-link-button" href="/#scanner">
              Start a skin scan
            </a>
          </section>
        ) : !routine || !skinType || !overallSeverity || !acnePattern ? (
          <section className="routine-guide-state routine-guide-error" role="alert">
            <h2>These recommendations couldn’t be displayed</h2>
            <p>Run a new scan to generate a fresh recommendation set.</p>
            <a className="routine-guide-link-button" href="/#scanner">
              Start a new scan
            </a>
          </section>
        ) : (
          <div className="recommendations-page-card">
            <p className="recommendations-page-date">
              Latest confirmed scan ·{" "}
              {new Date(scan.created_at).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </p>
            <RoutineCard
              routine={routine}
              skinType={skinType}
              overallSeverity={overallSeverity}
              acnePattern={acnePattern}
              hasWeather={Boolean(scan.weather)}
              reviewed
            />
          </div>
        )}
      </main>
    </AppShell>
  );
}
