import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";
import ScannerApp from "@/components/ScannerApp";

export default async function Home() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Middleware already redirects unauthenticated requests to /login, but
  // this guard keeps the page safe even if middleware is ever bypassed.
  if (!user) {
    redirect("/login");
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
      activeSection="dashboard"
      email={user.email ?? ""}
      fullName={user.user_metadata?.full_name ?? null}
      pageTitle="Skin analysis"
      footer={
        <footer className="app-footer border-t border-line">
          <p className="text-xs text-muted">
            SkinWISE — Final Year Project, Faculty of Computing, Riphah
            International University. This scanner runs entirely in your
            browser; no photo leaves your device — only the summarised result
            (skin type, lesion counts, severity, routine) is saved to your
            account for progress tracking.
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
