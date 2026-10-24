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
  if (authenticated.error) return NextResponse.json({ detail: "Sign in to expire this call." }, { status: 401 });
  if (!isUuid(params.id)) return NextResponse.json({ detail: "A valid call session ID is required." }, { status: 400 });

  const { data: sessionReference, error: referenceError } = await authenticated.supabase
    .from("call_sessions")
    .select("appointment_id")
    .eq("id", params.id)
    .maybeSingle<{ appointment_id: string }>();

  if (referenceError) return NextResponse.json({ detail: "Could not load the call session." }, { status: 500 });
  if (!sessionReference) return NextResponse.json({ detail: "Call session not found." }, { status: 404 });

  const authorization = await getAuthorizedAppointment(sessionReference.appointment_id, authenticated);
  if (authorization.error === "database") return NextResponse.json({ detail: "Could not verify the appointment." }, { status: 500 });
  if (authorization.error === "forbidden") return NextResponse.json({ detail: "Only confirmed appointment participants can expire this call." }, { status: 403 });

  if (!hasServiceConfiguration()) return NextResponse.json({ detail: "Call session service is not configured." }, { status: 503 });
  const serviceSupabase = createServiceClient();
  const { data: expiredSession, error: transitionError } = await serviceSupabase.rpc(
    "transition_call_session",
    {
      p_session_id: params.id,
      p_actor_user_id: authenticated.user.id,
      p_target_status: "missed",
    }
  );

  if (transitionError) {
    console.error("Could not expire call session:", transitionError);
    const notExpired = transitionError.message === "call_invitation_not_expired";
    return NextResponse.json(
      { detail: notExpired ? "Only an unanswered expired invitation can be marked missed." : "Could not expire the call invitation." },
      { status: notExpired ? 409 : 500 }
    );
  }

  const session = Array.isArray(expiredSession) ? expiredSession[0] : expiredSession;
  if (!session) return NextResponse.json({ detail: "Call session not found." }, { status: 404 });
  return NextResponse.json({ id: session.id, call_status: session.call_status });
}
