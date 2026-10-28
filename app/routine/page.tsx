
import Link from "next/link";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { createClient } from "@/lib/supabase/server";
import { isRoutine } from "@/lib/routineValidation";
import {
  activeSafetyReasons,
  DEFAULT_SAFETY_FLAGS,
  type SafetyFlags,
} from "@/lib/constants";

interface SavedRoutineScan {
  created_at: string;
  skin_type: string;
  overall_severity: string;
  acne_pattern: string | null;
  weather: {
    temperatureC: number;
    humidityPct: number;
    uvIndex: number;
  } | null;
  routine: unknown;
}

function ProductStep({
  number,
  title,
  product,
  instruction,
  accent,
}: {
  number: string;
  title: string;
  product: string;
  instruction: string;
  accent: "morning" | "evening";
}) {
  const image =
    title === "Cleanse"
      ? "/images/products/cleanser.svg"
      : title === "Moisturize"
        ? "/images/products/moisturizer.svg"
        : title === "Protect"
          ? "/images/products/sunscreen.svg"
          : "/images/products/acne-care.svg";

  return (
    <li className="routine-step">
      <span
        className={`routine-step-number routine-step-number-${accent}`}
      >
        {number}
      </span>

      <span className="routine-step-image" aria-hidden="true">
        <img src={image} alt="" />
      </span>

      <div className="routine-step-content">
        <div className="routine-step-heading">
          <h3>{title}</h3>
          <span>{product}</span>
        </div>

        <p>{instruction}</p>
      </div>

      <span className="routine-step-arrow" aria-hidden="true">
        ›
      </span>
    </li>
  );
}

