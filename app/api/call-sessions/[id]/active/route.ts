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
    return NextResponse.json({ detail: "Sign in to update this call." }, { status: 401 });
  }
  if (!isUuid(params.id)) return NextResponse.json({ detail: "A valid call session ID is required." }, { status: 400 });

  const { data: session, error: lookupError } = await authenticated.supabase
    .from("call_sessions")
    .select("appointment_id")
    .eq("id", params.id)
    .maybeSingle<{ appointment_id: string }>();

  if (lookupError) {
    return NextResponse.json({ detail: "Could not load this call." }, { status: 500 });
  }
  if (!session) {
    return NextResponse.json({ detail: "This call is no longer available." }, { status: 404 });
  }

  const authorization = await getAuthorizedAppointment(session.appointment_id, authenticated);
  if (authorization.error === "database") {
    return NextResponse.json({ detail: "Could not verify this call." }, { status: 500 });
  }
  if (authorization.error !== null) {
    return NextResponse.json({ detail: "This call is no longer available." }, { status: 403 });
  }

  if (!hasServiceConfiguration()) return NextResponse.json({ detail: "Call session service is not configured." }, { status: 503 });
  const serviceSupabase = createServiceClient();
  const { error: transitionError } = await serviceSupabase.rpc("transition_call_session", {
    p_session_id: params.id,
    p_actor_user_id: authenticated.user.id,
    p_target_status: "active",
  });

  if (transitionError) {
    console.error("Could not mark the call as active.");
    return NextResponse.json({ detail: "Could not update the call status." }, { status: 409 });
  }

  return NextResponse.json({ call_status: "active" });
}
