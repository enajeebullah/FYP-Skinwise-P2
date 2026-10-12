"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

const MAX_MESSAGE_LENGTH = 2000;

interface AppointmentMessage {
  id: string;
  sender_id: string;
  message: string;
  created_at: string;
}

interface PatientChatDetails {
  doctorName: string;
  doctorSpecialization: string;
  doctorImageUrl: string | null;
  appointmentDate: string;
  appointmentTime: string;
  status: string;
}

interface DoctorChatDetails {
  doctorName: string;
  appointmentDate: string;
  appointmentTime: string;
  patientMessage: string;
  status: string;
}

interface AppointmentChatProps {
  appointmentId: string;
  patientDetails?: PatientChatDetails;
  doctorDetails?: DoctorChatDetails;
}

export default function AppointmentChat({ appointmentId, patientDetails, doctorDetails }: AppointmentChatProps) {
  const [messages, setMessages] = useState<AppointmentMessage[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMessages = useCallback(async () => {
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      setCurrentUserId(null);
      setMessages([]);
      setError(`Could not verify your session${authError ? `: ${authError.message}` : "."}`);
      setLoading(false);
      return;
    }

    setCurrentUserId(user.id);
    const { data, error: loadError } = await supabase
      .from("appointment_messages")
      .select("id, sender_id, message, created_at")
      .eq("appointment_id", appointmentId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });

    if (loadError) {
      setMessages([]);
      setError(`Could not load messages: ${loadError.message}`);
      setLoading(false);
      return;
    }

    setMessages((data ?? []) as AppointmentMessage[]);
    setLoading(false);
  }, [appointmentId]);

  useEffect(() => {
    void loadMessages();
  }, [loadMessages]);

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = draft.trim();
    if (!message || message.length > MAX_MESSAGE_LENGTH || !currentUserId) return;

    setSending(true);
    setError(null);
    const { error: insertError } = await createClient()
      .from("appointment_messages")
      .insert({
        appointment_id: appointmentId,
        sender_id: currentUserId,
        message,
      });

    if (insertError) {
      setError(`Could not send message: ${insertError.message}`);
      setSending(false);
      return;
    }

    setDraft("");
    await loadMessages();
    setSending(false);
  }

  const isPatientView = Boolean(patientDetails);
  const isDoctorView = Boolean(doctorDetails);

  return (
    <section
      className={isPatientView
        ? "mt-5 overflow-hidden rounded-2xl border border-[#DCE7F5] bg-white shadow-[0_12px_36px_rgba(28,63,112,0.08)]"
        : isDoctorView
          ? "mt-5 overflow-hidden rounded-2xl border border-[#DCE7F5] bg-white shadow-[0_14px_40px_rgba(22,46,82,0.1)]"
          : "mt-4 rounded-xl border border-line bg-[#F8FAFD] p-4"}
      aria-label="Appointment chat"
    >
      {patientDetails ? (
        <>
          <header className="border-b border-[#E8EEF7] px-4 py-5 sm:px-6">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#3978C5]">Your appointment</p>
            <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                {patientDetails.doctorImageUrl ? (
                  <img
                    src={patientDetails.doctorImageUrl}
                    alt=""
                    className="h-12 w-12 shrink-0 rounded-full border border-[#E3EAF4] object-cover"
                  />
                ) : (
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#EAF2FB] font-semibold text-[#175BB3]" aria-hidden="true">
                    {patientDetails.doctorName.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <h2 className="truncate font-semibold text-ink">{patientDetails.doctorName}</h2>
                  <p className="mt-0.5 text-sm text-muted">{patientDetails.doctorSpecialization || "Dermatologist"}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-ink/80 sm:justify-end">
                <div>
                  <p className="text-xs font-medium text-muted">Date &amp; time</p>
                  <p className="mt-0.5">{patientDetails.appointmentDate}</p>
                  <p className="text-xs text-muted">{patientDetails.appointmentTime}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${
                  patientDetails.status === "confirmed" || patientDetails.status === "completed"
                    ? "bg-[#E7F2EA] text-[#3E7750]"
                    : patientDetails.status === "rejected" || patientDetails.status === "cancelled"
                      ? "bg-[#F9E8E9] text-[#A5404A]"
                      : "bg-[#FFF3D8] text-[#8C6719]"
                }`}>
                  {patientDetails.status}
                </span>
              </div>
            </div>
          </header>

          <div className="px-4 pb-4 pt-5 sm:px-6 sm:pb-5">
            <div className="mb-4">
              <h3 className="font-display text-xl font-semibold text-ink">Consultation Chat</h3>
              <p className="mt-1 text-sm text-muted">Chat with your dermatologist about your skin concerns.</p>
            </div>

            <div
              className="h-[min(58vh,520px)] min-h-[280px] space-y-4 overflow-y-auto overscroll-contain rounded-xl border border-[#E8EEF7] bg-[#F7FAFE] p-3 sm:p-5"
              aria-live="polite"
              aria-busy={loading}
            >
              {loading ? (
                <div className="flex h-full min-h-[240px] flex-col items-center justify-center text-center" role="status">
                  <span className="h-8 w-8 animate-spin rounded-full border-2 border-[#D8E7F8] border-t-[#3978C5]" aria-hidden="true" />
                  <p className="mt-3 text-sm font-medium text-ink">Loading your conversation…</p>
                  <p className="mt-1 text-xs text-muted">This will only take a moment.</p>
                </div>
              ) : messages.length === 0 ? (
                <div className="flex h-full min-h-[240px] flex-col items-center justify-center px-4 text-center">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#EAF2FB] text-[#3978C5]" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" stroke="currentColor" strokeWidth="1.7">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M7 9h10M7 13h6m-8 7 2.2-3.3A8 8 0 1 1 20 14.5" />
                    </svg>
                  </span>
                  <p className="mt-3 font-medium text-ink">Your conversation starts here</p>
                  <p className="mt-1 max-w-sm text-sm text-muted">Send a message to your dermatologist whenever you’re ready.</p>
                </div>
              ) : (
                messages.map((item) => {
                  const isCurrentUser = currentUserId !== null && item.sender_id === currentUserId;
                  return (
                    <article key={item.id} className="flex w-full items-end gap-2">
                      {!isCurrentUser && (
                        patientDetails.doctorImageUrl ? (
                          <img src={patientDetails.doctorImageUrl} alt="" className="mb-5 h-8 w-8 shrink-0 rounded-full object-cover" />
                        ) : (
                          <span className="mb-5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#E3EDF9] text-xs font-semibold text-[#175BB3]" aria-hidden="true">
                            {patientDetails.doctorName.slice(0, 1).toUpperCase()}
                          </span>
                        )
                      )}
                      <div className={`flex w-fit max-w-[88%] flex-col sm:max-w-[78%] ${isCurrentUser ? "ml-auto items-end" : "mr-auto items-start"}`}>
                        <p className={`mb-1 px-1 text-[11px] font-medium ${isCurrentUser ? "text-[#3978C5]" : "text-muted"}`}>
                          {isCurrentUser ? "You" : patientDetails.doctorName}
                        </p>
                        <div className={`rounded-2xl px-4 py-3 shadow-sm ${
                          isCurrentUser
                            ? "rounded-br-md bg-gradient-to-br from-[#4C8EF5] to-[#2869D8] text-white"
                            : "rounded-bl-md border border-[#E4EBF4] bg-white text-ink"
                        }`}>
                          <p className="whitespace-pre-wrap break-words text-sm leading-6">{item.message}</p>
                          <time
                            dateTime={item.created_at}
                            className={`mt-1.5 block text-[11px] ${isCurrentUser ? "text-blue-100" : "text-muted"}`}
                          >
                            {new Date(item.created_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                          </time>
                        </div>
                      </div>
                    </article>
                  );
                })
              )}
            </div>

            {error && (
              <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {error}
              </p>
            )}

            <form onSubmit={sendMessage} className="mt-4">
              <label htmlFor={`appointment-message-${appointmentId}`} className="sr-only">Write a message</label>
              <div className="flex items-end gap-2 rounded-xl border border-[#DCE5F1] bg-white p-2 shadow-sm transition focus-within:border-[#77A9E8] focus-within:ring-2 focus-within:ring-[#77A9E8]/20">
                <textarea
                  id={`appointment-message-${appointmentId}`}
                  rows={2}
                  maxLength={MAX_MESSAGE_LENGTH}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Write your message…"
                  className="max-h-32 min-h-12 flex-1 resize-y border-0 bg-transparent px-2 py-2 text-sm leading-5 text-ink outline-none placeholder:text-muted focus:ring-0 disabled:opacity-60"
                  disabled={sending || !currentUserId}
                />
                <button
                  type="submit"
                  disabled={sending || !currentUserId || !draft.trim() || draft.length > MAX_MESSAGE_LENGTH}
                  className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg bg-[#3978E8] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#2869D8] focus:outline-none focus:ring-2 focus:ring-[#3978E8]/40 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-55"
                >
                  {sending ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />
                      Sending…
                    </>
                  ) : (
                    <>
                      Send
                      <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
                        <path d="m3 10 14-7-4.5 14-2.4-5.1L3 10Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                        <path d="m10.1 11.9 3.2-3.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                      </svg>
                    </>
                  )}
                </button>
              </div>
              <div className="mt-2 flex flex-wrap justify-between gap-x-3 gap-y-1 px-1 text-xs text-muted">
                <span>{draft.length}/{MAX_MESSAGE_LENGTH} characters</span>
                {!currentUserId && !loading && <span>Sign in again to send a message.</span>}
              </div>
            </form>
          </div>
        </>
      ) : doctorDetails ? (
        <>
          <header className="border-b border-[#E6EDF7] bg-white px-4 py-5 sm:px-6">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#3978C5]">Patient consultation</p>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[#DCE7F5] bg-[#EAF2FB] font-semibold text-[#175BB3]" aria-hidden="true">P</span>
                <div className="min-w-0">
                  <h2 className="font-semibold text-[#172B4D]">Patient</h2>
                  <p className="mt-0.5 text-sm text-muted">{doctorDetails.doctorName} · Appointment consultation</p>
                </div>
              </div>
              <span className={`rounded-full px-3 py-1.5 text-xs font-semibold capitalize ${
                doctorDetails.status === "confirmed" || doctorDetails.status === "completed"
                  ? "bg-[#E7F2EA] text-[#3E7750]"
                  : doctorDetails.status === "rejected" || doctorDetails.status === "cancelled"
                    ? "bg-[#F9E8E9] text-[#A5404A]"
                    : "bg-[#FFF3D8] text-[#8C6719]"
              }`}>
                {doctorDetails.status}
              </span>
            </div>
          </header>

          <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_240px] lg:gap-5">
            <div className="min-w-0">
              <div className="mb-4">
                <h3 className="font-display text-xl font-semibold text-[#172B4D]">Patient Consultation Chat</h3>
                <p className="mt-1 text-sm text-muted">A private conversation between you and your patient.</p>
              </div>

              <div
                className="h-[min(58vh,560px)] min-h-[280px] space-y-4 overflow-y-auto overscroll-contain scroll-smooth rounded-xl border border-[#E6EDF7] bg-[#F6F9FE] p-3 sm:p-5"
                aria-live="polite"
                aria-busy={loading}
              >
                {loading ? (
                  <div className="flex h-full min-h-[240px] flex-col items-center justify-center text-center" role="status">
                    <span className="h-8 w-8 animate-spin rounded-full border-2 border-[#D8E7F8] border-t-[#3978C5]" aria-hidden="true" />
                    <p className="mt-3 text-sm font-medium text-[#172B4D]">Loading conversation…</p>
                    <p className="mt-1 text-xs text-muted">Messages will appear here.</p>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex h-full min-h-[240px] flex-col items-center justify-center px-4 text-center">
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#EAF2FB] text-[#3978C5]" aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" stroke="currentColor" strokeWidth="1.7">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7 9h10M7 13h6m-8 7 2.2-3.3A8 8 0 1 1 20 14.5" />
                      </svg>
                    </span>
                    <p className="mt-3 font-medium text-[#172B4D]">No messages yet</p>
                    <p className="mt-1 max-w-sm text-sm text-muted">Send a message to begin the consultation with your patient.</p>
                  </div>
                ) : (
                  messages.map((item) => {
                    const isCurrentUser = currentUserId !== null && item.sender_id === currentUserId;
                    return (
                      <article key={item.id} className="flex w-full items-end gap-2">
                        {!isCurrentUser && (
                          <span className="mb-5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#E3EDF9] text-xs font-semibold text-[#175BB3]" aria-hidden="true">
                            P
                          </span>
                        )}
                        <div className={`flex w-fit max-w-[88%] flex-col sm:max-w-[78%] ${isCurrentUser ? "ml-auto items-end" : "mr-auto items-start"}`}>
                          <p className={`mb-1 px-1 text-[11px] font-medium ${isCurrentUser ? "text-[#3978C5]" : "text-muted"}`}>
                            {isCurrentUser ? "You" : "Patient"}
                          </p>
                          <div className={`rounded-2xl px-4 py-3 shadow-sm ${
                            isCurrentUser
                              ? "rounded-br-md bg-[#2F76E5] text-white"
                              : "rounded-bl-md border border-[#E2EAF5] bg-white text-[#172B4D]"
                          }`}>
                            <p className="whitespace-pre-wrap break-words text-sm leading-6">{item.message}</p>
                            <time
                              dateTime={item.created_at}
                              className={`mt-1.5 block text-[11px] ${isCurrentUser ? "text-blue-100" : "text-muted"}`}
                            >
                              {new Date(item.created_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                            </time>
                          </div>
                        </div>
                      </article>
                    );
                  })
                )}
              </div>

              {error && (
                <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                  {error}
                </p>
              )}

              <form onSubmit={sendMessage} className="mt-4">
                <label htmlFor={`appointment-message-${appointmentId}`} className="sr-only">Write a message</label>
                <div className="flex items-end gap-2 rounded-xl border border-[#DCE5F1] bg-white p-2 shadow-sm transition focus-within:border-[#77A9E8] focus-within:ring-2 focus-within:ring-[#77A9E8]/20">
                  <textarea
                    id={`appointment-message-${appointmentId}`}
                    rows={2}
                    maxLength={MAX_MESSAGE_LENGTH}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder="Write a message to your patient…"
                    className="max-h-32 min-h-12 flex-1 resize-y border-0 bg-transparent px-2 py-2 text-sm leading-5 text-ink outline-none placeholder:text-muted focus:ring-0 disabled:opacity-60"
                    disabled={sending || !currentUserId}
                  />
                  <button
                    type="submit"
                    disabled={sending || !currentUserId || !draft.trim() || draft.length > MAX_MESSAGE_LENGTH}
                    className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg bg-[#3978E8] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#2869D8] focus:outline-none focus:ring-2 focus:ring-[#3978E8]/40 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-55"
                  >
                    {sending ? (
                      <>
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />
                        Sending…
                      </>
                    ) : (
                      <>
                        Send
                        <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
                          <path d="m3 10 14-7-4.5 14-2.4-5.1L3 10Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                          <path d="m10.1 11.9 3.2-3.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                        </svg>
                      </>
                    )}
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap justify-between gap-x-3 gap-y-1 px-1 text-xs text-muted">
                  <span>{draft.length}/{MAX_MESSAGE_LENGTH} characters</span>
                  {!currentUserId && !loading && <span>Sign in again to send a message.</span>}
                </div>
              </form>
            </div>

            <div className="grid h-fit gap-4 lg:mt-[3.45rem]">
              <aside className="rounded-xl border border-[#E2EAF5] bg-white p-4 shadow-sm">
                <h4 className="font-semibold text-[#172B4D]">Appointment Details</h4>
                <dl className="mt-4 space-y-4">
                  <div>
                    <dt className="text-xs font-medium text-muted">Status</dt>
                    <dd>
                      <span className={`mt-1 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${
                        doctorDetails.status === "confirmed" || doctorDetails.status === "completed"
                          ? "bg-[#E7F2EA] text-[#3E7750]"
                          : doctorDetails.status === "rejected" || doctorDetails.status === "cancelled"
                            ? "bg-[#F9E8E9] text-[#A5404A]"
                            : "bg-[#FFF3D8] text-[#8C6719]"
                      }`}>
                        {doctorDetails.status}
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-muted">Date &amp; time</dt>
                    <dd className="mt-1 text-sm leading-5 text-[#172B4D]">{doctorDetails.appointmentDate}</dd>
                    <dd className="text-xs leading-5 text-muted">{doctorDetails.appointmentTime}</dd>
                  </div>
                  {doctorDetails.patientMessage && (
                    <div>
                      <dt className="text-xs font-medium text-muted">Patient’s request</dt>
                      <dd className="mt-1 whitespace-pre-wrap break-words text-sm leading-5 text-[#344563]">{doctorDetails.patientMessage}</dd>
                    </div>
                  )}
                </dl>
              </aside>
              <aside className="rounded-xl border border-[#DCE7F5] bg-[#EDF4FE] p-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-[#3978C5]" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.7">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3 5 6v5c0 4.5 2.9 8.1 7 10 4.1-1.9 7-5.5 7-10V6l-7-3Z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="m9 12 2 2 4-4" />
                  </svg>
                </div>
                <h4 className="mt-3 text-sm font-semibold text-[#24539A]">Private consultation</h4>
                <p className="mt-1 text-xs leading-5 text-[#53698E]">This conversation is for the appointment participants only.</p>
              </aside>
            </div>
          </div>
        </>
      ) : (
        <>
          <h4 className="font-semibold text-ink">Messages</h4>

          {error && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}

          <div className="mt-3 grid max-h-80 gap-2 overflow-y-auto" aria-live="polite">
            {loading ? (
              <p className="text-sm text-muted">Loading messages…</p>
            ) : messages.length === 0 ? (
              <p className="rounded-lg bg-white p-3 text-sm text-muted">No messages yet. Start the conversation here.</p>
            ) : (
              messages.map((item) => (
                <article key={item.id} className="rounded-lg border border-line bg-white p-3">
                  <p className="text-xs font-medium text-muted">
                    {item.sender_id === currentUserId ? "You" : "Appointment participant"}
                    {" · "}
                    <time dateTime={item.created_at}>{new Date(item.created_at).toLocaleString()}</time>
                  </p>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm text-ink">{item.message}</p>
                </article>
              ))
            )}
          </div>

          <form onSubmit={sendMessage} className="mt-3 grid gap-2">
            <label htmlFor={`appointment-message-${appointmentId}`} className="sr-only">Write a message</label>
            <textarea
              id={`appointment-message-${appointmentId}`}
              rows={3}
              maxLength={MAX_MESSAGE_LENGTH}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Write a message…"
              className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm"
              disabled={sending || !currentUserId}
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-muted">{draft.length}/{MAX_MESSAGE_LENGTH}</span>
              <button
                type="submit"
                disabled={sending || !currentUserId || !draft.trim() || draft.length > MAX_MESSAGE_LENGTH}
                className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {sending ? "Sending…" : "Send"}
              </button>
            </div>
          </form>
        </>
      )}
    </section>
  );
}
