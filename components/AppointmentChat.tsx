"use client";

import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

const MAX_MESSAGE_LENGTH = 2000;
const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;
const ATTACHMENT_BUCKET = "appointment-chat-attachments";
const ATTACHMENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  pdf: "application/pdf",
};

interface AppointmentMessage {
  id: string;
  sender_id: string;
  message: string | null;
  created_at: string;
  attachment_storage_path: string | null;
  attachment_file_name: string | null;
  attachment_content_type: string | null;
  attachment_size_bytes: number | null;
}

interface PendingAttachment {
  file: File;
  storagePath: string;
  contentType: string;
  fileName: string;
  uploaded: boolean;
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

interface ChatComposerProps {
  appointmentId: string;
  draft: string;
  selectedFile: File | null;
  sending: boolean;
  uploadProgress: number | null;
  currentUserId: string | null;
  onDraftChange: (value: string) => void;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

function validateAttachment(file: File): string | null {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const expectedType = ATTACHMENT_TYPES[extension];

  if (!expectedType || (file.type && file.type !== expectedType)) {
    return "Choose a JPG, PNG, WebP, GIF, or PDF file.";
  }
  if (file.size <= 0 || file.size > MAX_ATTACHMENT_SIZE) {
    return "Attachments must be smaller than 10 MB.";
  }
  return null;
}

function uploadWithProgress(
  file: File,
  storagePath: string,
  accessToken: string,
  onProgress: (progress: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const apiKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!baseUrl || !apiKey) {
      reject(new Error("Supabase Storage is not configured."));
      return;
    }

    const encodedPath = storagePath.split("/").map(encodeURIComponent).join("/");
    request.open("POST", `${baseUrl}/storage/v1/object/${ATTACHMENT_BUCKET}/${encodedPath}`);
    request.setRequestHeader("apikey", apiKey);
    request.setRequestHeader("Authorization", `Bearer ${accessToken}`);
    request.setRequestHeader("Content-Type", file.type || ATTACHMENT_TYPES[file.name.split(".").pop()?.toLowerCase() ?? ""]);
    request.setRequestHeader("x-upsert", "false");
    request.timeout = 120000;
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onerror = () => reject(new Error("Network error while uploading the attachment."));
    request.ontimeout = () => reject(new Error("Attachment upload timed out. Retry sending the message."));
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        resolve();
        return;
      }
      let message = `Storage upload failed (${request.status}).`;
      try {
        const response = JSON.parse(request.responseText) as { message?: string; error?: string };
        message = response.message ?? response.error ?? message;
      } catch {
        // Keep the explicit HTTP error when Storage returns a non-JSON response.
      }
      reject(new Error(message));
    };
    request.send(file);
  });
}

async function uploadedFileMatches(
  file: File,
  storagePath: string
): Promise<boolean> {
  const { data, error } = await createClient()
    .storage.from(ATTACHMENT_BUCKET)
    .download(storagePath);
  if (error || !data || data.size !== file.size) return false;

  const [storedBytes, selectedBytes] = await Promise.all([
    data.arrayBuffer(),
    file.arrayBuffer(),
  ]);
  const stored = new Uint8Array(storedBytes);
  const selected = new Uint8Array(selectedBytes);
  return stored.every((byte, index) => byte === selected[index]);
}

