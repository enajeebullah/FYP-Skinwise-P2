"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Room, RoomEvent, Track } from "livekit-client";
import { createClient } from "@/lib/supabase/client";

type CallStatus = "ringing" | "accepted" | "active" | "rejected" | "missed" | "ended" | "failed";
export type CallMode = "audio" | "video";

type CallSession = {
  id: string;
  appointment_id: string;
  call_mode: CallMode;
  call_status: CallStatus;
  expires_at?: string;
  room_expires_at?: string | null;
  caller_name?: string;
};

type CallCredentials = { roomUrl: string; token: string; sessionId: string; callMode: CallMode };
type MediaControls = { toggleMicrophone: () => Promise<boolean>; toggleCamera: () => Promise<boolean> };

type ApiError = { detail?: string };

async function apiError(response: Response) {
  try {
    const result = (await response.json()) as ApiError;
    return result.detail || "The call request could not be completed.";
  } catch {
    return "The call request could not be completed.";
  }
}

export function startAppointmentCall(appointmentId: string, callMode: CallMode) {
  window.dispatchEvent(
    new CustomEvent("skinwise:start-call", { detail: { appointmentId, callMode } })
  );
}

export function AppointmentCallButton({
  appointmentId,
  callMode,
}: {
  appointmentId: string;
  callMode: CallMode;
}) {
  return (
    <button
      type="button"
      onClick={() => startAppointmentCall(appointmentId, callMode)}
      className="min-h-10 rounded-lg bg-[#0D9488] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0F766E] focus:outline-none focus:ring-2 focus:ring-[#5EEAD4] focus:ring-offset-2"
    >
      Start {callMode} call
    </button>
  );
}

