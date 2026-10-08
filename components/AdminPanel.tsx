"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

type Section = "overview" | "doctors" | "appointments" | "users";
type AppointmentStatus = "pending" | "confirmed" | "completed" | "cancelled" | "rejected";

interface Doctor {
  id: string;
  user_id: string | null;
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
  is_active: boolean;
}

interface Appointment {
  id: string;
  patient_id: string;
  doctor_id: string;
  appointment_date: string;
  appointment_time: string;
  patient_message: string;
  status: AppointmentStatus;
  meeting_link: string | null;
  created_at: string;
  patient_name: string | null;
  doctor_name: string;
}

interface PatientProfile {
  id: string;
  full_name: string | null;
  created_at: string;
}

interface DoctorForm {
  user_id: string;
  name: string;
  qualification: string;
  specialization: string;
  experience: string;
  bio: string;
  image_url: string;
  available_days: string;
  available_time: string;
  consultation_fee: string;
  is_verified: boolean;
}

const EMPTY_DOCTOR: DoctorForm = {
  user_id: "",
  name: "",
  qualification: "",
  specialization: "",
  experience: "0",
  bio: "",
  image_url: "",
  available_days: "",
  available_time: "",
  consultation_fee: "",
  is_verified: false,
};

const sections: { id: Section; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "doctors", label: "Dermatologists" },
  { id: "appointments", label: "Appointments" },
  { id: "users", label: "Users" },
];

const statuses: AppointmentStatus[] = [
  "pending",
  "confirmed",
  "completed",
  "cancelled",
  "rejected",
];

function formatDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
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
  if (status === "confirmed" || status === "completed") {
    return "bg-[#E7F2EA] text-[#3E7750]";
  }
  if (status === "rejected" || status === "cancelled") {
    return "bg-[#F9E8E9] text-[#A5404A]";
  }
  return "bg-[#FFF3D8] text-[#8C6719]";
}

