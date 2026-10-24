"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DailyCall, DailyEventObject } from "@daily-co/daily-js";

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

type DailyCredentials = { roomUrl: string; token: string; sessionId: string; callMode: CallMode };

type ApiError = { detail?: string };

async function apiError(response: Response) {
  try {
    const result = (await response.json()) as ApiError;
    return result.detail || "The call request could not be completed.";
  } catch {
    return "The call request could not be completed.";
  }
}

async function destroyCall(call: DailyCall | null, detachListeners?: () => void) {
  if (!call) return;
  try {
    call.setLocalAudio(false, { forceDiscardTrack: true });
  } catch {
    // Media tracks may already have been released.
  }
  try {
    call.setLocalVideo(false);
  } catch {
    // Media tracks may already have been released.
  }
  try {
    detachListeners?.();
  } catch {
    // Listener cleanup is best-effort if the Daily instance is already destroyed.
  }
  try {
    if (call.meetingState() !== "left-meeting") {
      await call.leave();
    }
  } catch {
    // The call may already have ended or lost its connection.
  }
  try {
    await call.destroy();
  } catch {
    // Destroy is best-effort cleanup after leaving.
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

export default function CallCenter() {
  const [session, setSession] = useState<CallSession | null>(null);
  const [credentials, setCredentials] = useState<DailyCredentials | null>(null);
  const [phase, setPhase] = useState<"idle" | "working" | "joining" | "joined" | "ending" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [otherDisconnected, setOtherDisconnected] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const callRef = useRef<DailyCall | null>(null);
  const callCleanupRef = useRef<(() => Promise<void>) | null>(null);
  const sessionRef = useRef<CallSession | null>(null);
  const busyRef = useRef(false);
  const pollInFlightRef = useRef(false);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const closeSession = useCallback(async (text: string) => {
    const cleanupCall = callCleanupRef.current;
    callRef.current = null;
    callCleanupRef.current = null;
    sessionRef.current = null;
    setCredentials(null);
    setSession(null);
    setPhase("idle");
    setMessage(null);
    setNotice(text);
    setOtherDisconnected(false);
    busyRef.current = false;
    await cleanupCall?.();
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
    let disposed = false;
    let call: DailyCall | null = null;

    if (!credentials || !containerRef.current) return;

    const createAndJoin = async () => {
      try {
        const { default: DailyIframe } = await import("@daily-co/daily-js");
        if (disposed || !containerRef.current) return;
        call = DailyIframe.createFrame(containerRef.current, {
          showLeaveButton: false,
          showLocalVideo: true,
          showFullscreenButton: true,
          startVideoOff: credentials.callMode === "audio",
          iframeStyle: { width: "100%", height: "min(62vh, 620px)", border: "0" },
        });
        callRef.current = call;
        const onJoined = () => {
          setPhase("joined");
          setMuted(false);
          setCameraOff(credentials.callMode === "audio");
          void fetch(`/api/call-sessions/${encodeURIComponent(credentials.sessionId)}/active`, { method: "POST" })
            .then(async (response) => {
              if (!response.ok) setMessage(await apiError(response));
            })
            .catch(() => setMessage("Could not update the call status."));
        };
        const onParticipantLeft = (event: DailyEventObject<"participant-left">) => {
          if (!event.participant.local) setOtherDisconnected(true);
        };
        const onParticipantJoined = (event: DailyEventObject<"participant-joined">) => {
          if (!event.participant.local) setOtherDisconnected(false);
        };
        const onCameraError = () => {
          setMessage("Camera or microphone access was denied. Allow access in your browser settings, then retry.");
        };
        const onError = () => {
          setMessage("Daily could not connect this call. Check your network and device permissions.");
        };
        const onLeftMeeting = () => {
          if (!disposed && sessionRef.current) setPhase("error");
        };
        call.on("joined-meeting", onJoined);
        call.on("participant-left", onParticipantLeft);
        call.on("participant-joined", onParticipantJoined);
        call.on("camera-error", onCameraError);
        call.on("error", onError);
        call.on("left-meeting", onLeftMeeting);
        const detachListeners = () => {
          call?.off("joined-meeting", onJoined);
          call?.off("participant-left", onParticipantLeft);
          call?.off("participant-joined", onParticipantJoined);
          call?.off("camera-error", onCameraError);
          call?.off("error", onError);
          call?.off("left-meeting", onLeftMeeting);
        };
        const cleanupCall = async () => {
          await destroyCall(call, detachListeners);
          if (callCleanupRef.current === cleanupCall) callCleanupRef.current = null;
        };
        callCleanupRef.current = cleanupCall;
        await call.join({ url: credentials.roomUrl, token: credentials.token });
      } catch (error) {
        if (disposed) return;
        const denied = error instanceof DOMException && error.name === "NotAllowedError";
        setPhase("error");
        setMessage(denied
          ? "Camera or microphone permission was denied. Allow access in your browser settings, then retry."
          : error instanceof Error ? error.message : "Could not connect to Daily.");
      }
    };

    void createAndJoin();
    return () => {
      disposed = true;
      if (callRef.current === call) {
        callRef.current = null;
        const cleanup = callCleanupRef.current;
        callCleanupRef.current = null;
        void (cleanup ? cleanup() : destroyCall(call));
      }
    };
  }, [credentials]);

  useEffect(() => {
    let stopped = false;
    const poll = async () => {
      if (stopped || pollInFlightRef.current) return;
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
          if (status) setSession((previous) => previous ? { ...previous, call_status: status } : previous);
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
          setSession(next);
          setPhase("idle");
        }
      } catch (error) {
        if (!stopped) {
          setNotice(error instanceof Error ? error.message : "Could not check calls.");
        }
      } finally {
        pollInFlightRef.current = false;
      }
    };

    void poll();
    const timer = window.setInterval(() => { if (!stopped) void poll(); }, session ? 2500 : 5000);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [session?.id, closeSession]);

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
    const call = callRef.current;
    if (!call) return;
    const nextMuted = call.localAudio();
    call.setLocalAudio(!nextMuted);
    setMuted(nextMuted);
  }

  function toggleCamera() {
    const call = callRef.current;
    if (!call) return;
    const nextCameraOff = call.localVideo();
    call.setLocalVideo(!nextCameraOff);
    setCameraOff(nextCameraOff);
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
          <section role="dialog" aria-modal="true" aria-labelledby="daily-call-title" className="w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <header className="flex items-center justify-between gap-3 border-b border-[#DCE5EF] px-4 py-3 sm:px-6">
              <div>
                <h2 id="daily-call-title" className="font-semibold text-[#142B49]">SkinWISE {session.call_mode} consultation</h2>
                <p className="text-xs text-[#64748B]">{phase === "joined" ? otherDisconnected ? "The other participant disconnected." : "Connected" : phase === "joining" || phase === "working" ? "Connecting securely…" : session.call_status === "ringing" ? "Waiting for the other participant to accept…" : "Call session"}</p>
              </div>
            </header>
            <div ref={containerRef} className="min-h-48 bg-[#101A28]" />
            {message && <p role="alert" className="mx-4 mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 sm:mx-6">{message}</p>}
            {phase === "error" && (
              <div className="flex justify-end px-4 pt-3 sm:px-6">
                <button type="button" onClick={() => void joinCall(session)} className="rounded-lg bg-[#0D9488] px-4 py-2 text-sm font-semibold text-white">Retry joining</button>
              </div>
            )}
            <footer className="flex flex-wrap items-center justify-center gap-3 border-t border-[#DCE5EF] bg-white px-4 py-3">
              <button type="button" disabled={!callRef.current || phase !== "joined"} onClick={toggleMicrophone} className="min-h-10 rounded-lg border border-[#DCE5EF] px-4 py-2 text-sm font-semibold text-[#243449] disabled:opacity-50">{muted ? "Unmute microphone" : "Mute microphone"}</button>
              <button type="button" disabled={!callRef.current || phase !== "joined"} onClick={toggleCamera} className="min-h-10 rounded-lg border border-[#DCE5EF] px-4 py-2 text-sm font-semibold text-[#243449] disabled:opacity-50">{cameraOff ? "Turn camera on" : "Turn camera off"}</button>
              <button type="button" onClick={() => void endCall()} disabled={phase === "ending" || phase === "working"} className="min-h-11 rounded-lg bg-[#A5404A] px-6 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-[#8F3540] focus:outline-none focus:ring-2 focus:ring-red-300 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60" aria-label="End video call">{phase === "ending" ? "Ending call…" : "End Call"}</button>
            </footer>
          </section>
        </div>
      )}
    </>
  );
}
