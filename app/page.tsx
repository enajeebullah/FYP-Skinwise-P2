import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";
import LandingPage from "@/components/LandingPage";
import ScannerApp from "@/components/ScannerApp";

export default async function Home() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The root route is public; signed-out visitors see the landing page.
  if (!user) {
    return <LandingPage />;
  }

  // First-time users are sent to the Safety Profile once, right after
  // login — they can fill it in or skip it (see SafetyProfileForm). On
  // every subsequent login this is already true, so they land here directly.
  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarding_completed")
    .eq("id", user.id)
    .maybeSingle();

  if (profile && profile.onboarding_completed === false) {
    redirect("/safety-profile?onboarding=true");
  }

  return (
    <AppShell
      activeSection="home"
      email={user.email ?? ""}
      fullName={user.user_metadata?.full_name ?? null}
      pageTitle="Skin analysis"
      footer={
        <footer className="app-footer border-t border-line">
          <p className="text-xs text-muted">
            SkinWISE — Final Year Project, Faculty of Computing, Riphah
            International University.             Your photo is processed by the configured SkinWISE analysis
            service and is not saved to your account; only the summarised
            result (skin type, lesion counts, severity, routine) is saved for
            progress tracking.
          </p>
        </footer>
      }
    >
      <div className="dashboard-content">
        <div id="scanner">
          <ScannerApp userId={user.id} />
        </div>
      </div>
    </AppShell>
  );
}
