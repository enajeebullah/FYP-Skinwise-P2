-- SkinWISE — reversible doctor appointment archive
-- Review and apply manually in Supabase SQL Editor.
-- This migration never deletes appointments, patients, messages, attachments,
-- payments, disputes, complaints, or medical history.

alter table public.appointments
  add column if not exists archived_at timestamptz;

create index if not exists appointments_doctor_active_schedule_idx
  on public.appointments (doctor_id, appointment_date, appointment_time)
  where archived_at is null;

-- Doctors may archive only appointments assigned to their linked doctor row.
-- The function does not accept a doctor id from the client and is the only new
-- archive mutation path exposed to authenticated users.
create or replace function public.archive_appointment_for_doctor(
  p_appointment_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  archived boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required to archive an appointment.'
      using errcode = '42501';
  end if;

  update public.appointments a
  set archived_at = now(),
      updated_at = now()
  where a.id = p_appointment_id
    and a.archived_at is null
    and exists (
      select 1
      from public.doctors d
      where d.id = a.doctor_id
        and d.user_id = auth.uid()
    )
  returning true into archived;

  return coalesce(archived, false);
end;
$$;

revoke all on function public.archive_appointment_for_doctor(uuid)
  from public, anon, authenticated;
grant execute on function public.archive_appointment_for_doctor(uuid)
  to authenticated;

-- Preserve patient and admin visibility. Only the assigned doctor's active
-- dashboard view excludes archived appointments.
drop policy if exists "Doctors can view their appointments"
  on public.appointments;
create policy "Doctors can view their appointments"
  on public.appointments for select
  to authenticated
  using (
    archived_at is null
    and exists (
      select 1
      from public.doctors d
      where d.id = appointments.doctor_id
        and d.user_id = auth.uid()
    )
  );

