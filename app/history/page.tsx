import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";
import HistoryView from "@/components/HistoryView";

export default async function HistoryPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: scans, error } = await supabase
    .from("scans")
    .select(
      "id, created_at, skin_type, overall_severity, total_lesions, lesion_counts, routine"
    )
    .order("created_at", { ascending: false });

  return (
    <AppShell
      activeSection="history"
      email={user.email ?? ""}
      fullName={user.user_metadata?.full_name ?? null}
      pageTitle="Scan history"
    >
      <div className="dashboard-content">
        <div className="max-w-4xl mx-auto w-full space-y-8 py-6">
          <div>
            <p className="font-mono text-xs uppercase tracking-wider text-muted mb-2">
              Progress tracking
            </p>
            <h1 className="font-display text-3xl">Your scan history</h1>
          </div>

          <HistoryView
            initialScans={scans ?? []}
            loadError={error?.message ?? null}
            userId={user.id}
          />
        </div>
      </div>
    </AppShell>
  );
}
