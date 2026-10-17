"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import AppointmentChat from "@/components/AppointmentChat";

interface Doctor {
  id: string;
  name: string;
  qualification: string;
  specialization: string;
  experience: number;
  bio: string;
  image_url: string | null;
  available_days: string[];
  available_time: string;
  consultation_fee: number | null;
  is_verified: boolean;
}

type AppointmentStatus = "pending" | "confirmed" | "completed" | "cancelled" | "rejected";

interface Appointment {
  id: string;
  doctor_id: string;
  appointment_date: string;
  appointment_time: string;
  patient_message: string;
  status: AppointmentStatus;
  meeting_link: string | null;
  created_at: string;
  doctor: Doctor | null;
}

type ConsultationPaymentMethod = "jazzcash" | "easypaisa";
type ConsultationPaymentStatus = "pending" | "simulated_paid" | "failed" | "simulated_refunded";

interface ConsultationPayment {
  id: string;
  appointment_id: string;
  method: ConsultationPaymentMethod;
  is_simulated: boolean;
  amount: number;
  currency: string;
  status: ConsultationPaymentStatus;
  status_reason: string | null;
}

type RefundRequestStatus = "requested" | "approved" | "rejected";

interface ConsultationRefundRequest {
  id: string;
  payment_id: string;
  appointment_id: string;
  reason: string;
  status: RefundRequestStatus;
  admin_decision_reason: string | null;
  created_at: string;
  updated_at: string;
  decided_at: string | null;
}

function todayInPakistan() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function isAppointmentInFuture(appointment: Pick<Appointment, "appointment_date" | "appointment_time">) {
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
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  const now = `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}:${values.second}`;
  const time = appointment.appointment_time.length === 5
    ? `${appointment.appointment_time}:00`
    : appointment.appointment_time.slice(0, 8);
  return `${appointment.appointment_date}T${time}` > now;
}

