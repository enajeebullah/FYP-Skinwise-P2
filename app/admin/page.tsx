import AdminPanel from "@/components/AdminPanel";
import { requireAdmin } from "@/lib/supabase/admin";

export default async function AdminPage() {
  const { user } = await requireAdmin();

  return <AdminPanel email={user.email ?? ""} fullName={user.user_metadata?.full_name ?? null} />;
}
