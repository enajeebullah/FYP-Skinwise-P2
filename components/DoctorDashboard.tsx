"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

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
  if (status === "confirmed" || status === "completed") return "bg-[#E7F2EA] text-[#3E7750]";
  if (status === "rejected" || status === "cancelled") return "bg-[#F9E8E9] text-[#A5404A]";
  return "bg-[#FFF3D8] text-[#8C6719]";
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
  const [meetingLinks, setMeetingLinks] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadAppointments = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: loadError } = await createClient()
      .from("appointments")
      .select("id, appointment_date, appointment_time, patient_message, status, meeting_link, created_at")
      .eq("doctor_id", doctorId)
      .order("appointment_date", { ascending: true })
      .order("appointment_time", { ascending: true });

    if (loadError) {
      setError(`Could not load appointments: ${loadError.message}`);
      setLoading(false);
      return;
    }

    const rows = (data ?? []) as Appointment[];
    setAppointments(rows);
    setMeetingLinks(Object.fromEntries(rows.map((appointment) => [
      appointment.id,
      appointment.meeting_link ?? "",
    ])));
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
        return;
      }
      if (!slotAvailable) {
        setError("This time slot is already booked. Please choose another time.");
        return;
      }
    }

    setSavingId(appointment.id);
    const { error: updateError } = await supabase
      .from("appointments")
      .update(updates)
      .eq("id", appointment.id);
    setSavingId(null);

    if (updateError) {
      setError(
        updateError.code === "23505"
          ? "This time slot is already booked. Please choose another time."
          : `Could not update appointment: ${updateError.message}`
      );
      return;
    }

    setNotice("Appointment updated.");
    await loadAppointments();
  }

  return (
    <main className="min-h-screen bg-[#F8F9FD] px-5 py-10">
      <div className="mx-auto max-w-4xl">
        <header className="mb-6">
          <p className="eyebrow">SKINWISE DOCTOR</p>
          <h1 className="font-display text-3xl text-ink">{doctorName}</h1>
          <p className="mt-2 text-sm text-muted">Review and respond to your appointment requests.</p>
        </header>

        {error && <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
        {notice && <p role="status" className="mb-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">{notice}</p>}

        <section aria-labelledby="doctor-appointments-heading">
          <h2 id="doctor-appointments-heading" className="mb-4 font-display text-2xl text-ink">Your appointments</h2>
          {loading ? (
            <p className="rounded-2xl border border-line bg-white p-6 text-sm text-muted">Loading appointments…</p>
          ) : appointments.length === 0 ? (
            <p className="rounded-2xl border border-line bg-white p-6 text-sm text-muted">You don’t have any appointment requests yet.</p>
          ) : (
            <div className="grid gap-3">
              {appointments.map((appointment) => (
                <article key={appointment.id} className="rounded-2xl border border-line bg-white p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-ink">{formatDate(appointment.appointment_date)}</h3>
                      <p className="mt-1 text-sm text-muted">{formatTime(appointment.appointment_time)}</p>
                      {appointment.patient_message && (
                        <p className="mt-3 text-sm leading-6 text-ink/80">Patient message: {appointment.patient_message}</p>
                      )}
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs capitalize ${statusStyle(appointment.status)}`}>
                      {appointment.status}
                    </span>
                  </div>

                  {appointment.status === "pending" && (
                    <div className="mt-4 flex gap-2">
                      <button
                        type="button"
                        disabled={savingId === appointment.id}
                        onClick={() => void updateAppointment(appointment, { status: "confirmed" })}
                        className="rounded-lg bg-[#E7F2EA] px-3 py-2 text-xs font-medium text-[#3E7750] disabled:opacity-60"
                      >
                        Confirm
                      </button>
                      <button
                        type="button"
                        disabled={savingId === appointment.id}
                        onClick={() => void updateAppointment(appointment, { status: "rejected" })}
                        className="rounded-lg bg-[#F9E8E9] px-3 py-2 text-xs font-medium text-[#A5404A] disabled:opacity-60"
                      >
                        Reject
                      </button>
                    </div>
                  )}

                  {appointment.status === "confirmed" && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <input
                        aria-label="Consultation link"
                        type="url"
                        placeholder="https://meeting.example.com/..."
                        value={meetingLinks[appointment.id] ?? ""}
                        onChange={(event) => setMeetingLinks({
                          ...meetingLinks,
                          [appointment.id]: event.target.value,
                        })}
                        className="min-w-[220px] flex-1 rounded-lg border border-line px-3 py-2 text-sm"
                      />
                      <button
                        type="button"
                        disabled={savingId === appointment.id}
                        onClick={() => void updateAppointment(appointment, {
                          meeting_link: meetingLinks[appointment.id]?.trim() || null,
                        })}
                        className="rounded-lg border border-line px-3 py-2 text-xs text-ink disabled:opacity-60"
                      >
                        Save consultation link
                      </button>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
