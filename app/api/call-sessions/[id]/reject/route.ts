import { NextResponse } from "next/server";

import { createServiceClient, hasServiceConfiguration } from "@/lib/supabase/service";
import {
  getAuthenticatedSession,
  getAuthorizedAppointment,
  isUuid,
} from "@/lib/call-sessions/authorization";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const authenticated = await getAuthenticatedSession();
  if (authenticated.error) return NextResponse.json({ detail: "Sign in to manage this call." }, { status: 401 });
  if (!isUuid(params.id)) return NextResponse.json({ detail: "A valid call session ID is required." }, { status: 400 });

  const sessionLookup = await getSessionAppointment(params.id, authenticated.supabase);
  if (sessionLookup.error) return sessionLookup.error;

  const authorization = await getAuthorizedAppointment(sessionLookup.appointmentId, authenticated);
  if (authorization.error === "database") return NextResponse.json({ detail: "Could not verify the appointment." }, { status: 500 });
  if (authorization.error === "forbidden") return NextResponse.json({ detail: "Only confirmed appointment participants can manage this call." }, { status: 403 });

  if (!hasServiceConfiguration()) return NextResponse.json({ detail: "Call session service is not configured." }, { status: 503 });
  const serviceSupabase = createServiceClient();
  const { data: rejectedSession, error: transitionError } = await serviceSupabase.rpc(
    "transition_call_session",
    {
      p_session_id: params.id,
      p_actor_user_id: authorization.user!.id,
      p_target_status: "rejected",
    }
  );

  if (transitionError) {
    console.error("Could not reject call session:", transitionError);
    const recipientOnly = transitionError.message === "recipient_only_transition";
    const expired = transitionError.message === "call_invitation_expired_or_invalid";
    return NextResponse.json(
      { detail: recipientOnly ? "Only the invited participant can reject this call." : expired ? "This call invitation is no longer available." : "Could not reject the call invitation." },
      { status: recipientOnly ? 403 : expired ? 409 : 500 }
    );
  }

  const session = Array.isArray(rejectedSession) ? rejectedSession[0] : rejectedSession;
  if (!session) return NextResponse.json({ detail: "Call session not found." }, { status: 404 });
  return NextResponse.json({ id: session.id, call_status: session.call_status });
}

async function getSessionAppointment(sessionId: string, supabase: ReturnType<typeof import("@/lib/supabase/server").createClient>) {
  const { data, error } = await supabase
    .from("call_sessions")
    .select("appointment_id")
    .eq("id", sessionId)
    .maybeSingle<{ appointment_id: string }>();
  if (error) return { appointmentId: null, error: NextResponse.json({ detail: "Could not load the call session." }, { status: 500 }) };
  if (!data) return { appointmentId: null, error: NextResponse.json({ detail: "Call session not found." }, { status: 404 }) };
  return { appointmentId: data.appointment_id, error: null };
}
