import { RoomServiceClient } from "livekit-server-sdk";

export const LIVEKIT_ROOM_PREFIX = "skinwise-lk-";

export function isLiveKitRoomName(roomName: string) {
  return roomName.startsWith(LIVEKIT_ROOM_PREFIX);
}

export function getLiveKitConfiguration() {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const publicUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL?.trim();
  const configuredUrl = publicUrl || process.env.LIVEKIT_URL?.trim();
  if (!apiKey || !apiSecret || !configuredUrl) return null;

  let clientUrl: URL;
  try {
    clientUrl = new URL(configuredUrl);
  } catch {
    return null;
  }
  if (!["wss:", "https:"].includes(clientUrl.protocol)) return null;

  const serverUrl = new URL(clientUrl.toString());
  serverUrl.protocol = "https:";
  const browserUrl = new URL(clientUrl.toString());
  browserUrl.protocol = "wss:";

  return {
    apiKey,
    apiSecret,
    serverUrl: serverUrl.toString().replace(/\/$/, ""),
    browserUrl: browserUrl.toString().replace(/\/$/, ""),
  };
}

export function createLiveKitRoomService() {
  const config = getLiveKitConfiguration();
  if (!config) throw new Error("LiveKit is not configured.");
  return new RoomServiceClient(config.serverUrl, config.apiKey, config.apiSecret);
}
