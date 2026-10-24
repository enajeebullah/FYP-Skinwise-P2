import { NextResponse } from "next/server";

import { createServiceClient, hasServiceConfiguration } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import {
  getAuthenticatedSession,
  getAuthorizedAppointment,
  isUuid,
} from "@/lib/call-sessions/authorization";

export const dynamic = "force-dynamic";

type AppointmentParticipant = {
  id: string;
  patient_id: string;
  doctor_id: string;
  status: string;
  doctor: { user_id: string | null } | null;
};

type CallMode = "audio" | "video";

type DailyRoom = {
  name: string;
  privacy: string;
  url: string;
  config?: {
    exp?: unknown;
    max_participants?: unknown;
    eject_at_room_exp?: unknown;
  };
};

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

function dailyRoomUrlBase(domain: string) {
  const host = domain
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
  return `https://${host.endsWith(".daily.co") ? host : `${host}.daily.co`}`;
}

function isDailyRoom(value: unknown): value is DailyRoom {
  if (typeof value !== "object" || value === null) return false;

  const room = value as Partial<DailyRoom>;
  return (
    typeof room.name === "string" &&
    typeof room.privacy === "string" &&
    typeof room.url === "string"
  );
}

async function getDailyRoom(apiKey: string, roomName: string) {
  const response = await fetch(
    `https://api.daily.co/v1/rooms/${encodeURIComponent(roomName)}`,
    {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    }
  );

  if (!response.ok) return null;

  const payload: unknown = await response.json();
  return isDailyRoom(payload) ? payload : null;
}

function isSuitableDailyRoom(
  room: DailyRoom,
  expectedName: string,
  expectedHost: string,
  nowSeconds: number
) {
  let roomUrl: URL;
  try {
    roomUrl = new URL(room.url);
  } catch {
    return false;
  }

  return (
    room.name === expectedName &&
    room.privacy === "private" &&
    roomUrl.protocol === "https:" &&
    roomUrl.hostname === expectedHost &&
    typeof room.config?.exp === "number" &&
    room.config.exp > nowSeconds &&
    room.config.max_participants === 2 &&
    room.config.eject_at_room_exp === true
  );
}

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

  const { data: existingSession, error: existingSessionError } = await supabase
    .from("call_sessions")
    .select("id, room_name, call_mode, call_status, expires_at, room_expires_at")
    .eq("appointment_id", appointment.id)
    .in("call_status", [...LIVE_CALL_STATUSES])
    .maybeSingle();

  if (existingSessionError) {
    console.error("Could not check for an existing call session:", existingSessionError);
    return NextResponse.json({ detail: "Could not check the call session." }, { status: 500 });
  }

  const dailyApiKey = process.env.DAILY_API_KEY;
  const dailyDomain = process.env.DAILY_DOMAIN?.trim();
  if (!dailyApiKey || !dailyDomain) {
    return NextResponse.json(
      { detail: "Daily room creation is not configured on the server." },
      { status: 503 }
    );
  }

  const dailyBaseUrl = dailyRoomUrlBase(dailyDomain);
  const dailyHost = new URL(dailyBaseUrl).hostname;

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

    const existingDailyRoom = await getDailyRoom(dailyApiKey, existingSession.room_name);
    if (
      !existingDailyRoom ||
      !isSuitableDailyRoom(
        existingDailyRoom,
        existingSession.room_name,
        dailyHost,
        Math.floor(Date.now() / 1000)
      )
    ) {
      return NextResponse.json(
        { detail: "The existing call room is unavailable or unsuitable." },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        session: publicSession(existingSession),
        room_url: existingDailyRoom.url,
      },
      { status: 200 }
    );
  }

  const recipientUserId =
    user.id === appointment.patient_id ? appointment.doctor.user_id : appointment.patient_id;
  // A new database session gets a fresh private room, so an ended call's
  // still-live Daily room can never be adopted by a later invitation.
  const roomName = `skinwise-${appointment.id}-${crypto.randomUUID()}`;
  const invitationExpiresAt = new Date(Date.now() + INVITATION_TTL_MS);
  const roomExpiresAt = new Date(Date.now() + ROOM_TTL_MS);

  try {
    const dailyResponse = await fetch("https://api.daily.co/v1/rooms", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${dailyApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: roomName,
        privacy: "private",
        properties: {
          exp: Math.floor(roomExpiresAt.getTime() / 1000),
          max_participants: 2,
          eject_at_room_exp: true,
          enable_prejoin_ui: true,
        },
      }),
      cache: "no-store",
    });

    if (dailyResponse.status === 409) {
      return NextResponse.json(
        { detail: "The requested Daily room name is already in use." },
        { status: 409 }
      );
    }

    if (!dailyResponse.ok) {
      console.error("Daily room creation failed with status:", dailyResponse.status);
      return NextResponse.json({ detail: "Could not create the Daily room." }, { status: 502 });
    }

    const dailyRoom = await getDailyRoom(dailyApiKey, roomName);
    if (
      !dailyRoom ||
      !isSuitableDailyRoom(
        dailyRoom,
        roomName,
        dailyHost,
        Math.floor(Date.now() / 1000)
      )
    ) {
      console.error("Daily room was missing or did not match the required configuration.");
      return NextResponse.json({ detail: "Daily returned an unexpected room." }, { status: 502 });
    }

    const serviceSupabase = createServiceClient();
    const { data: session, error: insertError } = await serviceSupabase
      .from("call_sessions")
      .insert({
        appointment_id: appointment.id,
        caller_user_id: user.id,
        recipient_user_id: recipientUserId,
        room_name: dailyRoom.name,
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

        if (racedSession) {
          const racedSessionExpiry =
            racedSession.call_status === "ringing"
              ? racedSession.expires_at
              : racedSession.room_expires_at;
          if (!racedSessionExpiry || new Date(racedSessionExpiry).getTime() <= Date.now()) {
            return NextResponse.json(
              { detail: "An existing call session requires lifecycle resolution before retrying." },
              { status: 409 }
            );
          }

          const racedRoom = await getDailyRoom(dailyApiKey, racedSession.room_name);
          if (
            !racedRoom ||
            !isSuitableDailyRoom(
              racedRoom,
              racedSession.room_name,
              dailyHost,
              Math.floor(Date.now() / 1000)
            )
          ) {
            return NextResponse.json(
              { detail: "The existing call room is unavailable or unsuitable." },
              { status: 409 }
            );
          }

          return NextResponse.json(
            {
              session: publicSession(racedSession),
              room_url: racedRoom.url,
            },
            { status: 200 }
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

    return NextResponse.json(
      { session: publicSession(session), room_url: dailyRoom.url },
      { status: 201 }
    );
  } catch (error) {
    console.error("Call session or Daily room creation failed:", error);
    return NextResponse.json(
      { detail: "Could not create the call session." },
      { status: 502 }
    );
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
