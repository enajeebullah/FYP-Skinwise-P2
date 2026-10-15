"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import AppointmentChat from "@/components/AppointmentChat";

type AppointmentStatus = "pending" | "confirmed" | "completed" | "cancelled" | "rejected";

interface Appointment {
  id: string;
  appointment_date: string;
  appointment_time: string;
  patient_message: string;
  status: AppointmentStatus;
  meeting_link: string | null;
  created_at: string;
}

type ConsultationPaymentStatus = "pending" | "simulated_paid" | "failed" | "simulated_refunded";

interface ConsultationPayment {
  id: string;
  appointment_id: string;
  doctor_id: string;
  method: "jazzcash" | "easypaisa";
  amount: number;
  currency: string;
  status: ConsultationPaymentStatus;
  status_reason: string | null;
  created_at: string;
  updated_at: string;
  settled_at: string | null;
}

function formatDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatTime(time: string) {
  const [hours, minutes] = time.slice(0, 5).split(":").map(Number);
  const date = new Date(Date.UTC(2000, 0, 1, hours, minutes));
  return `${date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  })} PKT`;
}

function statusStyle(status: AppointmentStatus) {
  if (status === "confirmed") return "border-[#B9D9C3] bg-[#EAF5ED] text-[#326846]";
  if (status === "completed") return "border-[#C8DCF5] bg-[#EDF5FF] text-[#175BB3]";
  if (status === "rejected" || status === "cancelled") return "border-[#F0C9CC] bg-[#FFF0F1] text-[#A5404A]";
  return "border-[#F1D99B] bg-[#FFF7E5] text-[#806016]";
}

function paymentStatusLabel(status: ConsultationPaymentStatus) {
  if (status === "pending") return "Awaiting admin verification";
  if (status === "simulated_paid") return "Paid / Verified (Demo)";
  if (status === "simulated_refunded") return "Refunded (Demo)";
  return "Failed";
}

function paymentStatusStyle(status: ConsultationPaymentStatus) {
  if (status === "simulated_paid") return "bg-[#EAF5ED] text-[#326846]";
  if (status === "failed") return "bg-[#FFF0F1] text-[#A5404A]";
  if (status === "simulated_refunded") return "bg-[#EDF5FF] text-[#175BB3]";
  return "bg-[#FFF7E5] text-[#806016]";
}

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

function isUpcoming(appointment: Appointment) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const nowParts = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  const now = `${nowParts.year}-${nowParts.month}-${nowParts.day}T${nowParts.hour}:${nowParts.minute}:${nowParts.second}`;
  const time = appointment.appointment_time.length === 5
    ? `${appointment.appointment_time}:00`
    : appointment.appointment_time.slice(0, 8);
  return `${appointment.appointment_date}T${time}` >= now;
}