function MessageAttachment({ message }: { message: AppointmentMessage }) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let createdUrl: string | null = null;
    if (!message.attachment_storage_path) return;

    void createClient()
      .storage.from(ATTACHMENT_BUCKET)
      .download(message.attachment_storage_path)
      .then(({ data, error: downloadError }) => {
        if (downloadError || !data) {
          if (active) setLoadError(downloadError?.message ?? "Attachment could not be loaded.");
          return;
        }
        createdUrl = URL.createObjectURL(data);
        if (active) setObjectUrl(createdUrl);
      })
      .catch((downloadError: unknown) => {
        if (active) setLoadError(downloadError instanceof Error ? downloadError.message : "Attachment could not be loaded.");
      });

    return () => {
      active = false;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [message.attachment_storage_path]);

  if (!message.attachment_storage_path) return null;
  const isImage = message.attachment_content_type?.startsWith("image/") ?? false;

  return (
    <div className="mt-2 max-w-full">
      {loadError ? (
        <p className="text-xs opacity-80">Attachment unavailable: {loadError}</p>
      ) : objectUrl ? (
        <>
          {isImage ? (
            <a href={objectUrl} target="_blank" rel="noopener noreferrer" aria-label={`Open ${message.attachment_file_name ?? "image"}`}>
              <img
                src={objectUrl}
                alt={message.attachment_file_name ?? "Appointment attachment"}
                className="max-h-64 max-w-full rounded-lg object-contain"
              />
            </a>
          ) : (
            <a
              href={objectUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block max-w-full truncate text-sm font-medium underline"
            >
              PDF document · {message.attachment_file_name}
            </a>
          )}
          <a
            href={objectUrl}
            download={message.attachment_file_name ?? "appointment-attachment"}
            className="mt-1 inline-block text-xs underline"
          >
            Download {isImage ? "image" : "document"}
          </a>
        </>
      ) : (
        <p className="text-xs opacity-80">Loading attachment…</p>
      )}
    </div>
  );
}

