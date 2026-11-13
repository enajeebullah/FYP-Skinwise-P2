"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import AppointmentChat from "@/components/AppointmentChat";
import CallCenter from "@/components/CallCenter";

type AppointmentStatus = "pending" | "confirmed" | "completed" | "cancelled" | "rejected";

interface Appointment {
  id: string;
  patient_id: string;
  appointment_date: string;
  appointment_time: string;
  patient_message: string;
  status: AppointmentStatus;
  created_at: string;
  archived_at: string | null;
}

interface AppointmentPatientDetails {
  appointment_id: string;
  patient_full_name: string | null;
  patient_age: number | null;
  patient_gender: string | null;
}

type ConsultationPaymentStatus = "pending" | "simulated_paid" | "failed" | "simulated_refunded";

type PortalView = "dashboard" | "today" | "next" | "upcoming" | "history" | "chat";

interface DoctorProfile {
  name: string;
  specialization: string | null;
  experience: number | null;
  qualification: string | null;
  image_url: string | null;
  is_active: boolean;
  consultation_fee: number | null;
}

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

function formatCreatedAt(value: string) {
  return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

type IconName = "dashboard" | "today" | "next" | "upcoming" | "history" | "patients" | "messages" | "chat" | "calendar" | "availability" | "profile" | "settings" | "logout" | "search" | "bell" | "refresh" | "check" | "clock" | "doctor" | "fee" | "arrow" | "activity";

function DoctorIcon({ name, className = "" }: { name: IconName; className?: string }) {
  const paths: Record<IconName, ReactNode> = {
    dashboard: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /></>,
    today: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18M8 14h3M8 17h6" /></>,
    next: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    upcoming: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18M8 14h3M8 17h6" /></>,
    history: <><path d="M3 12a9 9 0 1 0 2.6-6.4L3 8" /><path d="M3 3v5h5M12 7v5l3 2" /></>,
    patients: <><circle cx="9" cy="8" r="3" /><path d="M3 20c.5-3.5 2.5-5 6-5s5.5 1.5 6 5M16 5a3 3 0 0 1 0 6M17 15c2.5.3 3.7 1.8 4 4" /></>,
    messages: <><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H7l-3 2v-5.5a7.5 7.5 0 1 1 16-4Z" /><path d="M8 10h8M8 14h5" /></>,
    chat: <><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H7l-3 2v-5.5a7.5 7.5 0 1 1 16-4Z" /><path d="M8 10h.01M12 10h.01M16 10h.01" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
    availability: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2M19 5l2-2" /></>,
    profile: <><circle cx="12" cy="8" r="4" /><path d="M4 21c.7-4 3.3-6 8-6s7.3 2 8 6" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.6a8 8 0 0 1-1.7 1l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.7-1l-1.7.6-1.4-2.4L7 15a8 8 0 0 1 0-2l-1.4-1.1L7 9.5l1.7.6a8 8 0 0 1 1.7-1l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.7 1l1.7-.6 1.4 2.4L19.5 13a8 8 0 0 1-.1 2Z" /></>,
    logout: <><path d="M10 17l5-5-5-5M15 12H3" /><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" /></>,
    search: <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 5 5" /></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></>,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M5.6 9A7 7 0 0 1 18 6l2 2M4 16l2 2a7 7 0 0 0 12.4-3" /></>,
    check: <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.5 2.5L16 9" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    doctor: <><path d="M8 3v5a4 4 0 0 0 8 0V3M6 3h4M14 3h4M12 12v2a4 4 0 0 0 8 0v-1" /><circle cx="20" cy="11" r="1.5" /></>,
    fee: <><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
    activity: <><path d="M3 12h4l3-8 4 16 3-8h4" /></>,
  };
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
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
  const [archivedAppointments, setArchivedAppointments] = useState<Appointment[]>([]);
  const [doctorProfile, setDoctorProfile] = useState<DoctorProfile | null>(null);
  const [patientDetails, setPatientDetails] = useState<Record<string, AppointmentPatientDetails>>({});
  const [patientDetailsError, setPatientDetailsError] = useState<string | null>(null);
  const [activeAppointments, setActiveAppointments] = useState<Appointment[]>([]);
  const [payments, setPayments] = useState<ConsultationPayment[]>([]);
  const [consultationFee, setConsultationFee] = useState<number | null>(null);
  const [openChatAppointmentId, setOpenChatAppointmentId] = useState<string | null>(null);
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
  const [expandedAppointmentId, setExpandedAppointmentId] = useState<string | null>(null);

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
        .select("id, patient_id, appointment_date, appointment_time, patient_message, status, created_at, archived_at")
        .eq("doctor_id", doctorId)
        .is("archived_at", null)
        .order("appointment_date", { ascending: true })
        .order("appointment_time", { ascending: true }),
      supabase
        .from("appointments")
        .select("id, patient_id, appointment_date, appointment_time, patient_message, status, created_at, archived_at")
        .eq("doctor_id", doctorId)
        .not("archived_at", "is", null)
        .order("archived_at", { ascending: false })
        .order("appointment_date", { ascending: false })
        .order("appointment_time", { ascending: false }),
      supabase
        .from("doctors")
        .select("name, specialization, experience, qualification, image_url, is_active, consultation_fee")
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
    setArchivedAppointments(archivedRows);
    setArchivedLoadError(archivedError ? `Could not load archived appointments: ${archivedError.message}` : null);
    const rows = view === "active" ? activeRows : archivedRows;
    setAppointments(rows);
    if (doctorError) {
      setFeeError(`Could not load your consultation fee: ${doctorError.message}`);
      setConsultationFee(null);
      setDoctorProfile(null);
    } else {
      const fee = doctorData?.consultation_fee;
      setConsultationFee(typeof fee === "number" && Number.isFinite(fee) && fee >= 0 ? fee : null);
      setDoctorProfile(doctorData as DoctorProfile | null);
    }

    if (rows.length === 0) {
      setPayments([]);
      setPatientDetails({});
      setPatientDetailsError(null);
      setPaymentLoading(false);
    } else {
      const appointmentIds = rows.map((appointment) => appointment.id);
      const [
        { data: paymentData, error: paymentsFailure },
        { data: patientData, error: patientDataFailure },
      ] = await Promise.all([
        supabase.rpc("get_doctor_consultation_payment_status", { p_appointment_ids: appointmentIds }),
        supabase.rpc("get_doctor_appointment_patient_details", { p_appointment_ids: appointmentIds }),
      ]);

      if (paymentsFailure) {
        setPaymentError(`Could not load payment status: ${paymentsFailure.message}`);
        setPayments([]);
      } else {
        setPayments((paymentData ?? []) as ConsultationPayment[]);
      }
      if (patientDataFailure) {
        setPatientDetails({});
        setPatientDetailsError(`Could not load patient information: ${patientDataFailure.message}`);
      } else {
        const details = (patientData ?? []) as AppointmentPatientDetails[];
        setPatientDetails(Object.fromEntries(details.map((item) => [item.appointment_id, item])));
        setPatientDetailsError(null);
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
  const recentAppointmentRows = [...activeAppointments].sort(
    (first, second) => Date.parse(second.created_at) - Date.parse(first.created_at)
  );
  const completedAppointmentCount = [...activeAppointments, ...archivedAppointments]
    .filter((appointment) => appointment.status === "completed").length;
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
        : portalView === "history"
          ? archivedAppointments
          : portalView === "chat"
            ? activeAppointments.filter((appointment) => appointment.status === "confirmed" || appointment.status === "completed")
            : recentAppointmentRows;

  const appointmentPatientName = (appointment: Appointment) =>
    patientDetails[appointment.id]?.patient_full_name?.trim() || "Patient";
  const totalPatients = new Set([...activeAppointments, ...archivedAppointments].map((appointment) => appointment.patient_id)).size;

  const visibleAppointments = portalAppointments.filter((appointment) => {
    const query = appointmentSearch.trim().toLowerCase();
    const matchesSearch = !query || [
      appointmentPatientName(appointment),
      appointment.patient_id,
      appointment.id,
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
  }) {
    setError(null);
    setNotice(null);

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

  const chatAppointments = activeAppointments.filter((appointment) => appointment.status === "confirmed" || appointment.status === "completed");

  return (
  <main className="doctor-portal min-h-screen bg-[#F3F7FB] lg:flex">
    <CallCenter />
    <aside className="doctor-sidebar flex w-full shrink-0 flex-col text-white lg:sticky lg:top-0 lg:h-screen lg:w-64">
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
      <nav aria-label="Doctor portal navigation" className="doctor-sidebar-nav flex gap-1 overflow-x-auto px-3 py-3 lg:block lg:flex-1 lg:space-y-1 lg:overflow-y-auto lg:px-4 lg:py-5">
        {[
          ["dashboard", "Dashboard", "⌂"],
          ["today", "Today's Appointments", "▦"],
          ["next", "Next Appointments", "→"],
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
            <DoctorIcon className="doctor-nav-icon" name={key as IconName} />
            <span>{label}</span>
          </button>
        ))}
        <button type="button" aria-current={portalView === "chat" ? "page" : undefined} onClick={() => selectPortalView("chat")} className={`doctor-nav-link ${portalView === "chat" ? "active" : ""}`}><DoctorIcon name="chat" /><span>Chat</span></button>
        <div className="flex gap-1 border-t border-white/10 pt-3 lg:block lg:space-y-1 lg:pt-4">
          {[
            ["Patients", "patients"], ["Messages", "messages"], ["Calendar", "calendar"],
            ["Manage Availability", "availability"], ["Profile", "profile"], ["Settings", "settings"],
          ].map(([label, icon]) => (
            <button key={label} type="button" disabled className="doctor-nav-link soon">
              <DoctorIcon name={icon as IconName} className="doctor-nav-icon" />
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
      <div className="doctor-main-inner">
      <header className="doctor-topbar">
        <label className="doctor-search"><DoctorIcon name="search" /><span className="sr-only">Search patients or appointments</span><input value={appointmentSearch} onChange={(event) => setAppointmentSearch(event.target.value)} placeholder="Search patients or appointments..." /></label>
        <div className="doctor-header-actions"><button type="button" onClick={() => void loadAppointments()} aria-label="Refresh dashboard data"><DoctorIcon name="refresh" /></button><div className="doctor-header-profile">{doctorProfile?.image_url ? <img src={doctorProfile.image_url} alt="" /> : <span className="doctor-avatar">{doctorName.slice(0, 1).toUpperCase()}</span>}<span><strong>{doctorProfile?.name || doctorName}</strong><small>{doctorProfile?.specialization || "Dermatologist"}</small></span></div></div>
      </header>

      {error && <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
      {feeError && <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{feeError}</p>}
      {notice && <p role="status" className="mb-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">{notice}</p>}

      {portalView === "dashboard" && (
        <>
        <section className="doctor-welcome mb-4"><div><p>Your SkinWISE practice</p><h1>Welcome back, {doctorProfile?.name || doctorName}</h1><span>Manage appointments and continue consultations with your patients.</span></div><DoctorIcon name="doctor" /></section>
        <section aria-label="Appointment statistics" className="doctor-stat-grid mb-5">
          {[
            { label: "Total Patients", count: archivedLoadError ? null : totalPatients, icon: "patients" as IconName },
            { label: "Today's Appointments", count: todayAppointments.length, icon: "today" as IconName },
            { label: "Pending Appointments", count: activeAppointments.filter((appointment) => appointment.status === "pending").length, icon: "chat" as IconName },
            { label: "Confirmed Appointments", count: activeAppointments.filter((appointment) => appointment.status === "confirmed").length, icon: "check" as IconName },
            { label: "Completed Appointments", count: archivedLoadError ? null : completedAppointmentCount, icon: "check" as IconName },
          ].map((item) => <article key={item.label} className="doctor-stat-card"><span><DoctorIcon name={item.icon} /></span><div><p>{item.label}</p><strong>{loading ? "—" : item.count ?? "—"}</strong></div></article>)}
        </section>
        <section aria-label="Today's overview" className="hidden">
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
        </>
      )}

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

      {portalView === "chat" && <section className="doctor-chat-panel mb-5"><div className="doctor-section-title"><DoctorIcon name="chat" /><div><h2>Chat Center</h2><p>Open an existing appointment conversation.</p></div><button type="button" onClick={() => void loadAppointments()} aria-label="Refresh appointments"><DoctorIcon name="refresh" /></button></div>{chatAppointments.length ? <div className="doctor-chat-list">{chatAppointments.map((appointment) => <article key={appointment.id}><div><strong>{appointmentPatientName(appointment)}</strong><small>{formatDate(appointment.appointment_date)} · {formatTime(appointment.appointment_time)}</small></div><button type="button" onClick={() => setOpenChatAppointmentId(openChatAppointmentId === appointment.id ? null : appointment.id)}>{openChatAppointmentId === appointment.id ? "Close Chat" : "Open Chat"}</button>{openChatAppointmentId === appointment.id && <div className="doctor-chat-embed"><AppointmentChat appointmentId={appointment.id} doctorDetails={{ doctorName, appointmentDate: formatDate(appointment.appointment_date), appointmentTime: formatTime(appointment.appointment_time), patientMessage: appointment.patient_message, status: appointment.status }} /></div>}</article>)}</div> : <p className="doctor-empty-chat">No confirmed or completed appointment conversations are available.</p>}</section>}

      <div className={`doctor-dashboard-columns ${portalView === "dashboard" ? "with-profile" : ""}`}>
      <section aria-labelledby="doctor-appointments-heading" className={`rounded-2xl border border-[#DCE5EF] bg-white p-4 shadow-[0_10px_30px_rgba(20,43,73,0.06)] sm:p-5 ${portalView === "chat" ? "hidden" : ""}`}>
        <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#0D9488]">Consultation schedule</p>
            <h2 id="doctor-appointments-heading" className="mt-1 font-display text-2xl font-semibold text-[#142B49]">
              {portalView === "today" ? "Today's appointments" : portalView === "next" ? "Next appointment" : portalView === "upcoming" ? "Upcoming appointments" : view === "archived" ? "Appointment history" : "Recent Appointments"}
            </h2>
            <p className="mt-1 text-sm text-[#64748B]">
              {view === "archived" ? "Review consultations archived from the active doctor dashboard." : portalView === "today" ? "Review today's schedule and manage appointment actions." : portalView === "next" ? "Your next confirmed consultation." : portalView === "upcoming" ? "Confirmed consultations scheduled after today." : "Latest appointment records, with patient details and status."}
            </p>
          </div>
          {!loading && <p className="text-sm font-medium text-[#64748B]">Showing {visibleAppointments.length} of {appointments.length}</p>}
        </div>
        {!loading && appointments.length > 0 && (
          <div className="mb-5 flex flex-col gap-2 sm:flex-row">
            <label className="relative min-w-0 flex-1 hidden">
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
                    <h3 className="mt-1 font-semibold text-[#243449]">{appointmentPatientName(appointment)}</h3>
                    <p className="mt-1 text-sm text-[#64748B]">{formatDate(appointment.appointment_date)} · {formatTime(appointment.appointment_time)}</p>
                    <button type="button" className="doctor-details-toggle mt-3" aria-expanded={expandedAppointmentId === appointment.id} onClick={() => setExpandedAppointmentId(expandedAppointmentId === appointment.id ? null : appointment.id)}>{expandedAppointmentId === appointment.id ? "Hide Details" : "View Details"}</button>
                    {expandedAppointmentId === appointment.id && <><div className="mt-4 rounded-xl border border-[#D9E7F3] bg-gradient-to-br from-[#F4F9FF] to-white p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-[#3978C5]">Patient information</p>
                      {patientDetailsError ? (
                        <p role="status" className="mt-2 text-sm text-[#64748B]">Patient information is unavailable right now.</p>
                      ) : (
                        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
                          <div className="min-w-0">
                            <dt className="text-xs text-[#71829C]">Full name</dt>
                            <dd className="mt-0.5 break-words font-semibold text-[#173B73]">{patientDetails[appointment.id]?.patient_full_name?.trim() || "Not provided"}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-[#71829C]">Age</dt>
                            <dd className="mt-0.5 font-semibold text-[#173B73]">{patientDetails[appointment.id]?.patient_age ?? "Not provided"}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-[#71829C]">Gender</dt>
                            <dd className="mt-0.5 font-semibold text-[#173B73]">{patientDetails[appointment.id]?.patient_gender === "prefer_not_to_say" ? "Prefer not to say" : patientDetails[appointment.id]?.patient_gender ? patientDetails[appointment.id].patient_gender!.replace(/^./, (letter) => letter.toUpperCase()) : "Not provided"}</dd>
                          </div>
                        </dl>
                      )}
                    </div>
                    {appointment.patient_message && (
                      <div className="mt-3 rounded-lg bg-[#F3F7FB] px-3 py-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-[#64748B]">Patient message</p>
                        <p className="mt-1 whitespace-pre-wrap text-sm leading-5 text-[#243449]/80">{appointment.patient_message}</p>
                      </div>
                    )}</>}
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
      {portalView === "dashboard" && <aside className="doctor-dashboard-aside"><section className="doctor-profile-card"><div className="doctor-section-title"><DoctorIcon name="profile" /><h2>Doctor Profile</h2></div><div className="doctor-profile-body">{doctorProfile?.image_url ? <img src={doctorProfile.image_url} alt={`${doctorProfile.name || doctorName} profile`} /> : <span className="doctor-profile-placeholder"><DoctorIcon name="doctor" /></span>}<h3>{doctorProfile?.name || doctorName}</h3><p>{doctorProfile?.specialization || "Specialization not listed"}</p><span className="doctor-active-pill">{doctorProfile?.is_active ? "Active" : "Inactive"}</span><dl><div><dt>Experience</dt><dd>{doctorProfile?.experience != null ? `${doctorProfile.experience} Years` : "Not listed"}</dd></div><div><dt>Qualification</dt><dd>{doctorProfile?.qualification || "Not listed"}</dd></div><div><dt>Consultation Fee</dt><dd>{consultationFee !== null ? formatCurrency(consultationFee, "PKR") : "Not set"}</dd></div></dl></div></section><section className="doctor-chat-center"><div className="doctor-section-title"><DoctorIcon name="chat" /><h2>Chat Center</h2></div><p>Continue conversations linked to eligible appointments.</p><button type="button" onClick={() => selectPortalView("chat")}><DoctorIcon name="chat" />Open Chat<DoctorIcon name="arrow" /></button></section></aside>}
      </div>

    </div>
    </div>
  </main>
  );
}