function addDays(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  const result = new Date(Date.UTC(year, month - 1, day + days));
  return [
    result.getUTCFullYear(),
    String(result.getUTCMonth() + 1).padStart(2, "0"),
    String(result.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function isDateOnly(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

function formatDate(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
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

function getAvailableTimeRange(value: string) {
  const parts = value.split(/\s*(?:-|–|—|\bto\b)\s*/i);
  if (parts.length !== 2) return null;

  function parseTime(part: string) {
    const match = part.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
    if (!match) return null;

    let hours = Number(match[1]);
    const minutes = Number(match[2] ?? "0");
    const meridiem = match[3]?.toUpperCase();
    if (minutes > 59 || (meridiem ? hours < 1 || hours > 12 : hours > 23)) return null;

    if (meridiem) {
      hours %= 12;
      if (meridiem === "PM") hours += 12;
    }
    return hours * 60 + minutes;
  }

  const start = parseTime(parts[0]);
  const end = parseTime(parts[1]);
  return start !== null && end !== null && start <= end ? { start, end } : null;
}

function getTimeInMinutes(value: string) {
  const match = value.match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours <= 23 && minutes <= 59 ? hours * 60 + minutes : null;
}

function isDoctorAvailableOnDate(doctor: Doctor, value: string) {
  if (!value) return false;
  const day = new Date(`${value}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    timeZone: "UTC",
  });
  return doctor.available_days.some(
    (availableDay) => availableDay.trim().slice(0, 3).toLowerCase() === day.slice(0, 3).toLowerCase()
  );
}

function isDoctorAvailableAtTime(doctor: Doctor, value: string) {
  const range = getAvailableTimeRange(doctor.available_time);
  const selected = getTimeInMinutes(value);
  return (
    range !== null &&
    selected !== null &&
    selected >= range.start &&
    selected % 15 === 0 &&
    selected + 15 <= range.end
  );
}

function getDoctorTimeSlots(doctor: Doctor) {
  const range = getAvailableTimeRange(doctor.available_time);
  if (!range) return [];

  const slots: string[] = [];
  const firstSlot = Math.ceil(range.start / 15) * 15;
  for (let start = firstSlot; start + 15 <= range.end; start += 15) {
    slots.push(`${String(Math.floor(start / 60)).padStart(2, "0")}:${String(start % 60).padStart(2, "0")}`);
  }
  return slots;
}

function appointmentStatusStyle(status: AppointmentStatus, isUpcoming: boolean) {
  if (status === "pending") return "border-[#F1D99B] bg-[#FFF7E5] text-[#806016]";
  if (status === "confirmed" && isUpcoming) return "border-[#B9D9C3] bg-[#EAF5ED] text-[#326846]";
  if (status === "confirmed" || status === "completed") return "border-[#C8DCF5] bg-[#EDF5FF] text-[#175BB3]";
  if (status === "cancelled" || status === "rejected") return "border-[#F0C9CC] bg-[#FFF0F1] text-[#A5404A]";
  return "border-line bg-paper text-muted";
}

function formatFee(value: number) {
  return new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency: "PKR",
    maximumFractionDigits: 2,
  }).format(value);
}

function safeMeetingHref(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export default function ConsultationHub({ patientId }: { patientId: string }) {
  const today = todayInPakistan();
  const lastBookableDate = addDays(today, 30);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [consultationPayments, setConsultationPayments] = useState<ConsultationPayment[]>([]);
  const [refundRequests, setRefundRequests] = useState<ConsultationRefundRequest[]>([]);
  const [refundReasons, setRefundReasons] = useState<Record<string, string>>({});
  const [openChatAppointmentId, setOpenChatAppointmentId] = useState<string | null>(null);
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [availableTimeSlots, setAvailableTimeSlots] = useState<string[]>([]);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilityRefreshKey, setAvailabilityRefreshKey] = useState(0);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [paymentLoading, setPaymentLoading] = useState(true);
  const [payingAppointmentId, setPayingAppointmentId] = useState<string | null>(null);
  const [cancellingAppointmentId, setCancellingAppointmentId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentActionError, setPaymentActionError] = useState<string | null>(null);
  const [refundLoading, setRefundLoading] = useState(true);
  const [refundError, setRefundError] = useState<string | null>(null);
  const [refundActionError, setRefundActionError] = useState<string | null>(null);
  const [requestingRefundPaymentId, setRequestingRefundPaymentId] = useState<string | null>(null);
  const [appointmentError, setAppointmentError] = useState<string | null>(null);
  const [cancellationError, setCancellationError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadPaymentData = useCallback(async (appointmentIds: string[]) => {
    setPaymentLoading(true);
    setPaymentError(null);

    if (appointmentIds.length === 0) {
      setConsultationPayments([]);
      setRefundRequests([]);
      setRefundError(null);
      setPaymentLoading(false);
      setRefundLoading(false);
      return;
    }

    const { data, error: paymentsFailure } = await createClient()
      .from("consultation_payments")
      .select("id, appointment_id, method, is_simulated, amount, currency, status, status_reason")
      .eq("patient_id", patientId)
      .in("appointment_id", appointmentIds);

    if (paymentsFailure) {
      setPaymentError(`Could not load payment details: ${paymentsFailure.message}`);
      setRefundLoading(false);
      setPaymentLoading(false);
      return;
    }

    setConsultationPayments((data ?? []) as ConsultationPayment[]);
    setPaymentLoading(false);
    setRefundLoading(true);
    setRefundError(null);
    const { data: refundData, error: refundsFailure } = await createClient()
      .from("consultation_refund_requests")
      .select("id, payment_id, appointment_id, reason, status, admin_decision_reason, created_at, updated_at, decided_at")
      .eq("patient_id", patientId);

    if (refundsFailure) {
      setRefundError(`Could not load refund request details: ${refundsFailure.message}`);
      setRefundLoading(false);
      return;
    }

    setRefundRequests((refundData ?? []) as ConsultationRefundRequest[]);
    setRefundLoading(false);
  }, [patientId]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setPaymentLoading(true);
    setPaymentError(null);
    setPaymentActionError(null);
    setRefundActionError(null);
    const supabase = createClient();
    const [doctorResult, appointmentResult] = await Promise.all([
      supabase.from("doctors").select("*").eq("is_active", true).order("name"),
      supabase
        .from("appointments")
        .select("id, doctor_id, appointment_date, appointment_time, patient_message, status, meeting_link, created_at, doctor:doctors!appointments_doctor_id_fkey(id, name, qualification, specialization, experience, bio, image_url, available_days, available_time, consultation_fee, is_verified)")
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false }),
    ]);

    if (doctorResult.error || appointmentResult.error) {
      const failure = doctorResult.error ?? appointmentResult.error;
      setError(`Could not load consultations: ${failure?.message ?? "Unknown error"}`);
      setConsultationPayments([]);
      setPaymentError(`Could not verify payment records because consultations could not be loaded: ${failure?.message ?? "Unknown error"}`);
      setRefundLoading(false);
      setLoading(false);
      setPaymentLoading(false);
      return;
    }

    setDoctors((doctorResult.data ?? []) as Doctor[]);
    const patientAppointments = (appointmentResult.data ?? []) as unknown as Appointment[];
    setAppointments(patientAppointments);
    await loadPaymentData(patientAppointments.map((appointment) => appointment.id));
    setLoading(false);
  }, [loadPaymentData, patientId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function cancelAppointment(appointment: Appointment) {
    if (!window.confirm("Cancel this appointment? This cannot be undone.")) return;

    setCancellationError(null);
    setNotice(null);
    setCancellingAppointmentId(appointment.id);
    const { data, error: cancellationFailure } = await createClient()
      .from("appointments")
      .update({ status: "cancelled" })
      .eq("id", appointment.id)
      .eq("patient_id", patientId)
      .in("status", ["pending", "confirmed"])
      .select("id")
      .maybeSingle();

    if (cancellationFailure) {
      setCancellationError(`Could not cancel this appointment: ${cancellationFailure.message}`);
      setCancellingAppointmentId(null);
      return;
    }

    if (!data) {
      setCancellationError("This appointment is no longer eligible for cancellation. Refresh and try again.");
      setCancellingAppointmentId(null);
      return;
    }

    setNotice("Your appointment has been cancelled.");
    setAvailabilityRefreshKey((key) => key + 1);
    await loadData();
    setCancellingAppointmentId(null);
  }

  async function createDemoPayment(appointment: Appointment, method: ConsultationPaymentMethod) {
    setPaymentActionError(null);
    setNotice(null);
    setPayingAppointmentId(appointment.id);

    const { data: paymentId, error: paymentFailure } = await createClient().rpc(
      "create_consultation_demo_payment",
      {
        p_appointment_id: appointment.id,
        p_method: method,
      }
    );

    if (paymentFailure) {
      if (paymentFailure.code === "23505") {
        setPaymentActionError("A payment record already exists for this appointment. Refreshing its payment status.");
        await loadPaymentData(appointments.map((item) => item.id));
      } else {
        setPaymentActionError(`Could not create the demo payment: ${paymentFailure.message}`);
      }
      setPayingAppointmentId(null);
      return;
    }

    if (typeof paymentId !== "string" || paymentId.length === 0) {
      setPaymentActionError("The payment request returned no payment ID. Please refresh and check the appointment payment status.");
      setPayingAppointmentId(null);
      return;
    }

    setNotice(
      `Demo payment ${paymentId} was created and is awaiting admin review. No real money was transferred.`
    );
    await loadPaymentData(appointments.map((item) => item.id));
    setPayingAppointmentId(null);
  }

  async function requestSimulatedRefund(payment: ConsultationPayment) {
    const reason = refundReasons[payment.id]?.trim() ?? "";
    if (reason.length < 1 || reason.length > 2000) {
      setRefundActionError("Provide a refund request reason between 1 and 2000 characters.");
      return;
    }

    setRefundActionError(null);
    setNotice(null);
    setRequestingRefundPaymentId(payment.id);
    const { error: requestFailure } = await createClient().rpc("create_consultation_refund_request", {
      p_payment_id: payment.id,
      p_reason: reason,
    });

    if (requestFailure) {
      setRefundActionError(`Could not submit refund request: ${requestFailure.message}`);
      setRequestingRefundPaymentId(null);
      return;
    }

    setNotice("Your simulated refund request was sent for admin review. No real money will be returned.");
    await loadPaymentData(appointments.map((appointment) => appointment.id));
    setRequestingRefundPaymentId(null);
  }

  useEffect(() => {
    let active = true;
    const doctor = selectedDoctor;
    setAvailableTimeSlots([]);
    setTime("");

    if (
      !doctor ||
      !isDateOnly(date) ||
      date < today ||
      date > lastBookableDate ||
      !isDoctorAvailableOnDate(doctor, date)
    ) {
      setAvailabilityLoading(false);
      return () => {
        active = false;
      };
    }

    const doctorId = doctor.id;
    const candidateSlots = getDoctorTimeSlots(doctor);
    if (candidateSlots.length === 0) {
      setAvailabilityLoading(false);
      return () => {
        active = false;
      };
    }

    async function loadAvailableSlots() {
      setAvailabilityLoading(true);
      const { data, error: availabilityError } = await createClient().rpc(
        "get_available_appointment_slots",
        {
          p_doctor_id: doctorId,
          p_appointment_date: date,
          p_candidate_times: candidateSlots.map((slot) => `${slot}:00`),
        }
      );

      if (!active) return;

      if (availabilityError) {
        setAppointmentError(`Could not load available time slots: ${availabilityError.message}`);
        setAvailabilityLoading(false);
        return;
      }

      const available = new Set<string>((data ?? []).map((slot: string) => slot.slice(0, 5)));
      setAvailableTimeSlots(candidateSlots.filter((slot) => available.has(slot)));
      setAvailabilityLoading(false);
    }

    void loadAvailableSlots();
    return () => {
      active = false;
    };
  }, [availabilityRefreshKey, date, lastBookableDate, selectedDoctor, today]);

  async function requestAppointment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedDoctor) return;
    setAppointmentError(null);
    const today = todayInPakistan();
    const lastBookableDate = addDays(today, 30);
    if (!isDateOnly(date)) {
      setAppointmentError("Please select a valid appointment date.");
      return;
    }
    if (date < today) {
      setAppointmentError("Choose a date from today onward.");
      return;
    }
    if (date > lastBookableDate) {
      setAppointmentError("Appointments can be booked up to 30 days in advance.");
      return;
    }
    if (!isDoctorAvailableOnDate(selectedDoctor, date)) {
      setAppointmentError("This doctor is not available on the selected day. Please select another day.");
      return;
    }
    if (!isDoctorAvailableAtTime(selectedDoctor, time)) {
      setAppointmentError("Choose one of the available 15-minute appointment slots.");
      return;
    }
    if (!availableTimeSlots.includes(time)) {
      setAppointmentError("This time slot is no longer available. Please choose another slot.");
      setAvailabilityRefreshKey((key) => key + 1);
      return;
    }

    setSending(true);
    setAppointmentError(null);
    setNotice(null);
    const supabase = createClient();
    const { data: slotAvailable, error: availabilityError } = await supabase.rpc(
      "is_appointment_slot_available",
      {
        p_doctor_id: selectedDoctor.id,
        p_appointment_date: date,
        p_appointment_time: time,
      }
    );

    if (availabilityError) {
      setAppointmentError(`Could not check appointment availability: ${availabilityError.message}`);
      setSending(false);
      return;
    }

    if (!slotAvailable) {
      setAppointmentError("This time slot is already booked. Please choose another time.");
      setAvailabilityRefreshKey((key) => key + 1);
      setSending(false);
      return;
    }

    const { error: insertError } = await supabase.from("appointments").insert({
      patient_id: patientId,
      doctor_id: selectedDoctor.id,
      appointment_date: date,
      appointment_time: time,
      patient_message: message.trim(),
      status: "pending",
    });

    if (insertError) {
      if (insertError.code === "23P01" || insertError.code === "23505") {
        setAppointmentError("This 15-minute slot was just reserved by another patient. Choose another available slot.");
        setAvailabilityRefreshKey((key) => key + 1);
      } else {
        setAppointmentError(`Could not send appointment request: ${insertError.message}`);
      }
      setSending(false);
      return;
    }

    setSelectedDoctor(null);
    setDate("");
    setTime("");
    setMessage("");
    setNotice("Your request has been sent. You’ll see it here once the dermatologist responds.");
    await loadData();
    setSending(false);
  }

  return (
    <main className="dashboard-content animate-fadeUp">
      <header className="mb-8 rounded-3xl border border-[#D9E8F7] bg-gradient-to-br from-white via-white to-[#EDF6FF] p-6 shadow-sm sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#3978C5]">Online care</p>
        <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-display text-3xl text-ink sm:text-4xl">Consult a dermatologist</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
              Find a dermatologist, choose an available 15-minute slot, and send an appointment request. Your request stays pending until it is reviewed.
            </p>
          </div>
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-[#C8DCF5] bg-white px-3 py-2 text-xs font-medium text-[#175BB3]">
            <span className="h-2 w-2 rounded-full bg-[#4C9BE4]" />
            15-minute appointment slots
          </span>
        </div>
      </header>

      {error && <p role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}

      <section aria-labelledby="doctor-list-heading" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Find your specialist</p>
            <h2 id="doctor-list-heading" className="mt-1 font-display text-2xl text-ink">Available dermatologists</h2>
          </div>
          {!loading && doctors.length > 0 && <p className="text-sm text-muted">{doctors.length} {doctors.length === 1 ? "specialist" : "specialists"}</p>}
        </div>
        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Loading dermatologists">
            {[0, 1, 2].map((item) => (
              <div key={item} className="animate-pulse rounded-2xl border border-line bg-white p-5">
                <div className="flex items-center gap-3">
                  <div className="h-14 w-14 rounded-full bg-[#EAF0F7]" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-2/3 rounded bg-[#EAF0F7]" />
                    <div className="h-3 w-1/2 rounded bg-[#EAF0F7]" />
                  </div>
                </div>
                <div className="mt-6 h-3 w-full rounded bg-[#EAF0F7]" />
                <div className="mt-3 h-3 w-3/4 rounded bg-[#EAF0F7]" />
                <div className="mt-6 h-10 rounded-lg bg-[#EAF0F7]" />
              </div>
            ))}
          </div>
        ) : doctors.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#C8D5E4] bg-white p-8 text-center">
            <p className="font-medium text-ink">No dermatologists are available right now</p>
            <p className="mt-1 text-sm text-muted">Please check back later for available consultation providers.</p>
          </div>
        ) : (
          <div className="grid items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3">
            {doctors.map((doctor) => (
              <article key={doctor.id} className="flex min-w-0 flex-col rounded-2xl border border-line bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-[#C8DCF5] hover:shadow-md">
                <div className="flex items-start gap-3">
                  {doctor.image_url ? (
                    <img src={doctor.image_url} alt="" className="h-14 w-14 shrink-0 rounded-full border border-line object-cover" />
                  ) : (
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#E4F0FF] font-display text-xl text-[#175BB3]">
                      {doctor.name.trim().slice(0, 1).toUpperCase() || "D"}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold leading-5 text-ink">{doctor.name.trim() || "Dermatologist"}</h3>
                      {doctor.is_verified && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#EAF5ED] px-2 py-0.5 text-[11px] font-medium text-[#326846]" aria-label="Verified dermatologist">
                          <span aria-hidden="true">✓</span> Verified
                        </span>
                      )}
                    </div>
                    {doctor.qualification.trim() && <p className="mt-1 text-xs leading-5 text-muted">{doctor.qualification}</p>}
                  </div>
                </div>
                {doctor.specialization.trim() && (
                  <p className="mt-4 w-fit rounded-full bg-[#EDF5FF] px-3 py-1 text-xs font-semibold text-[#175BB3]">{doctor.specialization}</p>
                )}
                {Number.isFinite(doctor.experience) && doctor.experience >= 0 && (
                  <p className="mt-3 text-sm text-muted">{doctor.experience} {doctor.experience === 1 ? "year" : "years"} of experience</p>
                )}
                {doctor.bio.trim() && <p className="mt-3 line-clamp-3 text-sm leading-6 text-ink/80">{doctor.bio}</p>}
                <div className="mt-5 grid gap-3 border-t border-line pt-4 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-muted">Availability</span>
                    <span className="text-right font-medium text-ink">
                      {doctor.available_days.filter((day) => day.trim()).length
                        ? doctor.available_days.filter((day) => day.trim()).join(", ")
                        : "Availability not listed"}
                      {doctor.available_time.trim() && <span className="block text-xs font-normal text-muted">{doctor.available_time} PKT</span>}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted">Consultation fee</span>
                    <span className="font-semibold text-ink">
                      {doctor.consultation_fee !== null &&
                      Number.isFinite(doctor.consultation_fee) &&
                      doctor.consultation_fee >= 0
                        ? formatFee(doctor.consultation_fee)
                        : "Fee not listed"}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedDoctor(doctor);
                    setAppointmentError(null);
                    setNotice(null);
                  }}
                  className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-ink px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#344d7a] focus:outline-none focus:ring-2 focus:ring-[#4C9BE4] focus:ring-offset-2"
                >
                  Request a consultation
                </button>
              </article>
            ))}
          </div>
        )}
      </section>

      {selectedDoctor && (
        <section className="mt-6 overflow-hidden rounded-2xl border border-[#C8DCF5] bg-white shadow-sm" aria-labelledby="request-heading">
          <div className="border-b border-[#DCE9F6] bg-[#F4F9FF] px-5 py-4 sm:px-6">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#3978C5]">Appointment request</p>
            <h2 id="request-heading" className="mt-1 font-display text-xl text-ink">Request with {selectedDoctor.name}</h2>
            <p className="mt-1 text-sm text-muted">Choose a preferred time. Your appointment remains pending until the dermatologist reviews it.</p>
          </div>
          <form noValidate onSubmit={requestAppointment} className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
            <div className="rounded-xl border border-[#E5EAF3] bg-[#F8FAFD] p-4 sm:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Availability</p>
              <p className="mt-1 text-sm font-medium text-ink">
                {selectedDoctor.available_days.filter((day) => day.trim()).length
                  ? selectedDoctor.available_days.filter((day) => day.trim()).join(", ")
                  : "Availability not listed"}
              </p>
              <p className="mt-1 text-sm text-muted">
                {selectedDoctor.available_time.trim() ? `${selectedDoctor.available_time} PKT` : "Hours not listed"}
                {selectedDoctor.consultation_fee !== null &&
                Number.isFinite(selectedDoctor.consultation_fee) &&
                selectedDoctor.consultation_fee >= 0
                  ? ` · ${formatFee(selectedDoctor.consultation_fee)}`
                  : ""}
              </p>
            </div>
            <label className="text-sm font-medium text-ink">
              Preferred date
              <input
                required
                type="date"
                min={today}
                max={lastBookableDate}
                value={date}
                onChange={(event) => {
                  setDate(event.target.value);
                  setAppointmentError(null);
                }}
                aria-describedby="appointment-date-help"
                className="mt-1 block min-h-11 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm focus:border-[#4C9BE4] focus:outline-none focus:ring-2 focus:ring-[#4C9BE4]/20"
              />
              <span id="appointment-date-help" className="mt-1 block text-xs font-normal text-muted">
                Choose an available day. Appointments can be booked up to 30 days in advance.
              </span>
            </label>
            <label className="text-sm font-medium text-ink">
              Available 15-minute slots (PKT)
              <select
                required
                value={time}
                disabled={availabilityLoading || !date || availableTimeSlots.length === 0}
                onChange={(event) => {
                  setTime(event.target.value);
                  setAppointmentError(null);
                }}
                aria-describedby="appointment-time-help"
                className="mt-1 block min-h-11 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm focus:border-[#4C9BE4] focus:outline-none focus:ring-2 focus:ring-[#4C9BE4]/20 disabled:cursor-not-allowed disabled:bg-[#F8FAFD] disabled:text-muted"
              >
                <option value="">
                  {availabilityLoading
                    ? "Checking available slots…"
                    : !date
                      ? "Choose a date first"
                      : !isDateOnly(date) || !isDoctorAvailableOnDate(selectedDoctor, date)
                        ? "No availability on this day"
                        : availableTimeSlots.length === 0
                          ? "No available slots"
                          : "Choose an available slot"}
                </option>
                {availableTimeSlots.map((slot) => (
                  <option key={slot} value={slot}>
                    {formatTime(slot)}
                  </option>
                ))}
              </select>
              <span id="appointment-time-help" className="mt-1 block text-xs font-normal text-muted">
                Each appointment lasts 15 minutes. Only available times within the doctor’s schedule are shown.
              </span>
            </label>
            {appointmentError && (
              <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 sm:col-span-2">
                {appointmentError}
              </p>
            )}
            <label className="text-sm text-ink sm:col-span-2">
              Message for the dermatologist (optional)
              <textarea rows={3} maxLength={1000} value={message} onChange={(event) => setMessage(event.target.value)} className="mt-1 block w-full rounded-lg border border-line px-3 py-2 focus:border-[#4C9BE4] focus:outline-none focus:ring-2 focus:ring-[#4C9BE4]/20" />
            </label>
            <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:col-span-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setSelectedDoctor(null)} className="min-h-11 rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink hover:bg-paper">Close</button>
              <button disabled={sending} className="min-h-11 rounded-lg bg-ink px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#344d7a] disabled:cursor-not-allowed disabled:opacity-60">
                {sending ? "Sending…" : "Send appointment request"}
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="mt-10 space-y-4" aria-labelledby="my-appointments-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Your care</p>
            <h2 id="my-appointments-heading" className="mt-1 font-display text-2xl text-ink">My appointments</h2>
          </div>
          {!loading && appointments.length > 0 && <p className="text-sm text-muted">{appointments.length} total</p>}
        </div>
        {notice && <p role="status" className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">{notice}</p>}
        {cancellationError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{cancellationError}</p>}
        {paymentError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{paymentError}</p>}
        {paymentActionError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{paymentActionError}</p>}
        {refundError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{refundError}</p>}
        {refundActionError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{refundActionError}</p>}
        {loading ? (
          <p className="rounded-2xl border border-line bg-white p-6 text-sm text-muted">Loading your appointments…</p>
        ) : null}
        {appointments.length === 0 ? (
          !loading && (
            <div className="rounded-2xl border border-dashed border-[#C8D5E4] bg-white p-8 text-center">
              <p className="font-medium text-ink">No appointments yet</p>
              <p className="mt-1 text-sm text-muted">Choose a dermatologist above to send your first appointment request.</p>
            </div>
          )
        ) : (
          !loading && <div className="grid gap-3">
            {appointments.map((appointment) => {
              const meetingHref = safeMeetingHref(appointment.meeting_link);
              const consultationPayment = consultationPayments.find(
                (payment) => payment.appointment_id === appointment.id
              );
              const refundRequest = consultationPayment
                ? refundRequests.find((request) => request.payment_id === consultationPayment.id)
                : undefined;
              const isUpcoming = isAppointmentInFuture(appointment);
              const isPaymentEligible =
                (appointment.status === "confirmed" || appointment.status === "completed") &&
                Number.isFinite(appointment.doctor?.consultation_fee) &&
                (appointment.doctor?.consultation_fee ?? 0) > 0;
              return (
                <article key={appointment.id} className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
                  <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                        {appointment.status === "confirmed" && isUpcoming ? "Upcoming consultation" : "Consultation"}
                      </p>
                      <h3 className="mt-1 font-semibold text-ink">{appointment.doctor?.name?.trim() || "Dermatologist"}</h3>
                      {appointment.doctor?.specialization?.trim() && <p className="mt-0.5 text-sm text-muted">{appointment.doctor.specialization}</p>}
                      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink/80">
                        <span>{formatDate(appointment.appointment_date)}</span>
                        <span aria-hidden="true" className="text-muted">·</span>
                        <span>{formatTime(appointment.appointment_time)}</span>
                      </div>
                      {appointment.patient_message && (
                        <p className="mt-3 rounded-lg bg-[#F8FAFD] px-3 py-2 text-sm leading-5 text-muted">
                          <span className="font-medium text-ink">Your note:</span> {appointment.patient_message}
                        </p>
                      )}
                    </div>
                    <span className={`inline-flex w-fit shrink-0 items-center rounded-full border px-3 py-1.5 text-xs font-semibold ${appointmentStatusStyle(appointment.status, isUpcoming)}`}>
                      {appointment.status === "confirmed" && isUpcoming ? "Upcoming · Confirmed" : appointment.status.charAt(0).toUpperCase() + appointment.status.slice(1)}
                    </span>
                  </div>
                  {(isPaymentEligible || consultationPayment) && (
                    <div className="mx-4 mb-4 rounded-xl border border-[#E5EAF3] bg-[#F8FAFD] p-3 sm:mx-5 sm:mb-5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-ink">Payment</p>
                        <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-[#53698E]">DEMO · NO REAL MONEY</span>
                      </div>
                      {paymentLoading ? (
                        <p className="mt-2 text-sm text-muted">Loading payment details…</p>
                      ) : paymentError ? (
                        <p className="mt-2 text-sm text-red-800">Payment options are unavailable until payment details load successfully.</p>
                      ) : consultationPayment ? (
                        <>
                        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="text-sm font-medium text-ink">
                              {consultationPayment.method === "jazzcash" ? "JazzCash" : "Easypaisa"} (Demo)
                            </p>
                            <p className="mt-0.5 text-xs text-muted">
                              {formatFee(consultationPayment.amount)} ·{" "}
                              {consultationPayment.status === "pending"
                                ? "Awaiting admin review"
                                : consultationPayment.status === "simulated_paid"
                                  ? "Simulated paid"
                                  : consultationPayment.status === "simulated_refunded"
                                    ? "Simulated refunded"
                                    : "Failed"}
                            </p>
                            {consultationPayment.status_reason && (
                              <p className="mt-1 text-xs text-muted">Status note: {consultationPayment.status_reason}</p>
                            )}
                          </div>
                          <span className={`w-fit rounded-full px-2.5 py-1 text-xs font-medium ${
                            consultationPayment.status === "simulated_paid"
                              ? "bg-[#EAF5ED] text-[#326846]"
                              : consultationPayment.status === "failed"
                                ? "bg-[#FFF0F1] text-[#A5404A]"
                                : "bg-white text-[#53698E]"
                          }`}>
                            {consultationPayment.status.replaceAll("_", " ")}
                          </span>
                        </div>
                        {refundLoading ? (
                          <p className="mt-2 text-xs text-muted">Loading refund details…</p>
                        ) : refundError ? (
                          <p className="mt-2 text-xs text-red-800">Refund request availability could not be checked.</p>
                        ) : refundRequest ? (
                          <div className="mt-3 border-t border-[#E1E8F0] pt-3 text-xs">
                            <p className="font-medium text-ink">Simulated refund request: {refundRequest.status}</p>
                            <p className="mt-1 text-muted">{refundRequest.reason}</p>
                            {refundRequest.admin_decision_reason && (
                              <p className="mt-1 text-muted">Admin response: {refundRequest.admin_decision_reason}</p>
                            )}
                          </div>
                        ) : consultationPayment.status === "simulated_paid" ? (
                          <div className="mt-3 border-t border-[#E1E8F0] pt-3">
                            <label className="block text-xs font-medium text-ink">
                              Request a simulated refund
                              <textarea
                                rows={2}
                                maxLength={2000}
                                value={refundReasons[consultationPayment.id] ?? ""}
                                onChange={(event) => setRefundReasons({ ...refundReasons, [consultationPayment.id]: event.target.value })}
                                placeholder="Tell us why you are requesting a refund"
                                className="mt-1 block w-full rounded-lg border border-line bg-white px-3 py-2 text-sm font-normal focus:border-[#4C9BE4] focus:outline-none focus:ring-2 focus:ring-[#4C9BE4]/20"
                              />
                            </label>
                            <button
                              type="button"
                              disabled={requestingRefundPaymentId !== null}
                              onClick={() => void requestSimulatedRefund(consultationPayment)}
                              className="mt-2 rounded-lg border border-line bg-white px-3 py-2 text-xs font-semibold text-ink hover:bg-paper disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {requestingRefundPaymentId === consultationPayment.id ? "Submitting request…" : "Submit refund request"}
                            </button>
                            <p className="mt-1 text-[11px] text-muted">For demo review only; no real money will be returned.</p>
                          </div>
                        ) : null}
                        </>
                      ) : isPaymentEligible ? (
                        <>
                          <p className="mt-2 text-xs text-muted">
                            {formatFee(appointment.doctor?.consultation_fee ?? 0)} · Choose a method for admin review. No real money is transferred.
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={payingAppointmentId !== null}
                              onClick={() => void createDemoPayment(appointment, "jazzcash")}
                              className="rounded-lg border border-line bg-white px-3 py-2 text-sm font-medium text-ink hover:bg-paper disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {payingAppointmentId === appointment.id ? "Creating demo payment…" : "JazzCash (Demo)"}
                            </button>
                            <button
                              type="button"
                              disabled={payingAppointmentId !== null}
                              onClick={() => void createDemoPayment(appointment, "easypaisa")}
                              className="rounded-lg border border-line bg-white px-3 py-2 text-sm font-medium text-ink hover:bg-paper disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {payingAppointmentId === appointment.id ? "Creating demo payment…" : "Easypaisa (Demo)"}
                            </button>
                          </div>
                        </>
                      ) : null}
                    </div>
                  )}
                  {((appointment.status === "pending" && isUpcoming) ||
                    appointment.status === "confirmed" ||
                    appointment.status === "completed") && (
                    <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3 sm:px-5">
                      {appointment.status === "confirmed" && meetingHref && (
                        <a href={meetingHref} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center rounded-lg bg-[#175BB3] px-4 py-2 text-sm font-semibold text-white hover:bg-[#124A91]">
                          Join consultation
                        </a>
                      )}
                      {appointment.status === "confirmed" && !meetingHref && (
                        <p className="text-sm text-muted">Your appointment is confirmed. The meeting link will be shared here.</p>
                      )}
                      {(appointment.status === "pending" || appointment.status === "confirmed") &&
                        isUpcoming && (
                          <button
                            type="button"
                            disabled={cancellingAppointmentId !== null}
                            onClick={() => void cancelAppointment(appointment)}
                            className="min-h-10 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-[#A5404A] hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {cancellingAppointmentId === appointment.id ? "Cancelling…" : "Cancel appointment"}
                          </button>
                        )}
                      {(appointment.status === "confirmed" || appointment.status === "completed") && (
                        <button
                          type="button"
                          aria-expanded={openChatAppointmentId === appointment.id}
                          onClick={() => setOpenChatAppointmentId(
                            openChatAppointmentId === appointment.id ? null : appointment.id
                          )}
                          className="min-h-10 rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink hover:bg-paper"
                        >
                          {openChatAppointmentId === appointment.id ? "Close chat" : "Open chat"}
                        </button>
                      )}
                    </div>
                  )}
                  {(appointment.status === "confirmed" || appointment.status === "completed") && (
                    <>
                      {openChatAppointmentId === appointment.id && (
                        <AppointmentChat
                          appointmentId={appointment.id}
                          patientDetails={{
                            doctorName: appointment.doctor?.name || "Dermatologist",
                            doctorSpecialization: appointment.doctor?.specialization || "",
                            doctorImageUrl: appointment.doctor?.image_url ?? null,
                            appointmentDate: formatDate(appointment.appointment_date),
                            appointmentTime: formatTime(appointment.appointment_time),
                            status: appointment.status,
                          }}
                        />
                      )}
                    </>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <p className="mt-8 rounded-xl bg-[#EAF2FB] p-4 text-xs leading-5 text-[#53698E]">
        SkinWISE provides AI-assisted skin insights, not a diagnosis or prescription. A qualified dermatologist independently evaluates your concerns during consultation.
      </p>
    </main>
  );
}
