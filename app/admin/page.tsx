import AppShell from "@/components/AppShell";
import AdminPanel from "@/components/AdminPanel";
import { requireAdmin } from "@/lib/supabase/admin";

export default async function AdminPage() {
  const { user } = await requireAdmin();

  return (
    <AppShell
      activeSection="home"
      email={user.email ?? ""}
      fullName={user.user_metadata?.full_name ?? null}
      pageTitle="Administration"
    >
      <AdminPanel />
    </AppShell>
  );
}
