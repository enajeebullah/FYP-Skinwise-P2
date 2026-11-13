-- Store the details submitted with each appointment and expose them only to
-- the dermatologist assigned to that appointment.
-- Apply after migration_add_consultations.sql and
-- migration_add_doctor_appointment_archive.sql.

alter table public.appointments
  add column if not exists patient_full_name text,
  add column if not exists patient_age integer,
  add column if not exists patient_gender text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.appointments'::regclass
      and conname = 'appointments_patient_full_name_check'
  ) then
    alter table public.appointments
      add constraint appointments_patient_full_name_check
      check (
        patient_full_name is null
        or (char_length(btrim(patient_full_name)) between 1 and 120)
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.appointments'::regclass
      and conname = 'appointments_patient_age_check'
  ) then
    alter table public.appointments
      add constraint appointments_patient_age_check
      check (patient_age is null or patient_age between 1 and 120);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.appointments'::regclass
      and conname = 'appointments_patient_gender_check'
  ) then
    alter table public.appointments
      add constraint appointments_patient_gender_check
      check (patient_gender is null or patient_gender in ('male', 'female', 'prefer_not_to_say'));
  end if;
end;
$$;

-- Existing rows remain NULL. Require complete name and age snapshots for new
-- patient requests, while preserving the original appointment authorization.
drop policy if exists "Patients can request appointments" on public.appointments;
create policy "Patients can request appointments"
  on public.appointments for insert
  to authenticated
  with check (
    patient_id = auth.uid()
    and status = 'pending'
    and meeting_link is null
    and appointment_date >= current_date
    and patient_full_name is not null
    and char_length(btrim(patient_full_name)) between 1 and 120
    and patient_age between 1 and 120
    and (patient_gender is null or patient_gender in ('male', 'female', 'prefer_not_to_say'))
    and exists (
      select 1
      from public.doctors d
      where d.id = appointments.doctor_id and d.is_active
    )
  );

-- Remove the old table-level INSERT grant so callers cannot set arbitrary
-- columns, then grant only fields used by the patient request flow.
revoke insert on table public.appointments from public, anon, authenticated;
grant insert (
  patient_id,
  doctor_id,
  appointment_date,
  appointment_time,
  patient_message,
  status,
  patient_full_name,
  patient_age,
  patient_gender
) on public.appointments to authenticated;

-- Admins already have an appointment-wide RLS read policy. Use column-level
-- SELECT grants so authenticated clients can keep reading existing
-- appointment fields without selecting the patient information snapshots.
revoke select on table public.appointments from public, anon, authenticated;
grant select (
  id,
  patient_id,
  doctor_id,
  appointment_date,
  appointment_time,
  patient_message,
  status,
  meeting_link,
  created_at,
  updated_at,
  archived_at
) on public.appointments to authenticated;

create or replace function public.get_doctor_appointment_patient_details(
  p_appointment_ids uuid[]
)
returns table (
  appointment_id uuid,
  patient_full_name text,
  patient_age integer,
  patient_gender text
)
language sql
stable
security definer
set search_path = ''
set row_security = off
as $function$
  select a.id, a.patient_full_name, a.patient_age, a.patient_gender
  from public.appointments a
  where a.id = any(coalesce(p_appointment_ids, '{}'::uuid[]))
    and auth.uid() is not null
    and exists (
      select 1
      from public.doctors d
      where d.id = a.doctor_id
        and d.user_id = auth.uid()
    );
$function$;

alter function public.get_doctor_appointment_patient_details(uuid[])
  owner to postgres;
revoke all on function public.get_doctor_appointment_patient_details(uuid[])
  from public, anon, authenticated;
grant execute on function public.get_doctor_appointment_patient_details(uuid[])
  to authenticated;
