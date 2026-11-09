import { NextResponse } from "next/server";

import { createServiceClient, hasServiceConfiguration } from "@/lib/supabase/service";
import { getAuthenticatedSession, isUuid } from "@/lib/call-sessions/authorization";
import { AccessToken } from "livekit-server-sdk";
import { createLiveKitRoomService, getLiveKitConfiguration, isLiveKitRoomName } from "@/lib/call-sessions/livekit";

export const dynamic = "force-dynamic";

type TokenClaim = {
  claim_id: string;
  room_name: string;
  call_status: "ringing" | "accepted" | "active";
  invitation_expires_at: string;
  room_expires_at: string;
  claim_expires_at: string;
};

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
      console.error("Could not create call token claim.");
      return NextResponse.json({ detail: "Could not authorize joining this call." }, { status: 500 });
    }

    const claim = getTokenClaim(claimData);
    if (!claim) {
      console.error("Call token claim returned an invalid result.");
      return NextResponse.json({ detail: "Could not authorize joining this call." }, { status: 500 });
    }

    if (isLiveKitRoomName(claim.room_name)) {
      const livekit = getLiveKitConfiguration();
      if (!livekit) {
        return NextResponse.json({ detail: "LiveKit joining is not configured on the server." }, { status: 503 });
      }

      const [room] = await createLiveKitRoomService().listRooms([claim.room_name]);
      if (!room || room.name !== claim.room_name || room.maxParticipants !== 2) {
        return NextResponse.json({ detail: "The LiveKit room is unavailable or unsuitable." }, { status: 409 });
      }

      const nowSeconds = Math.floor(Date.now() / 1000);
      const roomExpirySeconds = Math.floor(new Date(claim.room_expires_at).getTime() / 1000);
      const claimExpirySeconds = Math.floor(new Date(claim.claim_expires_at).getTime() / 1000);
      const invitationExpirySeconds = Math.floor(new Date(claim.invitation_expires_at).getTime() / 1000);
      if (
        roomExpirySeconds <= nowSeconds ||
        claimExpirySeconds <= nowSeconds ||
        (claim.call_status === "ringing" && invitationExpirySeconds <= nowSeconds)
      ) {
        return NextResponse.json({ detail: "The LiveKit room is unsuitable or expired." }, { status: 409 });
      }

      const tokenExpiry = Math.min(
        roomExpirySeconds,
        claimExpirySeconds,
        claim.call_status === "ringing" ? invitationExpirySeconds : roomExpirySeconds
      );
      const ttlSeconds = tokenExpiry - nowSeconds;
      if (ttlSeconds <= 5) {
        return NextResponse.json({ detail: "The call authorization is expiring." }, { status: 409 });
      }
      const accessToken = new AccessToken(livekit.apiKey, livekit.apiSecret, {
        identity: authenticated.user.id,
        name: "SkinWISE participant",
        ttl: `${ttlSeconds}s`,
      });
      accessToken.addGrant({
        roomJoin: true,
        room: claim.room_name,
        canPublish: true,
        canSubscribe: true,
      });
      const token = await accessToken.toJwt();

      const { data: claimStillValid, error: validationError } = await serviceSupabase.rpc(
        "validate_call_session_token_claim",
        {
          p_session_id: params.id,
          p_claim_id: claim.claim_id,
          p_actor_user_id: authenticated.user.id,
        }
      );
      if (validationError || claimStillValid !== true || tokenExpiry <= Math.floor(Date.now() / 1000) + 5) {
        if (validationError) console.error("Could not validate LiveKit token claim.");
        return NextResponse.json({ detail: "Call authorization expired before token delivery." }, { status: 409 });
      }

      return NextResponse.json({
        token,
        room_url: livekit.browserUrl,
        provider: "livekit",
        expires_at: new Date(tokenExpiry * 1000).toISOString(),
      });
    }

    return NextResponse.json({ detail: "This call session uses an unsupported media provider." }, { status: 409 });
  } catch {
    console.error("Call join-token request failed.");
    return NextResponse.json({ detail: "Could not authorize call joining." }, { status: 502 });
  }
}
