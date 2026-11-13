-- Add a reversible admin-only archive marker without changing doctor history.
-- Apply after migration_add_consultations.sql and migration_add_doctor_appointment_archive.sql.

alter table public.appointments
  add column if not exists admin_archived_at timestamptz;

create index if not exists appointments_admin_archived_created_idx
  on public.appointments (admin_archived_at, created_at desc);

create or replace view public.admin_appointments
with (security_barrier = true)
as
  select
    a.id,
    a.patient_id,
    a.doctor_id,
    a.appointment_date,
    a.appointment_time,
    a.patient_message,
    a.status,
    a.meeting_link,
    a.created_at,
    p.full_name as patient_name,
    d.name as doctor_name,
    a.admin_archived_at
  from public.appointments a
  join public.profiles p on p.id = a.patient_id
  join public.doctors d on d.id = a.doctor_id
  where public.is_admin();

create or replace function public.set_admin_appointment_archived(
  p_appointment_id uuid,
  p_archived boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  changed boolean := false;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Administrator access is required to archive appointments.'
      using errcode = '42501';
  end if;

  update public.appointments a
  set admin_archived_at = case
        when p_archived then coalesce(a.admin_archived_at, now())
        else null
      end,
      updated_at = now()
  where a.id = p_appointment_id
  returning true into changed;

  return coalesce(changed, false);
end;
$$;

revoke all on function public.set_admin_appointment_archived(uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.set_admin_appointment_archived(uuid, boolean)
  to authenticated;

revoke all on public.admin_appointments from public, anon;
grant select on public.admin_appointments to authenticated;
