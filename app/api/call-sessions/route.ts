import { NextResponse } from "next/server";

import { createServiceClient, hasServiceConfiguration } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import {
  getAuthenticatedSession,
  getAuthorizedAppointment,
  isUuid,
} from "@/lib/call-sessions/authorization";
import {
  createLiveKitRoomService,
  getLiveKitConfiguration,
  isLiveKitRoomName,
  LIVEKIT_ROOM_PREFIX,
} from "@/lib/call-sessions/livekit";

export const dynamic = "force-dynamic";

type AppointmentParticipant = {
  id: string;
  patient_id: string;
  doctor_id: string;
  status: string;
  doctor: { user_id: string | null } | null;
};

type CallMode = "audio" | "video";

const LIVE_CALL_STATUSES = ["ringing", "accepted", "active"] as const;
const INVITATION_TTL_MS = 5 * 60 * 1000;
const ROOM_TTL_MS = 60 * 60 * 1000;

type CallSessionReference = {
  id: string;
  appointment_id: string;
  caller_user_id: string;
  recipient_user_id: string;
  call_status: string;
  call_mode: CallMode;
  expires_at: string;
  room_expires_at: string | null;
};

type ExistingCallSession = {
  id: string;
  room_name: string;
  call_mode: CallMode;
  call_status: string;
  expires_at: string;
  room_expires_at: string | null;
};