const LiveKitCallSurface = forwardRef<MediaControls, {
  credentials: CallCredentials;
  onConnected: () => void;
  onReconnecting: () => void;
  onDisconnected: () => void;
  onParticipantConnected: () => void;
  onParticipantDisconnected: () => void;
  onError: (message: string) => void;
}>(({ credentials, onConnected, onReconnecting, onDisconnected, onParticipantConnected, onParticipantDisconnected, onError }, ref) => {
  const mediaRef = useRef<HTMLDivElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const roomRef = useRef<Room | null>(null);
  const callbacksRef = useRef({
    onConnected,
    onReconnecting,
    onDisconnected,
    onParticipantConnected,
    onParticipantDisconnected,
    onError,
  });
  callbacksRef.current = {
    onConnected,
    onReconnecting,
    onDisconnected,
    onParticipantConnected,
    onParticipantDisconnected,
    onError,
  };
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(credentials.callMode === "audio");

  useImperativeHandle(ref, () => ({
    toggleMicrophone: async () => {
      const room = roomRef.current;
      if (!room) return false;
      const enabled = !room.localParticipant.isMicrophoneEnabled;
      await room.localParticipant.setMicrophoneEnabled(enabled);
      setMuted(!enabled);
      return !enabled;
    },
    toggleCamera: async () => {
      const room = roomRef.current;
      if (!room) return false;
      const enabled = !room.localParticipant.isCameraEnabled;
      await room.localParticipant.setCameraEnabled(enabled);
      setCameraOff(!enabled);
      return !enabled;
    },
  }), []);

  useEffect(() => {
    let disposed = false;
    const room = new Room({ adaptiveStream: true, dynacast: true });
    roomRef.current = room;
    const attachRemoteTrack = (track: Track) => {
      const element = track.attach();
      if (track.kind === Track.Kind.Audio) {
        element.className = "sr-only";
      } else {
        element.className = "h-full w-full rounded-xl object-cover";
      }
      mediaRef.current?.appendChild(element);
    };
    const detachRemoteTrack = (track: Track) => track.detach().forEach((element) => element.remove());
    const onTrackSubscribed = (track: Track) => attachRemoteTrack(track);
    const onTrackUnsubscribed = (track: Track) => detachRemoteTrack(track);
    let mediaReady = false;
    let transportConnected = false;
    const onRoomConnected = () => {
      transportConnected = true;
      if (mediaReady) callbacksRef.current.onConnected();
    };
    const onRemoteParticipantDisconnected = () => callbacksRef.current.onParticipantDisconnected();
    const onRemoteParticipantConnected = () => callbacksRef.current.onParticipantConnected();
    const onRoomReconnecting = () => {
      transportConnected = false;
      callbacksRef.current.onReconnecting();
    };
    const onRoomReconnected = () => {
      transportConnected = true;
      if (mediaReady) callbacksRef.current.onConnected();
    };
    const onRoomDisconnected = () => {
      transportConnected = false;
      if (!disposed) callbacksRef.current.onDisconnected();
    };
    room.on(RoomEvent.Connected, onRoomConnected);
    room.on(RoomEvent.TrackSubscribed, onTrackSubscribed);
    room.on(RoomEvent.TrackUnsubscribed, onTrackUnsubscribed);
    room.on(RoomEvent.ParticipantDisconnected, onRemoteParticipantDisconnected);
    room.on(RoomEvent.ParticipantConnected, onRemoteParticipantConnected);
    room.on(RoomEvent.Reconnecting, onRoomReconnecting);
    room.on(RoomEvent.Reconnected, onRoomReconnected);
    room.on(RoomEvent.Disconnected, onRoomDisconnected);

    const connect = async () => {
      try {
        await room.connect(credentials.roomUrl, credentials.token);
        if (credentials.callMode === "audio") {
          await room.localParticipant.setMicrophoneEnabled(true);
        } else {
          await room.localParticipant.enableCameraAndMicrophone();
        }
        if (disposed) return;
        const cameraTrack = room.localParticipant.getTrackPublication(Track.Source.Camera)?.track;
        if (cameraTrack && localVideoRef.current) cameraTrack.attach(localVideoRef.current);
        for (const participant of room.remoteParticipants.values()) {
          for (const publication of participant.trackPublications.values()) {
            if (publication.track && publication.track.kind !== Track.Kind.Unknown) {
              attachRemoteTrack(publication.track as Track);
            }
          }
        }
        mediaReady = true;
        if (transportConnected && room.state === "connected") callbacksRef.current.onConnected();
      } catch (error) {
        if (disposed) return;
        const denied = error instanceof DOMException && error.name === "NotAllowedError";
        callbacksRef.current.onError(denied
          ? "Camera or microphone permission was denied. Allow access in your browser settings, then retry."
          : error instanceof Error ? error.message : "Could not connect to LiveKit.");
      }
    };
    void connect();
    return () => {
      disposed = true;
      room.off(RoomEvent.Connected, onRoomConnected);
      room.off(RoomEvent.TrackSubscribed, onTrackSubscribed);
      room.off(RoomEvent.TrackUnsubscribed, onTrackUnsubscribed);
      room.off(RoomEvent.ParticipantDisconnected, onRemoteParticipantDisconnected);
      room.off(RoomEvent.ParticipantConnected, onRemoteParticipantConnected);
      room.off(RoomEvent.Reconnecting, onRoomReconnecting);
      room.off(RoomEvent.Reconnected, onRoomReconnected);
      room.off(RoomEvent.Disconnected, onRoomDisconnected);
      for (const participant of room.remoteParticipants.values()) {
        for (const publication of participant.trackPublications.values()) {
          publication.track?.detach().forEach((element) => element.remove());
        }
      }
      if (localVideoRef.current) {
        room.localParticipant.getTrackPublication(Track.Source.Camera)?.track?.detach(localVideoRef.current);
      }
      roomRef.current = null;
      void room.disconnect();
    };
  }, [credentials]);

  return (
    <div className="relative min-h-64 bg-[#101A28] p-3 sm:min-h-[min(62vh,620px)]">
      <div ref={mediaRef} className="grid h-full min-h-64 grid-cols-1 gap-3 sm:grid-cols-2" />
      {credentials.callMode === "video" && (
        <video ref={localVideoRef} autoPlay playsInline muted className="absolute bottom-5 right-5 z-10 h-24 w-36 rounded-xl bg-[#243449] object-cover shadow-lg sm:h-32 sm:w-48" />
      )}
      <span className="sr-only">Microphone {muted ? "muted" : "on"}; camera {cameraOff ? "off" : "on"}</span>
    </div>
  );
});
LiveKitCallSurface.displayName = "LiveKitCallSurface";

