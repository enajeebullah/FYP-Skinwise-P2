"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import UserMenu from "@/components/UserMenu";

type Section = "overview" | "doctors" | "appointments" | "payments" | "refunds" | "complaints" | "users";
type AppointmentStatus = "pending" | "confirmed" | "completed" | "cancelled" | "rejected";
type ConsultationPaymentStatus = "pending" | "simulated_paid" | "failed" | "simulated_refunded";
type RefundRequestStatus = "requested" | "approved" | "rejected";
type ComplaintStatus = "open" | "in_review" | "resolved" | "dismissed";

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
  created_at: string;
  patient_name: string | null;
  doctor_name: string;
  admin_archived_at: string | null;
}

interface PatientProfile {
  id: string;
  full_name: string | null;
  created_at: string;
}

interface ConsultationPayment {
  id: string;
  appointment_id: string;
  patient_id: string;
  doctor_id: string;
  method: "jazzcash" | "easypaisa";
  is_simulated: boolean;
  amount: number;
  currency: string;
  status: ConsultationPaymentStatus;
  status_reason: string | null;
  created_at: string;
  updated_at: string;
  settled_at: string | null;
}

interface RefundRequest {
  id: string;
  payment_id: string;
  appointment_id: string;
  patient_id: string;
  reason: string;
  status: RefundRequestStatus;
  admin_decision_reason: string | null;
  created_at: string;
  updated_at: string;
  decided_at: string | null;
}

