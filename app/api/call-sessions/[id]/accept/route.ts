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
  if (authenticated.error) {
    return NextResponse.json({ detail: "Sign in to manage this call." }, { status: 401 });
  }
  if (!isUuid(params.id)) return NextResponse.json({ detail: "A valid call session ID is required." }, { status: 400 });

  const authorization = await getAuthorizedAppointmentFromSession(params.id, authenticated);
  if (authorization.response) return authorization.response;

  const { appointment, user } = authorization;
  if (!hasServiceConfiguration()) return NextResponse.json({ detail: "Call session service is not configured." }, { status: 503 });
  const serviceSupabase = createServiceClient();
  const { data: acceptedSession, error: transitionError } = await serviceSupabase.rpc(
    "transition_call_session",
    {
      p_session_id: params.id,
      p_actor_user_id: user.id,
      p_target_status: "accepted",
    }
  );

  if (transitionError) {
    console.error("Could not accept call session:", transitionError);
    const expired = transitionError.message === "call_invitation_expired_or_invalid";
    return NextResponse.json(
      { detail: expired ? "This call invitation is no longer available." : "Could not accept the call invitation." },
      { status: expired ? 409 : 500 }
    );
  }

  const session = Array.isArray(acceptedSession) ? acceptedSession[0] : acceptedSession;
  if (!session) return NextResponse.json({ detail: "Call session not found." }, { status: 404 });

  return NextResponse.json({
    id: session.id,
    call_status: session.call_status,
    room_expires_at: session.room_expires_at,
  });
}

async function getAuthorizedAppointmentFromSession(
  sessionId: string,
  authenticated: Awaited<ReturnType<typeof import("@/lib/call-sessions/authorization").getAuthenticatedSession>> & { error: null }
) {
  const { data: session } = await authenticated.supabase
    .from("call_sessions")
    .select("appointment_id")
    .eq("id", sessionId)
    .maybeSingle<{ appointment_id: string }>();

  if (!session) {
    return { response: NextResponse.json({ detail: "Call session not found." }, { status: 404 }) } as const;
  }

  const authorization = await getAuthorizedAppointment(session.appointment_id, authenticated);
  if (authorization.error === "unauthorized") {
    return { response: NextResponse.json({ detail: "Sign in to manage this call." }, { status: 401 }) } as const;
  }
  if (authorization.error === "database") {
    return { response: NextResponse.json({ detail: "Could not verify the appointment." }, { status: 500 }) } as const;
  }
  if (authorization.error === "forbidden") {
    return { response: NextResponse.json({ detail: "Only confirmed appointment participants can manage this call." }, { status: 403 }) } as const;
  }

  return { response: null, appointment: authorization.appointment!, user: authorization.user! } as const;
}
