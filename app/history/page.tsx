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
      <div className="dashboard-content history-content">
        <HistoryView
          initialScans={scans ?? []}
          loadError={error?.message ?? null}
          userId={user.id}
        />
      </div>
    </AppShell>
  );
}