interface Complaint {
  id: string;
  appointment_id: string;
  payment_id: string | null;
  patient_id: string;
  doctor_id: string;
  reason: string;
  status: ComplaintStatus;
  admin_decision_reason: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

interface PrivateAdminNote {
  refund_request_id?: string;
  complaint_id?: string;
  notes: string;
  updated_at: string;
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

const DOCTOR_IMAGE_BUCKET = "dermatologist-profile-images";
const MAX_DOCTOR_IMAGE_SIZE = 5 * 1024 * 1024;
const ALLOWED_DOCTOR_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

const sections: { id: Section; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "doctors", label: "Dermatologists" },
  { id: "appointments", label: "Appointments" },
  { id: "payments", label: "Consultation Payments" },
  { id: "refunds", label: "Refund Requests" },
  { id: "complaints", label: "Patient Complaints" },
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

function consultationStatusStyle(status: string) {
  if (["confirmed", "completed", "simulated_paid", "approved", "resolved"].includes(status)) {
    return "bg-[#E7F2EA] text-[#3E7750]";
  }
  if (["cancelled", "rejected", "failed", "dismissed"].includes(status)) {
    return "bg-[#F9E8E9] text-[#A5404A]";
  }
  return "bg-[#FFF3D8] text-[#8C6719]";
}

function formatTimestamp(value: string | null) {
  return value ? new Date(value).toLocaleString() : "—";
}

interface AdminPanelProps {
  email?: string;
  fullName?: string | null;
}

function AdminIcon({ section }: { section: Section }) {
  const paths: Record<Section, ReactNode> = {
    overview: <><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1V10Z" /><path d="M9 21v-7h6v7" /></>,
    doctors: <><path d="M8 3v5a4 4 0 0 0 8 0V3M6 3h4M14 3h4M12 12v2a4 4 0 0 0 8 0v-1" /><circle cx="20" cy="11" r="1.5" /></>,
    appointments: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18M8 14h3M8 17h6" /></>,
    payments: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18M7 15h4" /></>,
    refunds: <><path d="M4 7v5h5M20 17v-5h-5" /><path d="M5.5 12a7 7 0 0 1 12-4L20 11M18.5 12a7 7 0 0 1-12 4L4 13" /></>,
    complaints: <><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H7l-3 2v-5.5a7.5 7.5 0 1 1 16-4Z" /><path d="M9 10h6M9 13h4" /></>,
    users: <><circle cx="9" cy="8" r="3" /><path d="M3 20c.5-3.5 2.5-5 6-5s5.5 1.5 6 5M16 5a3 3 0 0 1 0 6M17 15c2.5.3 3.7 1.8 4 4" /></>,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[section]}</svg>;
}

export default function AdminPanel({ email = "", fullName = null }: AdminPanelProps = {}) {
  const [section, setSection] = useState<Section>("overview");
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [users, setUsers] = useState<PatientProfile[]>([]);
  const [consultationPayments, setConsultationPayments] = useState<ConsultationPayment[]>([]);
  const [refundRequests, setRefundRequests] = useState<RefundRequest[]>([]);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [refundAdminNotes, setRefundAdminNotes] = useState<PrivateAdminNote[]>([]);
  const [complaintAdminNotes, setComplaintAdminNotes] = useState<PrivateAdminNote[]>([]);
  const [paymentDataError, setPaymentDataError] = useState<string | null>(null);
  const [refundDataError, setRefundDataError] = useState<string | null>(null);
  const [complaintDataError, setComplaintDataError] = useState<string | null>(null);
  const [counts, setCounts] = useState({
    users: 0,
    doctors: 0,
    pending: 0,
    confirmed: 0,
  });
  const [doctorForm, setDoctorForm] = useState<DoctorForm>(EMPTY_DOCTOR);
  const [doctorImageFile, setDoctorImageFile] = useState<File | null>(null);
  const [doctorImagePreview, setDoctorImagePreview] = useState<string | null>(null);
  const [doctorImageError, setDoctorImageError] = useState<string | null>(null);
  const [uploadingDoctorImage, setUploadingDoctorImage] = useState(false);
  const doctorImageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!doctorImagePreview) return;
    return () => URL.revokeObjectURL(doctorImagePreview);
  }, [doctorImagePreview]);
  const [editingDoctor, setEditingDoctor] = useState<string | null>(null);
  const [appointmentFilter, setAppointmentFilter] = useState<"all" | AppointmentStatus>("all");
  const [appointmentArchiveFilter, setAppointmentArchiveFilter] = useState<"active" | "archived">("active");
  const [appointmentSearch, setAppointmentSearch] = useState("");
  const [appointmentToArchive, setAppointmentToArchive] = useState<Appointment | null>(null);
  const [appointmentActionId, setAppointmentActionId] = useState<string | null>(null);
  const [paymentReasons, setPaymentReasons] = useState<Record<string, string>>({});
  const [refundDecisionReasons, setRefundDecisionReasons] = useState<Record<string, string>>({});
  const [refundPrivateNotes, setRefundPrivateNotes] = useState<Record<string, string>>({});
  const [complaintStatuses, setComplaintStatuses] = useState<Record<string, Exclude<ComplaintStatus, "open">>>({});
  const [complaintDecisionReasons, setComplaintDecisionReasons] = useState<Record<string, string>>({});
  const [complaintPrivateNotes, setComplaintPrivateNotes] = useState<Record<string, string>>({});
  const [adminActionId, setAdminActionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const [
      userResult,
      doctorCountResult,
      pendingResult,
      confirmedResult,
      doctorResult,
      appointmentResult,
      userListResult,
      paymentResult,
      refundResult,
      complaintResult,
      refundNotesResult,
      complaintNotesResult,
    ] =
      await Promise.all([
        supabase.from("admin_user_directory").select("id", { count: "exact", head: true }),
        supabase.from("doctors").select("id", { count: "exact", head: true }),
        supabase.from("appointments").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("appointments").select("id", { count: "exact", head: true }).eq("status", "confirmed"),
        supabase.from("doctors").select("*").order("created_at", { ascending: false }),
        supabase
          .from("admin_appointments")
          .select("id, patient_id, doctor_id, appointment_date, appointment_time, patient_message, status, created_at, patient_name, doctor_name, admin_archived_at")
          .order("created_at", { ascending: false }),
        supabase.from("admin_user_directory").select("id, full_name, created_at").order("created_at", { ascending: false }),
        supabase
          .from("consultation_payments")
          .select("id, appointment_id, patient_id, doctor_id, method, is_simulated, amount, currency, status, status_reason, created_at, updated_at, settled_at")
          .order("created_at", { ascending: false }),
        supabase
          .from("consultation_refund_requests")
          .select("id, payment_id, appointment_id, patient_id, reason, status, admin_decision_reason, created_at, updated_at, decided_at")
          .order("created_at", { ascending: false }),
        supabase
          .from("consultation_complaints")
          .select("id, appointment_id, payment_id, patient_id, doctor_id, reason, status, admin_decision_reason, created_at, updated_at, resolved_at")
          .order("created_at", { ascending: false }),
        supabase
          .from("consultation_refund_admin_notes")
          .select("refund_request_id, notes, updated_at"),
        supabase
          .from("consultation_complaint_admin_notes")
          .select("complaint_id, notes, updated_at"),
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
    if (paymentResult.error) {
      setPaymentDataError(`Could not load consultation payments: ${paymentResult.error.message}`);
    } else {
      setConsultationPayments((paymentResult.data ?? []) as ConsultationPayment[]);
      setPaymentDataError(null);
    }
    if (refundResult.error) {
      setRefundDataError(`Could not load refund requests: ${refundResult.error.message}`);
    } else {
      setRefundRequests((refundResult.data ?? []) as RefundRequest[]);
      setRefundDataError(null);
    }
    if (complaintResult.error) {
      setComplaintDataError(`Could not load complaints: ${complaintResult.error.message}`);
    } else {
      setComplaints((complaintResult.data ?? []) as Complaint[]);
      setComplaintDataError(null);
    }
    if (!refundNotesResult.error) {
      setRefundAdminNotes((refundNotesResult.data ?? []) as PrivateAdminNote[]);
    } else if (!refundResult.error) {
      setRefundDataError(`Could not load private refund notes: ${refundNotesResult.error.message}`);
    }
    if (!complaintNotesResult.error) {
      setComplaintAdminNotes((complaintNotesResult.data ?? []) as PrivateAdminNote[]);
    } else if (!complaintResult.error) {
      setComplaintDataError(`Could not load private complaint notes: ${complaintNotesResult.error.message}`);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  function beginEdit(doctor: Doctor) {
    setDoctorImageFile(null);
    setDoctorImagePreview(null);
    setDoctorImageError(null);
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

  function selectDoctorImage(file: File | undefined) {
    setDoctorImageError(null);
    if (!file) return;
    if (!ALLOWED_DOCTOR_IMAGE_TYPES.includes(file.type)) {
      setDoctorImageFile(null);
      setDoctorImagePreview(null);
      setDoctorImageError("Choose a JPG, PNG, or WebP image.");
      if (doctorImageInputRef.current) doctorImageInputRef.current.value = "";
      return;
    }
    if (file.size > MAX_DOCTOR_IMAGE_SIZE) {
      setDoctorImageFile(null);
      setDoctorImagePreview(null);
      setDoctorImageError("Image must be 5 MB or smaller.");
      if (doctorImageInputRef.current) doctorImageInputRef.current.value = "";
      return;
    }
    setDoctorImageFile(file);
    setDoctorImagePreview(URL.createObjectURL(file));
  }

  function clearDoctorImage() {
    setDoctorImageFile(null);
    setDoctorImagePreview(null);
    setDoctorImageError(null);
    setDoctorForm((current) => ({ ...current, image_url: "" }));
    if (doctorImageInputRef.current) doctorImageInputRef.current.value = "";
  }

  function resetDoctorForm() {
    setDoctorForm(EMPTY_DOCTOR);
    setDoctorImageFile(null);
    setDoctorImagePreview(null);
    setDoctorImageError(null);
    if (doctorImageInputRef.current) doctorImageInputRef.current.value = "";
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

    const supabase = createClient();
    let imageUrl = doctorForm.image_url.trim() || null;
    let uploadedImagePath: string | null = null;

    if (doctorImageFile) {
      setUploadingDoctorImage(true);
      const extensionByType: Record<string, string> = {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
      };
      uploadedImagePath = `doctors/${crypto.randomUUID()}.${extensionByType[doctorImageFile.type]}`;
      const { error: uploadError } = await supabase.storage
        .from(DOCTOR_IMAGE_BUCKET)
        .upload(uploadedImagePath, doctorImageFile, {
          contentType: doctorImageFile.type,
          cacheControl: "3600",
          upsert: false,
        });
      setUploadingDoctorImage(false);
      if (uploadError) {
        setDoctorImageError(`Could not upload profile image: ${uploadError.message}`);
        setSaving(false);
        return;
      }
      imageUrl = supabase.storage.from(DOCTOR_IMAGE_BUCKET).getPublicUrl(uploadedImagePath).data.publicUrl;
    }

    const payload = {
      user_id: doctorForm.user_id.trim() || null,
      name: doctorForm.name.trim(),
      qualification: doctorForm.qualification.trim(),
      specialization: doctorForm.specialization.trim(),
      experience,
      bio: doctorForm.bio.trim(),
      image_url: imageUrl,
      available_days: doctorForm.available_days.split(",").map((day) => day.trim()).filter(Boolean),
      available_time: doctorForm.available_time.trim(),
      consultation_fee: fee,
      is_verified: doctorForm.is_verified,
    };
    const result = editingDoctor
      ? await supabase.from("doctors").update(payload).eq("id", editingDoctor)
      : await supabase.from("doctors").insert(payload);

    if (result.error) {
      let saveError = `Could not save dermatologist: ${result.error.message}`;
      if (uploadedImagePath) {
        const { error: cleanupError } = await supabase.storage
          .from(DOCTOR_IMAGE_BUCKET)
          .remove([uploadedImagePath]);
        if (cleanupError) saveError += ` The uploaded image could not be removed: ${cleanupError.message}`;
      }
      setError(saveError);
      setSaving(false);
      return;
    }

    setDoctorForm(EMPTY_DOCTOR);
    setDoctorImageFile(null);
    setDoctorImagePreview(null);
    setDoctorImageError(null);
    if (doctorImageInputRef.current) doctorImageInputRef.current.value = "";
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
    updates: { status: AppointmentStatus }
  ) {
    setError(null);
    setNotice(null);
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

  async function setAppointmentArchived(appointment: Appointment, archived: boolean) {
    setError(null);
    setNotice(null);
    setAppointmentActionId(appointment.id);
    const { data: archivedResult, error: archiveError } = await createClient().rpc("set_admin_appointment_archived", {
      p_appointment_id: appointment.id,
      p_archived: archived,
    });
    if (archiveError || !archivedResult) {
      setError(`Could not ${archived ? "archive" : "restore"} appointment: ${archiveError?.message ?? "The appointment was not found."}`);
      setAppointmentActionId(null);
      return;
    }
    setAppointmentToArchive(null);
    setNotice(archived ? "Appointment archived." : "Appointment restored.");
    await loadData();
    setAppointmentActionId(null);
  }

  async function resolveDemoPayment(payment: ConsultationPayment, status: "simulated_paid" | "failed") {
    setError(null);
    setNotice(null);
    setAdminActionId(`payment:${payment.id}`);
    const { error: resolutionError } = await createClient().rpc("resolve_consultation_demo_payment", {
      p_payment_id: payment.id,
      p_status: status,
      p_reason: paymentReasons[payment.id]?.trim() || null,
    });

    if (resolutionError) {
      setError(`Could not update demo payment status: ${resolutionError.message}`);
      setAdminActionId(null);
      return;
    }

    setNotice(
      status === "simulated_paid"
        ? "Payment marked simulated paid for demo purposes. No real money was transferred."
        : "Demo payment marked failed. No real money was transferred."
    );
    await loadData();
    setAdminActionId(null);
  }

  async function resolveRefundRequest(request: RefundRequest, decision: "approved" | "rejected") {
    const reason = refundDecisionReasons[request.id]?.trim() ?? "";
    if (reason.length < 1 || reason.length > 2000) {
      setError("Enter a refund decision reason between 1 and 2000 characters.");
      setNotice(null);
      return;
    }

    setError(null);
    setNotice(null);
    setAdminActionId(`refund:${request.id}`);
    const { error: resolutionError } = await createClient().rpc("resolve_consultation_refund_request", {
      p_request_id: request.id,
      p_decision: decision,
      p_reason: reason,
    });

    if (resolutionError) {
      setError(`Could not resolve refund request: ${resolutionError.message}`);
      setAdminActionId(null);
      return;
    }

    setNotice(
      decision === "approved"
        ? "Simulated refund approved. The database marked the payment simulated refunded; no money was returned."
        : "Refund request rejected. No money was transferred or returned."
    );
    await loadData();
    setAdminActionId(null);
  }

  async function saveRefundPrivateNote(request: RefundRequest) {
    const notes = refundPrivateNotes[request.id]?.trim() ?? "";
    if (notes.length < 1 || notes.length > 4000) {
      setError("Private refund notes must contain between 1 and 4000 characters.");
      setNotice(null);
      return;
    }

    setError(null);
    setNotice(null);
    setAdminActionId(`refund-note:${request.id}`);
    const { error: notesError } = await createClient().rpc("set_consultation_refund_admin_notes", {
      p_request_id: request.id,
      p_notes: notes,
    });

    if (notesError) {
      setError(`Could not save private refund notes: ${notesError.message}`);
      setAdminActionId(null);
      return;
    }

    setNotice("Private refund investigation note saved for administrators.");
    await loadData();
    setAdminActionId(null);
  }

  async function resolveComplaint(complaint: Complaint) {
    const status = complaintStatuses[complaint.id] ?? "in_review";
    const decisionReason = complaintDecisionReasons[complaint.id]?.trim() ?? "";
    const privateNotes = complaintPrivateNotes[complaint.id]?.trim() ?? "";
    if (
      (status === "resolved" || status === "dismissed") &&
      (decisionReason.length < 1 || decisionReason.length > 2000)
    ) {
      setError("A complaint resolution reason between 1 and 2000 characters is required.");
      setNotice(null);
      return;
    }
    if (privateNotes.length > 4000) {
      setError("Private complaint notes cannot exceed 4000 characters.");
      setNotice(null);
      return;
    }

    setError(null);
    setNotice(null);
    setAdminActionId(`complaint:${complaint.id}`);
    const { error: resolutionError } = await createClient().rpc("resolve_consultation_complaint", {
      p_complaint_id: complaint.id,
      p_status: status,
      p_decision_reason: decisionReason || null,
      p_private_notes: privateNotes || null,
    });

    if (resolutionError) {
      setError(`Could not update complaint: ${resolutionError.message}`);
      setAdminActionId(null);
      return;
    }

    setNotice(
      status === "in_review"
        ? "Complaint moved to in review."
        : `Complaint marked ${status}.`
    );
    await loadData();
    setAdminActionId(null);
  }

  const appointmentById = new Map(appointments.map((appointment) => [appointment.id, appointment]));
  const paymentById = new Map(consultationPayments.map((payment) => [payment.id, payment]));
  const filteredAppointments = appointments.filter((appointment) => {
    const matchesArchive = appointmentArchiveFilter === "archived"
      ? Boolean(appointment.admin_archived_at)
      : !appointment.admin_archived_at;
    const matchesStatus = appointmentFilter === "all" || appointment.status === appointmentFilter;
    const query = appointmentSearch.trim().toLowerCase();
    const matchesSearch = !query || [
      appointment.patient_name ?? "",
      appointment.doctor_name ?? "",
      appointment.id,
      appointment.patient_message,
    ].some((value) => value.toLowerCase().includes(query));
    return matchesArchive && matchesStatus && matchesSearch;
  });

  const openComplaints = complaintDataError ? null : complaints.filter((complaint) => complaint.status === "open" || complaint.status === "in_review").length;
  const appointmentStatusCounts = statuses.reduce<Record<AppointmentStatus, number>>((result, status) => {
    result[status] = appointments.filter((appointment) => appointment.status === status).length;
    return result;
  }, { pending: 0, confirmed: 0, completed: 0, cancelled: 0, rejected: 0 });
  const chartStatuses: AppointmentStatus[] = ["confirmed", "pending", "completed", "cancelled", "rejected"];
  const appointmentTotal = appointments.length;
  const chartColors: Record<AppointmentStatus, string> = {
    confirmed: "#7964e8", pending: "#63a4f5", completed: "#43c7a6", cancelled: "#c9cadd", rejected: "#f28b8b",
  };
  const chartGradient = `conic-gradient(${chartStatuses.map((status, index) => {
    const start = chartStatuses.slice(0, index).reduce((sum, item) => sum + appointmentStatusCounts[item], 0);
    const end = start + appointmentStatusCounts[status];
    const from = appointmentTotal ? (start / appointmentTotal) * 100 : 0;
    const to = appointmentTotal ? (end / appointmentTotal) * 100 : 0;
    return `${chartColors[status]} ${from}% ${to}%`;
  }).join(", ")})`;

  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        <a href="/" className="admin-brand" aria-label="SkinWISE home">
          <span className="admin-brand-mark" aria-hidden="true">✦</span>
          <span><strong>SkinWISE</strong><small>Smart Skin Health<br />Management</small></span>
        </a>
        <nav className="admin-nav" aria-label="Administration sections">
        {sections.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setSection(item.id)}
            aria-current={section === item.id ? "page" : undefined}
            className={`admin-nav-link ${
              section === item.id
                ? "active"
                : ""
            }`}
          >
            <AdminIcon section={item.id} />{item.label}
          </button>
        ))}
      </nav>
        <div className="admin-sidebar-foot"><span className="admin-sidebar-orbit" aria-hidden="true">◌</span><p>Healthy Skin<br />Happier You</p><small>SkinWISE © 2026</small></div>
      </aside>

      <main className="admin-main">
      <header className="admin-topbar">
        <div><p className="admin-kicker">SKINWISE ADMIN</p><h1>Admin Dashboard</h1><p>Overview of your SkinWISE platform</p></div>
        <div className="admin-topbar-tools"><button type="button" onClick={() => void loadData()} className="admin-refresh" aria-label="Refresh administration data">↻</button><UserMenu email={email} fullName={fullName} /></div>
      </header>
      <div className="admin-content">

      {error && <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
      {notice && <p role="status" className="mb-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">{notice}</p>}
      {loading ? (
        <p className="rounded-2xl border border-line bg-white p-6 text-sm text-muted">Loading administration data…</p>
      ) : (
        <>
          {section === "overview" && (
            <section className="admin-overview" aria-label="Dashboard overview">
              <div className="admin-stat-grid">
                {[
                  { label: "Total users", value: counts.users, icon: "♙", tone: "violet" },
                  { label: "Dermatologists", value: counts.doctors, icon: "✚", tone: "blue" },
                  { label: "Pending appointments", value: counts.pending, icon: "▦", tone: "orange" },
                  { label: "Open complaints", value: openComplaints ?? "—", icon: "☏", tone: "green" },
                ].map((stat) => (
                  <article key={stat.label} className={`admin-stat-card ${stat.tone}`}>
                    <span className="admin-stat-icon" aria-hidden="true">{stat.icon}</span>
                    <div><p>{stat.label}</p><strong>{stat.value}</strong></div>
                    <span className="admin-stat-caption">Current total</span>
                  </article>
                ))}
              </div>
              <div className="admin-insight-grid">
                <section className="admin-card admin-appointments-overview">
                  <div className="admin-card-heading"><h2><AdminIcon section="appointments" />Appointments Overview</h2><button type="button" onClick={() => setSection("appointments")}>View all →</button></div>
                  {appointmentTotal ? <div className="admin-chart-layout"><div className="admin-donut" style={{ background: chartGradient }} role="img" aria-label={`${appointmentTotal} appointments by status`}><div><strong>{appointmentTotal}</strong><span>Total</span></div></div><ul className="admin-chart-legend">{chartStatuses.filter((status) => appointmentStatusCounts[status] > 0).map((status) => <li key={status}><i style={{ background: chartColors[status] }} />{status}<strong>{appointmentStatusCounts[status]}</strong></li>)}</ul></div> : <p className="admin-empty-chart">No appointment records to summarize.</p>}
                </section>
                <section className="admin-card admin-activity-card">
                  <div className="admin-card-heading"><h2><span aria-hidden="true">▥</span>Recent Activity</h2><span className="admin-data-label">Latest appointment records</span></div>
                  {appointments.length ? <ul className="admin-activity-list">{appointments.slice(0, 4).map((appointment) => <li key={appointment.id}><span className="admin-activity-icon"><AdminIcon section="appointments" /></span><span className="admin-activity-copy"><strong>{appointment.patient_name || "Patient"} · {appointment.status.replaceAll("_", " ")}</strong><small>{appointment.doctor_name} · {formatDate(appointment.appointment_date)}</small></span><span className={`admin-activity-tag ${appointment.status}`}>Appointment</span></li>)}</ul> : <p className="admin-empty-chart">No recent appointment records.</p>}
                </section>
              </div>
              <div className="admin-bottom-grid">
                <section className="admin-card admin-recent-table"><div className="admin-card-heading"><h2><AdminIcon section="appointments" />Recent Appointments</h2><button type="button" onClick={() => setSection("appointments")}>View all →</button></div><AppointmentTable appointments={appointments.slice(0, 5)} /></section>
                <aside className="admin-side-widgets"><section className="admin-system-card"><div className="admin-system-icon">✓</div><div><h2>System Status</h2><p><i />{error || loading ? "Checking data access" : "Admin data loaded"}</p><small>Based on current admin queries</small></div></section><section className="admin-quick-card"><h2>Quick Actions</h2><button type="button" onClick={() => { setSection("doctors"); setEditingDoctor(null); resetDoctorForm(); }}>＋ Add dermatologist</button><button type="button" onClick={() => setSection("appointments")}>▦ Manage appointments</button><button type="button" onClick={() => setSection("complaints")}>☏ View complaints</button></section></aside>
              </div>
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
                <div className="text-sm text-ink">
                  <span>Profile image</span>
                  <div className="mt-1 flex items-center gap-3 rounded-xl border border-line p-3">
                    {(doctorImagePreview || doctorForm.image_url) ? (
                      <img src={doctorImagePreview || doctorForm.image_url} alt="Dermatologist profile preview" className="h-16 w-16 rounded-full object-cover" />
                    ) : (
                      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#E4F0FF] text-xl font-semibold text-[#175BB3]" aria-hidden="true">{doctorForm.name.slice(0, 1).toUpperCase() || "?"}</div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs text-muted">{doctorImageFile?.name || (doctorForm.image_url ? "Current profile image" : "No image selected")}</p>
                      <input
                        ref={doctorImageInputRef}
                        type="file"
                        accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                        className="sr-only"
                        aria-label="Choose dermatologist profile image"
                        onChange={(event) => selectDoctorImage(event.target.files?.[0])}
                      />
                      <div className="mt-2 flex gap-2">
                        <button type="button" disabled={saving || uploadingDoctorImage} onClick={() => doctorImageInputRef.current?.click()} className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink hover:bg-paper disabled:opacity-60">{doctorForm.image_url || doctorImageFile ? "Change image" : "Choose image"}</button>
                        {(doctorForm.image_url || doctorImageFile) && <button type="button" disabled={saving || uploadingDoctorImage} onClick={clearDoctorImage} className="rounded-lg border border-line px-3 py-1.5 text-xs text-muted hover:bg-paper disabled:opacity-60">Remove</button>}
                      </div>
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-muted">JPG, PNG, or WebP; maximum 5 MB.</p>
                  {doctorImageError && <p role="alert" className="mt-1 text-xs text-red-700">{doctorImageError}</p>}
                </div>
                <label className="text-sm text-ink">Available days (comma separated)<input placeholder="Monday, Wednesday, Friday" value={doctorForm.available_days} onChange={(event) => setDoctorForm({ ...doctorForm, available_days: event.target.value })} className="mt-1 w-full rounded-lg border border-line px-3 py-2" /></label>
                <label className="text-sm text-ink">Available time (PKT)<input placeholder="10:00 AM – 2:00 PM" value={doctorForm.available_time} onChange={(event) => setDoctorForm({ ...doctorForm, available_time: event.target.value })} className="mt-1 w-full rounded-lg border border-line px-3 py-2" /></label>
                <label className="text-sm text-ink">Consultation fee (optional)<input type="number" min="0" step="0.01" value={doctorForm.consultation_fee} onChange={(event) => setDoctorForm({ ...doctorForm, consultation_fee: event.target.value })} className="mt-1 w-full rounded-lg border border-line px-3 py-2" /></label>
                <label className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" checked={doctorForm.is_verified} onChange={(event) => setDoctorForm({ ...doctorForm, is_verified: event.target.checked })} />Verified dermatologist</label>
                <div className="flex gap-2">
                  <button disabled={saving || uploadingDoctorImage} className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
                    {uploadingDoctorImage ? "Uploading image…" : saving ? "Saving…" : editingDoctor ? "Save changes" : "Add dermatologist"}
                  </button>
                  {editingDoctor && <button type="button" onClick={() => { setEditingDoctor(null); resetDoctorForm(); }} className="rounded-lg border border-line px-4 py-2 text-sm text-ink">Cancel edit</button>}
                </div>
              </form>
            </section>
          )}

          {section === "appointments" && (
            <section className="rounded-2xl border border-[#E2E8F0] bg-white p-4 shadow-sm sm:p-6">
              <div className="flex flex-col gap-4 border-b border-[#E8EDF3] pb-5 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#64748B]">Care coordination</p>
                  <h2 className="mt-1 font-display text-2xl font-semibold tracking-tight text-[#182B49]">Appointments</h2>
                  <p className="mt-1 text-sm text-[#64748B]">Review requests and manage consultation status.</p>
                </div>
                <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                  <label className="sr-only" htmlFor="admin-appointment-search">Search appointments</label>
                  <input id="admin-appointment-search" type="search" value={appointmentSearch} onChange={(event) => setAppointmentSearch(event.target.value)} placeholder="Search patient, doctor, or ID" className="min-h-10 min-w-0 rounded-lg border border-[#D8E0EA] bg-white px-3 text-sm text-[#243449] outline-none transition focus:border-[#0D9488] focus:ring-2 focus:ring-[#0D9488]/15 sm:w-64" />
                  <label className="sr-only" htmlFor="admin-appointment-status">Filter by status</label>
                  <select id="admin-appointment-status" value={appointmentFilter} onChange={(event) => setAppointmentFilter(event.target.value as "all" | AppointmentStatus)} className="min-h-10 rounded-lg border border-[#D8E0EA] bg-white px-3 text-sm text-[#243449] outline-none focus:border-[#0D9488] focus:ring-2 focus:ring-[#0D9488]/15">
                    <option value="all">All statuses</option>
                    {statuses.map((status) => <option key={status} value={status}>{status.charAt(0).toUpperCase() + status.slice(1)}</option>)}
                  </select>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label="Appointment archive view">
                {(["active", "archived"] as const).map((view) => {
                  const count = appointments.filter((appointment) => view === "archived" ? Boolean(appointment.admin_archived_at) : !appointment.admin_archived_at).length;
                  const selected = appointmentArchiveFilter === view;
                  return <button key={view} type="button" aria-pressed={selected} onClick={() => setAppointmentArchiveFilter(view)} className={`inline-flex min-h-9 items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition ${selected ? "bg-[#E8F4F3] text-[#087E75]" : "text-[#64748B] hover:bg-[#F4F7FA] hover:text-[#243449]"}`}>
                    {view === "active" ? "Active appointments" : "Archived"}
                    <span className={`rounded-full px-2 py-0.5 text-xs ${selected ? "bg-white text-[#087E75]" : "bg-[#EEF2F6] text-[#64748B]"}`}>{count}</span>
                  </button>;
                })}
              </div>

              {loading ? (
                <p className="mt-5 rounded-xl border border-dashed border-[#D8E0EA] bg-[#F8FAFC] px-4 py-8 text-center text-sm text-[#64748B]">Loading appointments…</p>
              ) : filteredAppointments.length === 0 ? (
                <div className="mt-5 rounded-xl border border-dashed border-[#D8E0EA] bg-[#F8FAFC] px-4 py-10 text-center">
                  <p className="text-sm font-semibold text-[#334155]">No appointments found</p>
                  <p className="mt-1 text-sm text-[#64748B]">Try changing the status filter or search terms.</p>
                </div>
              ) : (
                <div className="mt-5 grid gap-3">
                  {filteredAppointments.map((appointment) => (
                    <article key={appointment.id} className="rounded-xl border border-[#E2E8F0] bg-white p-4 transition hover:border-[#C7D6E5] hover:shadow-sm sm:p-5">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-semibold text-[#1E3354]">{appointment.patient_name || "Patient"}</h3>
                            <span className="text-xs text-[#94A3B8]" aria-hidden="true">with</span>
                            <span className="text-sm font-medium text-[#475569]">{appointment.doctor_name || "Dermatologist"}</span>
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[#64748B]">
                            <span className="font-medium text-[#334155]">{formatDate(appointment.appointment_date)}</span>
                            <span>{formatTime(appointment.appointment_time)}</span>
                            <span className="text-xs text-[#94A3B8]">ID {appointment.id.slice(0, 8)}</span>
                          </div>
                          {appointment.patient_message && <p className="mt-3 rounded-lg bg-[#F7F9FC] px-3 py-2.5 text-sm leading-5 text-[#526176]"><span className="font-semibold text-[#334155]">Patient note: </span>{appointment.patient_message}</p>}
                        </div>
                        <span className={`inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold capitalize ${statusStyle(appointment.status)}`}>
                          <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />{appointment.status}
                        </span>
                      </div>
                      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[#EEF2F6] pt-3">
                        {appointment.admin_archived_at ? (
                          <button type="button" disabled={appointmentActionId === appointment.id} onClick={() => void setAppointmentArchived(appointment, false)} className="inline-flex min-h-9 items-center rounded-lg border border-[#C8DAD7] bg-white px-3 py-2 text-xs font-semibold text-[#087E75] transition hover:bg-[#F0F8F7] disabled:cursor-wait disabled:opacity-60">{appointmentActionId === appointment.id ? "Restoring…" : "Restore appointment"}</button>
                        ) : (
                          <>
                            {appointment.status === "pending" && <>
                              <button type="button" onClick={() => void updateAppointment(appointment, { status: "confirmed" })} className="inline-flex min-h-9 items-center rounded-lg bg-[#E8F4EC] px-3 py-2 text-xs font-semibold text-[#33734B] transition hover:bg-[#D9EBDD]">Accept request</button>
                              <button type="button" onClick={() => void updateAppointment(appointment, { status: "rejected" })} className="inline-flex min-h-9 items-center rounded-lg bg-[#FFF1F0] px-3 py-2 text-xs font-semibold text-[#A5404A] transition hover:bg-[#FCE2E0]">Reject</button>
                            </>}
                            {appointment.status === "confirmed" && <>
                              <button type="button" onClick={() => void updateAppointment(appointment, { status: "completed" })} className="inline-flex min-h-9 items-center rounded-lg border border-[#D8E0EA] bg-white px-3 py-2 text-xs font-semibold text-[#334155] transition hover:bg-[#F7F9FC]">Mark completed</button>
                              <button type="button" onClick={() => void updateAppointment(appointment, { status: "cancelled" })} className="inline-flex min-h-9 items-center rounded-lg border border-[#E8D7D7] bg-white px-3 py-2 text-xs font-semibold text-[#A5404A] transition hover:bg-[#FFF7F6]">Cancel</button>
                            </>}
                            <button type="button" onClick={() => setAppointmentToArchive(appointment)} className="ml-auto inline-flex min-h-9 items-center rounded-lg border border-[#D8E0EA] bg-white px-3 py-2 text-xs font-semibold text-[#64748B] transition hover:border-[#AAB8C8] hover:bg-[#F7F9FC] hover:text-[#334155]">Archive</button>
                          </>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )}

              {appointmentToArchive && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setAppointmentToArchive(null); }}>
                  <section role="alertdialog" aria-modal="true" aria-labelledby="archive-appointment-title" aria-describedby="archive-appointment-description" className="w-full max-w-md rounded-2xl border border-white/70 bg-white p-5 shadow-2xl sm:p-6">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#64748B]">Confirm archive</p>
                    <h3 id="archive-appointment-title" className="mt-2 text-lg font-semibold text-[#1E3354]">Archive this appointment?</h3>
                    <p id="archive-appointment-description" className="mt-2 text-sm leading-6 text-[#64748B]">This hides the appointment from the active admin list. Its history and related records are preserved, and you can restore it later.</p>
                    <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                      <button type="button" disabled={appointmentActionId === appointmentToArchive.id} onClick={() => setAppointmentToArchive(null)} className="min-h-10 rounded-lg border border-[#D8E0EA] px-4 py-2 text-sm font-medium text-[#475569] hover:bg-[#F7F9FC] disabled:opacity-60">Keep appointment</button>
                      <button type="button" disabled={appointmentActionId === appointmentToArchive.id} onClick={() => void setAppointmentArchived(appointmentToArchive, true)} className="min-h-10 rounded-lg bg-[#A5404A] px-4 py-2 text-sm font-semibold text-white hover:bg-[#8F3540] disabled:cursor-wait disabled:opacity-60">{appointmentActionId === appointmentToArchive.id ? "Archiving…" : "Archive appointment"}</button>
                    </div>
                  </section>
                </div>
              )}
            </section>
          )}

          {section === "payments" && (
            <section className="rounded-2xl border border-line bg-white p-5 sm:p-6">
              <h2 className="font-display text-xl text-ink">Consultation Payments</h2>
              <p className="mt-1 text-sm text-muted">All payment methods and statuses are simulated. No real money is transferred.</p>
              {paymentDataError ? (
                <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{paymentDataError}</p>
              ) : consultationPayments.length === 0 ? (
                <p className="mt-4 text-sm text-muted">No consultation payment records.</p>
              ) : (
                <div className="mt-4 grid gap-3">
                  {consultationPayments.map((payment) => {
                    const appointment = appointmentById.get(payment.appointment_id);
                    const methodLabel = payment.method === "jazzcash" ? "JazzCash (Demo)" : "Easypaisa (Demo)";
                    return (
                      <article key={payment.id} className="rounded-xl border border-line p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-medium text-ink">{methodLabel} · {payment.amount} {payment.currency}</p>
                            <p className="mt-1 text-sm text-muted">
                              {appointment
                                ? `${appointment.patient_name || "Patient"} with ${appointment.doctor_name || "Dermatologist"}`
                                : `Patient ${payment.patient_id} · Doctor ${payment.doctor_id}`}
                            </p>
                            {appointment && (
                              <p className="mt-1 text-sm text-muted">
                                {formatDate(appointment.appointment_date)} at {formatTime(appointment.appointment_time)}
                              </p>
                            )}
                            <p className="mt-1 text-xs text-muted">Appointment ID: {payment.appointment_id}</p>
                            <p className="mt-1 text-xs text-muted">Payment ID: {payment.id}</p>
                            <p className="mt-1 text-xs text-muted">Patient ID: {payment.patient_id} · Doctor ID: {payment.doctor_id}</p>
                          </div>
                          <span className={`rounded-full px-3 py-1 text-xs ${consultationStatusStyle(payment.status)}`}>
                            {payment.status.replaceAll("_", " ")}
                          </span>
                        </div>
                        <div className="mt-3 grid gap-1 text-xs text-muted sm:grid-cols-2">
                          <p>Created: {formatTimestamp(payment.created_at)}</p>
                          <p>Updated: {formatTimestamp(payment.updated_at)}</p>
                          <p>Settled: {formatTimestamp(payment.settled_at)}</p>
                          <p>{payment.is_simulated ? "Simulated demo record" : "Not marked simulated"}</p>
                        </div>
                        {payment.status_reason && <p className="mt-2 text-sm text-ink/80">Status reason: {payment.status_reason}</p>}
                        {payment.status === "pending" && (
                          <div className="mt-4 grid gap-3 border-t border-line pt-4">
                            <label className="text-sm text-ink">
                              Optional status reason
                              <textarea
                                rows={2}
                                maxLength={2000}
                                value={paymentReasons[payment.id] ?? ""}
                                onChange={(event) => setPaymentReasons({ ...paymentReasons, [payment.id]: event.target.value })}
                                className="mt-1 w-full rounded-lg border border-line px-3 py-2"
                              />
                            </label>
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                disabled={adminActionId !== null}
                                onClick={() => void resolveDemoPayment(payment, "simulated_paid")}
                                className="rounded-lg bg-[#E7F2EA] px-3 py-2 text-xs font-medium text-[#3E7750] disabled:opacity-60"
                              >
                                Mark simulated paid
                              </button>
                              <button
                                type="button"
                                disabled={adminActionId !== null}
                                onClick={() => void resolveDemoPayment(payment, "failed")}
                                className="rounded-lg bg-[#F9E8E9] px-3 py-2 text-xs font-medium text-[#A5404A] disabled:opacity-60"
                              >
                                Mark failed
                              </button>
                              {adminActionId === `payment:${payment.id}` && <span className="self-center text-xs text-muted">Saving…</span>}
                            </div>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {section === "refunds" && (
            <section className="rounded-2xl border border-line bg-white p-5 sm:p-6">
              <h2 className="font-display text-xl text-ink">Simulated Refund Requests</h2>
              <p className="mt-1 text-sm text-muted">Refund decisions are for demo records only. Approval records a simulated refund; no money is returned.</p>
              {refundDataError ? (
                <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{refundDataError}</p>
              ) : refundRequests.length === 0 ? (
                <p className="mt-4 text-sm text-muted">No refund requests.</p>
              ) : (
                <div className="mt-4 grid gap-3">
                  {refundRequests.map((request) => {
                    const appointment = appointmentById.get(request.appointment_id);
                    const payment = paymentById.get(request.payment_id);
                    const privateNote = refundAdminNotes.find((note) => note.refund_request_id === request.id);
                    return (
                      <article key={request.id} className="rounded-xl border border-line p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-medium text-ink">
                              {appointment
                                ? `${appointment.patient_name || "Patient"} with ${appointment.doctor_name || "Dermatologist"}`
                                : `Patient ${request.patient_id}`}
                            </p>
                            <p className="mt-1 text-sm text-muted">
                              {appointment
                                ? `${formatDate(appointment.appointment_date)} at ${formatTime(appointment.appointment_time)}`
                                : `Appointment ${request.appointment_id}`}
                            </p>
                            {payment && (
                              <p className="mt-1 text-sm text-muted">
                                Linked payment: {payment.method === "jazzcash" ? "JazzCash (Demo)" : "Easypaisa (Demo)"} · {payment.amount} {payment.currency} · {payment.status.replaceAll("_", " ")}
                              </p>
                            )}
                            <p className="mt-1 text-xs text-muted">Request ID: {request.id} · Payment ID: {request.payment_id}</p>
                            <p className="mt-1 text-xs text-muted">Patient ID: {request.patient_id} · Appointment ID: {request.appointment_id}</p>
                          </div>
                          <span className={`rounded-full px-3 py-1 text-xs ${consultationStatusStyle(request.status)}`}>{request.status}</span>
                        </div>
                        <p className="mt-3 whitespace-pre-wrap text-sm text-ink/80">Request reason: {request.reason}</p>
                        {request.admin_decision_reason && <p className="mt-2 text-sm text-muted">Decision reason: {request.admin_decision_reason}</p>}
                        <div className="mt-3 grid gap-1 text-xs text-muted sm:grid-cols-2">
                          <p>Created: {formatTimestamp(request.created_at)}</p>
                          <p>Updated: {formatTimestamp(request.updated_at)}</p>
                          <p>Decided: {formatTimestamp(request.decided_at)}</p>
                        </div>
                        {privateNote && (
                          <div className="mt-3 rounded-lg bg-[#F8FAFD] p-3">
                            <p className="text-xs font-semibold text-ink">Private admin investigation note</p>
                            <p className="mt-1 whitespace-pre-wrap text-sm text-ink/80">{privateNote.notes}</p>
                            <p className="mt-1 text-xs text-muted">Updated: {formatTimestamp(privateNote.updated_at)}</p>
                          </div>
                        )}
                        {request.status === "requested" && (
                          <div className="mt-4 grid gap-3 border-t border-line pt-4">
                            <label className="text-sm text-ink">
                              Decision reason (required)
                              <textarea
                                rows={2}
                                maxLength={2000}
                                value={refundDecisionReasons[request.id] ?? ""}
                                onChange={(event) => setRefundDecisionReasons({ ...refundDecisionReasons, [request.id]: event.target.value })}
                                className="mt-1 w-full rounded-lg border border-line px-3 py-2"
                              />
                            </label>
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                disabled={adminActionId !== null}
                                onClick={() => void resolveRefundRequest(request, "approved")}
                                className="rounded-lg bg-[#E7F2EA] px-3 py-2 text-xs font-medium text-[#3E7750] disabled:opacity-60"
                              >
                                Approve simulated refund
                              </button>
                              <button
                                type="button"
                                disabled={adminActionId !== null}
                                onClick={() => void resolveRefundRequest(request, "rejected")}
                                className="rounded-lg bg-[#F9E8E9] px-3 py-2 text-xs font-medium text-[#A5404A] disabled:opacity-60"
                              >
                                Reject request
                              </button>
                              {adminActionId === `refund:${request.id}` && <span className="self-center text-xs text-muted">Saving…</span>}
                            </div>
                          </div>
                        )}
                        <div className="mt-4 grid gap-3 border-t border-line pt-4">
                          <label className="text-sm text-ink">
                            Private investigation note (admin-only; 1–4000 characters)
                            <textarea
                              rows={2}
                              maxLength={4000}
                              value={refundPrivateNotes[request.id] ?? ""}
                              onChange={(event) => setRefundPrivateNotes({ ...refundPrivateNotes, [request.id]: event.target.value })}
                              className="mt-1 w-full rounded-lg border border-line px-3 py-2"
                            />
                          </label>
                          <button
                            type="button"
                            disabled={adminActionId !== null}
                            onClick={() => void saveRefundPrivateNote(request)}
                            className="w-fit rounded-lg border border-line px-3 py-2 text-xs text-ink disabled:opacity-60"
                          >
                            Save private note
                          </button>
                          {adminActionId === `refund-note:${request.id}` && <span className="text-xs text-muted">Saving private note…</span>}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {section === "complaints" && (
            <section className="rounded-2xl border border-line bg-white p-5 sm:p-6">
              <h2 className="font-display text-xl text-ink">Patient Complaints</h2>
              <p className="mt-1 text-sm text-muted">Private admin notes are stored separately and are not exposed to patients or doctors.</p>
              {complaintDataError ? (
                <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{complaintDataError}</p>
              ) : complaints.length === 0 ? (
                <p className="mt-4 text-sm text-muted">No patient complaints.</p>
              ) : (
                <div className="mt-4 grid gap-3">
                  {complaints.map((complaint) => {
                    const appointment = appointmentById.get(complaint.appointment_id);
                    const privateNote = complaintAdminNotes.find((note) => note.complaint_id === complaint.id);
                    const selectedStatus = complaintStatuses[complaint.id] ?? "in_review";
                    return (
                      <article key={complaint.id} className="rounded-xl border border-line p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-medium text-ink">
                              {appointment
                                ? `${appointment.patient_name || "Patient"} with ${appointment.doctor_name || "Dermatologist"}`
                                : `Doctor ${complaint.doctor_id}`}
                            </p>
                            <p className="mt-1 text-sm text-muted">
                              {appointment
                                ? `${formatDate(appointment.appointment_date)} at ${formatTime(appointment.appointment_time)}`
                                : `Appointment ${complaint.appointment_id}`}
                            </p>
                            <p className="mt-1 text-xs text-muted">Complaint ID: {complaint.id} · Appointment ID: {complaint.appointment_id}</p>
                            <p className="mt-1 text-xs text-muted">Patient ID: {complaint.patient_id} · Doctor ID: {complaint.doctor_id}</p>
                            {complaint.payment_id && <p className="mt-1 text-xs text-muted">Linked payment ID: {complaint.payment_id}</p>}
                          </div>
                          <span className={`rounded-full px-3 py-1 text-xs ${consultationStatusStyle(complaint.status)}`}>{complaint.status.replaceAll("_", " ")}</span>
                        </div>
                        <p className="mt-3 whitespace-pre-wrap text-sm text-ink/80">Complaint details: {complaint.reason}</p>
                        {complaint.admin_decision_reason && <p className="mt-2 text-sm text-muted">Decision reason: {complaint.admin_decision_reason}</p>}
                        <div className="mt-3 grid gap-1 text-xs text-muted sm:grid-cols-2">
                          <p>Created: {formatTimestamp(complaint.created_at)}</p>
                          <p>Updated: {formatTimestamp(complaint.updated_at)}</p>
                          <p>Resolved: {formatTimestamp(complaint.resolved_at)}</p>
                        </div>
                        {privateNote && (
                          <div className="mt-3 rounded-lg bg-[#F8FAFD] p-3">
                            <p className="text-xs font-semibold text-ink">Private admin investigation note</p>
                            <p className="mt-1 whitespace-pre-wrap text-sm text-ink/80">{privateNote.notes}</p>
                            <p className="mt-1 text-xs text-muted">Updated: {formatTimestamp(privateNote.updated_at)}</p>
                          </div>
                        )}
                        {(complaint.status === "open" || complaint.status === "in_review") && (
                          <div className="mt-4 grid gap-3 border-t border-line pt-4">
                            <label className="text-sm text-ink">
                              Complaint status
                              <select
                                value={selectedStatus}
                                onChange={(event) => setComplaintStatuses({
                                  ...complaintStatuses,
                                  [complaint.id]: event.target.value as Exclude<ComplaintStatus, "open">,
                                })}
                                className="mt-1 block rounded-lg border border-line bg-white px-3 py-2"
                              >
                                <option value="in_review">in review</option>
                                <option value="resolved">resolved</option>
                                <option value="dismissed">dismissed</option>
                              </select>
                            </label>
                            <label className="text-sm text-ink">
                              Decision reason {selectedStatus === "in_review" ? "(optional)" : "(required; 1–2000 characters)"}
                              <textarea
                                rows={2}
                                maxLength={2000}
                                value={complaintDecisionReasons[complaint.id] ?? ""}
                                onChange={(event) => setComplaintDecisionReasons({ ...complaintDecisionReasons, [complaint.id]: event.target.value })}
                                className="mt-1 w-full rounded-lg border border-line px-3 py-2"
                              />
                            </label>
                            <label className="text-sm text-ink">
                              Private admin notes (optional; max 4000 characters)
                              <textarea
                                rows={2}
                                maxLength={4000}
                                value={complaintPrivateNotes[complaint.id] ?? ""}
                                onChange={(event) => setComplaintPrivateNotes({ ...complaintPrivateNotes, [complaint.id]: event.target.value })}
                                className="mt-1 w-full rounded-lg border border-line px-3 py-2"
                              />
                            </label>
                            <button
                              type="button"
                              disabled={adminActionId !== null}
                              onClick={() => void resolveComplaint(complaint)}
                              className="w-fit rounded-lg border border-line px-3 py-2 text-xs text-ink disabled:opacity-60"
                            >
                              {selectedStatus === "in_review" ? "Update complaint review" : `${selectedStatus === "resolved" ? "Resolve" : "Dismiss"} complaint`}
                            </button>
                            {adminActionId === `complaint:${complaint.id}` && <span className="text-xs text-muted">Saving complaint…</span>}
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
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
      </div>
      </main>
    </div>
  );
}

function AppointmentTable({ appointments }: { appointments: Appointment[] }) {
  if (!appointments.length) {
    return <p className="admin-table-empty">No appointments have been requested yet.</p>;
  }

  return (
    <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Patient</th><th>Dermatologist</th><th>Date &amp; time</th><th>Status</th></tr></thead><tbody>
      {appointments.map((appointment) => <tr key={appointment.id}><td><span className="admin-patient-cell"><i>{(appointment.patient_name || "P").slice(0, 1).toUpperCase()}</i>{appointment.patient_name || "Patient"}</span></td><td>{appointment.doctor_name || "Dermatologist"}</td><td>{formatDate(appointment.appointment_date)} · {formatTime(appointment.appointment_time)}</td><td><span className={`admin-table-status ${appointment.status}`}>{appointment.status}</span></td></tr>)}
    </tbody></table></div>
  );
}
