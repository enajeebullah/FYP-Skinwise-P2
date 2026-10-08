import AppShell from "@/components/AppShell";
import ConsultationHub from "@/components/ConsultationHub";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function ConsultationsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=%2Fconsultations");
  }

  return (
    <AppShell
      activeSection="consultations"
      email={user.email ?? ""}
      fullName={user.user_metadata?.full_name ?? null}
      pageTitle="Dermatologist consultation"
    >
      <ConsultationHub patientId={user.id} />
    </AppShell>
  );
}