function publicSession(session: {
  id: string;
  call_status: string;
  call_mode: CallMode;
  expires_at: string;
  room_expires_at: string | null;
  room_name: string;
}) {
  return {
    id: session.id,
    call_status: session.call_status,
    call_mode: session.call_mode,
    expires_at: session.expires_at,
    room_expires_at: session.room_expires_at,
    room_name: session.room_name,
  };
}

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ detail: "Sign in to start a call." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ detail: "A valid JSON body is required." }, { status: 400 });
  }

  const appointmentId =
    typeof body === "object" && body !== null && "appointment_id" in body
      ? (body as { appointment_id?: unknown }).appointment_id
      : undefined;
  const callMode =
    typeof body === "object" && body !== null && "call_mode" in body
      ? (body as { call_mode?: unknown }).call_mode
      : undefined;

  if (typeof appointmentId !== "string" || !isUuid(appointmentId)) {
    return NextResponse.json({ detail: "A valid appointment_id is required." }, { status: 400 });
  }
  if (callMode !== "audio" && callMode !== "video") {
    return NextResponse.json({ detail: "A valid call_mode is required." }, { status: 400 });
  }

  const { data: appointment, error: appointmentError } = await supabase
    .from("appointments")
    .select(
      "id, patient_id, doctor_id, status, doctor:doctors!appointments_doctor_id_fkey(user_id)"
    )
    .eq("id", appointmentId)
    .maybeSingle<AppointmentParticipant>();

  if (appointmentError) {
    console.error("Could not load appointment for call creation:", appointmentError);
    return NextResponse.json({ detail: "Could not verify the appointment." }, { status: 500 });
  }

  if (
    !appointment ||
    appointment.status !== "confirmed" ||
    !appointment.doctor?.user_id ||
    (user.id !== appointment.patient_id && user.id !== appointment.doctor.user_id)
  ) {
    return NextResponse.json(
      { detail: "Only confirmed appointment participants can start a call." },
      { status: 403 }
    );
  }

  if (!hasServiceConfiguration()) {
    return NextResponse.json({ detail: "Call session service is not configured." }, { status: 503 });
  }

  const { data: initialExistingSession, error: existingSessionError } = await supabase
    .from("call_sessions")
    .select("id, room_name, call_mode, call_status, expires_at, room_expires_at")
    .eq("appointment_id", appointment.id)
    .in("call_status", [...LIVE_CALL_STATUSES])
    .maybeSingle<ExistingCallSession>();

  if (existingSessionError) {
    console.error("Could not check for an existing call session:", existingSessionError);
    return NextResponse.json({ detail: "Could not check the call session." }, { status: 500 });
  }

  const serviceSupabase = createServiceClient();
  const resolveExpiredSession = async (candidate: ExistingCallSession) => {
    const expiresAt = candidate.call_status === "ringing"
      ? candidate.expires_at
      : candidate.room_expires_at;
    if (expiresAt && new Date(expiresAt).getTime() > Date.now()) {
      return { session: candidate, error: null };
    }

    const { error: transitionError } = await serviceSupabase.rpc("transition_call_session", {
      p_session_id: candidate.id,
      p_actor_user_id: user.id,
      p_target_status: candidate.call_status === "ringing" ? "missed" : "ended",
    });

    // Re-read after the transition (or a concurrent transition) before any
    // attempt to create another row for this appointment.
    const { data: recheckedSession, error: recheckError } = await supabase
      .from("call_sessions")
      .select("id, room_name, call_mode, call_status, expires_at, room_expires_at")
      .eq("appointment_id", appointment.id)
      .in("call_status", [...LIVE_CALL_STATUSES])
      .maybeSingle<ExistingCallSession>();

    if (recheckError) {
      console.error("Could not recheck the call session after expiry resolution:", recheckError);
      return { session: null, error: "Could not recheck the call session." };
    }

    if (transitionError && recheckedSession?.id === candidate.id) {
      // Preserve a session that may have been accepted concurrently; the
      // existing-session path below will only reuse it if it remains valid.
      console.error("Call-session expiry transition did not complete:", transitionError);
    }

    return { session: recheckedSession, error: null };
  };

  let existingSession = initialExistingSession;
  if (existingSession) {
    const expiry = existingSession.call_status === "ringing"
      ? existingSession.expires_at
      : existingSession.room_expires_at;
    if (!expiry || new Date(expiry).getTime() <= Date.now()) {
      const resolution = await resolveExpiredSession(existingSession);
      if (resolution.error) {
        return NextResponse.json({ detail: resolution.error }, { status: 500 });
      }
      existingSession = resolution.session;
    }
  }

  if (existingSession) {
    const sessionExpiry =
      existingSession.call_status === "ringing"
        ? existingSession.expires_at
        : existingSession.room_expires_at;
    if (!sessionExpiry || new Date(sessionExpiry).getTime() <= Date.now()) {
      return NextResponse.json(
        { detail: "An existing call session requires lifecycle resolution before retrying." },
        { status: 409 }
      );
    }

    if (isLiveKitRoomName(existingSession.room_name)) {
      if (!getLiveKitConfiguration()) {
        return NextResponse.json({ detail: "LiveKit room service is not configured on the server." }, { status: 503 });
      }
      try {
        const [livekitRoom] = await createLiveKitRoomService().listRooms([existingSession.room_name]);
        if (!livekitRoom || livekitRoom.name !== existingSession.room_name || livekitRoom.maxParticipants !== 2) {
          return NextResponse.json({ detail: "The existing call room is unavailable or unsuitable." }, { status: 409 });
        }
        return NextResponse.json({ session: publicSession(existingSession), provider: "livekit" }, { status: 200 });
      } catch (error) {
        console.error("LiveKit room retrieval failed:", error instanceof Error ? error.message : "unknown error");
        return NextResponse.json({ detail: "The existing call room is unavailable or unsuitable." }, { status: 409 });
      }
    }

    return NextResponse.json(
      { detail: "This call session uses an unsupported media provider." },
      { status: 409 }
    );
  }

  if (!getLiveKitConfiguration()) {
    return NextResponse.json({ detail: "LiveKit room service is not configured on the server." }, { status: 503 });
  }

  const recipientUserId =
    user.id === appointment.patient_id ? appointment.doctor.user_id : appointment.patient_id;
  const roomName = `${LIVEKIT_ROOM_PREFIX}${appointment.id}-${crypto.randomUUID()}`;
  const invitationExpiresAt = new Date(Date.now() + INVITATION_TTL_MS);
  const roomExpiresAt = new Date(Date.now() + ROOM_TTL_MS);
  let unclaimedLiveKitRoomName: string | null = null;
  let liveKitRoomService: ReturnType<typeof createLiveKitRoomService> | null = null;

  try {
    const livekitRooms = createLiveKitRoomService();
    liveKitRoomService = livekitRooms;
    const room = await livekitRooms.createRoom({
      name: roomName,
      emptyTimeout: Math.floor(ROOM_TTL_MS / 1000),
      departureTimeout: 60,
      maxParticipants: 2,
    });
    unclaimedLiveKitRoomName = roomName;
    const [verifiedRoom] = await livekitRooms.listRooms([roomName]);
    if (room.name !== roomName || !verifiedRoom || verifiedRoom.name !== roomName || verifiedRoom.maxParticipants !== 2) {
      console.error("LiveKit room creation returned an unexpected room.");
      return NextResponse.json({ detail: "LiveKit returned an unexpected room." }, { status: 502 });
    }

    const { data: session, error: insertError } = await serviceSupabase
      .from("call_sessions")
      .insert({
        appointment_id: appointment.id,
        caller_user_id: user.id,
        recipient_user_id: recipientUserId,
        room_name: roomName,
        call_mode: callMode,
        call_status: "ringing",
        // expires_at is the unanswered-invitation deadline; room_expires_at
        // remains the consultation/room deadline after acceptance.
        expires_at: invitationExpiresAt.toISOString(),
        room_expires_at: roomExpiresAt.toISOString(),
      })
      .select("id, room_name, call_mode, call_status, expires_at, room_expires_at")
      .single();

    if (insertError) {
      if (insertError.code === "23505") {
        const { data: racedSession } = await supabase
          .from("call_sessions")
          .select("id, room_name, call_mode, call_status, expires_at, room_expires_at")
          .eq("appointment_id", appointment.id)
          .in("call_status", [...LIVE_CALL_STATUSES])
          .maybeSingle();

        let reusableRacedSession = racedSession as ExistingCallSession | null;
        if (reusableRacedSession) {
          const racedExpiry = reusableRacedSession.call_status === "ringing"
            ? reusableRacedSession.expires_at
            : reusableRacedSession.room_expires_at;
          if (!racedExpiry || new Date(racedExpiry).getTime() <= Date.now()) {
            const resolution = await resolveExpiredSession(reusableRacedSession);
            if (resolution.error) {
              return NextResponse.json({ detail: resolution.error }, { status: 500 });
            }
            reusableRacedSession = resolution.session;
          }
        }

        if (reusableRacedSession) {
          const racedSessionExpiry =
            reusableRacedSession.call_status === "ringing"
              ? reusableRacedSession.expires_at
              : reusableRacedSession.room_expires_at;
          if (!racedSessionExpiry || new Date(racedSessionExpiry).getTime() <= Date.now()) {
            return NextResponse.json(
              { detail: "An existing call session requires lifecycle resolution before retrying." },
              { status: 409 }
            );
          }

          if (isLiveKitRoomName(reusableRacedSession.room_name)) {
            try {
              const [racedLiveKitRoom] = await createLiveKitRoomService().listRooms([reusableRacedSession.room_name]);
              if (!racedLiveKitRoom || racedLiveKitRoom.name !== reusableRacedSession.room_name || racedLiveKitRoom.maxParticipants !== 2) {
                return NextResponse.json({ detail: "The existing call room is unavailable or unsuitable." }, { status: 409 });
              }
              return NextResponse.json({ session: publicSession(reusableRacedSession), provider: "livekit" }, { status: 200 });
            } catch (error) {
              console.error("LiveKit raced-room retrieval failed:", error instanceof Error ? error.message : "unknown error");
              return NextResponse.json({ detail: "The existing call room is unavailable or unsuitable." }, { status: 409 });
            }
          }

          return NextResponse.json(
            { detail: "This call session uses an unsupported media provider." },
            { status: 409 }
          );
        }

        return NextResponse.json(
          { detail: "This appointment already has a live call." },
          { status: 409 }
        );
      }

      console.error("Could not create call session:", insertError);
      return NextResponse.json({ detail: "Could not create the call session." }, { status: 500 });
    }

    // The unique room is now referenced by a persisted call session and must
    // remain available to both participants.
    unclaimedLiveKitRoomName = null;
    return NextResponse.json(
      { session: publicSession(session), provider: "livekit" },
      { status: 201 }
    );
  } catch (error) {
    console.error("Call session or media room creation failed:", error);
    return NextResponse.json(
      { detail: "Could not create the call session." },
      { status: 502 }
    );
  } finally {
    if (unclaimedLiveKitRoomName && liveKitRoomService) {
      try {
        const { data: persistedSession, error: persistedSessionError } = await serviceSupabase
          .from("call_sessions")
          .select("id")
          .eq("room_name", unclaimedLiveKitRoomName)
          .maybeSingle<{ id: string }>();
        if (persistedSessionError) {
          console.error("Could not verify whether the LiveKit room is referenced by a call session.");
        } else if (!persistedSession) {
          const [room] = await liveKitRoomService.listRooms([unclaimedLiveKitRoomName]);
          if (room?.name === unclaimedLiveKitRoomName) {
            const participants = await liveKitRoomService.listParticipants(unclaimedLiveKitRoomName);
            if (participants.length === 0) {
              await liveKitRoomService.deleteRoom(unclaimedLiveKitRoomName);
            }
          }
        }
      } catch (cleanupError) {
        console.error(
          "Could not clean up an unclaimed LiveKit room:",
          cleanupError instanceof Error ? cleanupError.message : "unknown error"
        );
      }
    }
  }
}

