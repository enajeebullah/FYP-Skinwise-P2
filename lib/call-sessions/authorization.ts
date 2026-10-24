import { createClient } from "@/lib/supabase/server";

export type AuthorizedAppointment = {
  id: string;
  patient_id: string;
  doctor_id: string;
  status: string;
  doctor: { user_id: string | null } | null;
};

export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export type AuthenticatedSession = {
  supabase: ReturnType<typeof createClient>;
  user: { id: string };
  error: null;
};

type AuthenticationResult = AuthenticatedSession | {
  supabase: ReturnType<typeof createClient>;
  user: null;
  error: "unauthorized";
};

export async function getAuthenticatedSession(): Promise<AuthenticationResult> {
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { supabase, user: null, error: "unauthorized" as const };
  }

  return { supabase, user, error: null };
}

export async function getAuthorizedAppointment(
  appointmentId: string,
  authenticated?: AuthenticatedSession
) {
  const session = authenticated ?? (await getAuthenticatedSession());
  if (session.error) {
    return { supabase: session.supabase, user: null, appointment: null, error: "unauthorized" as const };
  }

  const { supabase, user } = session;

  const { data: appointment, error: appointmentError } = await supabase
    .from("appointments")
    .select(
      "id, patient_id, doctor_id, status, doctor:doctors!appointments_doctor_id_fkey(user_id)"
    )
    .eq("id", appointmentId)
    .maybeSingle<AuthorizedAppointment>();

  if (appointmentError) {
    console.error("Could not load appointment for call lifecycle:", appointmentError);
    return { supabase, user, appointment: null, error: "database" as const };
  }

  if (
    !appointment ||
    appointment.status !== "confirmed" ||
    !appointment.doctor?.user_id ||
    (user.id !== appointment.patient_id && user.id !== appointment.doctor.user_id)
  ) {
    return { supabase, user, appointment: null, error: "forbidden" as const };
  }

  return { supabase, user, appointment, error: null };
}

export function participantPairMatchesAppointment(
  callerUserId: string,
  recipientUserId: string,
  appointment: AuthorizedAppointment
) {
  const doctorUserId = appointment.doctor?.user_id;
  return Boolean(
    doctorUserId &&
      ((callerUserId === appointment.patient_id && recipientUserId === doctorUserId) ||
        (callerUserId === doctorUserId && recipientUserId === appointment.patient_id))
  );
}
