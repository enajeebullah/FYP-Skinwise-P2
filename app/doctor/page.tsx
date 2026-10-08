import DoctorDashboard from "@/components/DoctorDashboard";
import { requireDoctor } from "@/lib/supabase/doctor";

export default async function DoctorPage() {
  const { doctor } = await requireDoctor();

  return <DoctorDashboard doctorId={doctor.id} doctorName={doctor.name} />;
}
