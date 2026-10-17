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
  archived_at: string | null;
}

type ConsultationPaymentStatus = "pending" | "simulated_paid" | "failed" | "simulated_refunded";

type PortalView = "dashboard" | "today" | "next" | "upcoming" | "history";

interface ConsultationPayment {
  appointment_id: string;
  status: ConsultationPaymentStatus;
  status_reason: string | null;
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
  if (status === "confirmed") return "border-[#99D5CE] bg-[#E6F7F5] text-[#0F766E]";
  if (status === "completed") return "border-[#A8D8D3] bg-[#ECF9F7] text-[#0F766E]";
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
  if (status === "simulated_paid") return "bg-[#E6F7F5] text-[#0F766E]";
  if (status === "failed") return "bg-[#FFF0F1] text-[#A5404A]";
  if (status === "simulated_refunded") return "bg-[#ECF9F7] text-[#0F766E]";
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

function pakistanToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
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
  const [view, setView] = useState<"active" | "archived">("active");
  const [portalView, setPortalView] = useState<PortalView>("dashboard");
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [activeAppointments, setActiveAppointments] = useState<Appointment[]>([]);
  const [payments, setPayments] = useState<ConsultationPayment[]>([]);
  const [consultationFee, setConsultationFee] = useState<number | null>(null);
  const [openChatAppointmentId, setOpenChatAppointmentId] = useState<string | null>(null);
  const [meetingLinks, setMeetingLinks] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [paymentLoading, setPaymentLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [archivedLoadError, setArchivedLoadError] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [feeError, setFeeError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [appointmentSearch, setAppointmentSearch] = useState("");
  const [appointmentFilter, setAppointmentFilter] = useState<"all" | AppointmentStatus>("all");
  const [archiveTarget, setArchiveTarget] = useState<Appointment | null>(null);
  const [archivingId, setArchivingId] = useState<string | null>(null);

  const loadAppointments = useCallback(async () => {
    setLoading(true);
    setPaymentLoading(true);
    setError(null);
    setPaymentError(null);
    setFeeError(null);
    const supabase = createClient();
    const [
      { data: activeData, error: activeLoadError },
      { data: archivedData, error: archivedError },
      { data: doctorData, error: doctorError },
    ] = await Promise.all([
      supabase
        .from("appointments")
        .select("id, appointment_date, appointment_time, patient_message, status, meeting_link, created_at, archived_at")
        .eq("doctor_id", doctorId)
        .is("archived_at", null)
        .order("appointment_date", { ascending: true })
        .order("appointment_time", { ascending: true }),
      supabase
        .from("appointments")
        .select("id, appointment_date, appointment_time, patient_message, status, meeting_link, created_at, archived_at")
        .eq("doctor_id", doctorId)
        .not("archived_at", "is", null)
        .order("archived_at", { ascending: false })
        .order("appointment_date", { ascending: false })
        .order("appointment_time", { ascending: false }),
      supabase
        .from("doctors")
        .select("consultation_fee")
        .eq("id", doctorId)
        .maybeSingle(),
    ]);

    if (activeLoadError) {
      setError(`Could not load appointments: ${activeLoadError.message}`);
      setAppointments([]);
      setActiveAppointments([]);
      setPayments([]);
      setLoading(false);
      setPaymentLoading(false);
      return;
    }

    const activeRows = (activeData ?? []) as Appointment[];
    const archivedRows = (archivedData ?? []) as Appointment[];
    setActiveAppointments(activeRows);
    setArchivedLoadError(archivedError ? `Could not load archived appointments: ${archivedError.message}` : null);
    const rows = view === "active" ? activeRows : archivedRows;
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
      const { data: paymentData, error: paymentsFailure } = await supabase.rpc(
        "get_doctor_consultation_payment_status",
        { p_appointment_ids: rows.map((appointment) => appointment.id) }
      );

      if (paymentsFailure) {
        setPaymentError(`Could not load payment status: ${paymentsFailure.message}`);
        setPayments([]);
      } else {
        setPayments((paymentData ?? []) as ConsultationPayment[]);
      }
      setPaymentLoading(false);
    }
    setLoading(false);
  }, [doctorId, view]);

  useEffect(() => {
    void loadAppointments();
  }, [loadAppointments]);

  const todayAppointments = activeAppointments.filter(
    (appointment) => appointment.appointment_date === pakistanToday()
  );
  const futureAppointments = activeAppointments.filter(
    (appointment) => appointment.status === "confirmed" && isUpcoming(appointment)
  );
  const nextAppointment = futureAppointments[0] ?? null;
  const portalAppointments = portalView === "today"
    ? todayAppointments
    : portalView === "next"
      ? (nextAppointment ? [nextAppointment] : [])
      : portalView === "upcoming"
        ? futureAppointments
        : appointments;

  const visibleAppointments = portalAppointments.filter((appointment) => {
    const query = appointmentSearch.trim().toLowerCase();
    const matchesSearch = !query || [
      appointment.patient_message,
      appointment.status,
      formatDate(appointment.appointment_date),
      formatTime(appointment.appointment_time),
    ].some((value) => value.toLowerCase().includes(query));
    return matchesSearch && (appointmentFilter === "all" || appointment.status === appointmentFilter);
  });

  function selectPortalView(nextView: PortalView) {
    setPortalView(nextView);
    setView(nextView === "history" ? "archived" : "active");
    setAppointmentSearch("");
    setAppointmentFilter("all");
  }

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

  async function archiveAppointment() {
    if (!archiveTarget || archivingId !== null) return;

    setArchivingId(archiveTarget.id);
    setError(null);
    setNotice(null);

    const { data, error: archiveError } = await createClient().rpc(
      "archive_appointment_for_doctor",
      { p_appointment_id: archiveTarget.id }
    );

    if (archiveError) {
      setError(`Could not archive this consultation: ${archiveError.message}`);
      setArchivingId(null);
      return;
    }

    if (data !== true) {
      setError("This consultation could not be archived. It may already be archived or you may not be authorized to archive it.");
      setArchivingId(null);
      return;
    }

    const archivedDate = formatDate(archiveTarget.appointment_date);
    const archivedTime = formatTime(archiveTarget.appointment_time);
    setArchiveTarget(null);
    setNotice(`Consultation from ${archivedDate} at ${archivedTime} was archived.`);
    await loadAppointments();
    setArchivingId(null);
  }

  return (
  <main className="doctor-portal min-h-screen bg-[#F3F7FB] lg:flex">
    <aside className="flex w-full shrink-0 flex-col bg-[#142B49] text-white lg:sticky lg:top-0 lg:h-screen lg:w-64">
      <div className="flex items-center gap-3 border-b border-white/10 px-5 py-5 lg:px-6">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0D9488]/20 text-lg font-semibold text-[#7DD3CA]" aria-hidden="true">✦</span>
        <div>
          <p className="text-sm font-semibold tracking-wide">SkinWISE</p>
          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#B8C9DB]">Doctor portal</p>
        </div>
      </div>
      <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4 lg:px-6">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#D8F3EF] text-sm font-bold text-[#0F766E]" aria-hidden="true">
          {doctorName.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{doctorName}</p>
          <p className="text-xs text-[#B8C9DB]">Dermatologist</p>
        </div>
      </div>
      <nav aria-label="Doctor portal navigation" className="flex gap-1 overflow-x-auto px-3 py-3 lg:block lg:flex-1 lg:space-y-1 lg:overflow-y-auto lg:px-4 lg:py-5">
        {[
          ["dashboard", "Dashboard", "⌂"],
          ["today", "Today's Appointments", "▦"],
          ["next", "Next Appointment", "→"],
          ["upcoming", "Upcoming Appointments", "◷"],
          ["history", "Appointment History", "↺"],
        ].map(([key, label, icon]) => (
          <button
            key={key}
            type="button"
            aria-current={portalView === key ? "page" : undefined}
            onClick={() => selectPortalView(key as PortalView)}
            className={`flex min-h-10 shrink-0 items-center gap-3 rounded-lg px-3 text-left text-xs font-semibold transition lg:w-full lg:text-sm ${portalView === key ? "bg-[#0D9488] text-white shadow-sm" : "text-[#D7E3EF] hover:bg-white/10 hover:text-white"}`}
          >
            <span className="w-5 text-center text-base" aria-hidden="true">{icon}</span>
            <span>{label}</span>
          </button>
        ))}
        <div className="flex gap-1 border-t border-white/10 pt-3 lg:block lg:space-y-1 lg:pt-4">
          {["Patients", "Messages", "Calendar", "Manage Availability", "Profile", "Settings"].map((label) => (
            <button key={label} type="button" disabled className="flex min-h-10 shrink-0 items-center gap-3 rounded-lg px-3 text-left text-xs font-medium text-[#91A7BF] opacity-80 lg:w-full lg:text-sm">
              <span className="w-5 text-center text-base" aria-hidden="true">•</span>
              <span>{label}</span>
              <span className="ml-auto text-[9px] uppercase tracking-wide">Soon</span>
            </button>
          ))}
        </div>
      </nav>
      <form action="/auth/signout" method="post" className="hidden border-t border-white/10 p-4 lg:block">
        <button type="submit" className="flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-sm font-semibold text-[#D7E3EF] transition hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-[#5EEAD4]">
          <span className="w-5 text-center" aria-hidden="true">↪</span>
          Logout
        </button>
      </form>
      <form action="/auth/signout" method="post" className="border-t border-white/10 p-3 lg:hidden">
        <button type="submit" className="flex min-h-10 items-center gap-2 rounded-lg px-3 text-xs font-semibold text-[#D7E3EF] focus:outline-none focus:ring-2 focus:ring-[#5EEAD4]">
          <span aria-hidden="true">↪</span>
          Logout
        </button>
      </form>
    </aside>
    <div className={`min-w-0 flex-1 px-3 py-4 sm:px-6 sm:py-7 ${openChatAppointmentId ? "lg:px-7" : "lg:px-8"}`}>
      <div className="mx-auto max-w-[1440px]">
      <header className="mb-6 overflow-hidden rounded-2xl border border-[#DCE5EF] bg-white shadow-[0_12px_35px_rgba(20,43,73,0.08)]">
        <div className="flex flex-col gap-5 bg-gradient-to-br from-white via-white to-[#F3F7FB] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-7">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0D9488]">SkinWISE · Doctor portal</p>
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-[#142B49] sm:text-4xl">Doctor Dashboard</h1>
            <p className="mt-2 text-sm text-[#64748B]">Manage appointments and patient consultations in one place.</p>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-[#D9E7F6] bg-white/80 px-4 py-3 shadow-sm">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#D8F3EF] text-sm font-bold text-[#0F766E]" aria-hidden="true">
              {doctorName.slice(0, 1).toUpperCase()}
            </span>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#64748B]">Signed in as</p>
              <p className="mt-0.5 text-sm font-semibold text-[#142B49]">{doctorName}</p>
            </div>
          </div>
        </div>
      </header>

      {error && <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
      {feeError && <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{feeError}</p>}
      {notice && <p role="status" className="mb-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">{notice}</p>}

      {portalView === "dashboard" && (
        <section aria-label="Today's overview" className="mb-7 grid gap-4 xl:grid-cols-[1.15fr_.85fr]">
          <article className="rounded-2xl bg-[#142B49] p-5 text-white shadow-[0_14px_35px_rgba(20,43,73,0.18)] sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7DD3CA]">Today's schedule</p>
                <h2 className="mt-2 font-display text-2xl font-semibold">Your clinical day</h2>
                <p className="mt-1 text-sm text-[#C5D3DE]">{todayAppointments.length} appointment{todayAppointments.length === 1 ? "" : "s"} scheduled in Pakistan Standard Time.</p>
              </div>
              <span className="rounded-xl bg-[#0D9488]/25 px-3 py-2 text-xs font-semibold text-[#D8F3EF]">PKT</span>
            </div>
            <div className="mt-5 grid gap-2">
              {loading ? <div className="h-12 animate-pulse rounded-xl bg-white/10" /> : todayAppointments.length === 0 ? (
                <p className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-[#C5D3DE]">No appointments scheduled for today.</p>
              ) : todayAppointments.slice(0, 4).map((appointment) => (
                <button key={appointment.id} type="button" onClick={() => selectPortalView("today")} className="flex items-center justify-between gap-3 rounded-xl bg-white/10 px-4 py-3 text-left transition hover:bg-[#0D9488]/30 focus:outline-none focus:ring-2 focus:ring-[#5EEAD4]">
                  <span className="text-sm font-semibold">{formatTime(appointment.appointment_time)}</span>
                  <span className="truncate text-xs text-[#C5D3DE]">{appointment.status.charAt(0).toUpperCase() + appointment.status.slice(1)} consultation</span>
                </button>
              ))}
            </div>
          </article>
          <article className="rounded-2xl border border-[#DCE5EF] bg-white p-5 shadow-[0_10px_30px_rgba(20,43,73,0.06)] sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#0D9488]">Next appointment</p>
            <h2 className="mt-2 font-display text-2xl font-semibold text-[#142B49]">Up next</h2>
            {nextAppointment ? (
              <button type="button" onClick={() => selectPortalView("next")} className="mt-5 w-full rounded-xl border border-[#DCE5EF] bg-[#F3F7FB] p-4 text-left transition hover:border-[#0D9488] focus:outline-none focus:ring-2 focus:ring-[#5EEAD4]">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#64748B]">Confirmed consultation</p>
                <p className="mt-2 text-lg font-semibold text-[#142B49]">{formatDate(nextAppointment.appointment_date)}</p>
                <p className="mt-1 text-sm font-medium text-[#0D9488]">{formatTime(nextAppointment.appointment_time)}</p>
              </button>
            ) : <p className="mt-5 rounded-xl border border-dashed border-[#DCE5EF] px-4 py-5 text-sm text-[#64748B]">No confirmed appointments are currently scheduled.</p>}
          </article>
        </section>
      )}

      <section aria-label="Appointment summary" className="mb-7 grid gap-3 sm:grid-cols-3">
        {[
          { label: "Pending", count: activeAppointments.filter((appointment) => appointment.status === "pending").length, tone: "text-[#8A651D]", icon: "!" },
          { label: "Confirmed", count: activeAppointments.filter((appointment) => appointment.status === "confirmed").length, tone: "text-[#0F766E]", icon: "✓" },
          { label: "Completed", count: activeAppointments.filter((appointment) => appointment.status === "completed").length, tone: "text-[#0F766E]", icon: "✓" },
        ].map((item) => (
          <article key={item.label} className="flex items-center justify-between rounded-xl border border-[#DCE5EF] bg-white p-4 shadow-[0_7px_20px_rgba(20,43,73,0.05)] sm:p-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[#64748B]">{item.label} appointments</p>
              <p className={`mt-1 font-display text-3xl font-semibold ${item.tone}`}>{loading ? "—" : item.count}</p>
            </div>
            <span className={`flex h-11 w-11 items-center justify-center rounded-xl bg-[#F3F7FB] text-lg font-bold ${item.tone}`} aria-hidden="true">{item.icon}</span>
          </article>
        ))}
      </section>

      {view === "archived" && archivedLoadError && (
        <p role="alert" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-[#76551A]">
          {archivedLoadError} If this migration has not been applied yet, an administrator must apply the doctor-scoped archived appointment read migration in Supabase.
        </p>
      )}

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

      <section aria-labelledby="doctor-appointments-heading" className="rounded-2xl border border-[#DCE5EF] bg-white p-4 shadow-[0_10px_30px_rgba(20,43,73,0.06)] sm:p-5">
        <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#0D9488]">Consultation schedule</p>
            <h2 id="doctor-appointments-heading" className="mt-1 font-display text-2xl font-semibold text-[#142B49]">
              {portalView === "today" ? "Today's appointments" : portalView === "next" ? "Next appointment" : portalView === "upcoming" ? "Upcoming appointments" : view === "archived" ? "Appointment history" : "Appointment management"}
            </h2>
            <p className="mt-1 text-sm text-[#64748B]">
              {view === "archived" ? "Review consultations archived from the active doctor dashboard." : portalView === "today" ? "Review today's schedule and manage appointment actions." : portalView === "next" ? "Your next confirmed consultation." : portalView === "upcoming" ? "Confirmed consultations scheduled after today." : "Review requests, upcoming consultations, and completed visits."}
            </p>
          </div>
          {!loading && <p className="text-sm font-medium text-[#64748B]">Showing {visibleAppointments.length} of {appointments.length}</p>}
        </div>
        {!loading && appointments.length > 0 && (
          <div className="mb-5 flex flex-col gap-2 sm:flex-row">
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">Search appointments</span>
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[#7890AF]" aria-hidden="true">⌕</span>
              <input
                type="search"
                value={appointmentSearch}
                onChange={(event) => setAppointmentSearch(event.target.value)}
                placeholder="Search message, date, time, or status"
                className="min-h-11 w-full rounded-lg border border-[#DCE5EF] bg-white pl-9 pr-3 text-sm text-[#243449] outline-none transition placeholder:text-[#94A4BA] focus:border-[#0D9488] focus:ring-2 focus:ring-[#0D9488]/20"
              />
            </label>
            <label>
              <span className="sr-only">Filter appointments by status</span>
              <select
                value={appointmentFilter}
                onChange={(event) => setAppointmentFilter(event.target.value as "all" | AppointmentStatus)}
                className="min-h-11 w-full rounded-lg border border-[#DCE5EF] bg-white px-3 text-sm font-medium text-[#243449] outline-none focus:border-[#0D9488] focus:ring-2 focus:ring-[#0D9488]/20 sm:w-44"
              >
                <option value="all">All statuses</option>
                <option value="pending">Pending</option>
                <option value="confirmed">Confirmed</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
                <option value="rejected">Rejected</option>
              </select>
            </label>
          </div>
        )}
        {loading ? (
          <div className="grid gap-3" aria-label="Loading appointments">
            {[0, 1].map((item) => (
              <div key={item} className="animate-pulse rounded-2xl border border-[#DCE5EF] bg-white p-5">
                <div className="h-4 w-48 rounded bg-[#E8EEF4]" />
                <div className="mt-3 h-3 w-32 rounded bg-[#E8EEF4]" />
                <div className="mt-5 h-10 rounded bg-[#E8EEF4]" />
              </div>
            ))}
          </div>
        ) : appointments.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#DCE5EF] bg-white p-8 text-center">
            <p className="font-medium text-ink">{view === "active" ? "No appointments to review" : "No archived appointments"}</p>
            <p className="mt-1 text-sm text-muted">{view === "active" ? "New patient appointment requests will appear here." : "Archived consultations will appear here after you archive them."}</p>
          </div>
        ) : visibleAppointments.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#DCE5EF] bg-[#F3F7FB] p-8 text-center">
            <p className="font-medium text-[#142B49]">No matching appointments</p>
            <p className="mt-1 text-sm text-[#64748B]">Try clearing the search or selecting a different status.</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {visibleAppointments.map((appointment) => {
              const payment = payments.find((item) => item.appointment_id === appointment.id);
              const upcoming = isUpcoming(appointment);
              return (
              <article key={appointment.id} className="overflow-hidden rounded-2xl border border-[#DCE5EF] bg-white shadow-[0_8px_24px_rgba(20,43,73,0.05)]">
                <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[#64748B]">
                      {appointment.status === "confirmed" && upcoming ? "Upcoming consultation" : "Patient appointment"}
                    </p>
                    <h3 className="mt-1 font-semibold text-[#243449]">{formatDate(appointment.appointment_date)}</h3>
                    <p className="mt-1 text-sm text-[#64748B]">{formatTime(appointment.appointment_time)}</p>
                    {appointment.patient_message && (
                      <div className="mt-3 rounded-lg bg-[#F3F7FB] px-3 py-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-[#64748B]">Patient message</p>
                        <p className="mt-1 whitespace-pre-wrap text-sm leading-5 text-[#243449]/80">{appointment.patient_message}</p>
                      </div>
                    )}
                  </div>
                  <span className={`inline-flex w-fit shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold ${statusStyle(appointment.status)}`}>
                    {appointment.status === "confirmed" && upcoming ? "Upcoming · Confirmed" : appointment.status.charAt(0).toUpperCase() + appointment.status.slice(1)}
                  </span>
                </div>

                {appointment.status === "pending" && (
                  <div className="flex flex-wrap gap-2 border-t border-[#DCE5EF] px-4 py-3 sm:px-5">
                    <button
                      type="button"
                      aria-label={`Confirm appointment on ${formatDate(appointment.appointment_date)}`}
                      disabled={savingId !== null}
                      onClick={() => void updateAppointment(appointment, { status: "confirmed" })}
                      className="min-h-10 rounded-lg bg-[#0D9488] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0F766E] focus:outline-none focus:ring-2 focus:ring-[#5EEAD4] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {savingId === appointment.id ? "Processing…" : "Confirm appointment"}
                    </button>
                    <button
                      type="button"
                      aria-label={`Reject appointment on ${formatDate(appointment.appointment_date)}`}
                      disabled={savingId !== null}
                      onClick={() => void updateAppointment(appointment, { status: "rejected" })}
                      className="min-h-10 rounded-lg border border-[#F0C9CC] bg-white px-4 py-2 text-sm font-semibold text-[#A5404A] transition hover:bg-[#FFF0F1] focus:outline-none focus:ring-2 focus:ring-[#FCA5A5] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Reject request
                    </button>
                  </div>
                )}

                {appointment.status === "confirmed" && (
                  <div className="flex flex-col gap-2 border-t border-[#DCE5EF] px-4 py-3 sm:flex-row sm:px-5">
                    <input
                      aria-label={`Consultation link for ${formatDate(appointment.appointment_date)}`}
                      type="url"
                      placeholder="https://meeting.example.com/..."
                      value={meetingLinks[appointment.id] ?? ""}
                      onChange={(event) => setMeetingLinks({
                        ...meetingLinks,
                        [appointment.id]: event.target.value,
                      })}
                      className="min-h-10 min-w-0 flex-1 rounded-lg border border-[#DCE5EF] px-3 py-2 text-sm focus:border-[#0D9488] focus:outline-none focus:ring-2 focus:ring-[#0D9488]/20"
                    />
                    <button
                      type="button"
                      disabled={savingId !== null}
                      onClick={() => void updateAppointment(appointment, {
                        meeting_link: meetingLinks[appointment.id]?.trim() || null,
                      })}
                      className="min-h-10 rounded-lg border border-[#DCE5EF] px-4 py-2 text-sm font-medium text-[#243449] hover:bg-[#F3F7FB] focus:outline-none focus:ring-2 focus:ring-[#0D9488]/20 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {savingId === appointment.id ? "Saving…" : "Save consultation link"}
                    </button>
                  </div>
                )}

                <div className="border-t border-[#DCE5EF] bg-[#F8FAFC] px-4 py-3 sm:px-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-[#64748B]">Consultation fee</p>
                      <p className="mt-0.5 text-sm font-semibold text-[#243449]">
                        {consultationFee !== null
                          ? formatCurrency(consultationFee, "PKR")
                          : "Fee not available"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-semibold uppercase tracking-wide text-[#64748B]">Payment status</p>
                      {paymentLoading ? (
                        <p className="mt-0.5 text-sm text-[#64748B]">Loading…</p>
                      ) : paymentError ? (
                        <p className="mt-0.5 text-sm text-red-800">Status unavailable</p>
      ) : payment ? (
        <div className="mt-1 flex flex-col items-end gap-1">
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${paymentStatusStyle(payment.status)}`}>
            {paymentStatusLabel(payment.status)}
          </span>
                          {payment.status_reason && <span className="max-w-sm text-xs text-[#64748B]">{payment.status_reason}</span>}
        </div>
      ) : (
        <span className="mt-0.5 inline-flex rounded-full bg-white px-2.5 py-1 text-xs font-medium text-muted">
          No payment record
        </span>
      )}
                    </div>
                  </div>
                  {(payment || payments.length > 0) && (
                    <p className="mt-2 text-[11px] text-[#64748B]">Demo payment status only. No real money was transferred.</p>
                  )}
                </div>

                {view === "active" && <div className="border-t border-[#DCE5EF] px-4 py-3 sm:px-5">
                  <button
                    type="button"
                    aria-label={`Archive consultation from ${formatDate(appointment.appointment_date)}`}
                    disabled={savingId !== null || archivingId !== null}
                    onClick={() => {
                      setError(null);
                      setNotice(null);
                      setArchiveTarget(appointment);
                    }}
                    className="min-h-10 rounded-lg border border-[#E5A8AD] px-4 py-2 text-sm font-semibold text-[#B13D49] transition hover:bg-[#FFF2F3] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Archive consultation
                  </button>
                </div>}

                {(appointment.status === "confirmed" || appointment.status === "completed") && (
                  <div className="border-t border-[#DCE5EF] px-4 py-3 sm:px-5">
                    <button
                      type="button"
                      aria-label={`${openChatAppointmentId === appointment.id ? "Close" : "Open"} consultation chat for ${formatDate(appointment.appointment_date)}`}
                      aria-expanded={openChatAppointmentId === appointment.id}
                      disabled={savingId !== null}
                      onClick={() => setOpenChatAppointmentId(
                        openChatAppointmentId === appointment.id ? null : appointment.id
                      )}
                      className="min-h-10 rounded-lg border border-[#DCE5EF] px-4 py-2 text-sm font-medium text-[#243449] hover:bg-[#F3F7FB] focus:outline-none focus:ring-2 focus:ring-[#0D9488]/20 disabled:cursor-not-allowed disabled:opacity-60"
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

      {archiveTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#173B73]/35 p-4 backdrop-blur-[2px]"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && archivingId === null) setArchiveTarget(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="archive-consultation-title"
            className="w-full max-w-md rounded-2xl border border-[#E6D1D3] bg-white p-5 shadow-[0_20px_60px_rgba(23,59,115,0.24)] sm:p-6"
          >
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFF0F1] text-[#B13D49]" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 7h14M10 11v5m4-5v5M7 7l1 13h8l1-13M9 7V4h6v3" />
                </svg>
              </span>
              <div>
                <h2 id="archive-consultation-title" className="text-lg font-semibold text-[#173B73]">Archive consultation?</h2>
                <p className="mt-1 text-sm leading-5 text-[#617593]">
                  This removes the appointment from your active doctor dashboard. It does not delete the patient, chat, attachments, payments, or medical history, and can be reversed by an administrator.
                </p>
              </div>
            </div>

            <dl className="mt-5 grid gap-3 rounded-xl border border-[#E3EAF3] bg-[#F8FAFD] p-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs font-medium text-[#71829C]">Appointment date</dt>
                <dd className="mt-1 font-semibold text-[#173B73]">{formatDate(archiveTarget.appointment_date)}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-[#71829C]">Appointment time</dt>
                <dd className="mt-1 font-semibold text-[#173B73]">{formatTime(archiveTarget.appointment_time)}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs font-medium text-[#71829C]">Appointment ID</dt>
                <dd className="mt-1 break-all font-mono text-xs text-[#405777]">{archiveTarget.id}</dd>
              </div>
            </dl>

            <p className="mt-4 rounded-lg border border-[#F1D99B] bg-[#FFF9EA] px-3 py-2 text-xs leading-5 text-[#76551A]">
              No permanent deletion will occur. Confirm only if you want this consultation hidden from your active appointment list.
            </p>

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={archivingId !== null}
                onClick={() => setArchiveTarget(null)}
                className="min-h-10 rounded-lg border border-[#D5DFEC] px-4 py-2 text-sm font-semibold text-[#405777] hover:bg-[#F5F8FC] disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={archivingId !== null}
                onClick={() => void archiveAppointment()}
                className="min-h-10 rounded-lg bg-[#B13D49] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#98313D] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {archivingId === archiveTarget.id ? "Archiving…" : "Confirm Archive"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
    </div>
  </main>
  );
}