export default function CallCenter() {
  const [session, setSession] = useState<CallSession | null>(null);
  const [credentials, setCredentials] = useState<CallCredentials | null>(null);
  const [phase, setPhase] = useState<"idle" | "working" | "joining" | "joined" | "ending" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [otherDisconnected, setOtherDisconnected] = useState(false);
  const liveKitControlsRef = useRef<MediaControls | null>(null);
  const activeStatusRequestsRef = useRef(new Set<string>());
  const sessionRef = useRef<CallSession | null>(null);
  const busyRef = useRef(false);
  const pollInFlightRef = useRef(false);
  const reconcileQueuedRef = useRef(false);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  async function markCallActive(sessionId: string) {
    if (activeStatusRequestsRef.current.has(sessionId)) return;
    activeStatusRequestsRef.current.add(sessionId);
    try {
      const response = await fetch(`/api/call-sessions/${encodeURIComponent(sessionId)}/active`, { method: "POST" });
      if (!response.ok) setMessage(await apiError(response));
    } catch {
      setMessage("Could not update the call status.");
    }
  }

  const closeSession = useCallback(async (text: string) => {
    sessionRef.current = null;
    setCredentials(null);
    setSession(null);
    setPhase("idle");
    setMessage(null);
    setNotice(text);
    setOtherDisconnected(false);
    busyRef.current = false;
  }, []);

  const joinCall = useCallback(async (target: CallSession) => {
    setPhase("working");
    setMessage(null);
    setOtherDisconnected(false);
    try {
      const response = await fetch(`/api/call-sessions/${encodeURIComponent(target.id)}/token`, {
        method: "POST",
        cache: "no-store",
      });
      if (!response.ok) throw new Error(await apiError(response));
      const result = (await response.json()) as { token?: string; room_url?: string };
      if (!result.token || !result.room_url) throw new Error("The call token response was incomplete.");
      setCredentials({
        roomUrl: result.room_url,
        token: result.token,
        sessionId: target.id,
        callMode: target.call_mode,
      });
      setPhase("joining");
    } catch (error) {
      setPhase("error");
      setMessage(error instanceof Error ? error.message : "Could not join the call.");
    }
  }, []);

  const startCall = useCallback(async (appointmentId: string, callMode: CallMode) => {
    if (busyRef.current || sessionRef.current) return;
    busyRef.current = true;
    setNotice(null);
    setMessage(null);
    setPhase("working");
    try {
      const response = await fetch("/api/call-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointment_id: appointmentId, call_mode: callMode }),
      });
      if (!response.ok) throw new Error(await apiError(response));
      const result = (await response.json()) as {
        session?: {
          id: string;
          call_mode: CallMode;
          call_status: CallStatus;
          expires_at: string;
          room_expires_at: string | null;
        };
      };
      if (!result.session?.id) throw new Error("The call session response was incomplete.");
      const nextSession: CallSession = { appointment_id: appointmentId, ...result.session };
      sessionRef.current = nextSession;
      setSession(nextSession);
      await joinCall(nextSession);
    } catch (error) {
      setPhase("idle");
      setNotice(error instanceof Error ? error.message : "Could not start the call.");
      busyRef.current = false;
    }
  }, [joinCall]);

  useEffect(() => {
    const handleStart = (event: Event) => {
      const detail = (event as CustomEvent<{ appointmentId?: unknown; callMode?: unknown }>).detail;
      if (
        typeof detail?.appointmentId === "string" &&
        (detail.callMode === "audio" || detail.callMode === "video")
      ) {
        void startCall(detail.appointmentId, detail.callMode);
      }
    };
    window.addEventListener("skinwise:start-call", handleStart);
    return () => window.removeEventListener("skinwise:start-call", handleStart);
  }, [startCall]);

  useEffect(() => {
    let stopped = false;
    const poll = async () => {
      if (stopped) return;
      if (pollInFlightRef.current) {
        reconcileQueuedRef.current = true;
        return;
      }
      pollInFlightRef.current = true;
      try {
        const current = sessionRef.current;
        if (current) {
          const response = await fetch(`/api/call-sessions?session_id=${encodeURIComponent(current.id)}`, { cache: "no-store" });
          if (stopped) return;
          if (response.status === 404 || response.status === 410) {
            await closeSession("The appointment is no longer confirmed or this call is unavailable.");
            return;
          }
          if (!response.ok) {
            setNotice(await apiError(response));
            return;
          }
          const result = (await response.json()) as { session?: { call_status: CallStatus } };
          const status = result.session?.call_status;
          if (status && ["rejected", "missed", "ended", "failed"].includes(status)) {
            const text = status === "rejected" ? "The call was rejected."
              : status === "missed" ? "The invitation expired without an answer."
                : status === "ended" ? "The call has ended."
                  : "The call could not be completed.";
            await closeSession(text);
            return;
          }
          if (status) {
            const updated = { ...current, call_status: status };
            sessionRef.current = updated;
            setSession(updated);
          }
          return;
        }

        if (busyRef.current || stopped) return;
        const response = await fetch("/api/call-sessions", { cache: "no-store" });
        if (stopped) return;
        if (!response.ok) {
          setNotice(await apiError(response));
          return;
        }
        const result = (await response.json()) as { incoming?: CallSession[] };
        const next = result.incoming?.[0];
        if (next && !sessionRef.current && !busyRef.current) {
          busyRef.current = true;
          setNotice(null);
          sessionRef.current = next;
          setSession(next);
          setPhase("idle");
        }
      } catch (error) {
        if (!stopped) {
          setNotice(error instanceof Error ? error.message : "Could not check calls.");
        }
      } finally {
        pollInFlightRef.current = false;
        if (reconcileQueuedRef.current && !stopped) {
          reconcileQueuedRef.current = false;
          void poll();
        }
      }
    };

    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let realtimeHealthy = false;
    let hasSubscribed = false;
    let fallbackTimer: number | undefined;
    let connectionWatchdog: number | undefined;
    let connect: (() => Promise<void>) | null = null;

    const stopFallback = () => {
      if (fallbackTimer !== undefined) {
        window.clearTimeout(fallbackTimer);
        fallbackTimer = undefined;
      }
    };
    const scheduleFallback = () => {
      if (stopped || realtimeHealthy || fallbackTimer !== undefined) return;
      fallbackTimer = window.setTimeout(() => {
        fallbackTimer = undefined;
        void poll().finally(() => {
          if (!channel && connect) void connect();
          scheduleFallback();
        });
      }, sessionRef.current ? 5000 : 10000);
    };
    const startFallback = () => {
      if (stopped || realtimeHealthy) return;
      void poll();
      scheduleFallback();
    };

    connect = async () => {
      try {
        const { data: { user }, error } = await supabase.auth.getUser();
        if (stopped) return;
        if (error) {
          startFallback();
          return;
        }
        if (!user) return;

        channel = supabase
          .channel("skinwise-call-sessions:" + user.id)
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "call_sessions" },
            (payload) => {
              if (stopped) return;
              const row = payload.new as Record<string, unknown> | null;
              if (!row) return;
              if (row.caller_user_id !== user.id && row.recipient_user_id !== user.id) return;
              const current = sessionRef.current;
              const isCurrentSession = typeof row.id === "string" && row.id === current?.id;
              const isIncomingInvitation =
                row.recipient_user_id === user.id && row.call_status === "ringing";
              if (isCurrentSession || isIncomingInvitation) void poll();
            }
          )
          .subscribe((status) => {
            if (stopped) return;
            if (status === "SUBSCRIBED") {
              realtimeHealthy = true;
              hasSubscribed = true;
              stopFallback();
              if (connectionWatchdog !== undefined) {
                window.clearTimeout(connectionWatchdog);
                connectionWatchdog = undefined;
              }
              // Verify an authorized snapshot only after Realtime is ready.
              void poll();
              return;
            }

            realtimeHealthy = false;
            if (
              status === "CHANNEL_ERROR" ||
              status === "TIMED_OUT" ||
              status === "CLOSED" ||
              hasSubscribed
            ) {
              startFallback();
            }
          });

        connectionWatchdog = window.setTimeout(() => {
          connectionWatchdog = undefined;
          if (!stopped && !realtimeHealthy) startFallback();
        }, 8000);
      } catch {
        if (!stopped) startFallback();
      }
    };

    void connect();
    return () => {
      stopped = true;
      realtimeHealthy = false;
      reconcileQueuedRef.current = false;
      stopFallback();
      if (connectionWatchdog !== undefined) window.clearTimeout(connectionWatchdog);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [closeSession]);

  useEffect(() => {
    if (!session || session.call_status !== "ringing" || !session.expires_at) return;
    const sessionId = session.id;
    const expiresAt = new Date(session.expires_at).getTime();
    if (!Number.isFinite(expiresAt)) return;

    let stopped = false;
    let retryTimer: number | undefined;
    const verifyExpiry = async () => {
      if (stopped || sessionRef.current?.id !== sessionId) return;
      try {
        const expireResponse = await fetch(
          "/api/call-sessions/" + encodeURIComponent(sessionId) + "/expire",
          { method: "POST", cache: "no-store" }
        );
        if (stopped || sessionRef.current?.id !== sessionId) return;

        const response = await fetch(
          "/api/call-sessions?session_id=" + encodeURIComponent(sessionId),
          { cache: "no-store" }
        );
        if (stopped || sessionRef.current?.id !== sessionId) return;
        if (response.status === 404 || response.status === 410) {
          await closeSession("The appointment is no longer confirmed or this call is unavailable.");
          return;
        }
        if (!response.ok) {
          setNotice(await apiError(response));
          retryTimer = window.setTimeout(() => void verifyExpiry(), 5000);
          return;
        }

        const result = (await response.json()) as { session?: { call_status: CallStatus } };
        const status = result.session?.call_status;
        if (status === "missed") {
          await closeSession("The invitation expired without an answer.");
        } else if (status && status !== "ringing") {
          const updated = { ...sessionRef.current!, call_status: status };
          sessionRef.current = updated;
          setSession(updated);
        } else if (status === "ringing" && !expireResponse.ok) {
          retryTimer = window.setTimeout(() => void verifyExpiry(), 1500);
        }
      } catch {
        if (!stopped) {
          setNotice("Could not verify whether the call invitation expired.");
          retryTimer = window.setTimeout(() => void verifyExpiry(), 5000);
        }
      }
    };

    const delay = Math.max(0, expiresAt - Date.now()) + 250;
    const timer = window.setTimeout(() => void verifyExpiry(), delay);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
    };
  }, [session?.id, session?.call_status, session?.expires_at, closeSession]);

  async function acceptIncoming() {
    if (!session) return;
    setPhase("working");
    setMessage(null);
    try {
      const response = await fetch(`/api/call-sessions/${encodeURIComponent(session.id)}/accept`, { method: "POST" });
      if (!response.ok) throw new Error(await apiError(response));
      const next = { ...session, call_status: "accepted" as const };
      setSession(next);
      await joinCall(next);
    } catch (error) {
      setPhase("error");
      setMessage(error instanceof Error ? error.message : "Could not accept this invitation.");
    }
  }

  async function rejectIncoming() {
    if (!session) return;
    setPhase("working");
    try {
      const response = await fetch(`/api/call-sessions/${encodeURIComponent(session.id)}/reject`, { method: "POST" });
      if (!response.ok) throw new Error(await apiError(response));
      await closeSession("You rejected the incoming call.");
    } catch (error) {
      setPhase("error");
      setMessage(error instanceof Error ? error.message : "Could not reject this call.");
    }
  }

  async function endCall() {
    if (!session) return;
    const previousPhase = phase;
    setPhase("ending");
    setMessage(null);
    try {
      const response = await fetch(`/api/call-sessions/${encodeURIComponent(session.id)}/end`, { method: "POST" });
      if (!response.ok) throw new Error(await apiError(response));
      await closeSession("Call ended. The other participant will leave when their session updates.");
    } catch (error) {
      setPhase(previousPhase === "joined" ? "joined" : "error");
      setMessage(error instanceof Error ? error.message : "Could not end the call.");
    }
  }

  function toggleMicrophone() {
    void liveKitControlsRef.current?.toggleMicrophone().then(setMuted).catch((error) => setMessage(error instanceof Error ? error.message : "Could not change the microphone."));
  }

  function toggleCamera() {
    void liveKitControlsRef.current?.toggleCamera().then(setCameraOff).catch((error) => setMessage(error instanceof Error ? error.message : "Could not change the camera."));
  }

  const isIncoming = Boolean(session && !credentials && phase === "idle" && session.call_status === "ringing");

  return (
    <>
      {notice && (
        <div role="status" className="fixed bottom-4 right-4 z-[70] max-w-md rounded-xl border border-[#C8D5E4] bg-white px-4 py-3 text-sm text-[#243449] shadow-lg">
          {notice}
          <button type="button" className="ml-3 font-semibold text-[#0D9488]" onClick={() => setNotice(null)}>Dismiss</button>
        </div>
      )}
      {isIncoming && session && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#142B49]/55 p-4" role="presentation">
          <section role="dialog" aria-modal="true" aria-labelledby="incoming-call-title" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <p className="text-xs font-semibold uppercase tracking-widest text-[#0D9488]">Incoming {session.call_mode} call</p>
            <h2 id="incoming-call-title" className="mt-2 text-2xl font-semibold text-[#142B49]">{session.caller_name || "SkinWISE participant"} is calling</h2>
            <p className="mt-2 text-sm text-[#64748B]">This invitation expires at {new Date(session.expires_at ?? "").toLocaleTimeString()}.</p>
            {message && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{message}</p>}
            <div className="mt-6 flex gap-3">
              <button type="button" disabled={phase === "working"} onClick={() => void acceptIncoming()} className="min-h-11 flex-1 rounded-lg bg-[#0D9488] px-4 py-2 font-semibold text-white disabled:opacity-60">{phase === "working" ? "Connecting…" : "Accept"}</button>
              <button type="button" disabled={phase === "working"} onClick={() => void rejectIncoming()} className="min-h-11 flex-1 rounded-lg border border-red-200 px-4 py-2 font-semibold text-[#A5404A] disabled:opacity-60">Reject</button>
            </div>
          </section>
        </div>
      )}
      {session && !isIncoming && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#142B49]/65 p-3 sm:p-6" role="presentation">
          <section role="dialog" aria-modal="true" aria-labelledby="call-title" className="w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <header className="flex items-center justify-between gap-3 border-b border-[#DCE5EF] px-4 py-3 sm:px-6">
              <div>
                <h2 id="call-title" className="font-semibold text-[#142B49]">SkinWISE {session.call_mode} consultation</h2>
                <p className="text-xs text-[#64748B]">{phase === "joined" ? otherDisconnected ? "The other participant disconnected." : "Connected" : phase === "joining" || phase === "working" ? "Connecting securely…" : session.call_status === "ringing" ? "Waiting for the other participant to accept…" : "Call session"}</p>
              </div>
            </header>
            {credentials ? (
              <LiveKitCallSurface
                ref={liveKitControlsRef}
                credentials={credentials}
                onConnected={() => {
                  setPhase("joined");
                  setMessage(null);
                  setOtherDisconnected(false);
                  setMuted(false);
                  setCameraOff(credentials.callMode === "audio");
                  void markCallActive(credentials.sessionId);
                }}
                onReconnecting={() => {
                  setPhase("joining");
                  setMessage("Connection interrupted. Reconnecting securely…");
                }}
                onDisconnected={() => {
                  setPhase("error");
                  setMessage("The LiveKit connection ended. Retry joining or end the call.");
                }}
                onParticipantDisconnected={() => setOtherDisconnected(true)}
                onParticipantConnected={() => setOtherDisconnected(false)}
                onError={(text) => { setPhase("error"); setMessage(text); }}
              />
            ) : <div className="min-h-48 bg-[#101A28]" />}
            {message && <p role="alert" className="mx-4 mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 sm:mx-6">{message}</p>}
            {phase === "error" && (
              <div className="flex justify-end px-4 pt-3 sm:px-6">
                <button type="button" onClick={() => void joinCall(session)} className="rounded-lg bg-[#0D9488] px-4 py-2 text-sm font-semibold text-white">Retry joining</button>
              </div>
            )}
            <footer className="flex flex-wrap items-center justify-center gap-3 border-t border-[#DCE5EF] bg-white px-4 py-3">
              <button type="button" disabled={phase !== "joined" || !liveKitControlsRef.current} onClick={toggleMicrophone} className="min-h-10 rounded-lg border border-[#DCE5EF] px-4 py-2 text-sm font-semibold text-[#243449] disabled:opacity-50">{muted ? "Unmute microphone" : "Mute microphone"}</button>
              <button type="button" disabled={phase !== "joined" || !liveKitControlsRef.current} onClick={toggleCamera} className="min-h-10 rounded-lg border border-[#DCE5EF] px-4 py-2 text-sm font-semibold text-[#243449] disabled:opacity-50">{cameraOff ? "Turn camera on" : "Turn camera off"}</button>
              <button type="button" onClick={() => void endCall()} disabled={phase === "ending" || phase === "working"} className="min-h-11 rounded-lg bg-[#A5404A] px-6 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-[#8F3540] focus:outline-none focus:ring-2 focus:ring-red-300 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60" aria-label="End video call">{phase === "ending" ? "Ending call…" : "End Call"}</button>
            </footer>
          </section>
        </div>
      )}
    </>
  );
}
