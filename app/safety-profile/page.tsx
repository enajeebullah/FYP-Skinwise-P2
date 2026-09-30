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
      <div className="dashboard-content">
        <div className="max-w-2xl mx-auto w-full py-6">
          {!isOnboarding && (
            <a
              href="/"
              className="inline-flex items-center gap-1.5 text-sm text-ink/60 hover:text-ink transition-colors mb-6 focus-ring rounded"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Back to home
            </a>
          )}

          <p className="font-mono text-xs uppercase tracking-wider text-muted mb-2">
            {isOnboarding ? "Welcome to SkinWISE" : "Your account"}
          </p>
          <h1 className="font-display text-3xl mb-2">
            {isOnboarding ? "Quick safety check, before your first scan" : "Safety profile"}
          </h1>
          <p className="text-sm text-ink/70 mb-8 max-w-lg">
            These answers help SkinWISE decide when to pause your personalised
            routine — cleanser, moisturizer, sun protection, and ingredient
            guidance. Your skin type and acne analysis always run normally
            regardless. You can update this anytime from the Safety Profile
            link in the menu.
          </p>

          <SafetyProfileForm
            userId={user.id}
            initialFlags={initialFlags}
            isOnboarding={isOnboarding}
          />

          <p className="text-xs text-muted mt-8 border-t border-line pt-6">
            This is not a medical safety check. If you have any skin condition,
            open wound, or are taking medication, please consult a licensed
            healthcare professional before starting or changing any skincare
            routine.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
