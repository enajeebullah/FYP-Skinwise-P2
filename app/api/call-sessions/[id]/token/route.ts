import { NextResponse } from "next/server";

import { createServiceClient, hasServiceConfiguration } from "@/lib/supabase/service";
import { getAuthenticatedSession, isUuid } from "@/lib/call-sessions/authorization";

export const dynamic = "force-dynamic";

type TokenClaim = {
  claim_id: string;
  room_name: string;
  call_status: "ringing" | "accepted" | "active";
  invitation_expires_at: string;
  room_expires_at: string;
  claim_expires_at: string;
};

type DailyRoom = {
  name: string;
  privacy: string;
  url: string;
  config?: { exp?: unknown };
};

function dailyRoomHost(domain: string) {
  const host = domain.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  return host.endsWith(".daily.co") ? host : `${host}.daily.co`;
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

function getTokenClaim(value: unknown): TokenClaim | null {
  const claim = Array.isArray(value) ? value[0] : value;
  if (typeof claim !== "object" || claim === null) return null;
  const candidate = claim as Partial<TokenClaim>;
  return typeof candidate.claim_id === "string" &&
    typeof candidate.room_name === "string" &&
    (candidate.call_status === "ringing" ||
      candidate.call_status === "accepted" ||
      candidate.call_status === "active") &&
    typeof candidate.invitation_expires_at === "string" &&
    typeof candidate.room_expires_at === "string" &&
    typeof candidate.claim_expires_at === "string"
    ? candidate as TokenClaim
    : null;
}

export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const authenticated = await getAuthenticatedSession();
  if (authenticated.error) {
    return NextResponse.json({ detail: "Sign in to join the call." }, { status: 401 });
  }
  if (!isUuid(params.id)) return NextResponse.json({ detail: "A valid call session ID is required." }, { status: 400 });

  const dailyApiKey = process.env.DAILY_API_KEY;
  const dailyDomain = process.env.DAILY_DOMAIN?.trim();
  if (!dailyApiKey || !dailyDomain) {
    return NextResponse.json(
      { detail: "Daily joining is not configured on the server." },
      { status: 503 }
    );
  }
  if (!hasServiceConfiguration()) {
    return NextResponse.json({ detail: "Call authorization is not configured on the server." }, { status: 503 });
  }

  const serviceSupabase = createServiceClient();
  try {
    const { data: claimData, error: claimError } = await serviceSupabase.rpc(
      "create_call_session_token_claim",
      {
        p_session_id: params.id,
        p_actor_user_id: authenticated.user.id,
      }
    );

    if (claimError) {
      if (claimError.message === "call_token_claim_active") {
        return NextResponse.json({ detail: "A join authorization is already being issued." }, { status: 409 });
      }
      if (claimError.message === "call_token_not_authorized") {
        return NextResponse.json({ detail: "This call is not available to join." }, { status: 403 });
      }
      console.error("Could not create Daily token claim.");
      return NextResponse.json({ detail: "Could not authorize joining this call." }, { status: 500 });
    }

    const claim = getTokenClaim(claimData);
    if (!claim) {
      console.error("Call token claim returned an invalid result.");
      return NextResponse.json({ detail: "Could not authorize joining this call." }, { status: 500 });
    }

    const roomResponse = await fetch(
      `https://api.daily.co/v1/rooms/${encodeURIComponent(claim.room_name)}`,
      {
        headers: { Authorization: `Bearer ${dailyApiKey}` },
        cache: "no-store",
      }
    );
    if (!roomResponse.ok) {
      return NextResponse.json({ detail: "The Daily room is unavailable." }, { status: 409 });
    }

    const roomPayload: unknown = await roomResponse.json();
    if (!isDailyRoom(roomPayload)) {
      return NextResponse.json({ detail: "The Daily room response was invalid." }, { status: 502 });
    }

    let roomUrl: URL;
    try {
      roomUrl = new URL(roomPayload.url);
    } catch {
      return NextResponse.json({ detail: "The Daily room URL was invalid." }, { status: 502 });
    }

    const expectedHost = dailyRoomHost(dailyDomain);
    const nowSeconds = Math.floor(Date.now() / 1000);
    const invitationExpirySeconds = Math.floor(
      new Date(claim.invitation_expires_at).getTime() / 1000
    );
    const roomExpirySeconds = Math.floor(new Date(claim.room_expires_at).getTime() / 1000);
    const claimExpirySeconds = Math.floor(new Date(claim.claim_expires_at).getTime() / 1000);
    if (
      roomPayload.name !== claim.room_name ||
      roomPayload.privacy !== "private" ||
      roomUrl.protocol !== "https:" ||
      roomUrl.hostname !== expectedHost ||
      typeof roomPayload.config?.exp !== "number" ||
      !Number.isFinite(roomPayload.config.exp) ||
      roomPayload.config.exp <= nowSeconds ||
      !Number.isFinite(invitationExpirySeconds) ||
      (claim.call_status === "ringing" && invitationExpirySeconds <= nowSeconds) ||
      !Number.isFinite(roomExpirySeconds) ||
      roomExpirySeconds <= nowSeconds ||
      !Number.isFinite(claimExpirySeconds) ||
      claimExpirySeconds <= nowSeconds
    ) {
      return NextResponse.json({ detail: "The Daily room is unsuitable or expired." }, { status: 409 });
    }

    const tokenExpiry = Math.min(
      roomExpirySeconds,
      claimExpirySeconds,
      roomPayload.config.exp
    );
    if (tokenExpiry <= nowSeconds + 5) {
      return NextResponse.json({ detail: "The call authorization is expiring." }, { status: 409 });
    }

    const tokenResponse = await fetch("https://api.daily.co/v1/meeting-tokens", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${dailyApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        properties: {
          room_name: claim.room_name,
          exp: tokenExpiry,
          eject_at_token_exp: false,
          enable_screenshare: false,
          user_name: "SkinWISE participant",
          permissions: {
            hasPresence: true,
            canSend: true,
            canReceive: { base: true },
            canAdmin: false,
          },
        },
      }),
      cache: "no-store",
    });

    if (!tokenResponse.ok) {
      console.error("Daily meeting-token creation failed with status:", tokenResponse.status);
      return NextResponse.json({ detail: "Could not authorize Daily joining." }, { status: 502 });
    }

    const tokenPayload: unknown = await tokenResponse.json();
    if (
      typeof tokenPayload !== "object" ||
      tokenPayload === null ||
      typeof (tokenPayload as { token?: unknown }).token !== "string"
    ) {
      return NextResponse.json({ detail: "Daily returned an invalid meeting token." }, { status: 502 });
    }

    const { data: claimStillValid, error: validationError } = await serviceSupabase.rpc(
      "validate_call_session_token_claim",
      {
        p_session_id: params.id,
        p_claim_id: claim.claim_id,
        p_actor_user_id: authenticated.user.id,
      }
    );
    if (validationError || claimStillValid !== true) {
      if (validationError) console.error("Could not validate Daily token claim.");
      return NextResponse.json({ detail: "Call authorization expired before token delivery." }, { status: 409 });
    }
    if (tokenExpiry <= Math.floor(Date.now() / 1000) + 5) {
      return NextResponse.json({ detail: "Call authorization expired before token delivery." }, { status: 409 });
    }

    return NextResponse.json({
      token: (tokenPayload as { token: string }).token,
      room_url: roomPayload.url,
      expires_at: new Date(tokenExpiry * 1000).toISOString(),
    });
  } catch {
    console.error("Daily join-token request failed.");
    return NextResponse.json({ detail: "Could not authorize Daily joining." }, { status: 502 });
  }
}