function isValidMeetingLink(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export default function DoctorDashboard({
  doctorId,
  doctorName,
}: {
  doctorId: string;
  doctorName: string;
}) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [payments, setPayments] = useState<ConsultationPayment[]>([]);
  const [consultationFee, setConsultationFee] = useState<number | null>(null);
  const [openChatAppointmentId, setOpenChatAppointmentId] = useState<string | null>(null);
  const [meetingLinks, setMeetingLinks] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [paymentLoading, setPaymentLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [feeError, setFeeError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadAppointments = useCallback(async () => {
    setLoading(true);
    setPaymentLoading(true);
    setError(null);
    setPaymentError(null);
    setFeeError(null);
    const supabase = createClient();
    const [
      { data, error: loadError },
      { data: doctorData, error: doctorError },
    ] = await Promise.all([
      supabase
        .from("appointments")
        .select("id, appointment_date, appointment_time, patient_message, status, meeting_link, created_at")
        .eq("doctor_id", doctorId)
        .order("appointment_date", { ascending: true })
        .order("appointment_time", { ascending: true }),
      supabase
        .from("doctors")
        .select("consultation_fee")
        .eq("id", doctorId)
        .maybeSingle(),
    ]);

    if (loadError) {
      setError(`Could not load appointments: ${loadError.message}`);
      setAppointments([]);
      setPayments([]);
      setLoading(false);
      setPaymentLoading(false);
      return;
    }

    const rows = (data ?? []) as Appointment[];
    setAppointments(rows);
    setMeetingLinks(Object.fromEntries(rows.map((appointment) => [
      appointment.id,
      appointment.meeting_link ?? "",
    ])));
    if (doctorError) {
      setFeeError(`Could not load your consultation fee: ${doctorError.message}`);
      setConsultationFee(null);
    } else {
      const fee = doctorData?.consultation_fee;
      setConsultationFee(typeof fee === "number" && Number.isFinite(fee) && fee >= 0 ? fee : null);
    }

    if (rows.length === 0) {
      setPayments([]);
      setPaymentLoading(false);
    } else {
      const { data: paymentData, error: paymentsFailure } = await supabase
        .from("consultation_payments")
        .select("id, appointment_id, doctor_id, method, amount, currency, status, status_reason, created_at, updated_at, settled_at")
        .eq("doctor_id", doctorId)
        .in("appointment_id", rows.map((appointment) => appointment.id));

      if (paymentsFailure) {
        setPaymentError(`Could not load payment status: ${paymentsFailure.message}`);
        setPayments([]);
      } else {
        setPayments((paymentData ?? []) as ConsultationPayment[]);
      }
      setPaymentLoading(false);
    }
    setLoading(false);
  }, [doctorId]);

  useEffect(() => {
    void loadAppointments();
  }, [loadAppointments]);

  async function updateAppointment(appointment: Appointment, updates: {
    status?: "confirmed" | "rejected";
    meeting_link?: string | null;
  }) {
    setError(null);
    setNotice(null);

    if (updates.meeting_link && !isValidMeetingLink(updates.meeting_link)) {
      setError("Enter a valid HTTP or HTTPS consultation link.");
      return;
    }

    if (savingId !== null) return;
    setSavingId(appointment.id);
    const supabase = createClient();
    if (updates.status === "confirmed") {
      const { data: slotAvailable, error: availabilityError } = await supabase.rpc(
        "is_appointment_slot_available",
        {
          p_doctor_id: doctorId,
          p_appointment_date: appointment.appointment_date,
          p_appointment_time: appointment.appointment_time,
        }
      );
      if (availabilityError) {
        setError(`Could not check appointment availability: ${availabilityError.message}`);
        setSavingId(null);
        return;
      }
      if (!slotAvailable) {
        setError("This time slot is already booked. Please choose another time.");
        setSavingId(null);
        return;
      }
    }

    const { error: updateError } = await supabase
      .from("appointments")
      .update(updates)
      .eq("id", appointment.id);

    if (updateError) {
      setSavingId(null);
      setError(
        updateError.code === "23505"
          ? "This time slot is already booked. Please choose another time."
          : `Could not update appointment: ${updateError.message}`
      );
      return;
    }

    setNotice("Appointment updated.");
    await loadAppointments();
    setSavingId(null);
  }

  return (
  <main className="min-h-screen bg-[#F8F9FD] px-4 py-6 sm:px-6 sm:py-8">
    <div className={`mx-auto ${openChatAppointmentId ? "max-w-7xl" : "max-w-5xl"}`}>
      <header className="mb-6 rounded-2xl border border-[#D9E8F7] bg-gradient-to-br from-white to-[#EDF6FF] p-5 shadow-sm sm:p-7">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#3978C5]">SkinWISE Doctor</p>
        <h1 className="mt-2 font-display text-3xl text-ink sm:text-4xl">Doctor Dashboard</h1>
        <p className="mt-1 text-lg font-medium text-[#175BB3]">{doctorName}</p>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
          Review appointment requests, manage upcoming consultations, and follow consultation payment verification.
        </p>
      </header>

      {error && <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
      {feeError && <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{feeError}</p>}
      {notice && <p role="status" className="mb-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">{notice}</p>}

      <section aria-label="Appointment summary" className="mb-6 grid gap-3 sm:grid-cols-3">
        {[
          { label: "Pending requests", count: appointments.filter((appointment) => appointment.status === "pending").length, tone: "text-[#806016]" },
          { label: "Confirmed appointments", count: appointments.filter((appointment) => appointment.status === "confirmed").length, tone: "text-[#326846]" },
          { label: "Completed appointments", count: appointments.filter((appointment) => appointment.status === "completed").length, tone: "text-[#175BB3]" },
        ].map((item) => (
          <article key={item.label} className="rounded-xl border border-line bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-muted">{item.label}</p>
            <p className={`mt-1 font-display text-2xl ${item.tone}`}>{loading ? "—" : item.count}</p>
          </article>
        ))}
      </section>

      {paymentError && (
        <p role="alert" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-[#76551A]">
          {paymentError}
        </p>
      )}
      {!paymentLoading && !paymentError && appointments.length > 0 && payments.length === 0 && (
        <p role="status" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-[#76551A]">
          Payment status is not visible to doctor accounts under the current database read policy. Ask an administrator to enable secure, doctor-scoped payment reads; no payment is assumed absent.
        </p>
      )}

      <section aria-labelledby="doctor-appointments-heading">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Consultation schedule</p>
            <h2 id="doctor-appointments-heading" className="mt-1 font-display text-2xl text-ink">Your appointments</h2>
          </div>
          {!loading && <p className="text-sm text-muted">{appointments.length} total</p>}
        </div>
        {loading ? (
          <div className="grid gap-3" aria-label="Loading appointments">
            {[0, 1].map((item) => (
              <div key={item} className="animate-pulse rounded-2xl border border-line bg-white p-5">
                <div className="h-4 w-48 rounded bg-[#EAF0F7]" />
                <div className="mt-3 h-3 w-32 rounded bg-[#EAF0F7]" />
                <div className="mt-5 h-10 rounded bg-[#EAF0F7]" />
              </div>
            ))}
          </div>
        ) : appointments.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#C8D5E4] bg-white p-8 text-center">
            <p className="font-medium text-ink">No appointments to review</p>
            <p className="mt-1 text-sm text-muted">New patient appointment requests will appear here.</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {appointments.map((appointment) => {
              const payment = payments.find((item) => item.appointment_id === appointment.id);
              const upcoming = isUpcoming(appointment);
              return (
              <article key={appointment.id} className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
                <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                      {appointment.status === "confirmed" && upcoming ? "Upcoming consultation" : "Patient appointment"}
                    </p>
                    <h3 className="mt-1 font-semibold text-ink">{formatDate(appointment.appointment_date)}</h3>
                    <p className="mt-1 text-sm text-muted">{formatTime(appointment.appointment_time)}</p>
                    {appointment.patient_message && (
                      <div className="mt-3 rounded-lg bg-[#F8FAFD] px-3 py-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Patient message</p>
                        <p className="mt-1 whitespace-pre-wrap text-sm leading-5 text-ink/80">{appointment.patient_message}</p>
                      </div>
                    )}
                  </div>
                  <span className={`inline-flex w-fit shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold ${statusStyle(appointment.status)}`}>
                    {appointment.status === "confirmed" && upcoming ? "Upcoming · Confirmed" : appointment.status.charAt(0).toUpperCase() + appointment.status.slice(1)}
                  </span>
                </div>

                {appointment.status === "pending" && (
                  <div className="flex flex-wrap gap-2 border-t border-line px-4 py-3 sm:px-5">
                    <button
                      type="button"
                      aria-label={`Confirm appointment on ${formatDate(appointment.appointment_date)}`}
                      disabled={savingId !== null}
                      onClick={() => void updateAppointment(appointment, { status: "confirmed" })}
                      className="min-h-10 rounded-lg bg-[#E7F2EA] px-4 py-2 text-sm font-semibold text-[#326846] transition hover:bg-[#D8EBDD] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {savingId === appointment.id ? "Processing…" : "Confirm appointment"}
                    </button>
                    <button
                      type="button"
                      aria-label={`Reject appointment on ${formatDate(appointment.appointment_date)}`}
                      disabled={savingId !== null}
                      onClick={() => void updateAppointment(appointment, { status: "rejected" })}
                      className="min-h-10 rounded-lg border border-[#F0C9CC] bg-white px-4 py-2 text-sm font-semibold text-[#A5404A] transition hover:bg-[#FFF0F1] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Reject request
                    </button>
                  </div>
                )}

                {appointment.status === "confirmed" && (
                  <div className="flex flex-col gap-2 border-t border-line px-4 py-3 sm:flex-row sm:px-5">
                    <input
                      aria-label={`Consultation link for ${formatDate(appointment.appointment_date)}`}
                      type="url"
                      placeholder="https://meeting.example.com/..."
                      value={meetingLinks[appointment.id] ?? ""}
                      onChange={(event) => setMeetingLinks({
                        ...meetingLinks,
                        [appointment.id]: event.target.value,
                      })}
                      className="min-h-10 min-w-0 flex-1 rounded-lg border border-line px-3 py-2 text-sm focus:border-[#4C9BE4] focus:outline-none focus:ring-2 focus:ring-[#4C9BE4]/20"
                    />
                    <button
                      type="button"
                      disabled={savingId !== null}
                      onClick={() => void updateAppointment(appointment, {
                        meeting_link: meetingLinks[appointment.id]?.trim() || null,
                      })}
                      className="min-h-10 rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink hover:bg-paper disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {savingId === appointment.id ? "Saving…" : "Save consultation link"}
                    </button>
                  </div>
                )}

                <div className="border-t border-line bg-[#FBFCFE] px-4 py-3 sm:px-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted">Consultation fee</p>
                      <p className="mt-0.5 text-sm font-semibold text-ink">
                        {consultationFee !== null
                          ? formatCurrency(consultationFee, "PKR")
                          : "Fee not available"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted">Payment status</p>
                      {paymentLoading ? (
                        <p className="mt-0.5 text-sm text-muted">Loading…</p>
                      ) : paymentError ? (
                        <p className="mt-0.5 text-sm text-red-800">Status unavailable</p>
                      ) : payment ? (
                        <div className="mt-1 flex flex-col items-end gap-1">
                          <span className="text-xs font-medium text-ink">
                            {payment.method === "jazzcash" ? "JazzCash" : "Easypaisa"} (Demo) · {formatCurrency(payment.amount, payment.currency)}
                          </span>
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${paymentStatusStyle(payment.status)}`}>
                            {paymentStatusLabel(payment.status)}
                          </span>
                          {payment.status_reason && <span className="max-w-sm text-xs text-muted">{payment.status_reason}</span>}
                        </div>
                      ) : payments.length > 0 ? (
                        <span className="mt-0.5 inline-flex rounded-full bg-white px-2.5 py-1 text-xs font-medium text-muted">
                          No payment yet
                        </span>
                      ) : (
                        <span className="mt-0.5 inline-flex rounded-full bg-[#FFF7E5] px-2.5 py-1 text-xs font-medium text-[#806016]">
                          Not visible under current RLS
                        </span>
                      )}
                    </div>
                  </div>
                  {(payment || payments.length > 0) && (
                    <p className="mt-2 text-[11px] text-muted">Demo payment status only. No real money was transferred.</p>
                  )}
                </div>

                {(appointment.status === "confirmed" || appointment.status === "completed") && (
                  <div className="border-t border-line px-4 py-3 sm:px-5">
                    <button
                      type="button"
                      aria-label={`${openChatAppointmentId === appointment.id ? "Close" : "Open"} consultation chat for ${formatDate(appointment.appointment_date)}`}
                      aria-expanded={openChatAppointmentId === appointment.id}
                      disabled={savingId !== null}
                      onClick={() => setOpenChatAppointmentId(
                        openChatAppointmentId === appointment.id ? null : appointment.id
                      )}
                      className="min-h-10 rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink hover:bg-paper disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {openChatAppointmentId === appointment.id ? "Close chat" : "Open consultation chat"}
                    </button>
                    {openChatAppointmentId === appointment.id && (
                        <AppointmentChat
                          appointmentId={appointment.id}
                          doctorDetails={{
                            doctorName,
                            appointmentDate: formatDate(appointment.appointment_date),
                            appointmentTime: formatTime(appointment.appointment_time),
                            patientMessage: appointment.patient_message,
                            status: appointment.status,
                          }}
                        />
                      )}
                    </div>
                  )}
                </article>
              );
            })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
