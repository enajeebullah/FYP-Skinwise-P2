import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";
import SafetyProfileForm from "@/components/SafetyProfileForm";
import { DEFAULT_SAFETY_FLAGS, type SafetyFlags } from "@/lib/constants";

export default async function SafetyProfilePage({
  searchParams,
}: {
  searchParams: { onboarding?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("safety_flags, onboarding_completed")
    .eq("id", user.id)
    .maybeSingle();

  const initialFlags: SafetyFlags = {
    ...DEFAULT_SAFETY_FLAGS,
    ...(profile?.safety_flags ?? {}),
  };

  // Only treat this as the first-time onboarding gate if the query param
  // is set AND onboarding genuinely hasn't been completed yet — this stops
  // someone from bookmarking the ?onboarding=true URL and re-triggering
  // the "Skip for now" flow after they've already gone through it once.
  const isOnboarding = searchParams.onboarding === "true" && profile?.onboarding_completed === false;

  return (
    <AppShell
      activeSection="profile"
      email={user.email ?? ""}
      fullName={user.user_metadata?.full_name ?? null}
      pageTitle={isOnboarding ? "Welcome to SkinWISE" : "Skin profile"}
      showUserMenu={!isOnboarding}
    >
      <div className="dashboard-content safety-profile-page">
        <div className="safety-profile-card">
          <div className="safety-profile-intro">
            <div className="safety-profile-shield" aria-hidden="true">
              <svg viewBox="0 0 64 64" fill="none">
                <path d="M32 5 53 13v16c0 14-8.6 23.5-21 30C19.6 52.5 11 43 11 29V13L32 5Z" fill="currentColor" opacity=".16" />
                <path d="M32 8 50 15v14c0 12-7.2 20.4-18 26.3C21.2 49.4 14 41 14 29V15l18-7Z" fill="currentColor" />
                <path d="m23 31 6 6 13-14" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="safety-profile-intro-copy">
          <p className="safety-profile-eyebrow">
            {isOnboarding ? "Welcome to SkinWISE" : "Your account"}
          </p>
          {isOnboarding && (
            <ol className="onboarding-steps" aria-label="Onboarding progress">
              <li className="complete"><span>✓</span> Account</li>
              <li className="current" aria-current="step"><span>2</span> Safety profile</li>
              <li><span>3</span> First scan</li>
            </ol>
          )}
          <h1>
            {isOnboarding ? "Quick safety check, before your first scan" : "Safety Profile"}
          </h1>
          <p className="safety-profile-description">
            These answers help SkinWISE decide when to pause your personalised
            routine — cleanser, moisturizer, sun protection, and ingredient
            guidance. Your skin type and acne analysis always run normally
            regardless. You can update this anytime from the Safety Profile
            link in the menu.
          </p>
            </div>
            <aside className="safety-profile-privacy">
              <span aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none">
                  <path d="M12 3 20 6v6c0 5-3.3 8-8 10-4.7-2-8-5-8-10V6l8-3Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
                  <rect x="8.5" y="10.5" width="7" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.7" />
                  <path d="M10 10.5V9a2 2 0 1 1 4 0v1.5M12 12.5v1.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                </svg>
              </span>
              <div>
                <strong>Your health information</strong>
                <p>Your responses help inform personalized skincare recommendations.</p>
              </div>
            </aside>
          </div>

          <section className="safety-profile-section-heading">
            <span aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.8" />
                <path d="M5.5 20c.7-3.5 3-5.3 6.5-5.3s5.8 1.8 6.5 5.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </span>
            <div>
              <h2>Medical &amp; Health Information</h2>
              <p>Select all that apply. This helps us avoid unsuitable recommendations and ensure your safety.</p>
            </div>
          </section>

          <SafetyProfileForm
            userId={user.id}
            initialFlags={initialFlags}
            isOnboarding={isOnboarding}
          />

        </div>
      </div>
    </AppShell>
  );
}
