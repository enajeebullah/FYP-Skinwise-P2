
import Link from "next/link";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { createClient } from "@/lib/supabase/server";
import { isRoutine } from "@/lib/routineValidation";

interface SavedRoutineScan {
  created_at: string;
  skin_type: string;
  overall_severity: string;
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
  return (
    <li className="routine-step">
      <span
        className={`routine-step-number routine-step-number-${accent}`}
      >
        {number}
      </span>

      <div className="routine-step-content">
        <div className="routine-step-heading">
          <h3>{title}</h3>
          <span>{product}</span>
        </div>

        <p>{instruction}</p>
      </div>
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
    .select("created_at, skin_type, overall_severity, routine")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

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
        item.ingredient !== "Recommendation paused"
    ) ?? [];

  return (
    <AppShell
      activeSection="routine"
      email={user.email ?? ""}
      fullName={user.user_metadata?.full_name ?? null}
      pageTitle="Your routine"
    >
      <main className="dashboard-content routine-guide-page">
        <header className="routine-guide-hero">
          <div>
            <p className="routine-guide-eyebrow">
              YOUR DAILY SKINCARE PLAN
            </p>

            <h1>Simple steps, morning to night</h1>

            <p>
              Follow the order below using the products selected for your
              latest confirmed scan.
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
              <span>{scan.skin_type} skin</span>

              <span>{scan.overall_severity} severity</span>

              <span>
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

            {routine.recommendationPaused ? (
              <section className="routine-guide-alert routine-guide-paused">
                <span
                  className="routine-guide-alert-icon"
                  aria-hidden="true"
                >
                  !
                </span>

                <div>
                  <h2>Personalised steps are paused</h2>

                  <p>{routine.reasons.cleanser}</p>
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
                  </div>

                  <ol>
                    <ProductStep
                      number="01"
                      title="Cleanse"
                      product={routine.cleanser}
                      instruction="Gently wash your face, then pat it dry without rubbing."
                      accent="morning"
                    />

                    <ProductStep
                      number="02"
                      title="Moisturize"
                      product={routine.moisturizer}
                      instruction="Smooth a comfortable layer over your face and let it absorb."
                      accent="morning"
                    />

                    <ProductStep
                      number="03"
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

                    {acneCareItems.length > 0 ? (
                      acneCareItems.map((item, index) => (
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
                    ) : routine.professionalEvaluationRecommended ? (
                      <li className="routine-evening-note">
                        <strong>
                          Acne-treatment step not included
                        </strong>

                        <span>
                          {routine.professionalEvaluationReason}
                        </span>
                      </li>
                    ) : (
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
                        acneCareItems.length + 2
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
