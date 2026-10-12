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

function statusStyle(status: AppointmentStatus) {
  if (status === "confirmed" || status === "completed") return "bg-[#E7F2EA] text-[#3E7750]";
  if (status === "rejected" || status === "cancelled") return "bg-[#F9E8E9] text-[#A5404A]";
  return "bg-[#FFF3D8] text-[#8C6719]";
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
  const [openChatAppointmentId, setOpenChatAppointmentId] = useState<string | null>(null);
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [availableTimeSlots, setAvailableTimeSlots] = useState<string[]>([]);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilityRefreshKey, setAvailabilityRefreshKey] = useState(0);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [cancellingAppointmentId, setCancellingAppointmentId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appointmentError, setAppointmentError] = useState<string | null>(null);
  const [cancellationError, setCancellationError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
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
      setError(`Could not load consultations: ${failure.message}`);
      setLoading(false);
      return;
    }

    setDoctors((doctorResult.data ?? []) as Doctor[]);
    setAppointments((appointmentResult.data ?? []) as unknown as Appointment[]);
    setLoading(false);
  }, [patientId]);

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
      <header className="mb-6">
        <p className="eyebrow">ONLINE CARE</p>
        <h1 className="font-display text-3xl text-ink">Consult a dermatologist</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
          Browse available dermatologists and request an online appointment. A dermatologist independently evaluates you during the consultation.
        </p>
      </header>

      {error && <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}

      <section aria-labelledby="doctor-list-heading">
        <h2 id="doctor-list-heading" className="mb-4 font-display text-2xl text-ink">Available dermatologists</h2>
        {loading ? (
          <p className="rounded-2xl border border-line bg-white p-6 text-sm text-muted">Loading dermatologists…</p>
        ) : doctors.length === 0 ? (
          <p className="rounded-2xl border border-line bg-white p-6 text-sm text-muted">No dermatologists are available right now. Please check again later.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {doctors.map((doctor) => (
              <article key={doctor.id} className="flex flex-col rounded-2xl border border-line bg-white p-5 shadow-sm">
                <div className="flex items-center gap-3">
                  {doctor.image_url ? (
                    <img src={doctor.image_url} alt="" className="h-14 w-14 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#E4F0FF] font-display text-xl text-[#175BB3]">
                      {doctor.name.slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <h3 className="font-semibold text-ink">{doctor.name}{doctor.is_verified ? <span className="ml-1 text-[#3978C5]" aria-label="Verified">✓</span> : null}</h3>
                    <p className="text-xs text-muted">{doctor.qualification}</p>
                  </div>
                </div>
                <p className="mt-4 text-sm font-medium text-[#3978C5]">{doctor.specialization}</p>
                <p className="mt-1 text-sm text-muted">{doctor.experience} years of experience</p>
                {doctor.bio && <p className="mt-3 text-sm leading-6 text-ink/80">{doctor.bio}</p>}
                <div className="mt-4 space-y-1 text-xs text-muted">
                  <p>Available: {doctor.available_days.length ? doctor.available_days.join(", ") : "By appointment"}</p>
                  {doctor.available_time && <p>Hours: {doctor.available_time} PKT</p>}
                  {doctor.consultation_fee != null && <p>Fee: {doctor.consultation_fee}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedDoctor(doctor);
                    setAppointmentError(null);
                    setNotice(null);
                  }}
                  className="mt-5 rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-white hover:bg-[#344d7a]"
                >
                  Request appointment
                </button>
              </article>
            ))}
          </div>
        )}
      </section>

      {selectedDoctor && (
        <section className="mt-6 rounded-2xl border border-[#C8DCF5] bg-white p-5 shadow-sm sm:p-6" aria-labelledby="request-heading">
          <form noValidate onSubmit={requestAppointment} className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <h2 id="request-heading" className="font-display text-xl text-ink">Request with {selectedDoctor.name}</h2>
              <p className="mt-1 text-sm text-muted">Your appointment remains pending until it is reviewed.</p>
            </div>
            <div className="rounded-xl border border-[#E5EAF3] bg-[#F8FAFD] p-4 sm:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Doctor availability</p>
              <p className="mt-1 text-sm font-medium text-ink">
                {selectedDoctor.available_days.length ? selectedDoctor.available_days.join(", ") : "No available days listed"}
              </p>
              <p className="mt-1 text-sm text-muted">
                {selectedDoctor.available_time ? `${selectedDoctor.available_time} PKT` : "No available time range listed"}
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
              <textarea rows={3} maxLength={1000} value={message} onChange={(event) => setMessage(event.target.value)} className="mt-1 block w-full rounded-lg border border-line px-3 py-2" />
            </label>
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <button disabled={sending} className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
                {sending ? "Sending…" : "Send appointment request"}
              </button>
              <button type="button" onClick={() => setSelectedDoctor(null)} className="rounded-lg border border-line px-4 py-2 text-sm text-ink">Cancel</button>
            </div>
          </form>
        </section>
      )}

      <section className="mt-10" aria-labelledby="my-appointments-heading">
        <h2 id="my-appointments-heading" className="mb-4 font-display text-2xl text-ink">My appointments</h2>
        {notice && <p role="status" className="mb-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">{notice}</p>}
        {cancellationError && <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{cancellationError}</p>}
        {appointments.length === 0 ? (
          <p className="rounded-2xl border border-line bg-white p-6 text-sm text-muted">You don’t have any appointments yet.</p>
        ) : (
          <div className="grid gap-3">
            {appointments.map((appointment) => {
              const meetingHref = safeMeetingHref(appointment.meeting_link);
              return (
                <article key={appointment.id} className="rounded-2xl border border-line bg-white p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-ink">{appointment.doctor?.name || "Dermatologist"}</h3>
                      {appointment.doctor?.specialization && <p className="mt-1 text-sm text-muted">{appointment.doctor.specialization}</p>}
                      <p className="mt-2 text-sm text-ink/80">{formatDate(appointment.appointment_date)} at {formatTime(appointment.appointment_time)}</p>
                      {appointment.patient_message && <p className="mt-2 text-sm text-muted">Your message: {appointment.patient_message}</p>}
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs capitalize ${statusStyle(appointment.status)}`}>{appointment.status}</span>
                  </div>
                  {appointment.status === "confirmed" && meetingHref && (
                    <a href={meetingHref} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex rounded-lg bg-[#175BB3] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#124A91]">
                      Join Consultation
                    </a>
                  )}
                  {appointment.status === "confirmed" && !meetingHref && (
                    <p className="mt-3 text-sm text-muted">Your appointment is confirmed. The meeting link will be shared here.</p>
                  )}
                  {(appointment.status === "pending" || appointment.status === "confirmed") &&
                    isAppointmentInFuture(appointment) && (
                      <button
                        type="button"
                        disabled={cancellingAppointmentId !== null}
                        onClick={() => void cancelAppointment(appointment)}
                        className="mt-4 rounded-lg border border-red-200 px-4 py-2.5 text-sm font-medium text-[#A5404A] hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {cancellingAppointmentId === appointment.id ? "Cancelling…" : "Cancel Appointment"}
                      </button>
                    )}
                  {(appointment.status === "confirmed" || appointment.status === "completed") && (
                    <>
                      <button
                        type="button"
                        aria-expanded={openChatAppointmentId === appointment.id}
                        onClick={() => setOpenChatAppointmentId(
                          openChatAppointmentId === appointment.id ? null : appointment.id
                        )}
                        className="mt-4 rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-ink hover:bg-paper"
                      >
                        {openChatAppointmentId === appointment.id ? "Close chat" : "Chat"}
                      </button>
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