export default function AdminPanel() {
  const [section, setSection] = useState<Section>("overview");
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [users, setUsers] = useState<PatientProfile[]>([]);
  const [counts, setCounts] = useState({
    users: 0,
    doctors: 0,
    pending: 0,
    confirmed: 0,
  });
  const [doctorForm, setDoctorForm] = useState<DoctorForm>(EMPTY_DOCTOR);
  const [editingDoctor, setEditingDoctor] = useState<string | null>(null);
  const [appointmentFilter, setAppointmentFilter] = useState<"all" | AppointmentStatus>("all");
  const [meetingLinks, setMeetingLinks] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const [userResult, doctorCountResult, pendingResult, confirmedResult, doctorResult, appointmentResult, userListResult] =
      await Promise.all([
        supabase.from("admin_user_directory").select("id", { count: "exact", head: true }),
        supabase.from("doctors").select("id", { count: "exact", head: true }),
        supabase.from("appointments").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("appointments").select("id", { count: "exact", head: true }).eq("status", "confirmed"),
        supabase.from("doctors").select("*").order("created_at", { ascending: false }),
        supabase
          .from("admin_appointments")
          .select("id, patient_id, doctor_id, appointment_date, appointment_time, patient_message, status, meeting_link, created_at, patient_name, doctor_name")
          .order("created_at", { ascending: false }),
        supabase.from("admin_user_directory").select("id, full_name, created_at").order("created_at", { ascending: false }),
      ]);

    const failed = [
      userResult.error,
      doctorCountResult.error,
      pendingResult.error,
      confirmedResult.error,
      doctorResult.error,
      appointmentResult.error,
      userListResult.error,
    ].find(Boolean);

    if (failed) {
      setError(`Could not load administration data: ${failed.message}`);
      setLoading(false);
      return;
    }

    setCounts({
      users: userResult.count ?? 0,
      doctors: doctorCountResult.count ?? 0,
      pending: pendingResult.count ?? 0,
      confirmed: confirmedResult.count ?? 0,
    });
    setDoctors((doctorResult.data ?? []) as Doctor[]);
    setAppointments((appointmentResult.data ?? []) as unknown as Appointment[]);
    setUsers((userListResult.data ?? []) as PatientProfile[]);
    setMeetingLinks(
      Object.fromEntries(
        ((appointmentResult.data ?? []) as unknown as Appointment[]).map((item) => [
          item.id,
          item.meeting_link ?? "",
        ])
      )
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  function beginEdit(doctor: Doctor) {
    setEditingDoctor(doctor.id);
    setDoctorForm({
      user_id: doctor.user_id ?? "",
      name: doctor.name,
      qualification: doctor.qualification,
      specialization: doctor.specialization,
      experience: String(doctor.experience),
      bio: doctor.bio,
      image_url: doctor.image_url ?? "",
      available_days: doctor.available_days.join(", "),
      available_time: doctor.available_time,
      consultation_fee: doctor.consultation_fee == null ? "" : String(doctor.consultation_fee),
      is_verified: doctor.is_verified,
    });
    setSection("doctors");
  }

  async function saveDoctor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);

    const experience = Number(doctorForm.experience);
    const fee = doctorForm.consultation_fee.trim() ? Number(doctorForm.consultation_fee) : null;
    if (!Number.isInteger(experience) || experience < 0 || (fee !== null && (!Number.isFinite(fee) || fee < 0))) {
      setError("Enter a valid non-negative experience and consultation fee.");
      setSaving(false);
      return;
    }

    const payload = {
      user_id: doctorForm.user_id.trim() || null,
      name: doctorForm.name.trim(),
      qualification: doctorForm.qualification.trim(),
      specialization: doctorForm.specialization.trim(),
      experience,
      bio: doctorForm.bio.trim(),
      image_url: doctorForm.image_url.trim() || null,
      available_days: doctorForm.available_days.split(",").map((day) => day.trim()).filter(Boolean),
      available_time: doctorForm.available_time.trim(),
      consultation_fee: fee,
      is_verified: doctorForm.is_verified,
    };
    const supabase = createClient();
    const result = editingDoctor
      ? await supabase.from("doctors").update(payload).eq("id", editingDoctor)
      : await supabase.from("doctors").insert(payload);

    if (result.error) {
      setError(`Could not save dermatologist: ${result.error.message}`);
      setSaving(false);
      return;
    }

    setDoctorForm(EMPTY_DOCTOR);
    setEditingDoctor(null);
    setNotice(editingDoctor ? "Dermatologist details updated." : "Dermatologist added.");
    await loadData();
    setSaving(false);
  }

  async function toggleDoctor(doctor: Doctor) {
    setError(null);
    const { error: updateError } = await createClient()
      .from("doctors")
      .update({ is_active: !doctor.is_active })
      .eq("id", doctor.id);
    if (updateError) {
      setError(`Could not update dermatologist: ${updateError.message}`);
      return;
    }
    setNotice(`${doctor.name} ${doctor.is_active ? "deactivated" : "activated"}.`);
    await loadData();
  }

  async function updateAppointment(
    appointment: Appointment,
    updates: { status?: AppointmentStatus; meeting_link?: string | null }
  ) {
    setError(null);
    setNotice(null);
    if (updates.meeting_link) {
      try {
        const url = new URL(updates.meeting_link);
        if (url.protocol !== "https:" && url.protocol !== "http:") {
          setError("Meeting links must use HTTP or HTTPS.");
          return;
        }
      } catch {
        setError("Enter a valid online meeting URL.");
        return;
      }
    }
    const { error: updateError } = await createClient()
      .from("appointments")
      .update(updates)
      .eq("id", appointment.id);
    if (updateError) {
      setError(`Could not update appointment: ${updateError.message}`);
      return;
    }
    setNotice("Appointment updated.");
    await loadData();
  }

  const filteredAppointments =
    appointmentFilter === "all"
      ? appointments
      : appointments.filter((appointment) => appointment.status === appointmentFilter);

  return (
    <main className="dashboard-content animate-fadeUp">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">SKINWISE ADMIN</p>
          <h1 className="font-display text-3xl text-ink">Administration</h1>
          <p className="mt-1 text-sm text-muted">Manage consultations and dermatologist listings.</p>
        </div>
        <button type="button" onClick={() => void loadData()} className="rounded-lg border border-line bg-white px-4 py-2 text-sm text-ink hover:bg-paper">
          Refresh data
        </button>
      </header>

      <nav className="mb-6 flex flex-wrap gap-2" aria-label="Administration sections">
        {sections.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setSection(item.id)}
            aria-current={section === item.id ? "page" : undefined}
            className={`rounded-full border px-4 py-2 text-sm transition ${
              section === item.id
                ? "border-[#4C9BE4] bg-[#E4F0FF] font-semibold text-[#175BB3]"
                : "border-line bg-white text-muted hover:text-ink"
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {error && <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
      {notice && <p role="status" className="mb-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">{notice}</p>}
      {loading ? (
        <p className="rounded-2xl border border-line bg-white p-6 text-sm text-muted">Loading administration data…</p>
      ) : (
        <>
          {section === "overview" && (
            <section aria-label="Dashboard overview">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  ["Total users", counts.users],
                  ["Dermatologists", counts.doctors],
                  ["Pending appointments", counts.pending],
                  ["Confirmed appointments", counts.confirmed],
                ].map(([label, value]) => (
                  <article key={label} className="rounded-2xl border border-line bg-white p-5 shadow-sm">
                    <p className="text-sm text-muted">{label}</p>
                    <p className="mt-2 font-display text-3xl text-ink">{value}</p>
                  </article>
                ))}
              </div>
              <section className="mt-6 rounded-2xl border border-line bg-white p-5 sm:p-6">
                <h2 className="font-display text-xl text-ink">Recent appointments</h2>
                <AppointmentTable appointments={appointments.slice(0, 5)} />
              </section>
            </section>
          )}

          {section === "doctors" && (
            <section className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
              <div className="rounded-2xl border border-line bg-white p-5 sm:p-6">
                <h2 className="font-display text-xl text-ink">Dermatologists</h2>
                <div className="mt-4 grid gap-3">
                  {doctors.length === 0 && <p className="text-sm text-muted">No dermatologists have been added.</p>}
                  {doctors.map((doctor) => (
                    <article key={doctor.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-line p-3">
                      {doctor.image_url ? (
                        <img src={doctor.image_url} alt="" className="h-12 w-12 rounded-full object-cover" />
                      ) : (
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#E4F0FF] font-semibold text-[#175BB3]">
                          {doctor.name.slice(0, 1).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-ink">{doctor.name}{doctor.is_verified ? " ✓" : ""}</p>
                        <p className="text-xs text-muted">{doctor.specialization} · {doctor.experience} years</p>
                        <p className={`mt-1 text-xs ${doctor.is_active ? "text-green-700" : "text-muted"}`}>
                          {doctor.is_active ? "Active" : "Inactive"}
                        </p>
                      </div>
                      <button type="button" onClick={() => beginEdit(doctor)} className="rounded-lg border border-line px-3 py-1.5 text-xs text-ink hover:bg-paper">Edit</button>
                      <button type="button" onClick={() => void toggleDoctor(doctor)} className="rounded-lg border border-line px-3 py-1.5 text-xs text-ink hover:bg-paper">
                        {doctor.is_active ? "Deactivate" : "Activate"}
                      </button>
                    </article>
                  ))}
                </div>
              </div>

              <form onSubmit={saveDoctor} className="grid gap-3 rounded-2xl border border-line bg-white p-5 sm:p-6">
                <h2 className="font-display text-xl text-ink">{editingDoctor ? "Edit dermatologist" : "Add dermatologist"}</h2>
                <label className="text-sm text-ink">Supabase Auth user ID<input value={doctorForm.user_id} onChange={(event) => setDoctorForm({ ...doctorForm, user_id: event.target.value })} placeholder="UUID of the doctor’s Auth account" className="mt-1 w-full rounded-lg border border-line px-3 py-2" /><span className="mt-1 block text-xs text-muted">Create the account in Supabase Auth, then enter its user UUID.</span></label>
                <label className="text-sm text-ink">Name<input required value={doctorForm.name} onChange={(event) => setDoctorForm({ ...doctorForm, name: event.target.value })} className="mt-1 w-full rounded-lg border border-line px-3 py-2" /></label>
                <label className="text-sm text-ink">Qualification<input required value={doctorForm.qualification} onChange={(event) => setDoctorForm({ ...doctorForm, qualification: event.target.value })} className="mt-1 w-full rounded-lg border border-line px-3 py-2" /></label>
                <label className="text-sm text-ink">Specialization<input required value={doctorForm.specialization} onChange={(event) => setDoctorForm({ ...doctorForm, specialization: event.target.value })} className="mt-1 w-full rounded-lg border border-line px-3 py-2" /></label>
                <label className="text-sm text-ink">Experience (years)<input required type="number" min="0" step="1" value={doctorForm.experience} onChange={(event) => setDoctorForm({ ...doctorForm, experience: event.target.value })} className="mt-1 w-full rounded-lg border border-line px-3 py-2" /></label>
                <label className="text-sm text-ink">Bio<textarea rows={3} value={doctorForm.bio} onChange={(event) => setDoctorForm({ ...doctorForm, bio: event.target.value })} className="mt-1 w-full rounded-lg border border-line px-3 py-2" /></label>
                <label className="text-sm text-ink">Profile image URL<input type="url" value={doctorForm.image_url} onChange={(event) => setDoctorForm({ ...doctorForm, image_url: event.target.value })} className="mt-1 w-full rounded-lg border border-line px-3 py-2" /></label>
                <label className="text-sm text-ink">Available days (comma separated)<input placeholder="Monday, Wednesday, Friday" value={doctorForm.available_days} onChange={(event) => setDoctorForm({ ...doctorForm, available_days: event.target.value })} className="mt-1 w-full rounded-lg border border-line px-3 py-2" /></label>
                <label className="text-sm text-ink">Available time (PKT)<input placeholder="10:00 AM – 2:00 PM" value={doctorForm.available_time} onChange={(event) => setDoctorForm({ ...doctorForm, available_time: event.target.value })} className="mt-1 w-full rounded-lg border border-line px-3 py-2" /></label>
                <label className="text-sm text-ink">Consultation fee (optional)<input type="number" min="0" step="0.01" value={doctorForm.consultation_fee} onChange={(event) => setDoctorForm({ ...doctorForm, consultation_fee: event.target.value })} className="mt-1 w-full rounded-lg border border-line px-3 py-2" /></label>
                <label className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" checked={doctorForm.is_verified} onChange={(event) => setDoctorForm({ ...doctorForm, is_verified: event.target.checked })} />Verified dermatologist</label>
                <div className="flex gap-2">
                  <button disabled={saving} className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
                    {saving ? "Saving…" : editingDoctor ? "Save changes" : "Add dermatologist"}
                  </button>
                  {editingDoctor && <button type="button" onClick={() => { setEditingDoctor(null); setDoctorForm(EMPTY_DOCTOR); }} className="rounded-lg border border-line px-4 py-2 text-sm text-ink">Cancel edit</button>}
                </div>
              </form>
            </section>
          )}

          {section === "appointments" && (
            <section className="rounded-2xl border border-line bg-white p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-display text-xl text-ink">Appointment management</h2>
                <label className="text-sm text-muted">
                  Status{" "}
                  <select value={appointmentFilter} onChange={(event) => setAppointmentFilter(event.target.value as "all" | AppointmentStatus)} className="rounded-lg border border-line bg-white px-3 py-2 text-ink">
                    <option value="all">All</option>
                    {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
                  </select>
                </label>
              </div>
              <div className="mt-4 grid gap-3">
                {filteredAppointments.length === 0 && <p className="text-sm text-muted">No appointments in this view.</p>}
                {filteredAppointments.map((appointment) => (
                  <article key={appointment.id} className="rounded-xl border border-line p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-ink">{appointment.patient_name || "Patient"} with {appointment.doctor_name || "Dermatologist"}</p>
                        <p className="mt-1 text-sm text-muted">{formatDate(appointment.appointment_date)} at {formatTime(appointment.appointment_time)}</p>
                        {appointment.patient_message && <p className="mt-2 text-sm text-ink/80">Message: {appointment.patient_message}</p>}
                      </div>
                      <span className={`rounded-full px-3 py-1 text-xs capitalize ${statusStyle(appointment.status)}`}>{appointment.status}</span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {appointment.status === "pending" && (
                        <>
                          <button type="button" onClick={() => void updateAppointment(appointment, { status: "confirmed" })} className="rounded-lg bg-[#E7F2EA] px-3 py-2 text-xs font-medium text-[#3E7750]">Accept</button>
                          <button type="button" onClick={() => void updateAppointment(appointment, { status: "rejected" })} className="rounded-lg bg-[#F9E8E9] px-3 py-2 text-xs font-medium text-[#A5404A]">Reject</button>
                        </>
                      )}
                      {appointment.status === "confirmed" && (
                        <>
                          <input
                            aria-label="Online meeting link"
                            type="url"
                            placeholder="https://meeting.example.com/..."
                            value={meetingLinks[appointment.id] ?? ""}
                            onChange={(event) => setMeetingLinks({ ...meetingLinks, [appointment.id]: event.target.value })}
                            className="min-w-[220px] flex-1 rounded-lg border border-line px-3 py-2 text-sm"
                          />
                          <button type="button" onClick={() => void updateAppointment(appointment, { meeting_link: meetingLinks[appointment.id]?.trim() || null })} className="rounded-lg border border-line px-3 py-2 text-xs text-ink">Save link</button>
                          <button type="button" onClick={() => void updateAppointment(appointment, { status: "completed" })} className="rounded-lg border border-line px-3 py-2 text-xs text-ink">Mark completed</button>
                          <button type="button" onClick={() => void updateAppointment(appointment, { status: "cancelled" })} className="rounded-lg border border-line px-3 py-2 text-xs text-ink">Cancel</button>
                        </>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {section === "users" && (
            <section className="rounded-2xl border border-line bg-white p-5 sm:p-6">
              <h2 className="font-display text-xl text-ink">Registered users</h2>
              <p className="mt-1 text-sm text-muted">Only display name and account creation date are shown.</p>
              <div className="mt-4 divide-y divide-line">
                {users.map((patient) => (
                  <article key={patient.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <span className="text-sm font-medium text-ink">{patient.full_name || "SkinWISE user"}</span>
                    <time className="text-sm text-muted" dateTime={patient.created_at}>{new Date(patient.created_at).toLocaleDateString()}</time>
                  </article>
                ))}
                {users.length === 0 && <p className="py-3 text-sm text-muted">No registered users found.</p>}
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}

function AppointmentTable({ appointments }: { appointments: Appointment[] }) {
  if (!appointments.length) {
    return <p className="mt-4 text-sm text-muted">No appointments have been requested yet.</p>;
  }

  return (
    <div className="mt-4 grid gap-3">
      {appointments.map((appointment) => (
        <article key={appointment.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line px-4 py-3">
          <div>
            <p className="text-sm font-medium text-ink">{appointment.patient_name || "Patient"} · {appointment.doctor_name || "Dermatologist"}</p>
            <p className="mt-1 text-xs text-muted">{formatDate(appointment.appointment_date)} at {formatTime(appointment.appointment_time)}</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs capitalize ${statusStyle(appointment.status)}`}>{appointment.status}</span>
        </article>
      ))}
    </div>
  );
}