function ChatComposer({
  appointmentId,
  draft,
  selectedFile,
  sending,
  uploadProgress,
  currentUserId,
  onDraftChange,
  onFileChange,
  onSubmit,
}: ChatComposerProps) {
  const canSend = Boolean(draft.trim() || selectedFile);
  return (
    <form onSubmit={onSubmit} className="mt-4">
      <label htmlFor={`appointment-message-${appointmentId}`} className="sr-only">Write a message</label>
      <div className="flex items-end gap-2 rounded-xl border border-[#DCE5EF] bg-white p-2 shadow-sm transition focus-within:border-[#0D9488] focus-within:ring-2 focus-within:ring-[#0D9488]/20">
        <textarea
          id={`appointment-message-${appointmentId}`}
          rows={2}
          maxLength={MAX_MESSAGE_LENGTH}
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          placeholder="Write a message…"
          className="max-h-32 min-h-12 flex-1 resize-y border-0 bg-transparent px-2 py-2 text-sm leading-5 text-[#243449] outline-none placeholder:text-[#64748B] focus:ring-0 disabled:opacity-60"
          disabled={sending || !currentUserId}
        />
        <label
          htmlFor={`appointment-attachment-${appointmentId}`}
          className={`inline-flex min-h-11 shrink-0 cursor-pointer items-center rounded-lg border border-[#DCE5EF] px-3 text-sm font-medium text-[#243449] hover:bg-[#F3F7FB] focus-within:ring-2 focus-within:ring-[#0D9488]/20 ${sending || !currentUserId ? "pointer-events-none opacity-50" : ""}`}
        >
          Attach
        </label>
        <input
          id={`appointment-attachment-${appointmentId}`}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,.jpg,.jpeg,.png,.webp,.gif,.pdf"
          className="sr-only"
          onChange={onFileChange}
          disabled={sending || !currentUserId || uploadProgress === 100}
        />
        <button
          type="submit"
          disabled={sending || !currentUserId || !canSend || draft.length > MAX_MESSAGE_LENGTH}
          className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg bg-[#0D9488] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0F766E] focus:outline-none focus:ring-2 focus:ring-[#5EEAD4] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-55"
        >
          {sending ? "Sending…" : "Send"}
        </button>
      </div>
      {selectedFile && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[#E6F7F5] px-3 py-2 text-xs text-[#0F766E]">
          <span className="min-w-0 truncate">{selectedFile.name} · {(selectedFile.size / (1024 * 1024)).toFixed(1)} MB</span>
          {uploadProgress !== null && <span>{uploadProgress < 100 ? `Uploading ${uploadProgress}%` : "Saving message…"}</span>}
        </div>
      )}
      <div className="mt-2 flex flex-wrap justify-between gap-x-3 gap-y-1 px-1 text-xs text-[#64748B]">
        <span>{draft.length}/{MAX_MESSAGE_LENGTH} characters · Images/PDF up to 10 MB</span>
        {!currentUserId && <span>Sign in again to send a message.</span>}
      </div>
      {uploadProgress !== null && (
        <progress className="mt-1 h-1 w-full accent-[#0D9488]" max={100} value={uploadProgress} aria-label="Attachment upload progress" />
      )}
    </form>
  );
}

export default function AppointmentChat({ appointmentId, patientDetails, doctorDetails }: AppointmentChatProps) {
  const [messages, setMessages] = useState<AppointmentMessage[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pendingAttachment, setPendingAttachment] = useState<PendingAttachment | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

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
      .select("id, sender_id, message, created_at, attachment_storage_path, attachment_file_name, attachment_content_type, attachment_size_bytes")
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
    if ((!message && !pendingAttachment) || message.length > MAX_MESSAGE_LENGTH || !currentUserId) return;

    setSending(true);
    setError(null);
    let attachment = pendingAttachment;
    let uploadAttempted = false;
    let messageInsertFailed = false;
    try {
      const supabase = createClient();
      if (selectedFile && !attachment) {
        const validationError = validateAttachment(selectedFile);
        if (validationError) throw new Error(validationError);
        const extension = selectedFile.name.split(".").pop()?.toLowerCase() ?? "";
        const safeName = selectedFile.name.replace(/[\\/]/g, "_").slice(0, 255);
        attachment = {
          file: selectedFile,
          storagePath: `${appointmentId}/${crypto.randomUUID()}.${extension}`,
          contentType: ATTACHMENT_TYPES[extension],
          fileName: safeName,
          uploaded: false,
        };
        setPendingAttachment(attachment);
      }

      if (attachment && !attachment.uploaded) {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !session) throw new Error(`Could not verify upload session${sessionError ? `: ${sessionError.message}` : "."}`);
        setUploadProgress(0);
        uploadAttempted = true;
        try {
          await uploadWithProgress(
            attachment.file,
            attachment.storagePath,
            session.access_token,
            setUploadProgress
          );
        } catch (uploadError) {
          const verified = await uploadedFileMatches(attachment.file, attachment.storagePath);
          if (!verified) throw uploadError;
        }
        attachment = { ...attachment, uploaded: true };
        setPendingAttachment(attachment);
      }

      if (attachment) {
        const { data: existingMessage, error: existingMessageError } = await supabase
          .from("appointment_messages")
          .select("id")
          .eq("attachment_storage_path", attachment.storagePath)
          .maybeSingle();
        if (existingMessageError) throw new Error(`Could not verify whether the message was already sent: ${existingMessageError.message}`);
        if (existingMessage) {
          setDraft("");
          setSelectedFile(null);
          setPendingAttachment(null);
          await loadMessages();
          return;
        }
      }

      messageInsertFailed = true;
      const { error: insertError } = await supabase
        .from("appointment_messages")
        .insert({
          appointment_id: appointmentId,
          sender_id: currentUserId,
          message: message || null,
          attachment_storage_path: attachment?.storagePath ?? null,
          attachment_file_name: attachment?.fileName ?? null,
          attachment_content_type: attachment?.contentType ?? null,
          attachment_size_bytes: attachment?.file.size ?? null,
        });
      if (insertError) throw new Error(`Could not send message: ${insertError.message}`);
      messageInsertFailed = false;

      setDraft("");
      setSelectedFile(null);
      setPendingAttachment(null);
      await loadMessages();
    } catch (sendError) {
      let messageText = sendError instanceof Error ? sendError.message : "Could not send message.";
      if (attachment && (messageInsertFailed || uploadAttempted)) {
        try {
          const { error: cleanupError } = await createClient()
            .storage.from(ATTACHMENT_BUCKET)
            .remove([attachment.storagePath]);
          if (cleanupError) {
            if (attachment.uploaded) {
              messageText += ` The uploaded file could not be removed and is retained for a safe retry: ${cleanupError.message}`;
              setPendingAttachment(attachment);
            } else {
              messageText += ` Upload cleanup failed; the unattached file may remain for scheduled cleanup: ${cleanupError.message}`;
              setPendingAttachment(null);
            }
          } else {
            setPendingAttachment({ ...attachment, uploaded: false });
          }
        } catch (cleanupError) {
          const detail = cleanupError instanceof Error ? cleanupError.message : "Unknown Storage cleanup error.";
          if (attachment.uploaded) {
            messageText += ` The uploaded file could not be removed and is retained for a safe retry: ${detail}`;
            setPendingAttachment(attachment);
          } else {
            messageText += ` Upload cleanup failed; the unattached file may remain for scheduled cleanup: ${detail}`;
            setPendingAttachment(null);
          }
        }
      }
      setError(messageText);
    } finally {
      setSending(false);
      setUploadProgress(null);
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0] ?? null;
    event.currentTarget.value = "";
    if (!file) return;
    if (pendingAttachment?.uploaded) {
      setError("Retry sending the current attachment before choosing another file.");
      return;
    }
    const validationError = validateAttachment(file);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setSelectedFile(file);
    setPendingAttachment(null);
  }

  const isPatientView = Boolean(patientDetails);
  const isDoctorView = Boolean(doctorDetails);

  return (
    <section
      className={isPatientView
        ? "mt-5 overflow-hidden rounded-2xl border border-[#DCE5EF] bg-white shadow-[0_12px_36px_rgba(20,43,73,0.08)]"
        : isDoctorView
          ? "mt-5 overflow-hidden rounded-2xl border border-[#DCE5EF] bg-white shadow-[0_14px_40px_rgba(20,43,73,0.1)]"
          : "mt-4 rounded-xl border border-[#DCE5EF] bg-[#F3F7FB] p-4"}
      aria-label="Appointment chat"
    >
      {patientDetails ? (
        <>
          <header className="border-b border-[#DCE5EF] px-4 py-5 sm:px-6">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#0D9488]">Your appointment</p>
            <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                {patientDetails.doctorImageUrl ? (
                  <img
                    src={patientDetails.doctorImageUrl}
                    alt=""
                    className="h-12 w-12 shrink-0 rounded-full border border-[#DCE5EF] object-cover"
                  />
                ) : (
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#D8F3EF] font-semibold text-[#0F766E]" aria-hidden="true">
                    {patientDetails.doctorName.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <h2 className="truncate font-semibold text-[#142B49]">{patientDetails.doctorName}</h2>
                  <p className="mt-0.5 text-sm text-[#64748B]">{patientDetails.doctorSpecialization || "Dermatologist"}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-[#243449]/80 sm:justify-end">
                <div>
                  <p className="text-xs font-medium text-[#64748B]">Date &amp; time</p>
                  <p className="mt-0.5">{patientDetails.appointmentDate}</p>
                  <p className="text-xs text-[#64748B]">{patientDetails.appointmentTime}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${
                  patientDetails.status === "confirmed" || patientDetails.status === "completed"
                    ? "bg-[#E6F7F5] text-[#0F766E]"
                    : patientDetails.status === "rejected" || patientDetails.status === "cancelled"
                      ? "bg-[#FFF0F1] text-[#A5404A]"
                      : "bg-[#FFF7E5] text-[#806016]"
                }`}>
                  {patientDetails.status}
                </span>
              </div>
            </div>
          </header>

          <div className="px-4 pb-4 pt-5 sm:px-6 sm:pb-5">
            <div className="mb-4">
              <h3 className="font-display text-xl font-semibold text-[#142B49]">Consultation Chat</h3>
              <p className="mt-1 text-sm text-[#64748B]">Chat with your dermatologist about your skin concerns.</p>
            </div>

            <div
              className="h-[min(58vh,520px)] min-h-[280px] space-y-4 overflow-y-auto overscroll-contain rounded-xl border border-[#DCE5EF] bg-[#F3F7FB] p-3 sm:p-5"
              aria-live="polite"
              aria-busy={loading}
            >
              {loading ? (
                <div className="flex h-full min-h-[240px] flex-col items-center justify-center text-center" role="status">
                  <span className="h-8 w-8 animate-spin rounded-full border-2 border-[#B8E5DF] border-t-[#0D9488]" aria-hidden="true" />
                  <p className="mt-3 text-sm font-medium text-[#243449]">Loading your conversation…</p>
                  <p className="mt-1 text-xs text-[#64748B]">This will only take a moment.</p>
                </div>
              ) : messages.length === 0 ? (
                <div className="flex h-full min-h-[240px] flex-col items-center justify-center px-4 text-center">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#D8F3EF] text-[#0D9488]" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" stroke="currentColor" strokeWidth="1.7">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M7 9h10M7 13h6m-8 7 2.2-3.3A8 8 0 1 1 20 14.5" />
                    </svg>
                  </span>
                  <p className="mt-3 font-medium text-[#243449]">Your conversation starts here</p>
                  <p className="mt-1 max-w-sm text-sm text-[#64748B]">Send a message to your dermatologist whenever you’re ready.</p>
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
                          <span className="mb-5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#D8F3EF] text-xs font-semibold text-[#0F766E]" aria-hidden="true">
                            {patientDetails.doctorName.slice(0, 1).toUpperCase()}
                          </span>
                        )
                      )}
                      <div className={`flex w-fit max-w-[88%] flex-col sm:max-w-[78%] ${isCurrentUser ? "ml-auto items-end" : "mr-auto items-start"}`}>
                        <p className={`mb-1 px-1 text-[11px] font-medium ${isCurrentUser ? "text-[#0D9488]" : "text-[#64748B]"}`}>
                          {isCurrentUser ? "You" : patientDetails.doctorName}
                        </p>
                        <div className={`rounded-2xl px-4 py-3 shadow-sm ${
                          isCurrentUser
                            ? "rounded-br-md bg-[#0D9488] text-white"
                            : "rounded-bl-md border border-[#DCE5EF] bg-[#F8FAFC] text-[#243449]"
                        }`}>
                          {item.message && <p className="whitespace-pre-wrap break-words text-sm leading-6">{item.message}</p>}
                          <MessageAttachment message={item} />
                          <time
                            dateTime={item.created_at}
                            className={`mt-1.5 block text-[11px] ${isCurrentUser ? "text-[#D8F3EF]" : "text-[#64748B]"}`}
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

            <ChatComposer
              appointmentId={appointmentId}
              draft={draft}
              selectedFile={selectedFile}
              sending={sending}
              uploadProgress={uploadProgress}
              currentUserId={currentUserId}
              onDraftChange={setDraft}
              onFileChange={handleFileChange}
              onSubmit={sendMessage}
            />
          </div>
        </>
      ) : doctorDetails ? (
        <>
          <header className="border-b border-[#DCE5EF] bg-gradient-to-r from-white to-[#F3F7FB] px-4 py-5 sm:px-6">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#0D9488]">Patient consultation</p>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[#B8E5DF] bg-[#D8F3EF] font-semibold text-[#0F766E]" aria-hidden="true">P</span>
                <div className="min-w-0">
                  <h2 className="font-semibold text-[#142B49]">Patient</h2>
                  <p className="mt-0.5 text-sm text-[#64748B]">{doctorDetails.doctorName} · Appointment consultation</p>
                </div>
              </div>
              <span className={`rounded-full px-3 py-1.5 text-xs font-semibold capitalize ${
                doctorDetails.status === "confirmed" || doctorDetails.status === "completed"
                  ? "bg-[#E6F7F5] text-[#0F766E]"
                  : doctorDetails.status === "rejected" || doctorDetails.status === "cancelled"
                    ? "bg-[#FFF0F1] text-[#A5404A]"
                    : "bg-[#FFF7E5] text-[#806016]"
              }`}>
                {doctorDetails.status}
              </span>
            </div>
          </header>

          <div className="grid gap-4 bg-[#F3F7FB] p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_250px] lg:gap-5">
            <div className="min-w-0">
              <div className="mb-4">
                <h3 className="font-display text-xl font-semibold text-[#142B49]">Patient Consultation Chat</h3>
                <p className="mt-1 text-sm text-[#64748B]">A private conversation between you and your patient.</p>
              </div>

              <div
                className="h-[min(58vh,560px)] min-h-[280px] space-y-4 overflow-y-auto overscroll-contain scroll-smooth rounded-xl border border-[#DCE5EF] bg-white p-3 sm:p-5"
                aria-live="polite"
                aria-busy={loading}
              >
                {loading ? (
                  <div className="flex h-full min-h-[240px] flex-col items-center justify-center text-center" role="status">
                    <span className="h-8 w-8 animate-spin rounded-full border-2 border-[#B8E5DF] border-t-[#0D9488]" aria-hidden="true" />
                    <p className="mt-3 text-sm font-medium text-[#243449]">Loading conversation…</p>
                    <p className="mt-1 text-xs text-[#64748B]">Messages will appear here.</p>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex h-full min-h-[240px] flex-col items-center justify-center px-4 text-center">
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#D8F3EF] text-[#0D9488]" aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" stroke="currentColor" strokeWidth="1.7">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7 9h10M7 13h6m-8 7 2.2-3.3A8 8 0 1 1 20 14.5" />
                      </svg>
                    </span>
                    <p className="mt-3 font-medium text-[#243449]">No messages yet</p>
                    <p className="mt-1 max-w-sm text-sm text-[#64748B]">Send a message to begin the consultation with your patient.</p>
                  </div>
                ) : (
                  messages.map((item) => {
                    const isCurrentUser = currentUserId !== null && item.sender_id === currentUserId;
                    return (
                      <article key={item.id} className="flex w-full items-end gap-2">
                        {!isCurrentUser && (
                          <span className="mb-5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#D8F3EF] text-xs font-semibold text-[#0F766E]" aria-hidden="true">
                            P
                          </span>
                        )}
                        <div className={`flex w-fit max-w-[88%] flex-col sm:max-w-[78%] ${isCurrentUser ? "ml-auto items-end" : "mr-auto items-start"}`}>
                          <p className={`mb-1 px-1 text-[11px] font-medium ${isCurrentUser ? "text-[#0D9488]" : "text-[#64748B]"}`}>
                            {isCurrentUser ? "You" : "Patient"}
                          </p>
                          <div className={`rounded-2xl px-4 py-3 shadow-sm ${
                            isCurrentUser
                              ? "rounded-br-md bg-[#0D9488] text-white"
                              : "rounded-bl-md border border-[#DCE5EF] bg-[#F8FAFC] text-[#243449]"
                          }`}>
                            {item.message && <p className="whitespace-pre-wrap break-words text-sm leading-6">{item.message}</p>}
                            <MessageAttachment message={item} />
                            <time
                              dateTime={item.created_at}
                              className={`mt-1.5 block text-[11px] ${isCurrentUser ? "text-[#D8F3EF]" : "text-[#64748B]"}`}
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

              <ChatComposer
                appointmentId={appointmentId}
                draft={draft}
                selectedFile={selectedFile}
                sending={sending}
                uploadProgress={uploadProgress}
                currentUserId={currentUserId}
                onDraftChange={setDraft}
                onFileChange={handleFileChange}
                onSubmit={sendMessage}
              />
            </div>

            <div className="grid h-fit gap-4 lg:mt-[3.45rem]">
              <aside className="rounded-xl border border-[#DCE5EF] bg-white p-4 shadow-[0_8px_22px_rgba(20,43,73,0.05)]">
                <h4 className="font-semibold text-[#142B49]">Appointment Details</h4>
                <dl className="mt-4 space-y-4">
                  <div>
                    <dt className="text-xs font-medium text-[#64748B]">Status</dt>
                    <dd>
                      <span className={`mt-1 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${
                        doctorDetails.status === "confirmed" || doctorDetails.status === "completed"
                    ? "bg-[#E6F7F5] text-[#0F766E]"
                          : doctorDetails.status === "rejected" || doctorDetails.status === "cancelled"
                            ? "bg-[#FFF0F1] text-[#A5404A]"
                    : "bg-[#FFF7E5] text-[#806016]"
                      }`}>
                        {doctorDetails.status}
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-[#64748B]">Date &amp; time</dt>
                    <dd className="mt-1 text-sm leading-5 text-[#243449]">{doctorDetails.appointmentDate}</dd>
                    <dd className="text-xs leading-5 text-[#64748B]">{doctorDetails.appointmentTime}</dd>
                  </div>
                  {doctorDetails.patientMessage && (
                    <div>
                      <dt className="text-xs font-medium text-[#64748B]">Patient’s request</dt>
                      <dd className="mt-1 whitespace-pre-wrap break-words text-sm leading-5 text-[#243449]">{doctorDetails.patientMessage}</dd>
                    </div>
                  )}
                </dl>
              </aside>
              <aside className="rounded-xl border border-[#B8E5DF] bg-[#E6F7F5] p-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-[#0D9488]" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.7">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3 5 6v5c0 4.5 2.9 8.1 7 10 4.1-1.9 7-5.5 7-10V6l-7-3Z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="m9 12 2 2 4-4" />
                  </svg>
                </div>
                <h4 className="mt-3 text-sm font-semibold text-[#0F766E]">Private consultation</h4>
                <p className="mt-1 text-xs leading-5 text-[#365568]">This conversation is for the appointment participants only.</p>
              </aside>
            </div>
          </div>
        </>
      ) : (
        <>
          <h4 className="font-semibold text-[#142B49]">Messages</h4>

          {error && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}

          <div className="mt-3 grid max-h-80 gap-2 overflow-y-auto" aria-live="polite">
            {loading ? (
              <p className="text-sm text-[#64748B]">Loading messages…</p>
            ) : messages.length === 0 ? (
              <p className="rounded-lg border border-[#DCE5EF] bg-white p-3 text-sm text-[#64748B]">No messages yet. Start the conversation here.</p>
            ) : (
              messages.map((item) => (
                <article key={item.id} className="rounded-lg border border-[#DCE5EF] bg-white p-3">
                  <p className="text-xs font-medium text-[#64748B]">
                    {item.sender_id === currentUserId ? "You" : "Appointment participant"}
                    {" · "}
                    <time dateTime={item.created_at}>{new Date(item.created_at).toLocaleString()}</time>
                  </p>
                  {item.message && <p className="mt-1 whitespace-pre-wrap break-words text-sm text-[#243449]">{item.message}</p>}
                  <MessageAttachment message={item} />
                </article>
              ))
            )}
          </div>

          <ChatComposer
            appointmentId={appointmentId}
            draft={draft}
            selectedFile={selectedFile}
            sending={sending}
            uploadProgress={uploadProgress}
            currentUserId={currentUserId}
            onDraftChange={setDraft}
            onFileChange={handleFileChange}
            onSubmit={sendMessage}
          />
        </>
      )}
    </section>
  );
}
