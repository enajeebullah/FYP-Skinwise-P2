-- SkinWISE — Admin panel and online dermatologist consultations
-- Run in Supabase Dashboard → SQL Editor after the existing schema.sql.
--
-- To authorize an administrator, first create/sign in to their account,
-- then run this query with that account's email:
-- insert into public.admin_users (user_id)
-- select id from auth.users where email = 'admin@example.com'
-- on conflict do nothing;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;

drop policy if exists "Users can view their own admin membership" on public.admin_users;
create policy "Users can view their own admin membership"
  on public.admin_users for select
  to authenticated
  using (auth.uid() = user_id);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_users where user_id = auth.uid()
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;
grant select on public.admin_users to authenticated;

create table if not exists public.doctors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  name text not null,
  qualification text not null,
  specialization text not null,
  experience integer not null default 0 check (experience >= 0),
  bio text not null default '',
  image_url text,
  available_days text[] not null default '{}',
  available_time text not null default '',
  consultation_fee numeric(10, 2) check (consultation_fee is null or consultation_fee >= 0),
  is_verified boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.doctors
  add column if not exists user_id uuid references auth.users (id) on delete set null;

create unique index if not exists doctors_user_id_unique_idx
  on public.doctors (user_id)
  where user_id is not null;

alter table public.doctors enable row level security;

drop policy if exists "Users can view active doctors" on public.doctors;
create policy "Users can view active doctors"
  on public.doctors for select
  to authenticated
  using (is_active or public.is_admin());

drop policy if exists "Doctors can view their linked profile" on public.doctors;
create policy "Doctors can view their linked profile"
  on public.doctors for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Admins can manage doctors" on public.doctors;
create policy "Admins can manage doctors"
  on public.doctors for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert, update, delete on public.doctors to authenticated;

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null constraint appointments_patient_id_fkey
    references public.profiles (id) on delete cascade,
  doctor_id uuid not null constraint appointments_doctor_id_fkey
    references public.doctors (id) on delete restrict,
  appointment_date date not null,
  appointment_time time not null,
  patient_message text not null default '' check (char_length(patient_message) <= 1000),
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'completed', 'cancelled', 'rejected')),
  meeting_link text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.appointments enable row level security;

drop policy if exists "Patients can view their own appointments" on public.appointments;
create policy "Patients can view their own appointments"
  on public.appointments for select
  to authenticated
  using (patient_id = auth.uid());

drop policy if exists "Patients can request appointments" on public.appointments;
create policy "Patients can request appointments"
  on public.appointments for insert
  to authenticated
  with check (
    patient_id = auth.uid()
    and status = 'pending'
    and meeting_link is null
    and appointment_date >= current_date
    and exists (
      select 1
      from public.doctors d
      where d.id = appointments.doctor_id and d.is_active
    )
  );

drop policy if exists "Admins can view all appointments" on public.appointments;
create policy "Admins can view all appointments"
  on public.appointments for select
  to authenticated
  using (public.is_admin());

drop policy if exists "Admins can manage appointments" on public.appointments;
create policy "Admins can manage appointments"
  on public.appointments for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Doctors can view their appointments" on public.appointments;
create policy "Doctors can view their appointments"
  on public.appointments for select
  to authenticated
  using (
    exists (
      select 1
      from public.doctors d
      where d.id = appointments.doctor_id
        and d.user_id = auth.uid()
    )
  );

drop policy if exists "Doctors can update their appointments" on public.appointments;
create policy "Doctors can update their appointments"
  on public.appointments for update
  to authenticated
  using (
    exists (
      select 1
      from public.doctors d
      where d.id = appointments.doctor_id
        and d.user_id = auth.uid()
    )
  )
  with check (
    status in ('confirmed', 'rejected')
    and exists (
      select 1
      from public.doctors d
      where d.id = appointments.doctor_id
        and d.user_id = auth.uid()
    )
  );

grant select, insert, delete on public.appointments to authenticated;
revoke update on public.appointments from authenticated;
grant update (status, meeting_link) on public.appointments to authenticated;

create unique index if not exists appointments_one_confirmed_per_slot_idx
  on public.appointments (doctor_id, appointment_date, appointment_time)
  where status = 'confirmed';

create or replace function public.is_appointment_slot_available(
  p_doctor_id uuid,
  p_appointment_date date,
  p_appointment_time time
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and not exists (
      select 1
      from public.appointments a
      where a.doctor_id = p_doctor_id
        and a.appointment_date = p_appointment_date
        and a.appointment_time = p_appointment_time
        and a.status = 'confirmed'
    );
$$;

revoke all on function public.is_appointment_slot_available(uuid, date, time) from public, anon;
grant execute on function public.is_appointment_slot_available(uuid, date, time) to authenticated;

drop policy if exists "Admins can view basic user profiles" on public.profiles;

create or replace view public.admin_user_directory
with (security_barrier = true)
as
  select id, full_name, created_at
  from public.profiles
  where public.is_admin();

revoke all on public.admin_user_directory from public, anon;
grant select on public.admin_user_directory to authenticated;

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
    d.name as doctor_name
  from public.appointments a
  join public.profiles p on p.id = a.patient_id
  join public.doctors d on d.id = a.doctor_id
  where public.is_admin();

revoke all on public.admin_appointments from public, anon;
grant select on public.admin_appointments to authenticated;

create index if not exists appointments_patient_id_created_at_idx
  on public.appointments (patient_id, created_at desc);
create index if not exists appointments_doctor_id_date_idx
  on public.appointments (doctor_id, appointment_date, appointment_time);
create index if not exists appointments_status_created_at_idx
  on public.appointments (status, created_at desc);

create or replace function public.set_appointment_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_appointment_updated_at on public.appointments;
create trigger set_appointment_updated_at
  before update on public.appointments
  for each row execute function public.set_appointment_updated_at();