export default async function RoutinePage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data, error } = await supabase
    .from("scans")
    .select("created_at, skin_type, overall_severity, acne_pattern, weather, routine")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: profile, error: safetyProfileError } = await supabase
    .from("profiles")
    .select("safety_flags")
    .eq("id", user.id)
    .maybeSingle();

  const safetyFlags: SafetyFlags = {
    ...DEFAULT_SAFETY_FLAGS,
    ...(profile?.safety_flags ?? {}),
  };
  const currentSafetyReasons = activeSafetyReasons(safetyFlags);
  const currentSafetyPauseMessage =
    currentSafetyReasons.length > 0
      ? "Your personalised routine is paused because of your Safety Profile: " +
        currentSafetyReasons.join(" ") +
        " Your skin type and acne analysis above are unaffected — please consult a healthcare professional before starting a skincare routine."
      : null;

  const scan = data as SavedRoutineScan | null;

  const routine =
    scan && isRoutine(scan.routine) ? scan.routine : null;

  /*
   * Keep ALL valid acne-care items.
   *
   * Important:
   * We use filter() instead of find().
   *
   * Example:
   * Moderate + Dry
   * → Adapalene
   * → Azelaic acid
   *
   * Both will now appear in the Routine page.
   */
  const acneCareItems =
    routine?.acneCare.filter(
      (item) =>
        item.ingredient !== "No acne-care ingredient needed" &&
        item.ingredient !== "Recommendation paused" &&
        item.ingredient !== "Acne-care guidance withheld"
    ) ?? [];
  const morningAcneCareItems = acneCareItems.filter(
    (item) => item.timeOfDay === "AM"
  );
  // Older saved routines may not include timeOfDay. Keep those items in
  // Evening, matching the legacy timetable behavior.
  const eveningAcneCareItems = acneCareItems.filter(
    (item) => item.timeOfDay !== "AM"
  );
  const acneCareInputInconsistent = routine?.acneCare.find(
    (item) => item.ingredient === "Acne-care guidance withheld"
  );

  return (
    <AppShell
      activeSection="routine"
      email={user.email ?? ""}
      fullName={user.user_metadata?.full_name ?? null}
      pageTitle="Your routine"
    >
      <main className="dashboard-content routine-guide-page daily-routine-page">
        <header className="routine-guide-hero">
          <div>
            <p className="routine-guide-eyebrow">
              YOUR PERSONALIZED PLAN
            </p>

            <h1>Your Skincare Routine</h1>

            <p>
              Follow this routine daily. It reflects your latest confirmed
              scan and its saved recommendations.
            </p>
          </div>

          <div
            className="routine-guide-hero-icon"
            aria-hidden="true"
          >
            ✦
          </div>
        </header>

        {error ? (
          <section
            className="routine-guide-state routine-guide-error"
            role="alert"
          >
            <h2>We couldn’t load your routine</h2>
            <p>{error.message}</p>
          </section>
        ) : safetyProfileError ? (
          <section
            className="routine-guide-state routine-guide-error"
            role="alert"
          >
            <h2>We couldn’t verify your Safety Profile</h2>
            <p>
              Personalized routine steps are hidden until your saved safety
              settings can be checked. Refresh this page and try again.
            </p>
          </section>
        ) : !scan ? (
          <section className="routine-guide-state">
            <span
              className="routine-guide-state-icon"
              aria-hidden="true"
            >
              ✧
            </span>

            <h2>Your routine will appear here</h2>

            <p>
              Complete a skin scan and confirm its results to get a routine
              tailored to your latest analysis.
            </p>

            <Link
              className="routine-guide-link-button"
              href="/#scanner"
            >
              Start a skin scan
            </Link>
          </section>
        ) : !routine ? (
          <section
            className="routine-guide-state routine-guide-error"
            role="alert"
          >
            <h2>This saved routine couldn’t be displayed</h2>

            <p>Run a new scan to generate a fresh routine.</p>

            <Link
              className="routine-guide-link-button"
              href="/#scanner"
            >
              Start a new scan
            </Link>
          </section>
        ) : (
          <>
            <div className="routine-guide-meta">
              <span className="routine-meta-item">
                <small>Skin type</small>
                <strong>{scan.skin_type}</strong>
              </span>

              {scan.acne_pattern && (
                <span className="routine-meta-item">
                  <small>Acne pattern</small>
                  <strong>{scan.acne_pattern.replace(/_/g, " ")}</strong>
                </span>
              )}

              <span className="routine-meta-item">
                <small>Severity</small>
                <strong>{scan.overall_severity}</strong>
              </span>

              {scan.weather && (
                <span className="routine-meta-item">
                  <small>Weather at scan</small>
                  <strong>
                    {Math.round(scan.weather.temperatureC)}°C · RH{" "}
                    {Math.round(scan.weather.humidityPct)}% · UV{" "}
                    {scan.weather.uvIndex}
                  </strong>
                </span>
              )}

              <span className="routine-meta-date">
                Latest scan ·{" "}
                {new Date(scan.created_at).toLocaleDateString(
                  undefined,
                  {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  }
                )}
              </span>
            </div>

            {currentSafetyReasons.length > 0 || routine.recommendationPaused ? (
              <section className="routine-guide-alert routine-guide-paused">
                <span
                  className="routine-guide-alert-icon"
                  aria-hidden="true"
                >
                  !
                </span>

                <div>
                  <h2>Personalised steps are paused</h2>

                  <p>
                    {currentSafetyPauseMessage ??
                      "This saved routine was paused when its scan was saved."}
                  </p>
                  {currentSafetyReasons.length === 0 && (
                    <>
                      <p>
                        Its original personalized recommendations are
                        unavailable. A new scan may be required to generate
                        an updated routine for your current Safety Profile.
                      </p>
                      <Link
                        className="routine-guide-link-button"
                        href="/#scanner"
                      >
                        Start a new scan
                      </Link>
                    </>
                  )}
                </div>
              </section>
            ) : (
              <div className="routine-times">
                {/* =========================
                    MORNING ROUTINE
                   ========================= */}

                <section className="routine-time-card routine-time-morning">
                  <div className="routine-time-heading">
                    <span aria-hidden="true">☀</span>

                    <div>
                      <p>START YOUR DAY</p>
                      <h2>Morning</h2>
                    </div>

                    <span className="routine-time-period">AM</span>
                  </div>

                  <ol>
                    <ProductStep
                      number="01"
                      title="Cleanse"
                      product={routine.cleanser}
                      instruction="Gently wash your face, then pat it dry without rubbing."
                      accent="morning"
                    />

                    {morningAcneCareItems.map((item, index) => (
                      <ProductStep
                        key={`${item.ingredient}-${index}`}
                        number={String(index + 2).padStart(2, "0")}
                        title="Acne care"
                        product={item.ingredient}
                        instruction={`Use only as directed on the product label.${
                          item.usageTip ? ` ${item.usageTip}` : ""
                        }`}
                        accent="morning"
                      />
                    ))}

                    <ProductStep
                      number={String(morningAcneCareItems.length + 2).padStart(
                        2,
                        "0"
                      )}
                      title="Moisturize"
                      product={routine.moisturizer}
                      instruction="Smooth a comfortable layer over your face and let it absorb."
                      accent="morning"
                    />

                    <ProductStep
                      number={String(morningAcneCareItems.length + 3).padStart(
                        2,
                        "0"
                      )}
                      title="Protect"
                      product={routine.sunscreen}
                      instruction="Apply as the final morning step, following the product label."
                      accent="morning"
                    />
                  </ol>

                  <p className="routine-time-footnote">
                    Use sunscreen as directed on its label, and reapply as
                    advised.
                  </p>
                </section>

                {/* =========================
                    EVENING ROUTINE
                   ========================= */}

                <section className="routine-time-card routine-time-evening">
                  <div className="routine-time-heading">
                    <span aria-hidden="true">☾</span>

                    <div>
                      <p>WIND DOWN</p>
                      <h2>Evening</h2>
                    </div>

                    <span className="routine-time-period">PM</span>
                  </div>

                  <ol>
                    {/* Step 01 — Cleanse */}

                    <ProductStep
                      number="01"
                      title="Cleanse"
                      product={routine.cleanser}
                      instruction="Wash away the day and pat your skin dry gently."
                      accent="evening"
                    />

                    {/* Acne-care steps */}

                    {eveningAcneCareItems.length > 0 ? (
                      eveningAcneCareItems.map((item, index) => (
                        <ProductStep
                          key={`${item.ingredient}-${index}`}
                          number={String(index + 2).padStart(2, "0")}
                          title="Acne care"
                          product={item.ingredient}
                          instruction={`Use only as directed on the product label.${
                            item.usageTip
                              ? ` ${item.usageTip}`
                              : ""
                          }`}
                          accent="evening"
                        />
                      ))
                    ) : acneCareInputInconsistent ? (
                      <li className="routine-evening-note">
                        <strong>Acne-care guidance withheld</strong>

                        <span>{acneCareInputInconsistent.reason}</span>
                      </li>
                    ) : routine.professionalEvaluationRecommended ? (
                      <li className="routine-evening-note">
                        <strong>
                          Acne-treatment step not included
                        </strong>

                        <span>
                          {routine.professionalEvaluationReason}
                        </span>
                      </li>
                    ) : morningAcneCareItems.length > 0 ? null : (
                      <li className="routine-evening-note">
                        <strong>
                          No acne-care step needed
                        </strong>

                        <span>
                          Continue with your regular evening skincare
                          steps.
                        </span>
                      </li>
                    )}

                    {/* Moisturizer number is dynamic */}

                    <ProductStep
                      number={String(
                        eveningAcneCareItems.length + 2
                      ).padStart(2, "0")}
                      title="Moisturize"
                      product={routine.moisturizer}
                      instruction="Finish with a layer of moisturizer to keep your skin comfortable."
                      accent="evening"
                    />
                  </ol>
                </section>
              </div>
            )}

            {routine.professionalEvaluationRecommended &&
              !routine.recommendationPaused && (
                <section className="routine-guide-alert routine-guide-clinical">
                  <span
                    className="routine-guide-alert-icon"
                    aria-hidden="true"
                  >
                    +
                  </span>

                  <div>
                    <h2>
                      Professional evaluation recommended
                    </h2>

                    <p>
                      {routine.professionalEvaluationReason}
                    </p>
                  </div>
                </section>
              )}

            <p className="routine-guide-disclaimer">
              These steps are general skincare guidance, not a
              prescription. Follow each product’s label, introduce new
              products cautiously, and check with a healthcare professional
              if you are unsure what is suitable for you.
            </p>
          </>
        )}
      </main>
    </AppShell>
  );
}