export async function GET(request: Request) {
  const authenticated = await getAuthenticatedSession();
  if (authenticated.error) {
    return NextResponse.json({ detail: "Sign in to check calls." }, { status: 401 });
  }

  const requestedSessionId = new URL(request.url).searchParams.get("session_id");
  if (requestedSessionId) {
    if (!isUuid(requestedSessionId)) {
      return NextResponse.json({ detail: "A valid session_id is required." }, { status: 400 });
    }
    const { data: session, error } = await authenticated.supabase
      .from("call_sessions")
      .select("id, appointment_id, caller_user_id, recipient_user_id, call_mode, call_status, expires_at, room_expires_at")
      .eq("id", requestedSessionId)
      .maybeSingle<CallSessionReference>();

    if (error) {
      return NextResponse.json({ detail: "Could not check this call." }, { status: 500 });
    }
    if (!session) {
      return NextResponse.json({ detail: "This call is no longer available." }, { status: 404 });
    }

    const authorization = await getAuthorizedAppointment(session.appointment_id, authenticated);
    if (authorization.error === "database") {
      return NextResponse.json({ detail: "Could not verify this call." }, { status: 500 });
    }
    if (authorization.error !== null) {
      return NextResponse.json({ detail: "This call is no longer available." }, { status: 410 });
    }

    if (session.call_status === "ringing" && new Date(session.expires_at).getTime() <= Date.now()) {
      if (!hasServiceConfiguration()) {
        return NextResponse.json({ detail: "Call session service is not configured." }, { status: 503 });
      }
      const serviceSupabase = createServiceClient();
      const { error: expiryError } = await serviceSupabase.rpc("transition_call_session", {
        p_session_id: session.id,
        p_actor_user_id: authenticated.user.id,
        p_target_status: "missed",
      });
      if (expiryError) {
        console.error("Could not expire the call invitation during status polling.");
        return NextResponse.json({ detail: "Could not update the expired call." }, { status: 500 });
      }
      session.call_status = "missed";
    }

    return NextResponse.json({
      session: {
        id: session.id,
        call_status: session.call_status,
        call_mode: session.call_mode,
        expires_at: session.expires_at,
        room_expires_at: session.room_expires_at,
      },
    });
  }

  const { data: ringingSessions, error: ringingError } = await authenticated.supabase
    .from("call_sessions")
    .select("id, appointment_id, caller_user_id, recipient_user_id, call_mode, call_status, expires_at")
    .eq("recipient_user_id", authenticated.user.id)
    .eq("call_status", "ringing")
    .order("expires_at", { ascending: true })
    .limit(10);

  if (ringingError) {
    return NextResponse.json({ detail: "Could not check incoming calls." }, { status: 500 });
  }

  const incoming = [];
  if (ringingSessions?.length && !hasServiceConfiguration()) {
    return NextResponse.json({ detail: "Incoming-call service is not configured." }, { status: 503 });
  }
  for (const session of (ringingSessions ?? []) as CallSessionReference[]) {
    const authorization = await getAuthorizedAppointment(session.appointment_id, authenticated);
    if (authorization.error === "database") {
      return NextResponse.json({ detail: "Could not verify an incoming call." }, { status: 500 });
    }
    if (authorization.error !== null) continue;

    if (new Date(session.expires_at).getTime() <= Date.now()) {
      const serviceSupabase = createServiceClient();
      const { error: expiryError } = await serviceSupabase.rpc("transition_call_session", {
        p_session_id: session.id,
        p_actor_user_id: authenticated.user.id,
        p_target_status: "missed",
      });
      if (expiryError) console.error("Could not expire a stale incoming call.");
      continue;
    }

    const serviceSupabase = createServiceClient();
    let callerName = "SkinWISE participant";
    if (session.caller_user_id === authorization.appointment!.patient_id) {
      const { data: profile, error: profileError } = await serviceSupabase
        .from("profiles")
        .select("full_name")
        .eq("id", authorization.appointment!.patient_id)
        .maybeSingle<{ full_name: string | null }>();
      if (profileError) {
        console.error("Could not load the incoming caller display name.");
        return NextResponse.json({ detail: "Could not load incoming-call details." }, { status: 500 });
      }
      callerName = profile?.full_name?.trim() || "Patient";
    } else {
      const { data: doctor, error: doctorError } = await serviceSupabase
        .from("doctors")
        .select("name, user_id")
        .eq("id", authorization.appointment!.doctor_id)
        .maybeSingle<{ name: string; user_id: string | null }>();
      if (doctorError || doctor?.user_id !== session.caller_user_id) {
        console.error("Could not verify the incoming doctor's display name.");
        return NextResponse.json({ detail: "Could not load incoming-call details." }, { status: 500 });
      }
      callerName = doctor.name;
    }

    incoming.push({
      id: session.id,
      appointment_id: session.appointment_id,
      caller_name: callerName,
      call_status: session.call_status,
      call_mode: session.call_mode,
      expires_at: session.expires_at,
    });
  }

  return NextResponse.json({ incoming });
}
